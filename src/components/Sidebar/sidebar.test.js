import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { snapshotStatus } from '../../services/snapshotStatus.js';

async function component(path, name, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, path, { jsx: { runtime: "classic" } });
  const states = [], refs = [], effects = [], callbacks = [];
  let stateIndex = 0, refIndex = 0, callbackIndex = 0;
  const scope = {
    React: {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
      useState: initial => scope.useState(initial),
      useRef: initial => scope.useRef(initial),
      useEffect: fn => scope.useEffect(fn),
      useCallback: (fn, deps) => scope.useCallback(fn, deps),
      useContext: ctx => scope.useContext ? scope.useContext(ctx) : null,
      createContext: () => ({ Provider: "provider" }),
    },
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
    useEffect: fn => effects.push(fn),
    useCallback(fn, deps) {
      const i = callbackIndex++;
      const prev = callbacks[i];
      if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, idx) => Object.is(d, prev.deps[idx]))) {
        return prev.fn;
      }
      callbacks[i] = { fn, deps };
      return fn;
    },
    createContext: () => ({ Provider: "provider" }),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() { }, window: { addEventListener() { }, removeEventListener() { } },
    ...dependencies,
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function").replace(/export const/g, "const").replace(/^export default .*;$/gm, "").replaceAll("import.meta.env.VITE_MAPTILER_API_KEY", '"test-key"') + `\nthis.Component=${name};`, scope);
  return {
    effects,
    refs,
    scope,
    render(props = { children: "content" }) {
      stateIndex = 0;
      refIndex = 0;
      callbackIndex = 0;
      return scope.Component(props);
    },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('sidebar actions are native buttons and disclosures expose expanded state and matching panels', async () => {
  const routes = [];
  const ui = await component('./sidebar.jsx', 'Sidebar', {
    useNavigate: () => path => routes.push(path),
    useLocation: () => ({ pathname: '/dashboard' }),
    useAuth: () => ({ clearAuth() { } }),
    supabase: { auth: { signOut: async () => ({}) } },
  });
  const actions = () => find(ui.render(), n => typeof n.props.onClick === 'function');
  const named = label => actions().find(n => n.children.includes(label));
  assert.ok(actions().every(n => n.type === 'button' && n.props.type === 'button'));
  named('Shipments').props.onClick(); assert.deepEqual(routes, ['/shipment']);
  named('Compliance').props.onClick(); assert.equal(routes.at(-1), '/compliance');
  for (const label of ['Reports', 'Settings']) {
    assert.equal(named(label).props['aria-expanded'], false);
    named(label).props.onClick();
    assert.equal(named(label).props['aria-expanded'], true);
    assert.equal(find(ui.render(), n => n.props.id === named(label).props['aria-controls']).length, 1);
    assert.ok(actions().every(n => n.type === 'button'));
  }
  assert.equal(named('Reports').props['aria-expanded'], false);
  named('Security').props.onClick(); assert.equal(routes.at(-1), '/settings/security');
  named('Settings').props.onClick();
  assert.equal(named('Settings').props['aria-expanded'], false);
  assert.equal(find(ui.render(), n => n.props.className?.includes('submenu-item')).length, 0);
  assert.equal(find(ui.render(), n => n.props.className === 'sidebar-help-unavailable').length, 0);
});

test('sidebar automatically expands matching submenu on active route and synchronizes when route changes', async () => {
  let currentPath = '/report/overview';
  const ui = await component('./sidebar.jsx', 'Sidebar', {
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: currentPath }),
    useAuth: () => ({ clearAuth() {} }),
    supabase: { auth: { signOut: async () => ({}) } },
  });

  const actions = () => find(ui.render(), n => typeof n.props.onClick === 'function');
  const named = label => actions().find(n => n.children.includes(label));

  // Initially on /report/overview: Reports should be expanded, Settings collapsed
  assert.equal(named('Reports').props['aria-expanded'], true);
  assert.equal(named('Settings').props['aria-expanded'], false);

  // Navigate to /settings/pricing
  currentPath = '/settings/pricing';
  assert.equal(named('Reports').props['aria-expanded'], false);
  assert.equal(named('Settings').props['aria-expanded'], true);

  // Navigate to /dashboard (root route): both collapsed
  currentPath = '/dashboard';
  assert.equal(named('Reports').props['aria-expanded'], false);
  assert.equal(named('Settings').props['aria-expanded'], false);
});

