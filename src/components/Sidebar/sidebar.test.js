import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

async function component(path, name, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, path, { jsx: { runtime: "classic" } });
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0;
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
    useEffect: fn => effects.push(fn),
    createContext: () => ({ Provider: "provider" }),
    ...dependencies,
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function").replace(/^export default .*;$/gm, "").replaceAll("import.meta.env.VITE_MAPTILER_API_KEY", '"test-key"') + `\nthis.Component=${name};`, scope);
  return { effects, refs, render() { stateIndex = 0; refIndex = 0; return scope.Component({ children: "content" }); } };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function sidebar(signOut) {
  const events = [];
  const ui = await component("./sidebar.jsx", "Sidebar", {
    useNavigate: () => (...args) => events.push(["navigate", ...args]),
    useLocation: () => ({ pathname: "/dashboard" }),
    useAuth: () => ({ clearAuth: () => events.push(["clear"]) }),
    supabase: { auth: { signOut } },
  });
  find(ui.render(), node => node.props.className === "nav-item logout-button")[0].props.onClick();
  const confirm = () => find(ui.render(), node => node.props.className === "btn-modal-yes")[0];
  return { ui, events, confirm };
}

test("logout waits, disables both actions, deduplicates rapid confirmation, clears auth then replaces route", async () => {
  const pending = deferred(); let calls = 0;
  const { ui, events, confirm } = await sidebar(options => { assert.equal(options.scope, "local"); calls++; return pending.promise; });
  const click = confirm().props.onClick;
  const work = click(); await click();
  assert.equal(calls, 1); assert.equal(events.length, 0);
  const buttons = find(ui.render(), node => node.type === "button");
  assert.ok(buttons.every(button => button.props.disabled));
  assert.ok(JSON.stringify(ui.render()).includes("Logging out"));
  pending.resolve({ error: null }); await work;
  assert.equal(events[0][0], "clear"); assert.equal(events[1][0], "navigate");
  assert.equal(events[1][1], "/"); assert.equal(events[1][2].replace, true);
});
for (const mode of ["returned error", "rejected request"]) {
  test(`${mode} retains dialog/session and permits retry`, async () => {
    let attempts = 0;
    const { ui, events, confirm } = await sidebar(async () => {
      if (++attempts === 1) { if (mode === "rejected request") throw Error("network"); return { error: Error("failed") }; }
      return { error: null };
    });
    await confirm().props.onClick();
    assert.equal(events.length, 0);
    assert.ok(find(ui.render(), node => node.props.role === "alert").length);
    assert.equal(confirm().props.disabled, false);
    await confirm().props.onClick(); assert.equal(events[0][0], "clear");
  });
}
test("cancel closes confirmation without signing out", async () => {
  let calls = 0;
  const { ui, events } = await sidebar(() => { calls++; });
  find(ui.render(), node => node.props.className === "btn-modal-no")[0].props.onClick();
  assert.equal(find(ui.render(), node => node.props.role === "dialog").length, 0);
  assert.equal(calls, 0); assert.equal(events.length, 0);
});

test("SIGNED_OUT and explicit clear prevent stale profile restoring protected access or map session", async () => {
  const profile = deferred(); let callback;
  const auth = await component("../../context/AuthContext.jsx", "AuthProvider", {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "office" } } } }), onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
      from: () => ({ select: () => ({ eq: () => ({ single: () => profile.promise }) }) }),
    },
  });
  auth.render(); auth.effects[0](); await Promise.resolve();
  callback("SIGNED_OUT");
  auth.render().props.value.clearAuth();
  profile.resolve({ data: { role: "admin" } }); await Promise.resolve(); await Promise.resolve();
  const current = auth.render().props.value;
  assert.equal(current.user, null); assert.equal(current.role, null); assert.equal(current.loading, false);
  const guard = await component("../../router/ProtectedRoute.jsx", "ProtectedRoute", { useAuth: () => current, Navigate: "redirect" });
  assert.equal(guard.render().type, "redirect");
  const session = { user: { id: "office" }, role: "admin" };
  const map = await component("../../pages/Dashboard/DashboardMapProvider.jsx", "DashboardMapProvider", { useAuth: () => session });
  const signedInKey = map.render().props.key;
  Object.assign(session, current);
  assert.notEqual(map.render().props.key, signedInKey);
  assert.equal(map.render().props.key, "signed-out");
});

test("cached map effect cleanup removes MapLibre instance and disconnects observer", async () => {
  let removed = 0, disconnected = 0;
  const map = await component("../../pages/Dashboard/DashboardTrackingMap.jsx", "DashboardTrackingMap", {
    useLiveData: () => ({ data: [], loading: false, error: null }), getLiveTracking: () => {}, DASHBOARD_TABLES: [],
    maplibregl: { setWorkerUrl() {}, Map: class { on() {} remove() { removed++; } } },
    maplibreWorkerUrl: "test-worker", LUZON_CENTER: [121, 15], LUZON_BOUNDS: [], LUZON_MIN_ZOOM: 5, LUZON_MAX_ZOOM: 18,
    ResizeObserver: class { observe() {} disconnect() { disconnected++; } },
  });
  map.render(); map.refs[0].current = {};
  const cleanup = map.effects[0]();
  assert.equal(typeof cleanup, "function");
  cleanup();
  assert.equal(removed, 1); assert.equal(disconnected, 1);
  assert.equal(map.refs[1].current, null);
});

test("late getSession result after SIGNED_OUT cannot reload the old account", async () => {
  const pending = deferred(); let callback, queries = 0;
  const auth = await component("../../context/AuthContext.jsx", "AuthProvider", {
    supabase: {
      auth: { getSession: () => pending.promise, onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
      from() { queries++; throw Error("Must not load signed-out profile"); },
    },
  });
  auth.render(); auth.effects[0](); callback("SIGNED_OUT");
  pending.resolve({ data: { session: { user: { id: "old-user" } } } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(queries, 0);
  assert.equal(auth.render().props.value.user, null);
});
