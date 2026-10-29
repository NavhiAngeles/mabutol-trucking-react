import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const rows = [{ delivery_id: 'first', driver_id: 'driver', tracking_number: 'TRIP-1', unread: 2 }, { delivery_id: 'second', driver_id: 'driver', tracking_number: 'TRIP-2', unread: 1 }];
async function mount() {
  const states = [], deps = [], cleanups = [], effects = [];
  let si = 0, ei = 0, records = rows;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useEffect(effect, next) { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = next; } },
    deliveryConversationService: () => ({ watch: () => () => {}, unread: async () => records }), supabase: {}, DeliveryConversation: 'DeliveryConversation',
    useAuth: () => ({ user: { id: 'office' } }), setInterval: () => 0, clearInterval() {},
  });
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./DeliveryConversationInbox.jsx', import.meta.url), 'utf8'), 'DeliveryConversationInbox.jsx', { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=Inbox;', context);
  const render = () => { si = ei = 0; const tree = context.render(); effects.splice(0).forEach(effect => effect()); return tree; };
  render(); await new Promise(resolve => setImmediate(resolve));
  return { render, setRows: value => { records = value; }, settle: () => new Promise(resolve => setImmediate(resolve)), unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}

test('inbox opens one selected drawer directly with exact delivery and tracking reference', async () => {
  const ui = await mount();
  find(ui.render(), node => node.props.className === 'conversation-thread')[0].props.onClick();
  const drawer = find(ui.render(), node => node.type === 'DeliveryConversation')[0];
  assert.equal(drawer.props.delivery.id, 'first');
  assert.equal(drawer.props.delivery.tracking_number, 'TRIP-1');
  assert.equal(drawer.props.open, true); assert.equal(drawer.props.hideTrigger, true);
  ui.unmount();
});

test('mark-read inbox refresh cannot unmount the open thread or its pending reply', async () => {
  const ui = await mount();
  find(ui.render(), node => node.props.className === 'conversation-thread')[0].props.onClick();
  ui.setRows([]);
  find(ui.render(), node => node.type === 'DeliveryConversation')[0].props.onRead();
  ui.render(); await ui.settle();
  const drawer = find(ui.render(), node => node.type === 'DeliveryConversation')[0];
  assert.equal(drawer.props.open, true); assert.equal(drawer.props.delivery.id, 'first');
  assert.equal(find(ui.render(), node => node.props.className === 'conversation-thread').length, 1);
  drawer.props.onClose();
  find(ui.render(), node => node.props.className === 'conversation-thread')[0].props.onClick();
  assert.equal(find(ui.render(), node => node.type === 'DeliveryConversation')[0].props.open, true);
  ui.unmount();
});

test('closing and switching threads retains each component but shows only the selected drawer', async () => {
  const ui = await mount();
  find(ui.render(), node => node.props.className === 'conversation-thread')[0].props.onClick();
  find(ui.render(), node => node.type === 'DeliveryConversation')[0].props.onClose();
  find(ui.render(), node => node.props.className === 'conversation-thread')[1].props.onClick();
  const drawers = find(ui.render(), node => node.type === 'DeliveryConversation');
  assert.equal(drawers.length, 2);
  assert.equal(drawers[0].props.open, false); assert.equal(drawers[1].props.open, true);
  ui.unmount();
});
