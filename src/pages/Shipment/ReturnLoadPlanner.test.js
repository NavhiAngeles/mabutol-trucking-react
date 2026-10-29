import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
import { outboundOptions, planReturnLoads } from '../../services/returnLoadPlanner.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
const button = (tree, label) => find(tree, node => node.type === 'button' && node.children.flat(Infinity).includes(label))[0];
const empty = { shipments: [], deliveries: [], trucks: [], maintenance: [] };
async function mount(load = async () => empty) {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./ReturnLoadPlanner.jsx', import.meta.url), 'utf8'), 'ReturnLoadPlanner.jsx', { jsx: { runtime: 'classic' } });
  const states = [], deps = [], cleanups = [], intervals = new Set(), inspected = [];
  let index = 0, effectIndex = 0, effects = [], now = Date.parse('2026-10-29T00:00:00Z'), auth = { user: { id: 'office' }, role: 'staff' };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useAuth: () => auth,
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useEffect(effect, next) { const i = effectIndex++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = next; } },
    setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
    loadReturnLoadData: load, outboundOptions, planReturnLoads,
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=Planner;this.wrapper=ReturnLoadPlanner;', context);
  const render = () => { index = 0; effectIndex = 0; effects = []; const tree = context.render({ onInspect: row => inspected.push(row) }); effects.forEach(effect => effect()); return tree; };
  const destroy = () => cleanups.forEach(cleanup => cleanup?.());
  const advance = ms => { now += ms; intervals.forEach(fn => fn()); };
  return { render, inspected, destroy, advance, wrapper: context.wrapper, setAuth: value => { auth = value; } };
}
const data = () => ({
  shipments: [
    { id: 'out', tracking_number: 'OUT', status: 'in_transit', pickup_lat: 14, pickup_lng: 120, dropoff_lat: 15, dropoff_lng: 120 },
    { id: 'back', tracking_number: 'RETURN-1', status: 'booked', pickup_address: 'Pickup', dropoff_address: 'Home', pickup_lat: 14.95, pickup_lng: 120, dropoff_lat: 14.05, dropoff_lng: 120, requested_vehicle_type_id: 'v', weight_kg: 1000, scheduled_departure: '2026-10-30T02:00:00Z' },
  ], deliveries: [{ id: 'd', shipment_id: 'out', truck_id: 't', driver_id: 'driver', status: 'in_transit' }],
  trucks: [{ id: 't', plate_number: 'TEST', vehicle_type_id: 'v', capacity_kg: 2000, status: 'on_trip' }], maintenance: [],
});
async function open(ui) { button(ui.render(), 'Find return-load opportunities').props.onClick(); ui.render(); await tick(); return ui.render(); }
function enterPlan(ui) {
  let tree = ui.render(); find(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'd' } });
  tree = ui.render(); find(tree, node => node.type === 'input' && node.props.type === 'datetime-local')[0].props.onChange({ target: { value: '2026-10-30T08:00' } });
  return ui.render();
}

test('planner is lazy, handles empty data and office wrapper', async () => {
  let calls = 0; const ui = await mount(async () => { calls++; return empty; });
  assert.equal(calls, 0); assert.ok(ui.wrapper({}));
  const tree = await open(ui); assert.equal(calls, 1); assert.match(JSON.stringify(tree), /No outbound deliveries/); ui.destroy();
});
test('only active office context renders planner; customer/driver/anonymous contexts do not', async () => {
  const ui = await mount();
  for (const role of ['driver', 'customer', null]) { ui.setAuth({ user: { id: 'other' }, role }); assert.ok(!ui.wrapper({})); }
  ui.setAuth({ user: null, role: null }); assert.ok(!ui.wrapper({}));
  ui.setAuth({ user: { id: 'admin' }, role: 'admin' }); assert.ok(ui.wrapper({})); ui.destroy();
});
test('load failures expose retry, never an empty-success result; refresh recovers', async () => {
  let fail = true; const ui = await mount(async () => { if (fail) throw Error('private database detail'); return data(); });
  let tree = await open(ui); assert.match(JSON.stringify(tree), /data unavailable/); assert.doesNotMatch(JSON.stringify(tree), /private database detail/);
  fail = false; button(tree, 'Refresh return-load data').props.onClick(); ui.render(); await tick();
  tree = enterPlan(ui); assert.match(JSON.stringify(tree), /RETURN-1/); ui.destroy();
});
test('PHT input yields a candidate and review opens real shipment details without assignment', async () => {
  const ui = await mount(async () => data()); await open(ui); const tree = enterPlan(ui);
  assert.match(JSON.stringify(tree), /straight-line comparisons/); assert.match(JSON.stringify(tree), /1 potential return loads/);
  button(tree, 'Review return shipment').props.onClick(); assert.equal(ui.inspected[0].dbId, 'back'); ui.destroy();
});
test('expired results disappear; refresh rechecks a newly assigned candidate', async () => {
  const rows = data(), ui = await mount(async () => structuredClone(rows)); await open(ui); enterPlan(ui);
  ui.advance(61000); let tree = ui.render(); assert.match(JSON.stringify(tree), /Results expired/); assert.equal(button(tree, 'Review return shipment'), undefined);
  rows.deliveries.push({ id: 'assigned', shipment_id: 'back', status: 'assigned' });
  button(tree, 'Refresh return-load data').props.onClick(); ui.render(); await tick(); tree = ui.render();
  assert.match(JSON.stringify(tree), /No matching return loads/); assert.equal(button(tree, 'Review return shipment'), undefined); ui.destroy();
});
test('late response from closed planner cannot replace refreshed data', async () => {
  let finish, calls = 0;
  const ui = await mount(() => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(empty));
  button(ui.render(), 'Find return-load opportunities').props.onClick(); ui.render();
  button(ui.render(), 'Close return-load planner').props.onClick(); ui.render(); await open(ui);
  finish(data()); await tick(); assert.match(JSON.stringify(ui.render()), /No outbound deliveries/); ui.destroy();
});
