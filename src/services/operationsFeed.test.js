import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EVENT_STATUSES, SOURCE_RANK, compareEvents, mapOperationEvent, timestampKey, relativeEventTime, absoluteEventTime } from './operationsFeed.js';
const shipmentId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-10-13T15:59:59.123456+00:00';
function service(tables = {}, fail = '') {
  const requests = [], subscriptions = [], removed = [];
  const context = { EVENT_STATUSES, SOURCE_RANK, compareEvents, mapOperationEvent, timestampKey, supabase: {
    from(table) {
      let rows = [...(tables[table] || [])], limit = Infinity;
      const request = { table, columns: '', limit: null }; requests.push(request);
      const time = value => timestampKey(value);
      const q = {
        select(columns) { request.columns = columns; return q; },
        lte(field, value) { rows = rows.filter(r => time(r[field]) <= time(value)); return q; },
        lt(field, value) { rows = rows.filter(r => time(r[field]) < time(value)); return q; },
        eq(field, value) { rows = rows.filter(r => r[field] === value); return q; },
        in(field, values) { rows = rows.filter(r => values.includes(r[field])); return q; },
        or(expression) {
          const match = /created_at.lt.(.*),and\(created_at.eq.(.*),id.lt.(.*)\)/.exec(expression);
          assert.ok(match, expression);
          rows = rows.filter(r => time(r.created_at) < time(match[1]) || (time(r.created_at) === time(match[2]) &&
            (table === 'delivery_incidents' ? String(r.id) < match[3] : BigInt(r.id) < BigInt(match[3]))));
          return q;
        },
        order() { return q; },
        limit(value) { limit = value; request.limit = value; return q; },
        then(resolve, reject) {
          if (table === fail) return Promise.resolve({ error: new Error('Permission denied') }).then(resolve, reject);
          const source = table === 'shipment_status_history' ? 'history' : table === 'delivery_incidents' ? 'incident' : 'audit';
          const sorted = table === 'shipments' ? rows : rows.map(row => ({ ...row, source })).sort(compareEvents);
          return Promise.resolve({ data: sorted.slice(0, limit) }).then(resolve, reject);
        },
      }; return q;
    },
    channel() { const c = { on(_, filter, callback) { subscriptions.push({ filter, callback }); return c; }, subscribe(callback) { callback('SUBSCRIBED'); return c; } }; return c; },
    removeChannel(c) { removed.push(c); },
  } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./operationsFeedService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api={fetchOperationsPage,subscribeOperationsFeed};', context);
  return { ...context.api, requests, subscriptions, removed };
}
test('status labels distinguish submission, confirmation, assignment, departure, completion and cancellation', () => {
  const labels = ['pending', 'booked', 'assigned', 'in_transit', 'completed', 'cancelled'].map(to_status => mapOperationEvent('history', { id: 1, shipment_id: shipmentId, to_status, created_at: stamp }).label);
  assert.deepEqual(labels, ['Booking submitted', 'Booking confirmed', 'Assigned', 'Departed', 'Completed', 'Cancelled']);
  assert.equal(mapOperationEvent('incident', { id: incidentId, category: 'flat_tire' }).description, 'flat tire');
  assert.equal(mapOperationEvent('history', { id: 1, from_status: null, to_status: 'in_transit' }).label, 'Recorded in transit');
  assert.equal(mapOperationEvent('history', { id: 1, from_status: null, to_status: 'completed' }).label, 'Recorded completed');
});
test('mapping uses actual customer and route, exact record IDs, and safe missing/deleted fallbacks', () => {
  const s = { id: shipmentId, tracking_number: 'REAL-1', customer: { name: 'Actual customer' }, pickup_address: 'Actual pickup', dropoff_address: 'Actual destination' };
  const event = mapOperationEvent('history', { id: 1, shipment_id: shipmentId, to_status: 'completed' }, s);
  assert.equal(event.customer, 'Actual customer'); assert.equal(event.description, 'Actual pickup → Actual destination');
  assert.equal(event.href, `/shipment?tab=all&record=${shipmentId}`);
  assert.equal(mapOperationEvent('history', { id: 1, shipment_id: shipmentId }).href, null);
  assert.equal(mapOperationEvent('audit', { id: 2, entity_id: shipmentId }, s).href, null);
});
test('relative times and absolute dates handle invalid values and Philippine midnight', () => {
  const now = Date.parse('2026-10-13T16:00:00Z');
  assert.equal(relativeEventTime('bad', now), 'Time unavailable');
  assert.equal(relativeEventTime('2026-10-13T15:59:59Z', now), 'Just now');
  assert.equal(relativeEventTime('2026-10-13T15:55:00Z', now), '5 minutes ago');
  assert.equal(relativeEventTime('2026-10-13T14:00:00Z', now), '2 hours ago');
  assert.match(absoluteEventTime('2026-10-13T16:00:00Z'), /Oct 14, 2026/);
  assert.match(relativeEventTime('2026-10-14T16:00:00Z', now), /future/);
});
test('merged keyset pagination preserves ties, microseconds and a fixed snapshot despite new arrivals', async () => {
  const tables = {
    shipment_status_history: [1, 2, 3].map(id => ({ id, shipment_id: shipmentId, to_status: 'assigned', created_at: stamp })),
    delivery_incidents: [{ id: incidentId, shipment_id: shipmentId, category: 'other', created_at: stamp }],
    activity_logs: [{ id: 1, entity_type: 'shipments', entity_id: shipmentId, action: 'DELETE', created_at: stamp }],
    shipments: [{ id: shipmentId, tracking_number: 'REAL-1', customer: { name: 'Customer' } }],
  };
  const api = service(tables);
  let result = await api.fetchOperationsPage({ size: 2, snapshot: '2026-10-13T16:00:00Z' });
  const seen = Array.from(result.events, e => e.key);
  const snapshot = result.snapshot;
  tables.shipment_status_history.push({ id: 4, shipment_id: shipmentId, to_status: 'in_transit', created_at: '2026-10-13T16:00:01Z' });
  while (result.nextCursor) {
    result = await api.fetchOperationsPage({ size: 2, snapshot, cursor: result.nextCursor });
    seen.push(...result.events.map(e => e.key));
  }
  assert.deepEqual(seen, ['history:3', 'history:2', 'history:1', `incident:${incidentId}`, 'audit:1']);
  assert.equal(new Set(seen).size, 5);
  assert.ok(api.requests.filter(r => r.table !== 'shipments').every(r => r.limit === 3));
  assert.ok(compareEvents({ source: 'history', id: '1', created_at: stamp }, { source: 'history', id: '2', created_at: stamp.replace('123456', '123455') }) < 0);
});
test('audit status updates and inserts do not duplicate canonical history; raw details are never fetched', async () => {
  const api = service({ activity_logs: ['INSERT', 'UPDATE', 'DELETE'].map((action, id) => ({ id: id + 1, entity_type: 'shipments', action, created_at: stamp })) });
  const result = await api.fetchOperationsPage({ snapshot: '2026-10-14T00:00:00Z' });
  assert.equal(result.events.length, 1); assert.equal(result.events[0].label, 'Shipment removed');
  assert.ok(!api.requests.some(r => r.columns.includes('details')));
});
test('empty, permission and invalid requests have explicit outcomes, with no sample fallback', async () => {
  assert.equal((await service().fetchOperationsPage()).events.length, 0);
  await assert.rejects(service({}, 'delivery_incidents').fetchOperationsPage(), /Permission denied/);
  await assert.rejects(service().fetchOperationsPage({ cursor: { source: 'history', id: 'unsafe', created_at: stamp } }), /Invalid activity cursor/);
});
test('Realtime uses only published parent tables and removes its channel', () => {
  const api = service(); let refreshed = 0;
  const unsubscribe = api.subscribeOperationsFeed(() => refreshed++);
  assert.equal(refreshed, 1);
  assert.deepEqual(api.subscriptions.map(s => s.filter.table), ['shipments', 'deliveries']);
  unsubscribe(); assert.equal(api.removed.length, 1);
});
