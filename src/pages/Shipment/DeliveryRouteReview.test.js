import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const tick = () => new Promise(resolve => setImmediate(resolve));
const find = (node, predicate) => !node || typeof node !== 'object' ? []
  : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const button = (tree, text) => find(tree, n => n.type === 'button' && n.children?.flat(Infinity).some(c => typeof c === 'string' && c.trim() === text))[0];

const sampleRoutingContext = {
  delivery: { id: 'del-1', updated_at: '2026-10-24T08:00:00Z' },
  shipment: {
    pickup_lat: 14.5995,
    pickup_lng: 120.9842,
    dropoff_lat: 14.6091,
    dropoff_lng: 121.0223,
    updated_at: '2026-10-24T08:00:00Z',
    weight_kg: 5000,
  },
  plan: {
    confirmed_at: '2026-10-24T08:30:00Z',
    reason: 'Verified entrance',
    profile: { height: 3.5, width: 2.5, length: 12, weight: 15, axleload: 8, hazmat: false },
  },
};

async function mountDeliveryRouteReview(options = {}) {
  const { code } = await transformWithOxc(
    fs.readFileSync(new URL('./DeliveryRouteReview.jsx', import.meta.url), 'utf8'),
    'DeliveryRouteReview.jsx',
    { jsx: { runtime: 'classic' } }
  );

  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, pending = [];
  let rpcResult = options.rpcResult || { data: sampleRoutingContext, error: null };
  let invokeCalls = 0;
  let invokeResult = options.invokeResult || { data: { ok: true }, error: null };

  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) {
      const i = refIndex++;
      return refs[i] ||= { current: initial };
    },
    useEffect(effect, deps) {
      const i = effectIndex++;
      const old = effects[i];
      if (!old || (deps && deps.some((d, j) => old.deps[j] !== d))) {
        pending.push(() => {
          old?.cleanup?.();
          effects[i] = { deps, cleanup: effect() };
        });
      }
    },
    supabase: {
      rpc: async () => rpcResult,
      functions: {
        invoke: async () => {
          invokeCalls++;
          return invokeResult;
        },
      },
    },
    routeConfirmation: () => ({ mode: 'confirm' }),
    Date,
    Promise,
    Object,
    Number,
    Math,
    String,
    Array,
  });

  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Component = DeliveryRouteReview;', context);

  let currentProps = {
    delivery: { id: 'del-1', status: 'in_transit' },
    onSaved: () => {},
    actionBlocked: false,
    ...options.props,
  };

  const render = (props = {}) => {
    stateIndex = 0; refIndex = 0; effectIndex = 0; pending = [];
    currentProps = { ...currentProps, ...props };
    const tree = context.Component(currentProps);
    pending.forEach(run => run());
    return tree;
  };

  return {
    render,
    setRpcResult: res => { rpcResult = res; },
    setInvokeResult: res => { invokeResult = res; },
    getInvokeCalls: () => invokeCalls,
    flush: async () => { await tick(); await tick(); },
  };
}

test('DELIVERY-01 Route Review: successful read clears error, failed read renders error', async () => {
  const ui = await mountDeliveryRouteReview({
    rpcResult: { data: null, error: { message: 'Database connection failed' } },
  });

  ui.render();
  await ui.flush();
  let tree = ui.render();

  assert.ok(JSON.stringify(tree).includes('Route records unavailable. Refresh to retry.'));

  // Reload truck route with successful read
  ui.setRpcResult({ data: sampleRoutingContext, error: null });
  const reloadBtn = button(tree, 'Reload truck route');
  assert.ok(reloadBtn, 'Reload truck route button is present');
  reloadBtn.props.onClick();
  ui.render();
  await ui.flush();
  tree = ui.render();

  assert.ok(!JSON.stringify(tree).includes('Route records unavailable. Refresh to retry.'));
  assert.ok(JSON.stringify(tree).includes('Verified entrance'));
});

test('DELIVERY-01 Route Review: actionBlocked pauses route updates and disables submit with refresh label', async () => {
  const ui = await mountDeliveryRouteReview({
    props: { actionBlocked: true },
  });

  ui.render();
  await ui.flush();
  let tree = ui.render();

  // Status message informs updates are paused until delivery records and shipment details refresh
  const statusMsg = find(tree, n => n.props?.role === 'status')[0];
  assert.ok(statusMsg, 'Status element rendered when actionBlocked is true');
  assert.equal(statusMsg.children[0], 'Route updates are paused until delivery records and shipment details refresh successfully.');

  // Submit button is disabled with label instructing user to refresh records
  const submitBtn = button(tree, 'Refresh records before route update');
  assert.ok(submitBtn, 'Submit button has "Refresh records before route update" label');
  assert.equal(submitBtn.props.disabled, true, 'Submit button is disabled when actionBlocked is true');

  // Attempting to invoke save while actionBlocked does nothing
  await submitBtn.props.onClick();
  await ui.flush();
  assert.equal(ui.getInvokeCalls(), 0, 'No route save function invoked while actionBlocked is true');

  // Once actionBlocked becomes false, the pause notice is removed and button returns to confirm mode
  tree = ui.render({ actionBlocked: false });
  const statusMsgAfter = find(tree, n => n.props?.role === 'status')[0];
  assert.equal(statusMsgAfter, undefined, 'Pause notice cleared when actionBlocked is false');

  // Fill in required confirmation fields so button becomes enabled
  const reasonTextarea = find(tree, n => n.type === 'textarea')[0];
  reasonTextarea.props.onChange({ target: { value: 'Verified entrance and axle limits' } });
  tree = ui.render({ actionBlocked: false });

  const confirmCheckbox = find(tree, n => n.type === 'input' && n.props?.type === 'checkbox')[0];
  confirmCheckbox.props.onChange({ target: { checked: true } });
  tree = ui.render({ actionBlocked: false });

  const activeSubmitBtn = button(tree, 'Confirm pins and calculate truck route');
  assert.ok(activeSubmitBtn, 'Button returns to "Confirm pins and calculate truck route"');
  assert.equal(activeSubmitBtn.props.disabled, false, 'Button is enabled once confirmed and actionBlocked is false');
});

test('DELIVERY-01 Route Review: confirmed save invokes delivery-routing and requires follow-up refresh', async () => {
  let savedCalled = false;
  const ui = await mountDeliveryRouteReview({
    props: {
      actionBlocked: false,
      onSaved: () => { savedCalled = true; },
    },
  });

  ui.render();
  await ui.flush();
  let tree = ui.render();

  // Fill in form confirmation
  const reasonTextarea = find(tree, n => n.type === 'textarea')[0];
  reasonTextarea.props.onChange({ target: { value: 'Verified dimensions with fleet' } });
  tree = ui.render();
  const confirmCheckbox = find(tree, n => n.type === 'input' && n.props?.type === 'checkbox')[0];
  confirmCheckbox.props.onChange({ target: { checked: true } });
  tree = ui.render();

  const submitBtn = button(tree, 'Confirm pins and calculate truck route');
  await submitBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  assert.equal(ui.getInvokeCalls(), 1, 'Edge Function delivery-routing invoked');
  assert.equal(savedCalled, true, 'onSaved callback triggered');

  // After save, button switches to disabled refresh reminder until context reloads
  const postSaveBtn = button(tree, 'Refresh records before route update');
  assert.ok(postSaveBtn, 'Post-save button instructs user to refresh records before next route update');
  assert.equal(postSaveBtn.props.disabled, true);
});
