import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as vite from "vite";
import {
  resolveCity,
  resolveProvince,
  searchBarangays,
  searchCities,
  searchProvinces,
} from "../../utils/phAddress.js";
import {
  applyBarangaySelection,
  applyCitySelection,
  applyCityTextChange,
  applyProvinceSelection,
  applyProvinceTextChange,
  findDuplicateCustomer,
  formatPhMobileInput,
  isValidCustomerPhone,
  toFullPhPhone,
} from "./customerFormUtils.js";

const transformJsx = (source, filename) => vite.transformWithOxc
  ? vite.transformWithOxc(source, filename, { jsx: { runtime: "classic" } })
  : vite.transformWithEsbuild(source, filename, { jsx: "transform" });

const find = (node, type) => !node || typeof node !== "object" ? [] : [
  ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)),
];

const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.children);
};

async function fixture(createCustomerMock, { confirm = () => true, existingCustomers = [] } = {}) {
  const states = [], refs = [], effects = [], saved = [];
  let cursor = 0, refCursor = 0, idCounter = 0, closed = 0;

  const stripImports = (src) =>
    src
      .replace(/^import [\s\S]*?from\s+['"][^'"]+['"];\r?\n?/gm, "")
      .replace(/^import\s+['"][^'"]+['"];\r?\n?/gm, "");

  const scope = {
    React: {
      Fragment: "Fragment",
      createElement: (type, props, ...children) =>
        typeof type === "function"
          ? type({ ...(props || {}), children })
          : { type, props: props || {}, children },
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    },
    useRef(initial) {
      return refs[refCursor++] ||= { current: initial };
    },
    useEffect: fn => effects.push(fn),
    useMemo: fn => fn(),
    useId: () => `id-${++idCounter}`,
    createCustomer: createCustomerMock,
    resolveCity,
    resolveProvince,
    searchBarangays,
    searchCities,
    searchProvinces,
    applyBarangaySelection,
    applyCitySelection,
    applyCityTextChange,
    applyProvinceSelection,
    applyProvinceTextChange,
    findDuplicateCustomer,
    formatPhMobileInput,
    isValidCustomerPhone,
    toFullPhPhone,
    window: { confirm },
    document: { body: { style: { overflow: "" } }, activeElement: { focus() { } } },
  };

  vm.createContext(scope);
  const acPath = new URL("../../components/PhAddressAutocomplete/PhAddressAutocomplete.jsx", import.meta.url);
  const dialogPath = new URL("./CustomerAddDialog.jsx", import.meta.url);
  const { code: acCode } = await transformJsx(await readFile(acPath, "utf8"), acPath.pathname);
  const { code: dialogCode } = await transformJsx(await readFile(dialogPath, "utf8"), dialogPath.pathname);

  vm.runInContext(
    stripImports(acCode).replace("export default function", "function") +
    "\n" +
    stripImports(dialogCode).replace("export default function", "function") +
    "\nthis.Dialog=CustomerAddDialog;",
    scope
  );

  return {
    saved,
    effects,
    refs,
    get closed() { return closed; },
    render(callerRole = "admin", customersOverride = existingCustomers) {
      cursor = refCursor = idCounter = 0;
      return scope.Dialog({
        callerRole,
        existingCustomers: customersOverride,
        onSaved: value => saved.push(value),
        onClose: () => closed++,
      });
    },
  };
}

const event = () => ({ preventDefault() { }, stopPropagation() { } });

test("CustomerAddDialog renders all fields in top-down order, disables submit when name is empty, and confirms dirty cancel", async () => {
  const ui = await fixture(async () => ({ id: "c1", name: "Acme" }));
  let tree = ui.render();

  const inputs = find(tree, "input");
  assert.equal(inputs.length, 8);
  assert.deepEqual(
    inputs.map(i => i.props.name),
    ["name", "email", "phone", "notes", "province", "city", "barangay", "address"]
  );

  const nameInput = inputs.find(i => i.props.name === "name");
  assert.ok(nameInput);
  assert.equal(nameInput.props.value, "");

  // Two clean form sections
  const legends = find(tree, "legend").map(l => textOf(l));
  assert.deepEqual(legends, ["1. Customer & Contact Details", "2. Primary Address"]);

  // Submit button disabled when name is empty
  const submitBtn = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(submitBtn.props.disabled, true);

  // Type in name
  nameInput.props.onChange({ target: { value: "Mega Trading" } });
  tree = ui.render();

  const enabledSubmit = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(enabledSubmit.props.disabled, false);

  // Dirty cancel displays in-app confirmation modal, form stays open
  find(tree, "button").find(b => b.children.includes("Cancel")).props.onClick();
  tree = ui.render();
  assert.equal(ui.closed, 0);

  // User can click "Keep Editing" to dismiss confirmation and continue editing
  const keepEditingBtn = find(tree, "button").find(b => b.children.includes("Keep Editing"));
  assert.ok(keepEditingBtn);
  keepEditingBtn.props.onClick();
  tree = ui.render();
  assert.equal(ui.closed, 0);

  // Esc / onCancel on dirty form brings up discard confirmation
  tree.props.onCancel(event());
  tree = ui.render();
  assert.equal(ui.closed, 0);

  // Confirming discard via in-app button closes the dialog
  const discardBtn = find(tree, "button").find(b => b.children.includes("Discard Customer"));
  assert.ok(discardBtn);
  discardBtn.props.onClick();
  assert.equal(ui.closed, 1);
});

