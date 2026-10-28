import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
import { PendingDeliveryMessage } from '../../services/deliveryConversationService.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const button = (tree, text) => find(tree, node => node.type === 'button' && node.children.flat(Infinity).includes(text))[0];
const page = { can_send: true, driver_id: 'driver', messages: [{ id: '42', sender_role: 'driver', body: 'At gate', created_at: '2026-10-28T12:00:00Z' }], has_more: true };
async function mount(overrides = {}) {
  const states = [], refs = [], deps = [], cleanups = [], effects = [];
  let si = 0, ri = 0, ei = 0;
  const calls = [];
  const service = { watch: () => () => {}, unread: async () => [{ delivery_id: 'd', unread: 1 }], load: async (...args) => { calls.push(['load', ...args]); return page; }, read: async (...args) => calls.push(['read', ...args]), send: async (...args) => { calls.push(['send', ...args]); return { id: '43' }; }, ...overrides };
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[ri++] ||= { current: initial }; },
    useEffect(effect, next) { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = next; } },
    deliveryConversationService: () => service, supabase: {}, PendingDeliveryMessage, useAuth: () => ({ user: { id: 'office' } }),
    setInterval: () => 0, clearInterval() {}, crypto: { randomUUID: () => 'request' },
  });
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./DeliveryConversation.jsx', import.meta.url), 'utf8'), 'DeliveryConversation.jsx', { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render=Conversation;', context);
  const render = () => { si = ri = ei = 0; const tree = context.render({ delivery: 'd', driver: 'driver' }); effects.splice(0).forEach(effect => effect()); return tree; };
  let tree = render(); find(tree, node => node.type === 'button')[0].props.onClick(); render(); await tick();
  return { render, calls, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}
test('office shows conversation, explicit read ids, paging and no automatic mark-all', async () => {
  const ui = await mount(); let tree = ui.render();
  assert.match(JSON.stringify(tree), /At gate/); assert.equal(ui.calls.some(call => call[0] === 'read'), false);
  await button(tree, 'Mark displayed messages read').props.onClick();
  assert.equal(JSON.stringify(ui.calls.find(call => call[0] === 'read')), JSON.stringify(['read', 'd', ['42']]));
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
