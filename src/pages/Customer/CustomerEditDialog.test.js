import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

const find = (node, type) => !node || typeof node !== "object" ? [] : [
  ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)),
];
async function fixture(updateCustomer, confirm = () => true) {
  const states = [], refs = [], effects = [], saved = [];
  let cursor = 0, refCursor = 0, closed = 0;
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refCursor++] ||= { current: initial }; }, useEffect: fn => effects.push(fn),
    customerEditValues: row => Object.fromEntries(["name", "email", "phone", "address", "barangay", "city", "province"].map(key => [key, row[key] || ""])),
    updateCustomer, window: { confirm }, document: { body: { style: { overflow: "" } }, activeElement: { focus() {} } },
  };
  vm.createContext(scope);
  const path = new URL("./CustomerEditDialog.jsx", import.meta.url);
  const { code } = await transformWithOxc(await readFile(path, "utf8"), path.pathname, { jsx: { runtime: "classic" } });
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace("export default function", "function") + "\nthis.Dialog=CustomerEditDialog;", scope);
  return {
    saved, effects, refs, get closed() { return closed; },
    render() { cursor = refCursor = 0; return scope.Dialog({ customer: { id: "a", name: "Original", address: "Street", city: "City" }, onSaved: value => saved.push(value), onClose: () => closed++ }); },
  };
}
const event = () => ({ preventDefault() {} });

test("edit dialog preserves separate address fields, disables unchanged saves and confirms dirty cancellation", async () => {
  let discard = false;
  const ui = await fixture(async () => {}, () => discard);
  let tree = ui.render();
  assert.equal(find(tree, "input").find(input => input.props.name === "address").props.value, "Street");
  assert.equal(find(tree, "input").find(input => input.props.name === "barangay").props.value, "");
  assert.equal(find(tree, "button").find(button => button.props.type === "submit").props.disabled, true);
  find(tree, "input")[0].props.onChange({ target: { value: "Edited" } });
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
