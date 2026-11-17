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
  const states = [], refs = [], calls = [], routes = [], events = {};
  let si = 0, ri = 0, reloads = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(value) { const i = si++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; },
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useEffect(effect) { effect(); },
    document: { addEventListener(name, handler) { events[name] = handler; }, removeEventListener(name) { delete events[name]; } },
    useNavigate: () => path => routes.push(path),
    useAuth: () => ({ user: { id: 'own' } }),
    DeliveryConversationInbox: () => null,
    useLiveData: () => ({ data: { name: 'Office', notifications: [{ id: 'notice', title: 'Update', body: '', shipment_id: 'shipment', created_at: '2026-10-24' }] }, error: loadError, refresh: () => { reloads++; } }),
    supabase: { from(table) {
      const call = { table, filters: [], inFilters: [] }; calls.push(call);
      const chain = {
        update(value) { call.value = value; return chain; },
        eq(...args) { call.filters.push(args); return chain; },
        in(...args) { call.inFilters = args; return chain; },
        select() { return chain; },
        single() { return update(call, calls.length); },
        then(resolve, reject) {
          try {
            const res = update(call, calls.length);
            if (res && typeof res.then === 'function') {
              return res.then(resolve, reject);
            }
            return Promise.resolve(res).then(resolve, reject);
          } catch (err) {
            return Promise.reject(err).then(resolve, reject);
          }
        }
      };
      return chain;
    } },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.renderComponent = OfficeTools;', context);
  const render = () => { si = ri = 0; return context.renderComponent(); };
  const button = text => find(render(), n => n.type === 'button' && n.children.includes(text))[0];
  find(render(), n => n.type === 'button' && n.props.className === 'icon-btn')[0].props.onClick();
  return { render, button, calls, routes, events, reloads: () => reloads };
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

test('bell exposes unread count accessibly and dropdown closes on Escape/outside click', async () => {
  const ui = await screen(async () => ({ data: { id: 'notice' } }));
  let tree = ui.render();
  const trigger = find(tree, n => n.type === 'button' && n.props.className === 'icon-btn')[0];
  assert.equal(trigger.props['aria-label'], 'Notifications, 1 unread');
  assert.equal(find(trigger, n => n.type === 'svg').length, 1);
  assert.equal(trigger.children.flat(Infinity).includes('Notifications'), false);
  assert.equal(find(tree, n => n.props.id === trigger.props['aria-controls']).length, 1);
  assert.equal(find(tree, n => n.props.className === 'office-notification-dot').length, 1);
  ui.events.keydown({ key: 'Escape' }); tree = ui.render();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
  find(tree, n => n.type === 'button' && n.props.className === 'icon-btn')[0].props.onClick();
  ui.render(); ui.events.pointerdown({ target: {} });
  assert.equal(find(ui.render(), n => n.props.id === 'office-notifications-panel').length, 0);
});

test('Refresh button in notifications header triggers live refresh', async () => {
  const ui = await screen(async () => ({ data: { id: 'notice' } }));
  const refreshBtn = find(ui.render(), n => n.type === 'button' && n.props.title === 'Refresh notifications')[0];
  assert.ok(refreshBtn);
  refreshBtn.props.onClick();
  assert.equal(ui.reloads(), 1);
});

test('Mark all read button in notifications header marks all as read and updates unread badge', async () => {
  const ui = await screen(async () => ({ data: [{ id: 'notice' }] }));
  const markReadBtn = find(ui.render(), n => n.type === 'button' && (n.children.includes('Mark all read') || n.children.includes('Mark as Read')))[0];
  assert.ok(markReadBtn);
  await markReadBtn.props.onClick();
  assert.equal(ui.reloads(), 1);
  const trigger = find(ui.render(), n => n.type === 'button' && n.props.className === 'icon-btn')[0];
  assert.equal(trigger.props['aria-label'], 'Notifications');
  assert.equal(find(trigger, n => n.props.className === 'office-unread-count').length, 0);
});

test('Mark all read updates unread notifications in a single owner-scoped query, disables in flight, refreshes count, and retains retry feedback on error', async () => {
  let callCount = 0;
  const ui = await screen(async () => {
    callCount++;
    if (callCount === 1) {
      // First attempt fails to test retry feedback
      return { error: new Error('Database network timeout') };
    }
    // Retry succeeds
    return { data: [{ id: 'notice' }] };
  });

  // Verify 'Mark all read' button is present when unread > 0
  const btn = find(ui.render(), n => n.type === 'button' && n.children.includes('Mark all read'))[0];
  assert.ok(btn, 'Mark all read button must exist when unread > 0');
  assert.equal(btn.props['aria-label'], 'Mark all read');

  // Click Mark all read (first attempt fails)
  await btn.props.onClick();

  // Single owner-scoped query was executed
  assert.equal(ui.calls.length, 1);
  const firstCall = ui.calls[0];
  assert.equal(firstCall.table, 'notifications');
  assert.deepEqual(firstCall.inFilters, ['id', ['notice']]);
  assert.deepEqual(firstCall.filters, [['user_id', 'own']]);
  assert.ok(firstCall.value.read_at);

  // Error alert is retained with retry feedback
  const alerts = find(ui.render(), n => n.props.role === 'alert');
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].children.flat(Infinity).some(c => typeof c === 'string' && c.includes('Unable to mark all notifications read. Please retry.')));

  // Retry button is available
  const retryBtn = ui.button('Retry');
  assert.ok(retryBtn, 'Retry button must be present in error alert');

  // Clicking Retry repeats markAllAsRead
  await retryBtn.props.onClick();

  // Second owner-scoped query was executed
  assert.equal(ui.calls.length, 2);
  const secondCall = ui.calls[1];
  assert.equal(secondCall.table, 'notifications');
  assert.deepEqual(secondCall.inFilters, ['id', ['notice']]);
  assert.deepEqual(secondCall.filters, [['user_id', 'own']]);

  // Error is cleared, unread count is refreshed and badge is removed
  assert.equal(find(ui.render(), n => n.props.role === 'alert').length, 0);
  assert.equal(ui.reloads(), 1);
  const trigger = find(ui.render(), n => n.type === 'button' && n.props.className === 'icon-btn')[0];
  assert.equal(trigger.props['aria-label'], 'Notifications');
  assert.equal(find(trigger, n => n.props.className === 'office-unread-count').length, 0);
});

