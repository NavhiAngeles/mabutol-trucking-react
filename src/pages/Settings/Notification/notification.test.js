import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const types = ['shipment_status', 'booking_confirmed', 'assignment', 'delay', 'compliance_expiry', 'payment', 'message', 'system'];
const snapshot = () => ({ userId: 'own', preferences: Object.fromEntries(types.map(type => [type, true])) });
const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
async function screen(api = {}) {
  const source = fs.readFileSync(new URL('./notification.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'notification.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useEffect(fn) { effects.push(fn); },
    notificationPreferencesApi: { load: async () => snapshot(), ...api },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/export default function/g, 'function') + '\nthis.renderComponent=NotificationPreferences;', context);
  const render = () => { si = ri = 0; return context.renderComponent(); };
  render(); effects.slice(0, 2).forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  return { render, effects, toggle: label => find(render(), n => n.props.role === 'switch' && n.props['aria-label'] === label)[0], button: label => find(render(), n => n.type === 'button' && n.children.includes(label))[0] };
}
test('renders persisted disabled preferences, accessible switches and unavailable external channels', async () => {
  const data = snapshot(); data.preferences.delay = false;
  const ui = await screen({ load: async () => data });
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], false);
  for (const label of ['Email Notifications', 'Push Notifications', 'SMS Alerts']) assert.equal(ui.toggle(label).props.disabled, true);
  assert.ok(JSON.stringify(ui.render()).includes('Off-route, cold-chain'));
});
test('save waits for confirmation and deduplicates rapid clicks', async () => {
  let resolve, calls = 0;
  const pending = new Promise(yes => { resolve = yes; });
  const ui = await screen({ save: (id, type, value) => { assert.equal(id, 'own'); assert.equal(type, 'delay'); assert.equal(value, false); calls++; return pending; } });
  const click = ui.toggle('Delays & Incidents').props.onClick;
  const work = click(); await click(); assert.equal(calls, 1);
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], true);
  assert.ok(find(ui.render(), n => n.props.role === 'switch').every(n => n.props.disabled));
  resolve(false); await work;
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], false);
  assert.ok(JSON.stringify(ui.render()).includes('Preference saved'));
});
test('failed save retains confirmed value and retries the exact failed choice', async () => {
  let calls = 0;
  const ui = await screen({ save: async (_, type, enabled) => { assert.equal(type, 'delay'); assert.equal(enabled, false); if (++calls === 1) throw Error('Save denied'); return false; } });
  await ui.toggle('Delays & Incidents').props.onClick();
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], true);
  assert.ok(JSON.stringify(ui.render()).includes('Save denied'));
  assert.ok(!JSON.stringify(ui.render()).includes('Preference saved'));
  await ui.button('Retry save').props.onClick(); assert.equal(calls, 2);
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], false);
});
test('load errors expose retry without editable default toggles', async () => {
  const ui = await screen({ load: async () => { throw Error('Load denied'); } });
  assert.ok(ui.button('Retry loading'));
  assert.equal(find(ui.render(), n => n.props.role === 'switch').length, 0);
});
test('saving one category preserves the remaining category choices', async () => {
  const ui = await screen({ save: async () => false });
  await ui.toggle('Status Changes').props.onClick();
  assert.equal(ui.toggle('Status Changes').props['aria-checked'], false);
  assert.equal(ui.toggle('Delays & Incidents').props['aria-checked'], true);
});