test('help button opens the Office Help & Operations Guide dialog and closing removes it', async () => {
  const HelpStub = () => null;
  const ui = await component('./sidebar.jsx', 'Sidebar', {
    useNavigate: () => () => { },
    useLocation: () => ({ pathname: '/dashboard' }),
    useAuth: () => ({ clearAuth() { } }),
    supabase: { auth: { signOut: async () => ({}) } },
    OfficeHelpDialog: HelpStub,
  });
  const help = () => find(ui.render(), n => n.props.className?.includes('sidebar-help-button'))[0];
  const dialogs = () => find(ui.render(), n => n.type === HelpStub);
  assert.equal(help().type, 'button');
  assert.equal(help().props.type, 'button');
  assert.equal(help().props['aria-haspopup'], 'dialog');
  assert.equal(help().props['aria-expanded'], false);
  assert.ok(help().children.flat(Infinity).some(child => typeof child === 'string' && child.includes('Help & Operations Guide')));
  assert.equal(dialogs().length, 0);
  help().props.onClick();
  assert.equal(help().props['aria-expanded'], true);
  assert.equal(dialogs().length, 1);
  dialogs()[0].props.onClose();
  assert.equal(dialogs().length, 0);
  assert.equal(help().props['aria-expanded'], false);
});

async function helpDialog(trigger) {
  const doc = { activeElement: trigger };
  let closes = 0;
  const ui = await component('./OfficeHelpDialog.jsx', 'OfficeHelpDialog', { document: doc });
  const props = { onClose: () => { closes++; } };
  const native = { opened: 0, closed: 0, showModal() { this.opened++; }, close() { this.closed++; } };
  const tree = ui.render(props);
  ui.refs[0].current = native;
  return { ui, doc, tree, native, props, closes: () => closes };
}
const textOf = node => typeof node === 'string' ? node : !node || typeof node !== 'object' ? '' : (node.children || []).flat(Infinity).map(textOf).join('');

test('help dialog opens as a native modal and restores focus to its trigger on close', async () => {
  let focused = 0;
  const { ui, tree, native } = await helpDialog({ isConnected: true, focus() { focused++; } });
  assert.equal(tree.type, 'dialog');
  assert.equal(tree.props['aria-modal'], 'true');
  assert.equal(find(tree, n => n.props.id === tree.props['aria-labelledby']).length, 1);
  assert.equal(textOf(find(tree, n => n.props.id === tree.props['aria-labelledby'])[0]), 'Office Help & Operations Guide');
  const cleanup = ui.effects[0]();
  assert.equal(native.opened, 1);
  cleanup();
  assert.equal(native.closed, 1);
  assert.equal(focused, 1);
});

test('help dialog skips focus restoration when the trigger has left the page', async () => {
  let focused = 0;
  const { ui } = await helpDialog({ isConnected: false, focus() { focused++; } });
  ui.effects[0]()();
  assert.equal(focused, 0);
});

