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

const sampleWorkflow = {
  events: [{ id: 'ev-1', event_type: 'pickup_arrived', occurred_at: '2026-10-24T08:00:00Z', meta: null }],
  position: { recorded_at: '2026-10-24T08:30:00Z', accuracy_m: 5 },
  documents: [],
  incident_evidence: [],
  incidents: [],
  expenses: [],
  deliveries: [{
    id: 'del-1', status: 'in_transit', proof_review_status: 'pending_review',
    proof_review_reason: null, updated_at: '2026-10-24T08:00:00Z',
    pickup_arrived_at: '2026-10-24T08:00:00Z', grace_ends_at: '2026-10-24T08:30:00Z',
    auto_cancel_at: '2026-10-24T09:00:00Z',
  }],
};

async function mountDeliveryOperations(customService = {}) {
  const { code } = await transformWithOxc(
    fs.readFileSync(new URL('./DeliveryOperations.jsx', import.meta.url), 'utf8'),
    'DeliveryOperations.jsx',
    { jsx: { runtime: 'classic' } }
  );
  const states = [], refs = [], effects = [], callbacks = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, callbackIndex = 0, pending = [];
  let currentProps = { shipmentId: 's', shipmentStatus: 'review', shipmentRefreshVersion: 0, onChanged: async () => true };

  const service = {
    watch: () => () => {},
    load: async () => sampleWorkflow,
    action: async () => ({ id: 'del-1', status: 'completed' }),
    reviewExpense: async () => ({ id: 'exp-1', status: 'approved' }),
    proofUrl: async () => 'https://example.com/proof.jpg',
    evidenceUrl: async () => 'https://example.com/evidence.jpg',
    ...customService,
  };

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
    useCallback(fn, deps) {
      const i = callbackIndex++;
      const old = callbacks[i];
      if (!old || (deps && deps.some((d, j) => old.deps[j] !== d))) {
        callbacks[i] = { deps, fn };
      }
      return callbacks[i].fn;
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
    deliveryWorkflowService: () => service,
    DeliveryRouteReview: 'DeliveryRouteReview',
    DeliveryConversation: 'DeliveryConversation',
    setInterval: () => 1,
    clearInterval: () => {},
    Promise,
    Date,
  });

  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Component = DeliveryOperations;', context);

  const render = (props = {}) => {
    stateIndex = 0; refIndex = 0; effectIndex = 0; callbackIndex = 0; pending = [];
    currentProps = { ...currentProps, ...props };
    const tree = context.Component(currentProps);
    pending.forEach(run => run());
    return tree;
  };

  return { render, service, states, refs, flush: async () => { await tick(); await tick(); } };
}

test('DELIVERY-01: successful read clears loadError', async () => {
  let fail = true;
  const ui = await mountDeliveryOperations({
    load: async () => {
      if (fail) throw new Error('Database connection failed');
      return sampleWorkflow;
    },
  });

  ui.render();
  await ui.flush();
  let tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('Database connection failed'));

  fail = false;
  const retryBtn = button(tree, 'Retry delivery refresh');
  assert.ok(retryBtn, 'Retry delivery refresh button rendered');
  retryBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  assert.ok(!JSON.stringify(tree).includes('Database connection failed'));
  assert.ok(JSON.stringify(tree).includes('pickup arrived'));
  assert.equal(button(tree, 'Refresh delivery workflow').children[0], 'Refresh delivery workflow');
});

test('DELIVERY-01: failed refresh retains and labels the last good snapshot', async () => {
  let fail = false;
  const ui = await mountDeliveryOperations({
    load: async () => {
      if (fail) throw new Error('Gateway timeout');
      return sampleWorkflow;
    },
  });

  ui.render();
  await ui.flush();
  let tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('pickup arrived'));

  // Subsequent refresh fails
  fail = true;
  const refreshBtn = button(tree, 'Refresh delivery workflow');
  refreshBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  // Last good snapshot is retained and labeled
  assert.ok(JSON.stringify(tree).includes('pickup arrived'), 'Previous events retained');
  assert.ok(JSON.stringify(tree).includes('Gateway timeout'), 'Load error exposed');
  assert.ok(JSON.stringify(tree).includes('Showing the last successfully loaded delivery records.'), 'Labeled as last good snapshot');
  assert.ok(button(tree, 'Retry delivery refresh'), 'Button switches to Retry');
});

