import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";
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
  toFullPhPhone,
} from "./customerFormUtils.js";

const find = (node, type) => !node || typeof node !== "object" ? [] : [
  ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)),
];

const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.children);
};

async function fixture(updateCustomer, confirm = () => true, { existingCustomers = [] } = {}) {
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
    useRef(initial) { return refs[refCursor++] ||= { current: initial }; },
    useEffect: fn => effects.push(fn),
    useMemo: fn => fn(),
    useId: () => `edit-id-${++idCounter}`,
    customerEditValues: row => Object.fromEntries(["name", "email", "phone", "address", "barangay", "city", "province"].map(key => [key, row[key] || ""])),
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
    toFullPhPhone,
    updateCustomer,
    window: { confirm },
    document: { body: { style: { overflow: "" } }, activeElement: { focus() {} } },
  };
  vm.createContext(scope);
  const acPath = new URL("../../components/PhAddressAutocomplete/PhAddressAutocomplete.jsx", import.meta.url);
  const dialogPath = new URL("./CustomerEditDialog.jsx", import.meta.url);
  const { code: acCode } = await transformWithOxc(await readFile(acPath, "utf8"), acPath.pathname, { jsx: { runtime: "classic" } });
  const { code: dialogCode } = await transformWithOxc(await readFile(dialogPath, "utf8"), dialogPath.pathname, { jsx: { runtime: "classic" } });

  vm.runInContext(
    stripImports(acCode).replace("export default function", "function") +
      "\n" +
      stripImports(dialogCode).replace("export default function", "function") +
      "\nthis.Dialog=CustomerEditDialog;",
    scope
  );

  return {
    saved, effects, refs, get closed() { return closed; },
    render(customerOverride = { id: "a", name: "Original", address: "Street", city: "City" }, customersOverride = existingCustomers) {
      cursor = refCursor = idCounter = 0;
      return scope.Dialog({
        customer: customerOverride,
        existingCustomers: customersOverride,
        onSaved: value => saved.push(value),
        onClose: () => closed++,
      });
    },
  };
}
const event = () => ({ preventDefault() {}, stopPropagation() {} });

test("edit dialog preserves separate address fields in top-down order, disables unchanged saves and confirms dirty cancellation", async () => {
  let discard = false;
  const ui = await fixture(async () => {}, () => discard);
  let tree = ui.render();

  const inputs = find(tree, "input");
  assert.deepEqual(
    inputs.map(i => i.props.name),
    ["name", "email", "phone", "province", "city", "barangay", "address"]
  );
  assert.deepEqual(
    find(tree, "legend").map(l => textOf(l)),
    ["1. Customer & Contact Details", "2. Primary Address"]
  );
  assert.equal(inputs.find(input => input.props.name === "address").props.value, "Street");
  assert.equal(inputs.find(input => input.props.name === "barangay").props.value, "");
  assert.equal(find(tree, "button").find(button => button.props.type === "submit").props.disabled, true);
  inputs[0].props.onChange({ target: { value: "Edited" } });
  tree = ui.render();
  assert.equal(find(tree, "button").find(button => button.props.type === "submit").props.disabled, false);
  find(tree, "button").find(button => button.children.includes("Cancel")).props.onClick();
  assert.equal(ui.closed, 0);
  discard = true;
  tree.props.onCancel(event()); assert.equal(ui.closed, 1);
});

test("pending saves block duplicate requests and close; success waits for confirmation", async () => {
  let resolve, calls = 0;
  const ui = await fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  let tree = ui.render();
  const pending = find(tree, "form")[0].props.onSubmit(event());
  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();
  assert.ok(find(tree, "input").every(input => input.props.disabled));
  tree.props.onCancel(event()); assert.equal(ui.closed, 0);
  assert.equal(calls, 1); assert.equal(ui.saved.length, 0);
  resolve({ id: "a", name: "Saved" }); await pending;
  assert.equal(ui.saved[0].name, "Saved");
});

