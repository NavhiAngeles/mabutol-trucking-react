import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

const find = (node, type) => !node || typeof node !== "object" ? [] : [
  ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)),
];

async function fixture(createCustomerMock, confirm = () => true) {
  const states = [], refs = [], effects = [], saved = [];
  let cursor = 0, refCursor = 0, closed = 0;
  const scope = {
    React: {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
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
    createCustomer: createCustomerMock,
    window: { confirm },
    document: { body: { style: { overflow: "" } }, activeElement: { focus() {} } },
  };

  vm.createContext(scope);
  const path = new URL("./CustomerAddDialog.jsx", import.meta.url);
  const { code } = await transformWithOxc(await readFile(path, "utf8"), path.pathname, { jsx: { runtime: "classic" } });
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace("export default function", "function") + "\nthis.Dialog=CustomerAddDialog;", scope);

  return {
    saved,
    effects,
    refs,
    get closed() { return closed; },
    render(callerRole = "admin") {
      cursor = refCursor = 0;
      return scope.Dialog({
        callerRole,
        onSaved: value => saved.push(value),
        onClose: () => closed++,
      });
    },
  };
}

const event = () => ({ preventDefault() {} });

test("CustomerAddDialog renders all fields, disables submit when name is empty, and confirms dirty cancel", async () => {
  const ui = await fixture(async () => ({ id: "c1", name: "Acme" }));
  let tree = ui.render();

  const inputs = find(tree, "input");
  assert.equal(inputs.length, 8);
  const nameInput = inputs.find(i => i.props.name === "name");
  assert.ok(nameInput);
  assert.equal(nameInput.props.value, "");

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

test("CustomerAddDialog submits form values, passes callerRole, disables inputs while saving, and calls onSaved", async () => {
  let resolveSave, passedValues, passedOptions;
  const ui = await fixture((values, opts) => {
    passedValues = values;
    passedOptions = opts;
    return new Promise(done => { resolveSave = done; });
  });

  let tree = ui.render("staff");
  const inputs = find(tree, "input");

  // Fill in required name and optional fields
  inputs.find(i => i.props.name === "name").props.onChange({ target: { value: "Fast Deliveries" } });
  inputs.find(i => i.props.name === "email").props.onChange({ target: { value: "dispatch@fast.ph" } });
  inputs.find(i => i.props.name === "phone").props.onChange({ target: { value: "0917-888-9999" } });
  inputs.find(i => i.props.name === "notes").props.onChange({ target: { value: "Net 15 terms" } });
  inputs.find(i => i.props.name === "address").props.onChange({ target: { value: "Building 4" } });
  inputs.find(i => i.props.name === "barangay").props.onChange({ target: { value: "Ugong" } });
  inputs.find(i => i.props.name === "city").props.onChange({ target: { value: "Pasig" } });
  inputs.find(i => i.props.name === "province").props.onChange({ target: { value: "Metro Manila" } });

  tree = ui.render("staff");

  // Submit form
  const pending = find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render("staff");

  // While in flight, all inputs are disabled
  assert.ok(find(tree, "input").every(i => i.props.disabled));
  assert.equal(passedOptions.callerRole, "staff");
  assert.equal(passedValues.name, "Fast Deliveries");
  assert.equal(passedValues.email, "dispatch@fast.ph");
  assert.equal(passedValues.phone, "0917-888-9999");

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