test('DELIVERY-01: confirmed mutation followed by failed read keeps action confirmed, blocks repeat mutations and route saves until both refresh', async () => {
  let actionCalls = 0;
  let loadFail = false;
  let shipmentSucceeded = false;

  const ui = await mountDeliveryOperations({
    load: async () => {
      if (loadFail) throw new Error('Post-action refresh failed');
      return sampleWorkflow;
    },
    action: async () => {
      actionCalls++;
      return { id: 'del-1', status: 'completed' };
    },
  });

  ui.render({
    onChanged: async () => shipmentSucceeded,
  });
  await ui.flush();
  let tree = ui.render();

  // Enter reason for office action
  const textarea = find(tree, n => n.type === 'textarea')[0];
  textarea.props.onChange({ target: { value: 'Proof verified by office' } });
  tree = ui.render();

  // Perform mutation while follow-up load and shipment read fail
  loadFail = true;
  shipmentSucceeded = false;
  const completeBtn = button(tree, 'Confirm delivery completion');
  assert.ok(completeBtn, 'Found Confirm delivery completion button');
  await completeBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  // Action is confirmed and was not repeated
  assert.equal(actionCalls, 1, 'Underlying action executed exactly once');
  assert.ok(JSON.stringify(tree).includes('Action completed successfully, but follow-up data is not fully refreshed.'));
  assert.ok(JSON.stringify(tree).includes('Retry the read-only refreshes before taking another action; this action was not repeated.'));

  // Repeat mutations are blocked (textarea and action buttons disabled)
  const reasonArea = find(tree, n => n.type === 'textarea')[0];
  assert.equal(reasonArea.props.disabled, true, 'Reason textarea disabled during refresh barrier');
  const completeBtnDisabled = button(tree, 'Confirm delivery completion');
  assert.equal(completeBtnDisabled.props.disabled, true, 'Mutation button disabled');

  // Route updates in DeliveryRouteReview are blocked via actionBlocked prop
  let routeReview = find(tree, n => n.type === 'DeliveryRouteReview')[0];
  assert.equal(routeReview.props.actionBlocked, true, 'DeliveryRouteReview actionBlocked is true');

  // Step 1: Delivery records refresh successfully, but shipment details have not yet refreshed
  loadFail = false;
  const retryBtn = button(tree, 'Retry delivery refresh');
  await retryBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  // Barrier is STILL active because shipment details have not refreshed yet
  routeReview = find(tree, n => n.type === 'DeliveryRouteReview')[0];
  assert.equal(routeReview.props.actionBlocked, true, 'DeliveryRouteReview actionBlocked remains true until shipment details refresh');

  // Step 2: Now shipment details refresh as triggered by parent (shipmentRefreshVersion incremented)
  shipmentSucceeded = true;
  ui.render({ shipmentRefreshVersion: 1 });
  await ui.flush();
  tree = ui.render({ shipmentRefreshVersion: 1 });

  assert.ok(JSON.stringify(tree).includes('Action completed successfully. Delivery records and shipment details are current.'));
  const routeReviewAfter = find(tree, n => n.type === 'DeliveryRouteReview')[0];
  assert.equal(routeReviewAfter.props.actionBlocked, false, 'DeliveryRouteReview actionBlocked cleared');
});

test('DELIVERY-01: retry labels explicitly state they are read-only and do not repeat mutations', async () => {
  let actionCalls = 0;
  let shipmentRefreshSuccess = true;
  const ui = await mountDeliveryOperations({
    action: async () => {
      actionCalls++;
      return { id: 'del-1', status: 'completed' };
    },
  });
  ui.render({
    onChanged: async () => shipmentRefreshSuccess,
  });
  await ui.flush();
  let tree = ui.render();

  // Perform an action so that an action completed successfully
  const textarea = find(tree, n => n.type === 'textarea')[0];
  textarea.props.onChange({ target: { value: 'Proof verified by office' } });
  tree = ui.render();
  const completeBtn = button(tree, 'Confirm delivery completion');
  await completeBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  assert.equal(actionCalls, 1);

  // Subsequent manual refresh explicitly informs that refresh only reloads data and does not repeat the action
  const refreshBtn = button(tree, 'Refresh delivery workflow');
  await refreshBtn.props.onClick();
  await ui.flush();
  tree = ui.render();

  assert.ok(JSON.stringify(tree).includes('Refresh controls only reload data; they do not repeat the action.'));

  // Route review onSaved with unrefreshed follow-up states read-only retries
  shipmentRefreshSuccess = false;
  const routeReview = find(tree, n => n.type === 'DeliveryRouteReview')[0];
  await routeReview.props.onSaved?.();
  await ui.flush();
  tree = ui.render();

  assert.ok(JSON.stringify(tree).includes('Retry read-only refreshes before resubmitting the route.'));
});
