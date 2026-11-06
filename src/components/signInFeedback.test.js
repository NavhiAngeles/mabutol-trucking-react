import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

async function load(auth) {
  const source = await readFile(new URL("./SignInFeedback.jsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "SignInFeedback.jsx", { jsx: { runtime: "classic" } });
  const effects = [], timers = [], cleared = [];
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useEffect: fn => effects.push(fn),
    useAuth: () => auth,
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { cleared.push(id); },
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace(/export default function/g, "function") + "\nthis.Component=SignInFeedback;", scope);
  return { effects, timers, cleared, render: () => scope.Component() };
}

test("sign-in success notice auto-dismisses after five seconds and cleans up its timer", async () => {
  let dismissed = 0;
  const dismissSignInMessage = () => { dismissed++; };
  const ui = await load({ user: { id: "office" }, signInMessage: "You have successfully signed in.", dismissSignInMessage });
  const box = ui.render();
  assert.equal(box.type, "aside");
  assert.equal(box.props.role, "status");
  const cleanup = ui.effects[0]();
  assert.equal(ui.timers.length, 1);
  assert.equal(ui.timers[0].ms, 5000);
  ui.timers[0].fn();
  assert.equal(dismissed, 1);
  cleanup();
  assert.deepEqual(ui.cleared, [1]);
  const close = box.children.flat(Infinity).find(node => node?.type === "button");
  assert.equal(close.props.onClick, dismissSignInMessage);
});

test("sign-in success notice renders nothing and schedules no timer without a user or message", async () => {
  for (const auth of [{ user: null, signInMessage: "x" }, { user: { id: "office" }, signInMessage: null }]) {
    const ui = await load({ ...auth, dismissSignInMessage() {} });
    assert.equal(ui.render(), null);
    assert.equal(ui.effects[0](), undefined);
    assert.equal(ui.timers.length, 0);
  }
});

