import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const button = (tree, label) => find(tree, node => node.type === 'button' && node.children.flat(Infinity).includes(label))[0];
async function mount({ load = async () => ({ id: 's', status: 'booked', paymentCount: 2 }), save = async () => ({ id: 's', status: 'cancelled' }), allowed = true } = {}) {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./ShipmentCancellationDialog.jsx', import.meta.url), 'utf8'), 'ShipmentCancellationDialog.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = []; let index = 0, refIndex = 0, mounted = false, effects = [], closes = 0;
  const results = [];
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) }, document: { activeElement: null },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; }, useEffect(effect) { if (!mounted) effects.push(effect); },
    fetchShipmentForCancellation: load, cancelShipment: save, cancellationPolicy: record => ({ allowed: !!record && allowed, reason: 'Started trip locked' }),
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=ShipmentCancellationDialog;', context);
  const render = () => { index = 0; refIndex = 0; return context.render({ shipment: { dbId: 's', id: 'SHIP-1' }, onClose: () => closes++, onCancelled: result => results.push(result) }); };
  render(); effects.forEach(effect => effect()); mounted = true; await new Promise(resolve => setImmediate(resolve));
  const fill = () => { find(render(), n => n.type === 'textarea')[0].props.onChange({ target: { value: 'Customer requested' } }); find(render(), n => n.type === 'input')[0].props.onChange({ target: { checked: true } }); };
  return { render, fill, results, closes: () => closes };
}

test('confirmation explains finance/history, requires reason and acknowledgement, and submits once', async () => {
  let resolve, calls = 0;
  const ui = await mount({ save: () => { calls++; return new Promise(done => { resolve = done; }); } });
  assert.ok(JSON.stringify(ui.render()).includes('2 payment record(s)'));
  assert.ok(JSON.stringify(ui.render()).includes('No cancellation fee or refund'));
  assert.equal(button(ui.render(), 'Confirm cancellation').props.disabled, true);
  ui.fill(); assert.equal(button(ui.render(), 'Confirm cancellation').props.disabled, false);
  const confirm = button(ui.render(), 'Confirm cancellation').props.onClick;
  const pending = confirm(); await confirm(); assert.equal(calls, 1);
  assert.equal(button(ui.render(), 'Close').props.disabled, true);
  let prevented = false; ui.render().props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(ui.closes(), 0);
  resolve({ id: 's', status: 'cancelled' }); await pending; assert.equal(ui.results.length, 1);
});

test('failure retains reason, blocks blind retry, and allows dismissal; locked/load-error snapshots cannot cancel', async () => {
  const ui = await mount({ save: async () => { throw Error('Assignment changed. Reload'); } });
  ui.fill(); await button(ui.render(), 'Confirm cancellation').props.onClick();
  assert.ok(JSON.stringify(ui.render()).includes('Assignment changed'));
  assert.equal(find(ui.render(), n => n.type === 'textarea')[0].props.value, 'Customer requested');
  assert.equal(button(ui.render(), 'Confirm cancellation').props.disabled, true);
  ui.render().props.onCancel({ preventDefault() {} }); assert.equal(ui.closes(), 1);
  const locked = await mount({ allowed: false });
  assert.equal(button(locked.render(), 'Confirm cancellation').props.disabled, true);
  assert.equal(find(locked.render(), n => n.type === 'textarea').length, 0);
  const failed = await mount({ load: async () => { throw Error('Payments unavailable'); } });
  assert.ok(JSON.stringify(failed.render()).includes('Payments unavailable'));
  assert.equal(button(failed.render(), 'Confirm cancellation').props.disabled, true);
  assert.equal(button(failed.render(), 'Reload shipment').props.disabled, false);
});
