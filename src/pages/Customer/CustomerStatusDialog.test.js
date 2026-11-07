import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

const find = (node, type) => !node || typeof node !== "object" ? [] : [
  ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)),
];

async function fixture(setCustomerActiveStatus = async () => ({ id: "cust-1", is_active: false })) {
  const states = [], refs = [], effects = [], confirmed = [];
  let cursor = 0, refCursor = 0, closed = 0;
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    },
    useRef(initial) { return refs[refCursor++] ||= { current: initial }; },
    useEffect: fn => effects.push(fn),
    setCustomerActiveStatus,
    document: { body: { style: { overflow: "" } }, activeElement: { focus() {} } },
  };
  vm.createContext(scope);
  const path = new URL("./CustomerStatusDialog.jsx", import.meta.url);
  const { code } = await transformWithOxc(await readFile(path, "utf8"), path.pathname, { jsx: { runtime: "classic" } });
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace("export default function", "function") + "\nthis.Dialog=CustomerStatusDialog;", scope);

  return {
    confirmed, effects, refs,
    get closed() { return closed; },
    render(customer = { id: "cust-1", name: "Acme Corp", customer_code: "CUST-001", is_active: true, updated_at: "2026-11-01T00:00:00Z" }, callerRole = "staff") {
      cursor = refCursor = 0;
      return scope.Dialog({
        customer,
        callerRole,
        onConfirmed: value => confirmed.push(value),
        onClose: () => closed++,
      });
    },
  };
}

const event = () => ({ preventDefault() {} });

test("status dialog renders suspend view with accessible attributes and validates reason requirement", async () => {
  const ui = await fixture();
  let tree = ui.render({ id: "cust-1", name: "Acme Corp", customer_code: "CUST-001", is_active: true });

  assert.equal(tree.type, "dialog");
  assert.equal(tree.props["aria-labelledby"], "customer-status-title");
  assert.equal(tree.props["aria-describedby"], "customer-status-description");

  // Title and prompt for active customer
  const title = find(tree, "h2")[0];
  assert.equal(title.children[0], "Suspend Customer Account");

  // Submit button starts disabled when reason is empty
  const submitBtn = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(submitBtn.props.disabled, true);
  assert.equal(submitBtn.children[0], "Suspend Account");

  // Typing < 3 characters keeps submit disabled
  const textarea = find(tree, "textarea")[0];
  textarea.props.onChange({ target: { value: "ab" } });
  tree = ui.render({ id: "cust-1", name: "Acme Corp", customer_code: "CUST-001", is_active: true });
  const updatedBtn = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(updatedBtn.props.disabled, true);

  // Typing valid reason enables submit
  textarea.props.onChange({ target: { value: "Overdue balance exceeding credit limit" } });
  tree = ui.render({ id: "cust-1", name: "Acme Corp", customer_code: "CUST-001", is_active: true });
  const enabledBtn = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(enabledBtn.props.disabled, false);
});

test("status dialog renders reactivate view when customer is suspended", async () => {
  const ui = await fixture();
  const tree = ui.render({ id: "cust-2", name: "Zenith Inc", customer_code: "CUST-002", is_active: false });

  const title = find(tree, "h2")[0];
  assert.equal(title.children[0], "Reactivate Customer Account");

  const submitBtn = find(tree, "button").find(b => b.props.type === "submit");
  assert.equal(submitBtn.children[0], "Reactivate Account");
  assert.equal(submitBtn.props.className, "btn-status-confirm");
});

test("status dialog submits with confirmation reason and notifies caller on success", async () => {
  let calledWith = null;
  const mockSave = async (cust, targetActive, reason, options) => {
    calledWith = { cust, targetActive, reason, options };
    return { ...cust, is_active: targetActive };
  };
  const ui = await fixture(mockSave);
  const cust = { id: "cust-1", name: "Acme Corp", is_active: true, updated_at: "2026-11-01T00:00:00Z" };
  let tree = ui.render(cust, "admin");

  find(tree, "textarea")[0].props.onChange({ target: { value: "Account review approved" } });
  tree = ui.render(cust, "admin");

  await find(tree, "form")[0].props.onSubmit(event());

  assert.ok(calledWith);
  assert.equal(calledWith.targetActive, false);
  assert.equal(calledWith.reason, "Account review approved");
  assert.equal(calledWith.options.callerRole, "admin");
  assert.equal(ui.confirmed.length, 1);
  assert.equal(ui.confirmed[0].is_active, false);
});

test("status dialog handles errors, displays alert and allows retry without closing", async () => {
  const mockSave = async () => { throw new Error("Optimistic lock error: Record was changed by another user."); };
  const ui = await fixture(mockSave);
  const cust = { id: "cust-1", name: "Acme Corp", is_active: true, updated_at: "2026-11-01T00:00:00Z" };
  let tree = ui.render(cust, "staff");

  find(tree, "textarea")[0].props.onChange({ target: { value: "Valid reason" } });
  tree = ui.render(cust, "staff");

  await find(tree, "form")[0].props.onSubmit(event());
  tree = ui.render(cust, "staff");

  assert.equal(ui.closed, 0);
  assert.equal(ui.confirmed.length, 0);
  const errorAlert = find(tree, "p").find(p => p.props.role === "alert");
  assert.ok(errorAlert);
  assert.ok(errorAlert.children.includes("Optimistic lock error: Record was changed by another user."));
});

test("status dialog close button and onCancel dismiss dialog", async () => {
  const ui = await fixture();
  const tree = ui.render();

  // Cancel button
  const cancelBtn = find(tree, "button").find(b => b.children.includes("Cancel"));
  cancelBtn.props.onClick();
  assert.equal(ui.closed, 1);

  // onCancel (Escape key)
  tree.props.onCancel(event());
  assert.equal(ui.closed, 2);
});