test("failed saves retain the draft, expose an alert and allow retry", async () => {
  const ui = await fixture(async () => { throw new Error("Record changed"); });
  let tree = ui.render();
  find(tree, "input")[0].props.onChange({ target: { value: "Keep my draft" } });
  tree = ui.render(); await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render();
  assert.equal(find(tree, "input")[0].props.value, "Keep my draft");
  assert.ok(find(tree, "p").some(node => node.props.role === "alert" && node.children.includes("Record changed")));
  assert.equal(find(tree, "button").find(button => button.props.type === "submit").props.disabled, false);
  assert.equal(ui.saved.length, 0);
});

test("unmounted editor ignores a late save result", async () => {
  let resolve;
  const ui = await fixture(() => new Promise(done => { resolve = done; }));
  const tree = ui.render();
  ui.refs[0].current = { showModal() {} };
  const cleanup = ui.effects[0]();
  const pending = find(tree, "form")[0].props.onSubmit(event());
  cleanup(); resolve({ id: "a" }); await pending;
  assert.equal(ui.saved.length, 0);
});

test("edit dialog formats +63 phone, supports PSGC reverse auto-fill, and excludes self from duplicate check", async () => {
  let submittedPayload = null;
  const self = {
    id: "cust-self",
    name: "Mabutol Logistics",
    phone: "+63 917 111 2222",
    province: "Nueva Ecija",
    city: "Cabanatuan City",
    barangay: "Aduas Norte",
    address: "Lot 3",
  };
  const other = {
    id: "cust-other",
    customer_code: "CUST-0088",
    name: "North Star Haulers",
    phone: "09189990000",
  };

  const ui = await fixture(
    async (_customer, payload) => {
      submittedPayload = payload;
      return { id: "cust-self", ...payload };
    },
    () => true,
    { existingCustomers: [self, other] }
  );

  let tree = ui.render(self, [self, other]);
  // Displays formatted local phone without false self-duplicate warning
  assert.equal(find(tree, "input").find(i => i.props.name === "phone").props.value, "917 111 2222");
  assert.equal(find(tree, "div").filter(d => d.props.className === "customer-duplicate-callout").length, 0);

  // Pasting another customer's 09... number shows duplicate warning
  find(tree, "input").find(i => i.props.name === "phone").props.onPaste({
    preventDefault() {},
    clipboardData: { getData: () => "0918-999-0000" },
  });
  tree = ui.render(self, [self, other]);
  const callout = find(tree, "div").find(d => d.props.className === "customer-duplicate-callout");
  assert.ok(callout);
  assert.match(textOf(callout), /Account with this contact number already exists/);
  assert.match(textOf(callout), /North Star Haulers/);

  // Clear province first, then selecting Pasig City auto-populates Metro Manila and clears stale Cabanatuan barangay
  find(tree, "input").find(i => i.props.name === "province").props.onChange({ target: { value: "" } });
  tree = ui.render(self, [self, other]);
  const cityInput = find(tree, "input").find(i => i.props.name === "city");
  cityInput.props.onFocus();
  cityInput.props.onChange({ target: { value: "Pasig City" } });
  tree = ui.render(self, [self, other]);
  const pasigOpt = find(tree, "li").find(li => li.props.role === "option" && textOf(li).includes("Pasig City"));
  assert.ok(pasigOpt);
  pasigOpt.props.onMouseDown(event());
  tree = ui.render(self, [self, other]);

  assert.equal(find(tree, "input").find(i => i.props.name === "province").props.value, "Metro Manila");
  assert.equal(find(tree, "input").find(i => i.props.name === "city").props.value, "Pasig City");
  assert.equal(find(tree, "input").find(i => i.props.name === "barangay").props.value, "");

  await find(tree, "form")[0].props.onSubmit(event());
  assert.equal(submittedPayload.phone, "+63 918 999 0000");
  assert.equal(submittedPayload.province, "Metro Manila");
  assert.equal(submittedPayload.city, "Pasig City");
});