test('Escape and both close buttons close the help dialog', async () => {
  const { tree, closes } = await helpDialog(null);
  let prevented = 0;
  tree.props.onCancel({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(closes(), 1);
  const buttons = find(tree, n => n.type === 'button');
  assert.ok(buttons.every(button => button.props.type === 'button'));
  const icon = buttons.find(button => button.props['aria-label'] === 'Close help guide');
  assert.equal(icon.props.autoFocus, true);
  for (const button of buttons) button.props.onClick();
  assert.equal(closes(), 1 + buttons.length);
  assert.ok(buttons.length >= 2);
});

test('Tab and Shift+Tab wrap focus inside the help dialog', async () => {
  const { tree, doc } = await helpDialog(null);
  const focus = [];
  const items = ['close', 'body', 'footer'].map(name => ({ name, focus() { focus.push(name); } }));
  const key = (shiftKey, active, other = 'Tab') => {
    let prevented = false;
    doc.activeElement = active;
    tree.props.onKeyDown({ key: other, shiftKey, preventDefault() { prevented = true; }, currentTarget: { querySelectorAll: () => items } });
    return prevented;
  };
  assert.equal(key(false, items[2]), true); assert.deepEqual(focus, ['close']);
  assert.equal(key(true, items[0]), true); assert.deepEqual(focus, ['close', 'footer']);
  assert.equal(key(false, items[1]), false);
  assert.equal(key(false, items[2], 'Enter'), false);
  assert.deepEqual(focus, ['close', 'footer']);
  const body = find(tree, n => n.props.className === 'office-help-body')[0];
  assert.equal(body.props.tabIndex, 0);
  assert.equal(body.props.role, 'region');
});

test('help guide covers booking review, toll pricing, manual dispatch and publishes verified support contacts', async () => {
  const { tree } = await helpDialog(null);
  const headings = find(tree, n => n.type === 'h3').map(textOf);
  assert.deepEqual(headings, ['Booking review', 'Toll pricing rules', 'Manual dispatch eligibility', 'Support contacts']);
  for (const heading of find(tree, n => n.type === 'section')) {
    assert.equal(find(heading, n => n.props.id === heading.props['aria-labelledby']).length, 1);
  }
  const text = textOf(tree);
  for (const phrase of ['Fee pending', 'Settings → Pricing', 'never estimated', 'exact requested vehicle type', 'no active maintenance', 'compliance documents', 'Started trips are locked', 'cannot be reassigned']) {
    assert.ok(text.includes(phrase), phrase);
  }
  const contacts = find(tree, n => n.props.className === 'office-help-contacts')[0];
  const rows = find(contacts, n => n.type === 'div');
  assert.deepEqual(rows.map(row => textOf(find(row, n => n.type === 'dt')[0])), ['Dispatch Hotline', 'Support Email', 'Office Hours']);
  assert.ok(textOf(contacts).includes('0977 851 7403'));
  assert.ok(textOf(contacts).includes('mabutoltrucking2015@gmail.com'));
  assert.ok(textOf(contacts).includes('Monday – Saturday, 8:00 AM – 5:00 PM (PHT)'));
  assert.ok(!textOf(contacts).includes('After-hours escalation'));
  const links = find(contacts, n => n.type === 'a');
  assert.equal(links.find(l => l.props.href === 'tel:09778517403')?.children[0], '0977 851 7403');
  assert.equal(links.find(l => l.props.href === 'mailto:mabutoltrucking2015@gmail.com')?.children[0], 'mabutoltrucking2015@gmail.com');
});
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
  const dialog = find(ui.render(), node => node.props.role === "dialog")[0];
  const buttons = find(dialog, node => node.type === "button");
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
      auth: { getSession: async () => ({ data: { session: { user: { id: "office" } } } }), onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { } } } }; } },
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
    snapshotStatus,
    useLiveData: () => ({ data: [], loading: false, error: null }), getLiveTracking: () => { }, DASHBOARD_TABLES: [],
    maplibregl: { setWorkerUrl() { }, Map: class { on() { } remove() { removed++; } } },
    maplibreWorkerUrl: "test-worker", LUZON_CENTER: [121, 15], LUZON_BOUNDS: [], LUZON_MIN_ZOOM: 5, LUZON_MAX_ZOOM: 18,
    ResizeObserver: class { observe() { } disconnect() { disconnected++; } },
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
      auth: { getSession: () => pending.promise, onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { } } } }; } },
      from() { queries++; throw Error("Must not load signed-out profile"); },
    },
  });
  auth.render(); auth.effects[0](); callback("SIGNED_OUT");
  pending.resolve({ data: { session: { user: { id: "old-user" } } } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(queries, 0);
  assert.equal(auth.render().props.value.user, null);
});

test('verified sign-in publishes office access before redirect and ignores a late anonymous startup read', async () => {
  const pending = deferred();
  const auth = await component('../../context/AuthContext.jsx', 'AuthProvider', {
    supabase: {
      auth: { getSession: () => pending.promise, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }) },
      from() { throw Error('Old startup must not load a profile'); },
    },
  });
  auth.render(); auth.effects[0]();
  auth.render().props.value.completeSignIn({ user: { id: 'office' }, role: 'admin' });
  assert.equal(auth.render().props.value.user.id, 'office');
  assert.equal(auth.render().props.value.loading, false);
  pending.resolve({ data: { session: null } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(auth.render().props.value.user.id, 'office');
  assert.equal(auth.render().props.value.role, 'admin');
  assert.equal(auth.render().props.value.signInMessage, 'You have successfully signed in.');
  auth.render().props.value.dismissSignInMessage();
  assert.equal(auth.render().props.value.signInMessage, null);
});

test('office permission polling applies role changes and blocks deactivated accounts', async () => {
  let tick; let profile = { role: 'admin', is_active: true };
  const auth = await component('../../context/AuthContext.jsx', 'AuthProvider', {
    setInterval(fn) { tick = fn; return 0; },
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'office', user_metadata: { role: 'admin' } } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
    },
  });
  auth.render(); auth.effects[0](); await tick();
  assert.equal(auth.render().props.value.role, 'admin');
  profile = { role: 'staff', is_active: true }; await tick();
  assert.equal(auth.render().props.value.role, 'staff');
  profile = { role: 'staff', is_active: false }; await tick();
  assert.equal(auth.render().props.value.user, null); assert.equal(auth.render().props.value.role, null);
});

test('failed profile refresh removes office access rather than keeping stale admin claims', async () => {
  let tick; let failed = false;
  const auth = await component('../../context/AuthContext.jsx', 'AuthProvider', {
    setInterval(fn) { tick = fn; return 0; },
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'office' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin', is_active: true }, error: failed ? Error('denied') : null }) }) }) }),
    },
  });
  auth.render(); auth.effects[0](); await tick();
  assert.equal(auth.render().props.value.role, 'admin'); failed = true; await tick();
  assert.equal(auth.render().props.value.role, null);
});