test("CustomerAddDialog formats phone with +63 badge, submits normalized values, disables inputs while saving, and calls onSaved", async () => {
  let resolveSave, passedValues, passedOptions;
  const ui = await fixture((values, opts) => {
    passedValues = values;
    passedOptions = opts;
    return new Promise(done => { resolveSave = done; });
  });

  let tree = ui.render("staff");
  const inputs = find(tree, "input");

  // Has +63 prefix badge
  assert.ok(find(tree, "span").some(s => textOf(s) === "+63"));

  // Fill in required name and optional fields
  inputs.find(i => i.props.name === "name").props.onChange({ target: { value: "Fast Deliveries" } });
  inputs.find(i => i.props.name === "email").props.onChange({ target: { value: "dispatch@fast.ph" } });
  inputs.find(i => i.props.name === "phone").props.onChange({ target: { value: "0917-888-9999" } });
  inputs.find(i => i.props.name === "notes").props.onChange({ target: { value: "Net 15 terms" } });
  inputs.find(i => i.props.name === "province").props.onChange({ target: { value: "Metro Manila" } });
  inputs.find(i => i.props.name === "city").props.onChange({ target: { value: "Pasig City" } });
  inputs.find(i => i.props.name === "barangay").props.onChange({ target: { value: "Ugong" } });
  inputs.find(i => i.props.name === "address").props.onChange({ target: { value: "Building 4" } });

  tree = ui.render("staff");
  assert.equal(find(tree, "input").find(i => i.props.name === "phone").props.value, "917 888 9999");

  // Submit form
  const pending = find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render("staff");

  // While in flight, all inputs are disabled
  assert.ok(find(tree, "input").every(i => i.props.disabled));
  assert.equal(passedOptions.callerRole, "staff");
  assert.equal(passedValues.name, "Fast Deliveries");
  assert.equal(passedValues.email, "dispatch@fast.ph");
  assert.equal(passedValues.phone, "+63 917 888 9999");

  // Resolve save
  resolveSave({ id: "cust-new-1", name: "Fast Deliveries", customer_code: "CUST-0099" });
  await pending;

  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].customer_code, "CUST-0099");
});

test("CustomerAddDialog displays duplicate or validation errors and retains entered inputs for retry", async () => {
  const ui = await fixture(async () => {
    throw new Error('A customer with email "duplicate@example.com" already exists.');
  });

  let tree = ui.render();
  find(tree, "input").find(i => i.props.name === "name").props.onChange({ target: { value: "Duplicate Company" } });
  find(tree, "input").find(i => i.props.name === "email").props.onChange({ target: { value: "duplicate@example.com" } });
  tree = ui.render();

  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();

  // Preserves draft
  assert.equal(find(tree, "input").find(i => i.props.name === "name").props.value, "Duplicate Company");
  assert.equal(find(tree, "input").find(i => i.props.name === "email").props.value, "duplicate@example.com");

  // Displays error alert
  const alert = find(tree, "div").find(d => d.props.role === "alert");
  assert.ok(alert);
  assert.ok(alert.children.some(c => typeof c === "string" || (c.children && c.children.some(ch => String(ch).includes("already exists")))));
  assert.equal(ui.saved.length, 0);
});

