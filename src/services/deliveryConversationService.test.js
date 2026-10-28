import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryConversationService, PendingDeliveryMessage } from './deliveryConversationService.js';

test('uncertain send keeps key and immutable body; retry reconciles one stored message', async () => {
  const calls = []; let fail = true;
  const service = { send: async (...args) => { calls.push(args); if (fail) throw Error('response lost'); return { id: '1' }; } };
  const pending = new PendingDeliveryMessage(service, 'delivery', () => 'stable-id');
  await assert.rejects(pending.send(' Original message '), /response lost/);
  assert.equal(pending.pending.body, 'Original message');
  fail = false; assert.equal((await pending.send('changed text')).id, '1');
  assert.deepEqual(calls, [['delivery', 'stable-id', 'Original message'], ['delivery', 'stable-id', 'Original message']]);
  assert.equal(pending.pending, null);
});
test('double tap only sends once and confirmed send permits a new key', async () => {
  let release; let calls = 0; let id = 0;
  const pending = new PendingDeliveryMessage({ send: () => { calls++; return new Promise(resolve => { release = resolve; }); } }, 'd', () => String(++id));
  const first = pending.send('hello'); assert.equal(await pending.send('hello'), null); assert.equal(calls, 1);
  release({ id: '1' }); await first;
  const second = pending.send('another'); assert.equal(pending.pending.request, '2'); release({ id: '2' }); await second;
});
test('invalid messages never contact backend; Unicode limit counts code points', async () => {
  const pending = new PendingDeliveryMessage({ send: async () => ({ id: 'ok' }) }, 'd', () => 'id');
  await assert.rejects(pending.send('  ')); await assert.rejects(pending.send('x'.repeat(2001)));
  assert.equal((await pending.send('🚚'.repeat(2000))).id, 'ok');
});
test('conversation RPC carries delivery, cursor and exact read IDs without caller identity', async () => {
  const calls = [];
  const service = deliveryConversationService({ rpc: async (...args) => { calls.push(args); return { data: [] }; } });
  await service.load('d', '9007199254740993'); await service.read('d', ['9', '10']); await service.send('d', 'request', ' hello ', 'driver');
  assert.deepEqual(calls, [['delivery_conversation', { p_delivery: 'd', p_before: '9007199254740993' }], ['read_delivery_messages', { p_delivery: 'd', p_ids: ['9', '10'] }], ['send_delivery_message', { p_delivery: 'd', p_request: 'request', p_body: 'hello', p_driver: 'driver' }]]);
});
test('backend denial is actionable and does not become an empty conversation', async () => {
  const service = deliveryConversationService({ rpc: async () => ({ error: Error('private details') }) });
  await assert.rejects(service.load('denied'), /Conversation unavailable/);
});
