import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
import { PendingDeliveryMessage } from '../../services/deliveryConversationService.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const button = (tree, text) => find(tree, node => node.type === 'button' && node.children.flat(Infinity).some(child => typeof child === 'string' && child.trim() === text))[0];
const page = { can_send: true, driver_id: 'driver', messages: [{ id: '42', sender_role: 'driver', body: 'At gate', created_at: '2026-10-28T12:00:00Z' }], has_more: true };
async function mount(overrides = {}, options = {}) {
  const states = [], refs = [], deps = [], cleanups = [], effects = [];
  let si = 0, ri = 0, ei = 0;
  const calls = [];
  const listeners = new Set();
  const document = { activeElement: null, visibilityState: options.hidden ? 'hidden' : 'visible', addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) };
  const service = { watch: () => () => {}, unread: async () => [{ delivery_id: 'd', unread: 1 }], load: async (...args) => { calls.push(['load', ...args]); return page; }, read: async (...args) => calls.push(['read', ...args]), send: async (...args) => { calls.push(['send', ...args]); return { id: '43' }; }, ...overrides };
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[ri++] ||= { current: initial }; },
    useEffect(effect, next) { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = next; } },
    deliveryConversationService: () => service, supabase: {}, PendingDeliveryMessage, useAuth: () => ({ user: { id: 'office' } }),
    setInterval: () => 0, clearInterval() {}, crypto: { randomUUID: () => 'request' }, document,
  });
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./DeliveryConversation.jsx', import.meta.url), 'utf8'), 'DeliveryConversation.jsx', { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=Conversation;', context);
  const render = () => { si = ri = ei = 0; const tree = context.render({ delivery: 'd', driver: 'driver', onRead: options.onRead }); effects.splice(0).forEach(effect => effect()); return tree; };
  const tree = render();
  if (options.open !== false) { find(tree, node => node.type === 'button')[0].props.onClick(); render(); await tick(); }
  return { render, calls, document, visible: () => { document.visibilityState = 'visible'; listeners.forEach(listener => listener()); }, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}
