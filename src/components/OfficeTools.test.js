import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
async function screen(update, loadError = '') {
  const source = await readFile(new URL('./OfficeTools.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'OfficeTools.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = [], calls = [], routes = [];
  let si = 0, ri = 0, reloads = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(value) { const i = si++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; },
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useNavigate: () => path => routes.push(path),
    useAuth: () => ({ user: { id: 'own' } }),
    useLiveData: () => ({ data: { name: 'Office', notifications: [{ id: 'notice', title: 'Update', body: '', shipment_id: 'shipment', created_at: '2026-10-24' }] }, error: loadError, refresh: () => { reloads++; } }),
    supabase: { from(table) {
      const call = { table, filters: [] }; calls.push(call);
      return { update(value) { call.value = value; return this; }, eq(...args) { call.filters.push(args); return this; }, select() { return this; }, single() { return update(call, calls.length); } };
    } },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.renderComponent = OfficeTools;', context);
  const render = () => { si = ri = 0; return context.renderComponent(); };
  const button = text => find(render(), n => n.type === 'button' && n.children.includes(text))[0];
  find(render(), n => n.type === 'button' && n.props.className === 'icon-btn')[0].props.onClick();
  return { render, button, calls, routes, reloads: () => reloads };
}

test('Retry repeats the failed owner-filtered write, clears error, refreshes and navigates only on success', async () => {
  const ui = await screen(async (_, count) => count === 1 ? { error: Error('Denied') } : { data: { id: 'notice' } });
  await ui.button('View shipment').props.onClick();
  assert.equal(ui.reloads(), 0); assert.equal(ui.routes.length, 0);
  assert.equal(find(ui.render(), n => n.props.role === 'alert').length, 1);
  await ui.button('Retry').props.onClick();
  assert.equal(ui.calls.length, 2);
  for (const call of ui.calls) {
    assert.equal(call.table, 'notifications');
    assert.deepEqual(call.filters, [['id', 'notice'], ['user_id', 'own']]);
    assert.ok(call.value.read_at);
  }
  assert.equal(find(ui.render(), n => n.props.role === 'alert').length, 0);
  assert.equal(ui.reloads(), 1);
  assert.deepEqual(ui.routes, ['/shipment?tab=all&record=shipment']);
});

test('pending Retry disables actions and deduplicates rapid invocations; repeated failure remains retryable', async () => {
  let reject;
  const ui = await screen((_, count) => count === 1 ? Promise.resolve({ data: null }) : new Promise((resolve, no) => { reject = no; }));
  await ui.button('View shipment').props.onClick();
  const retry = ui.button('Retry').props.onClick;
  const pending = retry(); await retry();
  assert.equal(ui.calls.length, 2);
  assert.equal(find(ui.render(), n => n.children.includes('Saving…'))[0].props.disabled, true);
  reject(Error('Offline')); await pending;
  assert.equal(ui.button('Retry').props.disabled, false);
  assert.equal(ui.routes.length, 0);
});

test('load-error Retry reloads without writing notifications', async () => {
  const ui = await screen(() => { throw Error('Unexpected write'); }, 'Offline');
  ui.button('Retry').props.onClick();
  assert.equal(ui.reloads(), 1); assert.equal(ui.calls.length, 0);
});
