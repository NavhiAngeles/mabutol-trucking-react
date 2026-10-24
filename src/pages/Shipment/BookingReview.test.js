import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const request = { id: 's', status: 'pending', updated_at: '2026-10-24T00:00:00Z', quoted_amount: 2500, override_amount: 0, cargo_description: 'Boxes', weight_kg: 500, pickup_address: 'Pickup', dropoff_address: 'Destination' };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function mount({ load = async () => request, save = async () => ({ id: 's', status: 'booked' }) } = {}) {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./BookingReview.jsx', import.meta.url), 'utf8'), 'BookingReview.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = []; let index = 0, refIndex = 0, effects = [], mounted = false, reviewed = [], closes = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    document: { activeElement: null },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect(effect) { if (!mounted) effects.push(effect); },
    fetchBookingRequest: load, reviewBookingRequest: save,
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = BookingReview;', context);
  const render = () => { index = 0; refIndex = 0; return context.render({ shipment: { dbId: 's', id: 'BOOK-1', customer: 'Customer' }, onClose: () => closes++, onReviewed: result => reviewed.push(result) }); };
  render(); effects.forEach(effect => effect()); mounted = true; await tick();
  return { render, reviewed, closes: () => closes, states };
}
const button = (tree, label) => find(tree, node => node.type === 'button' && node.children.flat(Infinity).includes(label))[0];

