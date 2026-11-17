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

test('threads() retains read conversations with unread=0 and sorts unread then newest activity first', async () => {
  const client = {
    rpc: async name => {
      assert.equal(name, 'delivery_conversation_unread');
      return {
        data: [{ delivery_id: 'del-unread', driver_id: 'drv-2', tracking_number: 'SHP-002', unread: 2 }],
        error: null,
      };
    },
    from: table => {
      assert.equal(table, 'deliveries');
      const query = {
        select: () => query,
        order: () => query,
        limit: count => {
          if (count === 200) {
            return Promise.resolve({
              data: [
                {
                  id: 'del-read-older',
                  driver_id: 'drv-1',
                  status: 'in_transit',
                  shipment: { tracking_number: 'SHP-001', status: 'in_transit' },
                  driver: { full_name: 'Nav Angeles' },
                  delivery_messages: [
                    {
                      id: 10,
                      driver_id: 'drv-1',
                      sender_role: 'driver',
                      body: 'Passed Balagtas toll gate',
                      created_at: '2026-11-09T14:00:00Z',
                    },
                  ],
                },
                {
                  id: 'del-read-newer',
                  driver_id: 'drv-3',
                  status: 'delivered',
                  shipment: { tracking_number: 'SHP-003', status: 'review' },
                  driver: { full_name: 'Juan Dela Cruz' },
                  delivery_messages: [
                    {
                      id: 15,
                      driver_id: 'drv-3',
                      sender_role: 'admin',
                      body: 'Please upload signed POD receipt',
                      created_at: '2026-11-09T15:30:00Z',
                    },
                  ],
                },
                {
                  id: 'del-unread',
                  driver_id: 'drv-2',
                  status: 'loading',
                  shipment: { tracking_number: 'SHP-002', status: 'loading' },
                  driver: { full_name: 'Pedro Santos' },
                  delivery_messages: [
                    {
                      id: 12,
                      driver_id: 'drv-2',
                      sender_role: 'driver',
                      body: 'Waiting at loading bay 4',
                      created_at: '2026-11-09T14:30:00Z',
                    },
                  ],
                },
              ],
              error: null,
            });
          }
          return query;
        },
      };
      return query;
    },
  };

  const service = deliveryConversationService(client);
  const result = await service.threads();

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map(r => [r.tracking_number, r.unread, r.driver_name]),
    [
      ['SHP-002', 2, 'Pedro Santos'],
      ['SHP-003', 0, 'Juan Dela Cruz'],
      ['SHP-001', 0, 'Nav Angeles'],
    ]
  );
  assert.equal(result[1].last_message_body, 'Please upload signed POD receipt');
  assert.equal(result[2].last_message_body, 'Passed Balagtas toll gate');
});

test('threads() falls back to delivery_messages lookup and excludes reassigned former-driver messages', async () => {
  const client = {
    rpc: async () => ({ data: [], error: null }),
    from: table => {
      if (table === 'deliveries') {
        return {
          select: cols => {
            if (cols.includes('delivery_messages!inner')) {
              const failQuery = {
                order: () => failQuery,
                limit: count => (count === 200 ? Promise.resolve({ data: null, error: Error('embed unsupported') }) : failQuery),
              };
              return failQuery;
            }
            return {
              in: async () => ({
                data: [
                  { id: 'del-1', shipment_id: 'ship-1', driver_id: 'drv-current', status: 'assigned' },
                  { id: 'del-reassigned', shipment_id: 'ship-2', driver_id: 'drv-new', status: 'assigned' },
                ],
                error: null,
              }),
            };
          },
        };
      }
      if (table === 'delivery_messages') {
        const msgQuery = {
          select: () => msgQuery,
          order: () => msgQuery,
          limit: async () => ({
            data: [
              { id: 21, delivery_id: 'del-1', driver_id: 'drv-current', sender_role: 'driver', body: 'Ready to depart', created_at: '2026-11-09T16:00:00Z' },
              { id: 19, delivery_id: 'del-reassigned', driver_id: 'drv-former', sender_role: 'driver', body: 'Old driver message', created_at: '2026-11-09T15:00:00Z' },
            ],
            error: null,
          }),
        };
        return msgQuery;
      }
      if (table === 'drivers') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'drv-current', full_name: 'Nav Angeles' }], error: null }),
          }),
        };
      }
      if (table === 'shipments') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'ship-1', tracking_number: 'SHP-NE-26-002328', status: 'assigned' }], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const service = deliveryConversationService(client);
  const result = await service.threads();

  assert.equal(result.length, 1);
  assert.equal(result[0].delivery_id, 'del-1');
  assert.equal(result[0].tracking_number, 'SHP-NE-26-002328');
  assert.equal(result[0].driver_name, 'Nav Angeles');
  assert.equal(result[0].unread, 0);
  assert.equal(result[0].last_message_body, 'Ready to depart');
});
