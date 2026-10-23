import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardAnalytics, complianceState, latestTracking, manilaDate } from './dashboardAnalytics.js';
const now = Date.parse('2026-10-24T00:00:00+08:00');
test('empty dashboard has zero real counts and unavailable rates rather than demo figures', () => {
  const result = calculateDashboardAnalytics([], [], [], [], [], now);
  assert.equal(result.completedToday, 0); assert.equal(result.onTimeRate, null); assert.equal(result.averageTripHours, null);
  assert.equal(result.trends.length, 7); assert.ok(result.trends.every(d => d.value === 0)); assert.deepEqual(result.alerts, []);
});
test('performance uses Manila midnight and only completed shipments with comparable times', () => {
  const shipments = [
    { status: 'completed', created_at: '2026-10-23T16:00:00Z', actual_delivery_at: '2026-10-23T16:00:00Z', estimated_arrival: '2026-10-23T16:30:00Z' },
    { status: 'completed', created_at: '2026-10-23T15:59:00Z', actual_delivery_at: '2026-10-23T15:59:00Z', estimated_arrival: '2026-10-23T15:00:00Z' },
    { status: 'completed', created_at: '2026-10-20', actual_delivery_at: null },
  ];
  const result = calculateDashboardAnalytics(shipments, [], [], [], [], now);
  assert.equal(manilaDate(now), '2026-10-24'); assert.equal(result.completedToday, 1); assert.equal(result.onTimeRate, 50);
  assert.equal(result.trends.at(-1).value, 1); assert.equal(result.trends.at(-2).value, 1);
});
test('resources form a disjoint partition and reservations exclude dispatch availability', () => {
  const trucks = ['a', 'b', 'c', 'd'].map(id => ({ id, status: 'available' }));
  const result = calculateDashboardAnalytics([], trucks, [{ truck_id: 'b', status: 'assigned' }], [{ truck_id: 'c', status: 'in_progress' }], [], now);
  assert.deepEqual(result.resources, { available: 2, inUse: 1, maintenance: 1, other: 0, total: 4 });
});
test('compliance expires after the Manila expiry day and requires actual approved enum', () => {
  assert.equal(complianceState({ expiry_date: '2026-10-24', review_status: 'approved' }, now), 'expiring_soon');
  assert.equal(complianceState({ expiry_date: '2026-10-23', review_status: 'approved' }, now), 'expired');
  assert.equal(complianceState({ review_status: 'approved' }, now), 'valid');
  assert.equal(complianceState({ review_status: 'valid' }, now), 'pending_review');
});
test('replaced documents are counted once; OR and CR stay separate; alerts have real destinations', () => {
  const docs = [
    { truck_id: 'a', doc_type: 'lto_registration', remarks: 'OR copy', created_at: '2026-10-20', expiry_date: '2026-10-01', review_status: 'approved' },
    { truck_id: 'a', doc_type: 'lto_registration', remarks: 'OR copy', created_at: '2026-10-21', expiry_date: '2027-10-01', review_status: 'approved' },
    { truck_id: 'a', doc_type: 'lto_registration', remarks: 'CR copy', created_at: '2026-10-21', review_status: 'pending_review' },
  ];
  const result = calculateDashboardAnalytics([{ status: 'pending' }, { status: 'delayed' }], [], [], [{ status: 'scheduled', scheduled_date: '2026-10-23' }], docs, now);
  assert.deepEqual(result.compliance, { expired: 0, expiring: 0, review: 1 });
  assert.equal(result.alerts.length, 4); assert.ok(result.alerts.every(a => a.path.startsWith('/')));
});
test('trip duration excludes negative or incomplete intervals', () => {
  const result = calculateDashboardAnalytics([], [], [
    { status: 'delivered', departed_at: '2026-10-23T00:00Z', arrived_at: '2026-10-23T02:00Z' },
    { status: 'delivered', departed_at: '2026-10-23T02:00Z', arrived_at: '2026-10-23T00:00Z' },
    { status: 'delivered', departed_at: '2026-10-23T00:00Z' },
  ], [], [], now);
  assert.equal(result.averageTripHours, 2);
});
test('GPS picks newest valid active-delivery fix and labels stale positions', () => {
  const rows = [
    { id: 1, truck_id: 'a', delivery_id: 'd', latitude: 15, longitude: 121, recorded_at: '2026-10-23T15:00:00Z' },
    { id: 2, truck_id: 'a', delivery_id: 'd', latitude: 16, longitude: 121, recorded_at: '2026-10-23T15:59:00Z' },
    { id: 3, truck_id: 'b', delivery_id: 'old', latitude: 15, longitude: 121, recorded_at: '2026-10-23T15:00:00Z' },
    { id: 4, truck_id: 'c', delivery_id: 'd', latitude: null, longitude: 121, recorded_at: '2026-10-23T15:59:00Z' },
  ];
  const result = latestTracking(rows, [{ id: 'd', status: 'in_transit' }], now);
  assert.equal(result.length, 1); assert.equal(result[0].latitude, 16); assert.equal(result[0].stale, false);
  assert.equal(latestTracking(rows.slice(0, 1), [{ id: 'd', status: 'in_transit' }], now)[0].stale, true);
});
