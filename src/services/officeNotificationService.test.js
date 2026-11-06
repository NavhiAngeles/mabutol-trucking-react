import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
  const updates = [];
  const inserts = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user || { id: 'office-1', email: 'office@mabutol.com' } }, error: null }),
    },
    rpc: async (name) => {
      if (name === 'delivery_conversation_unread') {
        return { data: options.unreadThreads || [], error: null };
      }
      return { data: null, error: null };
    },
    from: (table) => {
      const query = {
        eq: () => query,
        single: async () => {
          if (table === 'users') return { data: options.profile || { full_name: 'Office Admin' }, error: null };
          return { data: null, error: null };
        },
        order: () => ({
          limit: async () => {
            if (table === 'notifications') return { data: options.notifications || [], error: null };
            if (table === 'delivery_messages') return { data: options.deliveryMessages || [], error: null };
            if (table === 'shipments') return { data: options.mobileBookings || [], error: null };
            if (table === 'delivery_incidents') return { data: options.incidents || [], error: null };
            if (table === 'delivery_expenses') return { data: options.expenses || [], error: null };
            return { data: [], error: null };
          },
        }),
        is: () => query,
        in: async (_col, ids) => {
          if (table === 'deliveries') {
            return { data: (options.deliveries || []).filter(d => ids.includes(d.id)), error: null };
          }
          if (table === 'shipments') {
            return { data: (options.shipments || []).filter(s => ids.includes(s.id)), error: null };
          }
          return { data: [], error: null };
        },
      };
      return {
        select: () => {
          if (table === 'delivery_message_reads') {
            return {
              eq: async () => ({ data: options.messageReads || [], error: null }),
            };
          }
          return query;
        },
        insert: async (row) => {
          inserts.push({ table, row });
          return { data: row, error: null };
        },
        update: (val) => ({
          eq: (col1, val1) => ({
            eq: (col2, val2) => ({
              select: () => ({
                single: async () => {
                  updates.push({ table, val, filters: [[col1, val1], [col2, val2]] });
                  return { data: { id: val1 }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  };

  const context = vm.createContext({ supabase: client });
  const source = fs.readFileSync(new URL('./officeNotificationService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export async function /gm, 'async function ')
    .replace(/^export function /gm, 'function ');
  vm.runInContext(source + '\nthis.load=loadOfficeNotifications;\nthis.dismiss=dismissNotification;\nthis.dismissed=dismissedSyntheticIds;\nthis.markAll=markAllOfficeNotificationsRead;', context);

  return {
    client,
    updates,
    inserts,
    load: () => context.load(client),
    dismiss: (notif, userId) => context.dismiss(notif, userId, client),
    markAll: (notifs, userId) => context.markAll(notifs, userId, client),
    dismissed: context.dismissed,
  };
}

test('loadOfficeNotifications merges database notifications, driver messages, and mobile bookings', async () => {
  const { load } = setup({
    notifications: [
      { id: 'notif-1', title: 'System notice', body: 'System maintenance', shipment_id: null, read_at: '2026-11-06T10:00:00Z', created_at: '2026-11-06T10:00:00Z' },
    ],
    deliveryMessages: [
      { id: 42, delivery_id: 'del-1', driver_id: 'dr-1', sender_role: 'driver', body: 'Traffic is heavy near Balintawak, delayed by 15 mins.', created_at: '2026-11-06T11:30:00Z' },
    ],
    mobileBookings: [
      { id: 'ship-1', tracking_number: 'TRK-2002', cargo_description: 'Agricultural Feeds', created_at: '2026-11-06T11:00:00Z' },
    ],
    deliveries: [
      { id: 'del-1', shipment_id: 'ship-del-1' },
    ],
    shipments: [
      { id: 'ship-del-1', tracking_number: 'TRK-1001' },
    ],
  });

  const result = await load();
  assert.equal(result.name, 'Office Admin');
  assert.equal(result.notifications.length, 3);

  const driverMsg = result.notifications.find(n => n.type === 'message');
  assert.ok(driverMsg);
  assert.equal(driverMsg.title, 'Driver message · TRK-1001');
  assert.equal(driverMsg.body, 'Traffic is heavy near Balintawak, delayed by 15 mins.');
  assert.equal(driverMsg.shipment_id, 'ship-del-1');
  assert.equal(driverMsg.delivery_id, 'del-1');
  assert.equal(driverMsg.message_id, 42);
  assert.equal(driverMsg.read_at, null);
  assert.equal(driverMsg.synthetic, true);

  const booking = result.notifications.find(n => n.type === 'booking_confirmed');
  assert.ok(booking);
  assert.equal(booking.title, 'New customer booking · TRK-2002');
  assert.equal(booking.shipment_id, 'ship-1');
  assert.equal(booking.synthetic, true);
});

test('loadOfficeNotifications marks driver messages read if recorded in delivery_message_reads', async () => {
  const { load } = setup({
    deliveryMessages: [
      { id: 99, delivery_id: 'del-1', driver_id: 'dr-1', sender_role: 'driver', body: 'Arrived at pickup location.', created_at: '2026-11-06T12:00:00Z' },
    ],
    messageReads: [
      { message_id: 99 },
    ],
    deliveries: [
      { id: 'del-1', shipment_id: 'ship-del-1' },
    ],
    shipments: [
      { id: 'ship-del-1', tracking_number: 'TRK-8888' },
    ],
  });

  const result = await load();
  const driverMsg = result.notifications.find(n => n.type === 'message');
  assert.ok(driverMsg);
  assert.equal(driverMsg.read_at, '2026-11-06T12:00:00Z');
});

test('loadOfficeNotifications falls back to unread thread RPC when direct delivery_messages is empty', async () => {
  const { load } = setup({
    deliveryMessages: [],
    unreadThreads: [
      { delivery_id: 'del-fallback', driver_id: 'dr-1', tracking_number: 'TRK-FALLBACK', unread: 3 },
    ],
    deliveries: [
      { id: 'del-fallback', shipment_id: 'ship-fallback' },
    ],
  });

  const result = await load();
  const driverMsg = result.notifications.find(n => n.type === 'message');
  assert.ok(driverMsg);
  assert.equal(driverMsg.title, 'Driver message · TRK-FALLBACK');
  assert.equal(driverMsg.body, '3 unread messages from driver.');
});

test('loadOfficeNotifications deduplicates events already recorded in notifications table', async () => {
  const { load } = setup({
    notifications: [
      { id: 'notif-existing', title: 'New customer booking · TRK-2002', body: 'Already saved', shipment_id: 'ship-1', read_at: null, created_at: '2026-11-06T11:00:00Z' },
    ],
    mobileBookings: [
      { id: 'ship-1', tracking_number: 'TRK-2002', cargo_description: 'Agricultural Feeds', created_at: '2026-11-06T11:00:00Z' },
    ],
  });

  const result = await load();
  const bookings = result.notifications.filter(n => n.title.includes('TRK-2002'));
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].id, 'notif-existing');
});

test('dismissNotification updates database for real notifications and records message reads for driver messages', async () => {
  const { dismiss, updates, inserts, dismissed } = setup();

  // 1. Synthetic notification with message_id
  const synthRes = await dismiss({ id: 'msg-42', message_id: 42, synthetic: true }, 'office-1');
  assert.equal(synthRes.id, 'msg-42');
  assert.ok(dismissed.has('msg-42'));
  assert.equal(updates.length, 0);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'delivery_message_reads');
  assert.equal(inserts[0].row.message_id, 42);
  assert.equal(inserts[0].row.user_id, 'office-1');

  // 2. Real notification
  const realRes = await dismiss({ id: 'real-notif-1', synthetic: false }, 'office-1');
  assert.equal(realRes.id, 'real-notif-1');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, 'notifications');
  assert.deepEqual(updates[0].filters, [['id', 'real-notif-1'], ['user_id', 'office-1']]);
});

test('markAllOfficeNotificationsRead marks unread DB notifications, driver messages and synthetic bookings', async () => {
  const { markAll, inserts, dismissed } = setup();

  const notifications = [
    { id: 'notif-1', synthetic: false, read_at: null },
    { id: 'msg-42', message_id: 42, synthetic: true, read_at: null },
    { id: 'booking-99', synthetic: true, read_at: null },
    { id: 'already-read', synthetic: false, read_at: '2026-11-06T10:00:00Z' },
  ];

  await markAll(notifications, 'office-1');

  assert.ok(notifications[0].read_at);
  assert.ok(notifications[1].read_at);
  assert.ok(notifications[2].read_at);
  assert.ok(dismissed.has('booking-99'));
  assert.ok(dismissed.has('msg-42'));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'delivery_message_reads');
  assert.equal(inserts[0].row.length, 1);
  assert.equal(inserts[0].row[0].message_id, 42);
  assert.equal(inserts[0].row[0].user_id, 'office-1');
});