test('review shows quote, explicit zero override and details; rejection needs reason', async () => {
  const calls = [];
  const ui = await mount({ save: async (...args) => { calls.push(args); return { status: 'cancelled' }; } });
  let tree = ui.render();
  assert.equal(find(tree, node => node.props.role === 'dialog').length, 1);
  assert.ok(JSON.stringify(tree).includes('₱0.00'));
  assert.equal(button(tree, 'Reject request').props.disabled, true);
  find(tree, node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Cannot fulfill' } });
  tree = ui.render(); assert.equal(button(tree, 'Reject request').props.disabled, false);
  await button(tree, 'Reject request').props.onClick();
  assert.equal(calls[0][1], 'reject'); assert.equal(calls[0][2], 'Cannot fulfill'); assert.equal(ui.reviewed.length, 1);
});

test('approval blocks double submission and dismissal while saving', async () => {
  let finish, calls = 0;
  const ui = await mount({ save: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const action = button(ui.render(), 'Approve request').props.onClick;
  const pending = action(); await action(); assert.equal(calls, 1);
  const tree = ui.render(); assert.equal(button(tree, 'Close').props.disabled, true);
  find(tree, node => node.props.role === 'dialog')[0].props.onKeyDown({ key: 'Escape' }); assert.equal(ui.closes(), 0);
  finish({ status: 'assigned', delivery_id: 'd' }); await pending; assert.equal(ui.reviewed.length, 1);
});

test('save failure requires reload and load failure allows retry without decisions', async () => {
  const ui = await mount({ save: async () => { throw Error('Request changed'); } });
  await button(ui.render(), 'Approve request').props.onClick();
  const tree = ui.render(); assert.equal(button(tree, 'Approve request').props.disabled, true);
  assert.ok(JSON.stringify(tree).includes('Request changed')); assert.equal(ui.reviewed.length, 0);
  const failed = await mount({ load: async () => { throw Error('Offline'); } });
  assert.equal(button(failed.render(), 'Approve request').props.disabled, true);
  assert.equal(button(failed.render(), 'Reload request').props.disabled, false);
});

test('service submits one versioned RPC, validates reasons and rejects unconfirmed results', async () => {
  const calls = []; let response = { data: { id: 's', status: 'booked', delivery_id: null } };
  const context = vm.createContext({ supabase: { rpc: async (...args) => { calls.push(args); return response; } } });
  const source = fs.readFileSync(new URL('../../services/shipmentService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.review = reviewBookingRequest;', context);
  assert.equal((await context.review(request, 'approve')).status, 'booked');
  assert.equal(calls[0][0], 'review_booking_request'); assert.equal(calls[0][1].p_expected_updated_at, request.updated_at);
  await assert.rejects(context.review(request, 'reject', ' '), /reason/); assert.equal(calls.length, 1);
  response = { data: { id: 'other', status: 'cancelled' } };
  await assert.rejects(context.review(request, 'reject', 'Reason'), /not confirmed/);
  response = { error: Error('Access denied') }; await assert.rejects(context.review(request, 'approve'), /Access denied/);
});

test('Shipment pending menu opens review and confirmed decisions refresh the list', async () => {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./shipment.jsx', import.meta.url), 'utf8'), 'shipment.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = []; let index = 0, refIndex = 0, refreshes = 0;
  let rawStatus = 'pending', currentTab = 'all', driverNotes = 'Call first.\nUse rear gate.';
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; }, useEffect() {},
    MainLayout: 'MainLayout', OfficeTools: 'OfficeTools', BookingReview: 'BookingReview', ShipmentDetails: 'ShipmentDetails', CreateShipmentDrawer: 'CreateShipmentDrawer',
    useShipmentViewModel: () => ({
      visibleShipments: [{}], pagedShipments: [{ dbId: 's', id: 'BOOK-1', rawStatus, status: rawStatus, finalAmount: 2500, driverNotes }],
      page: 1, pageCount: 1, pageSize: 10, tabs: [], stats: {}, currentTab, activeConfig: { label: 'All', title: 'Pending Booking Requests' },
      refresh: () => refreshes++,
    }),
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = Shipment;', context);
  const render = () => { index = 0; refIndex = 0; return context.render(); };
  const openMenu = () => find(render(), node => node.props.className === 'action-btn')[0].props.onClick();
  openMenu();
  button(render(), 'Review booking request').props.onClick({ currentTarget: { closest: () => null } });
  const review = find(render(), node => node.type === 'BookingReview')[0];
  assert.equal(review.props.shipment.dbId, 's');
  review.props.onReviewed({ status: 'booked', delivery_id: null });
  assert.equal(refreshes, 1); assert.equal(find(render(), node => node.type === 'BookingReview').length, 0);
  assert.ok(JSON.stringify(render()).includes('Awaiting an available driver'));
  openMenu(); button(render(), 'Review booking request').props.onClick({ currentTarget: { closest: () => null } });
  find(render(), node => node.type === 'BookingReview')[0].props.onReviewed({ status: 'cancelled' });
  assert.equal(refreshes, 2); assert.ok(JSON.stringify(render()).includes('rejected and cancelled'));
  rawStatus = 'booked'; openMenu(); assert.equal(button(render(), 'Review booking request'), undefined);
  for (const label of ['Edit (unavailable)', 'Cancel (unavailable)']) {
    const unavailable = find(render(), node => node.type === 'button' && node.children.flat(Infinity).some(child => typeof child === 'string' && child.trim() === label))[0];
    assert.equal(unavailable.props.disabled, true); assert.equal(unavailable.props.onClick, undefined);
    assert.equal(find(render(), node => node.props.id === unavailable.props['aria-describedby']).length, 1);
  }
  find(render(), node => node.type === 'button' && node.children.flat(Infinity).some(child => typeof child === 'string' && child.trim() === 'View Details'))[0]
    .props.onClick({ currentTarget: { closest: () => null } });
  const shipmentDetails = find(render(), node => node.type === 'ShipmentDetails')[0];
  assert.equal(shipmentDetails.props.shipment.dbId, 's'); shipmentDetails.props.onClose();
  assert.equal(find(render(), node => node.type === 'ShipmentDetails').length, 0);
  for (const status of ['assigned', 'in_transit', 'completed']) {
    rawStatus = status; currentTab = status === 'completed' ? 'completed' : 'all';
    const details = find(render(), node => node.type === 'details' && node.props.className === 'shipment-driver-instructions');
    assert.equal(details.length, 1);
    assert.equal(find(details[0], node => node.type === 'summary')[0].children[0], 'Driver instructions');
    assert.equal(find(details[0], node => node.type === 'p')[0].children[0], driverNotes);
  }
  driverNotes = '';
  assert.ok(JSON.stringify(render()).includes('None recorded'));
});