test("CustomerAddDialog supports enabling mobile application credentials and validates passwords", async () => {
  let submittedPayload = null;
  const ui = await fixture(async (payload) => {
    submittedPayload = payload;
    return { id: "c-mobile-1", name: payload.name, user_id: "user-auth-1" };
  });

  let tree = ui.render();
  const nameInput = find(tree, "input").find(i => i.props.name === "name");
  const emailInput = find(tree, "input").find(i => i.props.name === "email");
  nameInput.props.onChange({ target: { value: "Mobile Customer Inc" } });
  emailInput.props.onChange({ target: { value: "app@mobilecustomer.ph" } });
  tree = ui.render();

  // Click "+ Enable Mobile Access"
  const toggleBtn = find(tree, "button").find(b => b.children && b.children.some(c => typeof c === "object" && c.children && c.children.includes("+ Enable Mobile Access")));
  assert.ok(toggleBtn, "Must find + Enable Mobile Access button");
  toggleBtn.props.onClick();
  tree = ui.render();

  // Now password inputs exist
  const pwdInputs = find(tree, "input").filter(i => i.props.name === "password" || i.props.name === "confirmPassword");
  assert.equal(pwdInputs.length, 2, "Must render password and confirmPassword inputs");

  // Submitting with empty password shows validation error
  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();
  let alert = find(tree, "div").find(d => d.props.role === "alert");
  assert.ok(alert);
  assert.match(JSON.stringify(alert), /temporary password/i);

  // Submitting with short password shows validation error
  find(tree, "input").find(i => i.props.name === "password").props.onChange({ target: { value: "123" } });
  find(tree, "input").find(i => i.props.name === "confirmPassword").props.onChange({ target: { value: "123" } });
  tree = ui.render();
  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();
  alert = find(tree, "div").find(d => d.props.role === "alert");
  assert.match(JSON.stringify(alert), /at least 8 characters/i);

  // Submitting with mismatched password shows validation error
  find(tree, "input").find(i => i.props.name === "password").props.onChange({ target: { value: "SecurePass123" } });
  find(tree, "input").find(i => i.props.name === "confirmPassword").props.onChange({ target: { value: "MismatchedPass123" } });
  tree = ui.render();
  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();
  alert = find(tree, "div").find(d => d.props.role === "alert");
  assert.match(JSON.stringify(alert), /passwords do not match/i);

  // Submitting with matching valid password succeeds
  find(tree, "input").find(i => i.props.name === "confirmPassword").props.onChange({ target: { value: "SecurePass123" } });
  tree = ui.render();
  await find(tree, "form")[0].props.onSubmit(event());
  ui.render();

  assert.equal(submittedPayload.name, "Mobile Customer Inc");
  assert.equal(submittedPayload.email, "app@mobilecustomer.ph");
  assert.equal(submittedPayload.password, "SecurePass123");
  assert.equal(submittedPayload.confirmPassword, "SecurePass123");
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].user_id, "user-auth-1");
});

test("CustomerAddDialog supports bidirectional PSGC auto-fill, clearing stale children, and free-text fallback", async () => {
  let submitted = null;
  const ui = await fixture(async (payload) => {
    submitted = payload;
    return { id: "c-addr", ...payload };
  });

  let tree = ui.render();

  // 1. Search Barangay directly while City & Province are blank -> reverse-fills City & Province
  const brgyInput = find(tree, "input").find(i => i.props.name === "barangay");
  brgyInput.props.onFocus();
  brgyInput.props.onChange({ target: { value: "Ugong" } });
  tree = ui.render();

  const brgyOptions = find(tree, "li").filter(li => li.props.role === "option");
  const pasigUgong = brgyOptions.find(li => textOf(li).includes("Pasig City, Metro Manila"));
  assert.ok(pasigUgong, "Barangay dropdown must display parent city and province in subtitle");
  pasigUgong.props.onMouseDown(event());
  tree = ui.render();

  assert.equal(find(tree, "input").find(i => i.props.name === "barangay").props.value, "Ugong");
  assert.equal(find(tree, "input").find(i => i.props.name === "city").props.value, "Pasig City");
  assert.equal(find(tree, "input").find(i => i.props.name === "province").props.value, "Metro Manila");

  // 2. Selecting a different Province clears stale City & Barangay
  const provInput = find(tree, "input").find(i => i.props.name === "province");
  provInput.props.onFocus();
  provInput.props.onChange({ target: { value: "Nueva Ecija" } });
  tree = ui.render();

  const nuevaEcijaOpt = find(tree, "li").find(li => li.props.role === "option" && textOf(li).includes("Nueva Ecija"));
  assert.ok(nuevaEcijaOpt);
  nuevaEcijaOpt.props.onMouseDown(event());
  tree = ui.render();

  assert.equal(find(tree, "input").find(i => i.props.name === "province").props.value, "Nueva Ecija");
  assert.equal(find(tree, "input").find(i => i.props.name === "city").props.value, "");
  assert.equal(find(tree, "input").find(i => i.props.name === "barangay").props.value, "");

  // 3. Selecting a City directly (Cabanatuan City) auto-populates Province and filters Barangay
  const cityInput = find(tree, "input").find(i => i.props.name === "city");
  cityInput.props.onFocus();
  cityInput.props.onChange({ target: { value: "Cabanatuan" } });
  tree = ui.render();

  const cabanatuanOpt = find(tree, "li").find(li => li.props.role === "option" && textOf(li).includes("Cabanatuan City"));
  assert.ok(cabanatuanOpt);
  cabanatuanOpt.props.onMouseDown(event());
  tree = ui.render();

  assert.equal(find(tree, "input").find(i => i.props.name === "city").props.value, "Cabanatuan City");
  assert.equal(find(tree, "input").find(i => i.props.name === "province").props.value, "Nueva Ecija");

  // 4. Free-text fallback for custom sitio/subdivision
  find(tree, "input").find(i => i.props.name === "barangay").props.onChange({ target: { value: "Sitio Maligaya (Custom)" } });
  find(tree, "input").find(i => i.props.name === "name").props.onChange({ target: { value: "Central Luzon Haulers" } });
  find(tree, "input").find(i => i.props.name === "address").props.onChange({ target: { value: "Km 115 Maharlika Hwy" } });
  tree = ui.render();

  await find(tree, "form")[0].props.onSubmit(event());
  assert.equal(submitted.province, "Nueva Ecija");
  assert.equal(submitted.city, "Cabanatuan City");
  assert.equal(submitted.barangay, "Sitio Maligaya (Custom)");
  assert.equal(submitted.address, "Km 115 Maharlika Hwy");
});

