import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const rows = [{ delivery_id: 'first', driver_id: 'driver', tracking_number: 'TRIP-1', unread: 2 }, { delivery_id: 'second', driver_id: 'driver', tracking_number: 'TRIP-2', unread: 1 }];
async function mount(initialRows = rows, useThreadsMethod = false, defaultOpen = true) {
  const states = [], deps = [], cleanups = [], effects = [];
  let si = 0, ei = 0, records = initialRows;
  const serviceImpl = useThreadsMethod
    ? { watch: () => () => {}, threads: async () => records, unread: async () => [] }
    : { watch: () => () => {}, unread: async () => records };
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return { current: initial }; },
    useEffect(effect, next) { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = next; } },
    deliveryConversationService: () => serviceImpl, supabase: {}, DeliveryConversation: 'DeliveryConversation',
    useAuth: () => ({ user: { id: 'office' } }), setInterval: () => 0, clearInterval() {},
  });
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./DeliveryConversationInbox.jsx', import.meta.url), 'utf8'), 'DeliveryConversationInbox.jsx', { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=Inbox;', context);
  const render = () => { si = ei = 0; const tree = context.render({ defaultOpen }); effects.splice(0).forEach(effect => effect()); return tree; };
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

test('read conversations remain visible in read mode after full page reload and can be reopened', async () => {
  const persistedReadThreads = [
    {
      delivery_id: 'del-read',
      driver_id: 'drv-1',
      tracking_number: 'SHP-NE-26-002328',
      driver_name: 'Nav Angeles',
      last_message_body: 'Arrived at dropoff gate',
      last_sender_role: 'driver',
      last_message_at: '2026-11-09T15:00:00Z',
      unread: 0,
    },
  ];
  const reloadedUi = await mount(persistedReadThreads, true, true);
  const tree = reloadedUi.render();
  const serialized = JSON.stringify(tree);

  assert.doesNotMatch(serialized, /caught up/);
  const threads = find(tree, node => node.props.className === 'conversation-thread');
  assert.equal(threads.length, 1);
  assert.equal(threads[0].props['data-state'], 'read');
  assert.match(serialized, /SHP-NE-26-002328/);
  assert.match(serialized, /Nav Angeles/);
  assert.match(serialized, /Driver: Arrived at dropoff gate/);
  assert.match(serialized, /"Read"/);

  threads[0].props.onClick();
  const drawer = find(reloadedUi.render(), node => node.type === 'DeliveryConversation')[0];
  assert.equal(drawer.props.delivery.id, 'del-read');
  assert.equal(drawer.props.delivery.driver_id, 'drv-1');
  assert.equal(drawer.props.delivery.tracking_number, 'SHP-NE-26-002328');
  assert.equal(drawer.props.open, true);
  reloadedUi.unmount();
});

test('message trigger button renders beside topbar tools with unread badge and toggles dropdown', async () => {
  const ui = await mount(rows, false, false);
  const tree = ui.render();
  const trigger = find(tree, node => node.props.className === 'icon-btn conversation-inbox-trigger')[0];
  assert.ok(trigger, 'trigger button exists with icon-btn class');
  assert.equal(trigger.props.title, 'Driver messages');
  assert.match(trigger.props['aria-label'], /Driver messages/);
  assert.equal(trigger.props['aria-expanded'], false);
  assert.equal(trigger.props['aria-controls'], 'office-messages-panel');

  const unreadBadge = find(trigger, node => node.props.className === 'office-unread-count')[0];
  assert.ok(unreadBadge, 'unread badge rendered on trigger');
  assert.equal(unreadBadge.children[0], 3);

  // Panel is closed initially
  assert.equal(find(ui.render(), node => node.props.id === 'office-messages-panel').length, 0);

  // Click trigger opens the panel
  trigger.props.onClick();
  const openTree = ui.render();
  assert.equal(find(openTree, node => node.props.id === 'office-messages-panel').length, 1);
  const openTrigger = find(openTree, node => node.props.className === 'icon-btn conversation-inbox-trigger')[0];
  assert.equal(openTrigger.props['aria-expanded'], true);

  // Close button closes panel
  const closeBtn = find(openTree, node => node.props.className === 'office-messages-close')[0];
  assert.ok(closeBtn);
  closeBtn.props.onClick();
  assert.equal(find(ui.render(), node => node.props.id === 'office-messages-panel').length, 0);

  ui.unmount();
});