test('opening the office drawer automatically acknowledges only the displayed IDs once', async () => {
  const ui = await mount(); let tree = ui.render();
  assert.match(JSON.stringify(tree), /At gate/); await tick();
  assert.equal(JSON.stringify(ui.calls.find(call => call[0] === 'read')), JSON.stringify(['read', 'd', ['42']]));
  ui.render(); await tick(); assert.equal(ui.calls.filter(call => call[0] === 'read').length, 1);
  assert.equal(button(tree, 'Mark displayed messages read'), undefined);
  button(ui.render(), 'Older messages').props.onClick(); ui.render(); await tick();
  assert.equal(ui.calls.filter(call => call[0] === 'load').at(-1)[2], '42'); ui.unmount();
});
test('office failed send keeps text/key and retries once without accepting edits', async () => {
  const sent = []; const ui = await mount({ send: async (...args) => { sent.push(args); if (sent.length === 1) throw Error('Lost response'); return { id: '43' }; } });
  find(ui.render(), node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Proceed to gate' } });
  await button(ui.render(), 'Send message').props.onClick();
  assert.equal(find(ui.render(), node => node.type === 'textarea')[0].props.disabled, true);
  await button(ui.render(), 'Retry send').props.onClick();
  assert.deepEqual(sent[0], sent[1]); assert.equal(sent[0][3], 'driver');
  assert.match(JSON.stringify(ui.render()), /Message sent/); assert.equal(find(ui.render(), node => node.type === 'textarea')[0].props.value, ''); ui.unmount();
});
test('load failure offers retry and never claims empty or enables send', async () => {
  const ui = await mount({ load: async () => { throw Error('Unavailable'); } }); const tree = ui.render();
  assert.match(JSON.stringify(tree), /Unavailable/); assert.doesNotMatch(JSON.stringify(tree), /No messages yet/);
  assert.equal(button(tree, 'Send message').props.disabled, true); assert.ok(button(tree, 'Retry / refresh messages')); ui.unmount();
});
test('closed conversation remains readable with disabled composer', async () => {
  const ui = await mount({ load: async () => ({ ...page, can_send: false }) }); const tree = ui.render();
  assert.match(JSON.stringify(tree), /At gate/); assert.match(JSON.stringify(tree), /read-only/);
  assert.equal(find(tree, node => node.type === 'textarea')[0].props.disabled, true); ui.unmount();
});
test('stale office thread hides replacement driver messages and blocks composer', async () => {
  const ui = await mount({ load: async () => ({ ...page, driver_id: 'replacement' }) }); const tree = ui.render();
  assert.match(JSON.stringify(tree), /Driver assignment changed/); assert.doesNotMatch(JSON.stringify(tree), /At gate/);
  assert.equal(button(tree, 'Send message').props.disabled, true); ui.unmount();
});

test('conversation opens as a labelled drawer and close/reopen retains the draft', async () => {
  const ui = await mount();
  const dialog = find(ui.render(), node => node.type === 'dialog')[0];
  assert.equal(dialog.props['aria-labelledby'], 'conversation-title-d');
  find(ui.render(), node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Keep this draft' } });
  find(ui.render(), node => node.props['aria-label'] === 'Close conversation')[0].props.onClick();
  assert.equal(find(ui.render(), node => node.type === 'textarea').length, 0);
  find(ui.render(), node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog')[0].props.onClick();
  ui.render(); await tick();
  assert.equal(find(ui.render(), node => node.type === 'textarea')[0].props.value, 'Keep this draft');
  assert.equal(ui.calls.some(call => call[0] === 'send'), false);
  ui.unmount();
});

test('Escape dismisses the drawer without losing an unconfirmed retry', async () => {
  const sent = [];
  const ui = await mount({ send: async (...args) => { sent.push(args); if (sent.length === 1) throw Error('Lost response'); } });
  find(ui.render(), node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Same retry' } });
  await button(ui.render(), 'Send message').props.onClick();
  let cancelled = false;
  find(ui.render(), node => node.type === 'dialog')[0].props.onCancel({ preventDefault() { cancelled = true; }, stopPropagation() {} });
  assert.equal(cancelled, true);
  find(ui.render(), node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog')[0].props.onClick();
  ui.render(); await tick();
  await button(ui.render(), 'Retry send').props.onClick();
  assert.deepEqual(sent[0], sent[1]);
  ui.unmount();
});

test('drawer traps Tab boundaries and shields a parent dialog from Escape', async () => {
  const ui = await mount();
  let focused = '', prevented = false, stopped;
  const first = { focus() { focused = 'first'; } }, last = { focus() { focused = 'last'; } };
  const element = { querySelectorAll: () => [first, last] };
  const key = (key, shiftKey = false) => find(ui.render(), node => node.type === 'dialog')[0].props.onKeyDown({ key, shiftKey, currentTarget: element, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  ui.document.activeElement = first; key('Tab', true);
  assert.equal(focused, 'last'); assert.equal(prevented, true);
  ui.document.activeElement = last; key('Tab'); assert.equal(focused, 'first');
  prevented = stopped = false; key('Escape');
  assert.equal(stopped, true); assert.equal(prevented, false);
  ui.unmount();
});

test('backdrop closes the drawer while clicking its content does not', async () => {
  const ui = await mount();
  const element = { getBoundingClientRect: () => ({ left: 100, right: 200, top: 0, bottom: 500 }) };
  const click = clientX => find(ui.render(), node => node.type === 'dialog')[0].props.onClick({ target: element, currentTarget: element, clientX, clientY: 50 });
  click(150);
  assert.equal(find(ui.render(), node => node.type === 'textarea').length, 1);
  click(50);
  assert.equal(find(ui.render(), node => node.type === 'textarea').length, 0);
  ui.unmount();
});

test('closed and hidden conversations are not marked read until displayed in a visible tab', async () => {
  const closed = await mount({}, { open: false });
  closed.render(); await tick(); assert.equal(closed.calls.some(call => call[0] === 'read'), false); closed.unmount();
  const hidden = await mount({}, { hidden: true });
  hidden.render(); await tick(); assert.equal(hidden.calls.some(call => call[0] === 'read'), false);
  hidden.visible(); await tick();
  assert.equal(hidden.calls.filter(call => call[0] === 'read').length, 1); hidden.unmount();
});

test('read failure keeps the unread count and offers retry without blocking the reply', async () => {
  let attempts = 0, refreshed = 0;
  const ui = await mount({ read: async () => { if (++attempts === 1) throw Error('Network'); }, unread: async () => attempts > 1 ? [] : [{ delivery_id: 'd', unread: 1 }] }, { onRead: () => refreshed++ });
  ui.render(); await tick();
  assert.match(JSON.stringify(ui.render()), /read status could not be updated/);
  assert.equal(find(ui.render(), node => node.type === 'textarea')[0].props.disabled, false);
  assert.equal(refreshed, 0);
  button(ui.render(), 'Retry marking messages read').props.onClick(); ui.render(); await tick();
  assert.equal(attempts, 2); assert.equal(refreshed, 1);
  assert.doesNotMatch(JSON.stringify(ui.render()), /read status could not be updated/); ui.unmount();
});

test('new arrivals and older pages acknowledge only their newly displayed IDs', async () => {
  const read = []; let changed, latest = page;
  const ui = await mount({ watch: (_id, refresh) => { changed = refresh; return () => {}; }, load: async (_id, before) => before ? { ...page, messages: [{ ...page.messages[0], id: '41' }] } : latest, read: async (_delivery, ids) => read.push([...ids]) });
  ui.render(); await tick();
  latest = { ...page, messages: [...page.messages, { ...page.messages[0], id: '43' }] };
  changed(); ui.render(); await tick(); ui.render(); await tick();
  assert.deepEqual(read, [['42'], ['43']]);
  button(ui.render(), 'Older messages').props.onClick(); ui.render(); await tick(); ui.render(); await tick();
  assert.deepEqual(read, [['42'], ['43'], ['41']]); ui.unmount();
});

test('denied or reassigned conversation data never triggers a read receipt', async () => {
  const ui = await mount({ load: async () => ({ ...page, driver_id: 'replacement' }) });
  ui.render(); await tick();
  assert.equal(ui.calls.some(call => call[0] === 'read'), false); ui.unmount();
});