test("CustomerAddDialog normalizes 09... phone paste and shows inline duplicate warning without blocking form", async () => {
  const existingCustomers = [
    { id: "c-existing", customer_code: "CUST-0042", name: "Mabutol Farms Inc", phone: "+63 917 555 1234" },
  ];
  const ui = await fixture(async (p) => ({ id: "c-2", ...p }), { existingCustomers });
  let tree = ui.render();

  const phoneInput = find(tree, "input").find(i => i.props.name === "phone");
  let pastePrevented = false;
  phoneInput.props.onPaste({
    preventDefault() { pastePrevented = true; },
    clipboardData: { getData: () => "0917-555-1234" },
  });
  tree = ui.render();

  assert.equal(pastePrevented, true);
  assert.equal(find(tree, "input").find(i => i.props.name === "phone").props.value, "917 555 1234");

  const callout = find(tree, "div").find(d => d.props.className === "customer-duplicate-callout");
  assert.ok(callout, "Must render live inline duplicate warning callout");
  assert.match(textOf(callout), /Account with this contact number already exists/);
  assert.match(textOf(callout), /Mabutol Farms Inc/);

  // Name match also triggers callout when phone is cleared
  find(tree, "input").find(i => i.props.name === "phone").props.onChange({ target: { value: "" } });
  find(tree, "input").find(i => i.props.name === "name").props.onChange({ target: { value: "  mabutol farms inc " } });
  tree = ui.render();
  const nameCallout = find(tree, "div").find(d => d.props.className === "customer-duplicate-callout");
  assert.ok(nameCallout);
  assert.match(textOf(nameCallout), /Mabutol Farms Inc/);
});

test("CustomerAddDialog handles +6309/00639/dot phone pastes and rejects partial mobile numbers", async () => {
  let submitted = null;
  const ui = await fixture(async (payload) => {
    submitted = payload;
    return { id: "c-variant", ...payload };
  });

  for (const variant of ["+63 0917 555 1234", "00639175551234", "0917.555.1234"]) {
    assert.equal(formatPhMobileInput(variant), "917 555 1234");
    assert.equal(toFullPhPhone(variant), "+63 917 555 1234");
  }

  let tree = ui.render();
  find(tree, "input").find(i => i.props.name === "name").props.onChange({ target: { value: "Variant Co" } });
  find(tree, "input").find(i => i.props.name === "phone").props.onChange({ target: { value: "917 123" } });
  tree = ui.render();
  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();

  assert.equal(submitted, null);
  const alert = find(tree, "div").find(d => d.props.role === "alert");
  assert.ok(alert);
  assert.match(textOf(alert), /valid Philippine mobile/i);

  find(tree, "input").find(i => i.props.name === "phone").props.onPaste({
    preventDefault() { },
    clipboardData: { getData: () => "+63 0917 555 1234" },
  });
  tree = ui.render();
  await find(tree, "form")[0].props.onSubmit(event());
  assert.equal(submitted.phone, "+63 917 555 1234");
});