test('SignInFeedback auto-dismisses after 5 seconds, cleans up timer on manual close, maintains stable callback reference, and clears on SIGNED_OUT', async () => {
  const timers = [], cleared = [];
  let currentAuth = {
    user: { id: 'office' },
    role: 'admin',
    signInMessage: 'You have successfully signed in.',
    dismissSignInMessage: () => { currentAuth.signInMessage = null; },
  };

  const feedback = await component('../SignInFeedback.jsx', 'SignInFeedback', {
    useAuth: () => currentAuth,
    setTimeout: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout: id => { cleared.push(id); },
  });

  // 1. Initial render with active message: renders status aside and schedules 5000ms timer
  let tree = feedback.render();
  assert.equal(tree.type, 'aside');
  assert.equal(tree.props.role, 'status');
  assert.equal(tree.props.className, 'sign-in-success-box');
  assert.equal(feedback.effects.length, 1);
  const cleanup1 = feedback.effects[0]();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 5000);

  // 2. 5-second auto-dismiss timer fires
  timers[0].fn();
  assert.equal(currentAuth.signInMessage, null);
  cleanup1();
  assert.deepEqual(cleared, [1]);

  // 3. Reset and test manual close button & timer cleanup
  currentAuth.signInMessage = 'You have successfully signed in.';
  tree = feedback.render();
  const cleanup2 = feedback.effects[0]();
  assert.equal(timers.length, 2);
  const closeBtn = find(tree, n => n.type === 'button' && n.props['aria-label'] === 'Dismiss sign-in message')[0];
  assert.ok(closeBtn);
  closeBtn.props.onClick();
  assert.equal(currentAuth.signInMessage, null);
  cleanup2();
  assert.deepEqual(cleared, [1, 2]);

  // 4. Stable dismissSignInMessage across rerenders in AuthProvider
  let callback;
  const auth = await component('../../context/AuthContext.jsx', 'AuthProvider', {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'office' } } } }),
        onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin', is_active: true } }) }) }) }),
    },
  });

  auth.render();
  auth.effects[0]();
  auth.render().props.value.completeSignIn({ user: { id: 'office' }, role: 'admin' });

  // Grab dismissSignInMessage across two separate renders
  const fn1 = auth.render().props.value.dismissSignInMessage;
  auth.render();
  const fn2 = auth.render().props.value.dismissSignInMessage;
  assert.equal(fn1, fn2, 'dismissSignInMessage reference must remain stable across rerenders');
  assert.equal(auth.render().props.value.signInMessage, 'You have successfully signed in.');

  // 5. SIGNED_OUT event clears user and signInMessage
  callback('SIGNED_OUT');
  const signedOutVal = auth.render().props.value;
  assert.equal(signedOutVal.user, null);
  assert.equal(signedOutVal.role, null);
  assert.equal(signedOutVal.signInMessage, null);

  // When rendered with signed-out auth, SignInFeedback returns null and schedules no timer
  currentAuth = signedOutVal;
  const emptyTree = feedback.render();
  assert.equal(emptyTree, null);
});

test('sidebar supports mobile drawer props: reflects mobileOpen and invokes onClose on dismiss or navigation', async () => {
  let closedCount = 0;
  const routes = [];
  const ui = await component('./sidebar.jsx', 'Sidebar', {
    useNavigate: () => path => routes.push(path),
    useLocation: () => ({ pathname: '/dashboard' }),
    useAuth: () => ({ clearAuth() {} }),
    supabase: { auth: { signOut: async () => ({}) } },
  });

  // 1. Render closed without onClose prop
  const closedTree = ui.render({ mobileOpen: false });
  const asideClosed = find(closedTree, n => n.type === 'aside')[0];
  assert.ok(asideClosed);
  assert.equal(asideClosed.props.className, 'sidebar');
  assert.equal(find(closedTree, n => n.props.className === 'sidebar-mobile-close').length, 0);

  // 2. Render open with mobileOpen and onClose
  const openTree = ui.render({ mobileOpen: true, onClose: () => { closedCount++; } });
  const asideOpen = find(openTree, n => n.type === 'aside')[0];
  assert.ok(asideOpen.props.className.includes('mobile-open'));

  const closeBtn = find(openTree, n => n.props.className === 'sidebar-mobile-close')[0];
  assert.ok(closeBtn, 'Close button should render when onClose is provided');
  assert.equal(closeBtn.props['aria-label'], 'Close navigation sidebar');
  closeBtn.props.onClick();
  assert.equal(closedCount, 1, 'Clicking close button should invoke onClose');

  // 3. Clicking navigation link also invokes onClose and navigates
  const navItems = find(openTree, n => typeof n.props.onClick === 'function');
  const shipmentsBtn = navItems.find(n => n.children.includes('Shipments'));
  assert.ok(shipmentsBtn);
  shipmentsBtn.props.onClick();
  assert.equal(closedCount, 2, 'Navigating should invoke onClose');
  assert.deepEqual(routes, ['/shipment']);
});
