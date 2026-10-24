import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const record = { id: 's', tracking_number: 'SHIP-1', status: 'cancelled', customer: { name: 'Test Customer' },
  driver_notes: 'Call first.\nUse rear gate.', quoted_amount: 2500, override_amount: 0, final_amount: null,
  cancelled_reason: 'Customer requested', scheduled_departure: 'invalid', deliveries: [] };
async function mount(load) {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./ShipmentDetails.jsx', import.meta.url), 'utf8'), 'ShipmentDetails.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = [], effects = []; let index = 0, refIndex = 0, effectIndex = 0, pending = [], closes = 0, focused = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => {
      if (props?.ref) props.ref.current = { focus() { focused++; } };
      return { type, props: props || {}, children };
    } }, document: { activeElement: null },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect(effect, deps) { const i = effectIndex++; const old = effects[i];
      if (!old || deps.some((d, j) => old.deps[j] !== d)) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; });
    }, fetchShipmentDetails: load,
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = ShipmentDetails;', context);
  const render = () => { index = 0; refIndex = 0; effectIndex = 0; pending = []; const tree = context.render({ shipment: { dbId: 's', id: 'SHIP-1' }, onClose: () => closes++ }); pending.forEach(run => run()); return tree; };
  return { render, states, refs, focused: () => focused, closes: () => closes, cleanup: () => effects.forEach(effect => effect.cleanup?.()) };
}
const button = (tree, text) => find(tree, n => n.type === 'button' && n.children.flat(Infinity).includes(text))[0];

test('details shows saved fields, zero override, unknown charge, notes and cancellation with keyboard close', async () => {
  const ui = await mount(async id => { assert.equal(id, 's'); return record; });
  assert.equal(find(ui.render(), n => n.props.role === 'status').length, 1);
  await tick(); const tree = ui.render();
  const text = JSON.stringify(tree); assert.ok(text.includes('₱0.00')); assert.ok(text.includes('Customer requested'));
  assert.equal(find(tree, n => n.props.className === 'shipment-details-notes')[0].children[0], record.driver_notes);
  assert.ok(text.includes('No delivery assignment recorded.')); assert.ok(text.includes('Unavailable')); assert.ok(ui.focused() > 0);
  find(tree, n => n.props.role === 'dialog')[0].props.onKeyDown({ key: 'Escape', preventDefault() {} }); assert.equal(ui.closes(), 1);
});

test('read failure exposes retry and hides details; retry loads assignments and refresh clears old data', async () => {
  let calls = 0;
  const ui = await mount(async () => { if (++calls === 1) throw Error('Access denied'); return { ...record, deliveries: [{ id: 'd', driver: { full_name: 'Assigned Driver' }, truck: { plate_number: 'TEST-1' }, status: 'assigned' }] }; });
  ui.render(); await tick(); let tree = ui.render(); assert.ok(JSON.stringify(tree).includes('Access denied'));
  button(tree, 'Retry').props.onClick(); ui.render(); await tick(); tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('Assigned Driver')); assert.ok(JSON.stringify(tree).includes('TEST-1')); assert.equal(calls, 2);
  button(tree, 'Refresh details').props.onClick(); tree = ui.render(); assert.equal(find(tree, n => n.type === 'dl').length, 0);
});

test('closing details ignores an in-flight response', async () => {
  let finish; const ui = await mount(() => new Promise(resolve => { finish = resolve; }));
  ui.render(); ui.cleanup(); finish(record); await tick(); assert.equal(ui.states[0], null);
});

test('details service scopes shipment and deliveries to selected ID and propagates both read failures', async () => {
  let shipment = { data: record }, deliveries = { data: [{ id: 'd' }] };
  const calls = [];
  const context = vm.createContext({ supabase: { from(table) {
    return { select(columns) { calls.push({ table, columns }); return this; },
      eq(column, id) { assert.equal(column, table === 'shipments' ? 'id' : 'shipment_id'); assert.equal(id, 's'); return table === 'shipments' ? this : Promise.resolve(deliveries); },
      async single() { return shipment; } };
  } } });
  const source = fs.readFileSync(new URL('../../services/shipmentService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.load = fetchShipmentDetails;', context);
  const result = await context.load('s'); assert.equal(result.driver_notes, record.driver_notes); assert.equal(result.deliveries.length, 1);
  assert.ok(calls[0].columns.includes('customers!customer_id(name)'));
  shipment = { error: Error('Shipment denied') }; await assert.rejects(context.load('s'), /Shipment denied/);
  shipment = { data: record }; deliveries = { error: Error('Delivery denied') }; await assert.rejects(context.load('s'), /Delivery denied/);
  shipment = { data: null }; deliveries = { data: [] }; await assert.rejects(context.load('s'), /not found/);
});