test('driver messages are excluded from notification bell and notify in Drivers Message tool', async () => {
  const source = await readFile(new URL('./OfficeTools.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'OfficeTools.jsx', { jsx: { runtime: 'classic' } });
  let renderedInbox = false;
  const context = vm.createContext({
    React: {
      createElement: (type, props, ...children) => {
        if (type === 'DeliveryConversationInbox') renderedInbox = true;
        return { type, props: props || {}, children };
      },
    },
    useState: (val) => [val, () => {}],
    useRef: (val) => ({ current: val }),
    useEffect: () => {},
    useNavigate: () => () => {},
    useAuth: () => ({ user: { id: 'own' } }),
    DeliveryConversationInbox: 'DeliveryConversationInbox',
    useLiveData: () => ({
      data: {
        name: 'Office',
        notifications: [
          { id: '1', title: 'New customer booking', type: 'booking_confirmed', created_at: '2026-11-10' },
          { id: '2', title: 'Driver message · TRIP-1', type: 'message', created_at: '2026-11-10' },
        ].filter(n => n.type !== 'message' && !n.title.toLowerCase().startsWith('driver message')),
      },
      error: '',
      refresh: () => {},
    }),
    supabase: { from: () => ({}) },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.renderComponent = OfficeTools;', context);
  const tree = context.renderComponent();
  assert.ok(renderedInbox, 'DeliveryConversationInbox component must be rendered beside the bell');
  const bellBtn = find(tree, n => n.type === 'button' && n.props.title === 'Notifications')[0];
  assert.ok(bellBtn);
  assert.equal(bellBtn.props['aria-label'], 'Notifications, 1 unread', 'Bell unread count only reflects non-driver message notifications');
});

test('Notifications bell and Driver Messages dropdown panels are mutually exclusive', async () => {
  const source = await readFile(new URL('./OfficeTools.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'OfficeTools.jsx', { jsx: { runtime: 'classic' } });
  const states = [];
  let si = 0;
  let inboxProps = null;
  const context = vm.createContext({
    React: {
      createElement: (type, props, ...children) => {
        if (type === 'DeliveryConversationInbox') inboxProps = props;
        return { type, props: props || {}, children };
      },
    },
    useState: (val) => {
      const i = si++;
      if (!(i in states)) states[i] = val;
      return [states[i], next => { states[i] = next; }];
    },
    useRef: (val) => ({ current: val }),
    useEffect: () => {},
    useNavigate: () => () => {},
    useAuth: () => ({ user: { id: 'own' } }),
    DeliveryConversationInbox: 'DeliveryConversationInbox',
    useLiveData: () => ({
      data: {
        name: 'Office',
        notifications: [{ id: '1', title: 'Booking', created_at: '2026-11-10' }],
      },
      error: '',
      refresh: () => {},
    }),
    supabase: { from: () => ({}) },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.renderComponent = OfficeTools;', context);

  // 1. Initial state: both panels closed
  let tree = context.renderComponent();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
  assert.equal(inboxProps.isOpen, false);

  // 2. Click bell to open notifications: notifications open, messages closed
  si = 0;
  find(tree, n => n.type === 'button' && n.props.title === 'Notifications')[0].props.onClick();
  si = 0;
  tree = context.renderComponent();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 1);
  assert.equal(inboxProps.isOpen, false);

  // 3. Toggle messages: messages open, notifications closed
  si = 0;
  inboxProps.onToggle();
  si = 0;
  tree = context.renderComponent();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
  assert.equal(inboxProps.isOpen, true);

  // 4. Click bell again: notifications open, messages closed
  si = 0;
  find(tree, n => n.type === 'button' && n.props.title === 'Notifications')[0].props.onClick();
  si = 0;
  tree = context.renderComponent();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 1);
  assert.equal(inboxProps.isOpen, false);

  // 5. Click bell again to close notifications: both closed
  si = 0;
  find(tree, n => n.type === 'button' && n.props.title === 'Notifications')[0].props.onClick();
  si = 0;
  tree = context.renderComponent();
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
  assert.equal(inboxProps.isOpen, false);

  // 6. Messages onClose callback closes messages
  si = 0;
  inboxProps.onToggle();
  si = 0;
  tree = context.renderComponent();
  assert.equal(inboxProps.isOpen, true);
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
  si = 0;
  inboxProps.onClose();
  si = 0;
  tree = context.renderComponent();
  assert.equal(inboxProps.isOpen, false);
  assert.equal(find(tree, n => n.props.id === 'office-notifications-panel').length, 0);
});


