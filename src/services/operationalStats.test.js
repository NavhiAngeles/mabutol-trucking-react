import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOperationalStats, dispatchReadyIds, historicalCounts, comparisonLabel } from './operationalStats.js';
const stats = (s, d = [], t = [], m = [], h = null, now) => calculateOperationalStats(s, t, d, m, h, now);
test('two booked and one assigned, without pending, gives three pending dispatch and one active', () => {
  const result = stats([{ id: 'a', status: 'booked' }, { id: 'b', status: 'booked' }, { id: 'c', status: 'assigned' }]);
  assert.equal(result.pendingDispatch, 3); assert.equal(result.activeShipments, 1);
});
test('booking through assignment, loading, transit, delay and closure counts each record once', () => {
  for (const [status, active, pending, delayed] of [
    ['pending', 0, 0, 0], ['booked', 0, 1, 0], ['assigned', 1, 1, 0],
    ['loading', 1, 0, 0], ['in_transit', 1, 0, 0], ['delayed', 0, 0, 1],
    ['completed', 0, 0, 0], ['cancelled', 0, 0, 0],
  ]) {
    const result = stats([{ id: 'a', status }]);
    assert.deepEqual([result.activeShipments, result.pendingDispatch, result.delayedShipments], [active, pending, delayed]);
  }
});
test('assignment requires both truck and driver; departed or loading deliveries cannot remain pending', () => {
  const s = [{ id: 'a', status: 'assigned' }];
  const d = { shipment_id: 'a', status: 'assigned', truck_id: 't', driver_id: 'd' };
  assert.equal(stats(s, [d, d]).awaitingDispatch, 1);
  assert.equal(stats(s, [{ ...d, driver_id: null }]).awaitingAssignment, 1);
  assert.equal(stats(s, [{ ...d, departed_at: '2026-10-13T00:00:00Z' }]).pendingDispatch, 0);
  assert.equal(stats(s, [{ ...d, status: 'loading' }]).pendingDispatch, 0);
});
test('truck readiness excludes assignment conflicts, active maintenance and unavailable states', () => {
  const trucks = ['a', 'b', 'c', 'd'].map(id => ({ id, status: 'available' }));
  trucks.push({ id: 'e', status: 'maintenance' }, { id: 'f', status: 'inactive' });
  assert.deepEqual(dispatchReadyIds(trucks, [{ truck_id: 'a', status: 'assigned' }, { truck_id: 'b', status: 'in_transit' }], [{ truck_id: 'c', status: 'in_progress' }, { truck_id: 'd', status: 'completed' }]), ['d']);
});
test('missing, incomplete, or contradictory history yields neutral comparisons', () => {
  const s = [{ id: 'a', status: 'assigned', created_at: '2026-10-10T00:00:00Z' }];
  assert.equal(historicalCounts(s, [], Date.parse('2026-10-13T00:00:00Z')), null);
  assert.equal(stats(s).activeDelta, null);
  assert.equal(comparisonLabel(null), 'Historical comparison unavailable');
});
test('history reconstructs yesterday status, including completed shipments and newly booked records', () => {
  const created_at = '2026-10-10T00:00:00Z';
  const s = [{ id: 'a', status: 'completed', created_at }, { id: 'b', status: 'assigned', created_at: '2026-10-13T00:00:00Z' }];
  const h = [{ shipment_id: 'a', from_status: null, to_status: 'assigned', created_at },
    { shipment_id: 'a', from_status: 'assigned', to_status: 'completed', created_at: '2026-10-12T12:00:00Z' }];
  assert.deepEqual(historicalCounts(s, h, Date.parse('2026-10-13T00:00:00Z')), { active: 1, delayed: 0 });
  assert.equal(stats(s, [], [], [], h, Date.parse('2026-10-13T00:00:00Z')).activeDelta, 0);
  assert.match(comparisonLabel(-2), /^-2/); assert.match(comparisonLabel(2), /^\+2/);
});
test('same-time-yesterday comparison crosses Manila midnight without browser timezone dependence', () => {
  const s = [{ id: 'a', status: 'delayed', created_at: '2026-10-10T00:00:00Z' }];
  const h = [{ shipment_id: 'a', from_status: null, to_status: 'assigned', created_at: s[0].created_at },
    { shipment_id: 'a', from_status: 'assigned', to_status: 'delayed', created_at: '2026-10-12T16:00:00Z' }];
  assert.equal(stats(s, [], [], [], h, Date.parse('2026-10-13T15:59:59Z')).delayedDelta, 1);
  assert.equal(stats(s, [], [], [], h, Date.parse('2026-10-13T16:00:00Z')).delayedDelta, 0);
});
