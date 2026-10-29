import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinates, distanceKm, outboundOptions, planReturnLoads } from './returnLoadPlanner.js';

const now = Date.parse('2026-10-29T00:00:00Z');
const options = { now, readyAt: '2026-10-30T00:00:00Z' };
function fixture() {
  return {
    shipments: [
      { id: 'out', status: 'in_transit', pickup_lat: 14, pickup_lng: 120, dropoff_lat: 15, dropoff_lng: 120, estimated_arrival: '2026-10-29T23:00:00Z' },
      { id: 'back', tracking_number: 'RETURN', status: 'booked', pickup_lat: 14.95, pickup_lng: 120, dropoff_lat: 14.05, dropoff_lng: 120, weight_kg: 1000, requested_vehicle_type_id: 'van', scheduled_departure: '2026-10-30T02:00:00Z' },
    ],
    deliveries: [{ id: 'd', shipment_id: 'out', truck_id: 't', driver_id: 'driver', status: 'in_transit' }],
    trucks: [{ id: 't', vehicle_type_id: 'van', capacity_kg: 2000, status: 'on_trip' }], maintenance: [],
  };
}
const plan = (data = fixture(), overrides = {}) => planReturnLoads(data, 'd', { ...options, ...overrides });

test('matches real return direction, capacity and time; does not mutate or assign', () => {
  const data = fixture(), before = structuredClone(data), result = plan(data);
  assert.equal(result.matches.length, 1);
  assert.ok(result.matches[0].reductionKm > 90);
  assert.equal(result.matches[0].waitHours, 2);
  assert.deepEqual(data, before);
});
test('unknown coordinates never become zero; zero is valid', () => {
  for (const value of [null, undefined, '', ' ', 'bad', Infinity, 91]) assert.equal(coordinates({ pickup_lat: value, pickup_lng: 0 }, 'pickup'), null);
  assert.deepEqual(coordinates({ pickup_lat: '0', pickup_lng: '0' }, 'pickup'), [0, 0]);
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
});
test('rejects other types, zero/unknown/overweight payload; accepts exact capacity', () => {
  for (const patch of [{ weight_kg: null }, { weight_kg: 0 }, { weight_kg: 2001 }, { requested_vehicle_type_id: 'truck' }]) {
    const data = fixture(); Object.assign(data.shipments[1], patch); assert.equal(plan(data).matches.length, 0);
  }
  const data = fixture(); data.shipments[1].weight_kg = 2000; assert.equal(plan(data).matches.length, 1);
});
test('excludes assigned return loads but cancelled prior assignments do not block', () => {
  const data = fixture(); data.deliveries.push({ id: 'other', shipment_id: 'back', status: 'assigned' });
  assert.equal(plan(data).matches.length, 0);
  data.deliveries[1].status = 'cancelled'; assert.equal(plan(data).matches.length, 1);
});
test('never suggests pending/cancelled/completed/self loads', () => {
  for (const status of ['pending', 'cancelled', 'completed', 'assigned']) {
    const data = fixture(); data.shipments[1].status = status; assert.equal(plan(data).matches.length, 0);
  }
});
test('requires future ready time and honors recorded arrival', () => {
  for (const readyAt of ['', 'bad', '2026-10-28T00:00:00Z', '2026-10-29T22:00:00Z']) assert.ok(plan(fixture(), { readyAt }).error);
});
test('excludes missing, too early and too late departures', () => {
  for (const scheduled_departure of [null, 'bad', '2026-10-29T23:59:59Z', '2026-10-31T00:00:01Z']) {
    const data = fixture(); data.shipments[1].scheduled_departure = scheduled_departure; assert.equal(plan(data).matches.length, 0);
  }
});
test('filters pickup radius and wrong-way / no-improvement returns', () => {
  assert.equal(plan(fixture(), { maxPickupKm: 1 }).matches.length, 0);
  const data = fixture(); data.shipments[1].dropoff_lat = 16; assert.equal(plan(data).matches.length, 0);
  data.shipments[1].pickup_lat = 17; data.shipments[1].dropoff_lat = 14; assert.equal(plan(data, { maxPickupKm: 500 }).matches.length, 0);
});
test('blocks unavailable/unknown truck capacity, maintenance and conflicting resources', () => {
  for (const patch of [{ capacity_kg: null }, { status: 'maintenance' }, { vehicle_type_id: null }]) {
    const data = fixture(); Object.assign(data.trucks[0], patch); assert.ok(plan(data).error);
  }
  const data = fixture(); data.maintenance.push({ truck_id: 't', status: 'in_progress' }); assert.ok(plan(data).error);
  data.maintenance = []; data.deliveries.push({ id: 'other', driver_id: 'driver', status: 'assigned' }); assert.ok(plan(data).error);
});
test('outbound removal or cancellation fails closed; empty data has no fabricated options', () => {
  const data = fixture(); data.deliveries[0].status = 'cancelled'; assert.ok(plan(data).error);
  assert.deepEqual(outboundOptions({ shipments: [], deliveries: [] }), []);
});
test('deterministic ranking favors greater empty-distance reduction', () => {
  const data = fixture(); data.shipments.push({ ...data.shipments[1], id: 'nearer', pickup_lat: 14.99, dropoff_lat: 14.01 });
  assert.deepEqual(plan(data).matches.map(row => row.shipment.id), ['nearer', 'back']);
});
test('invalid planner limits do not silently use defaults', () => {
  for (const patch of [{ maxPickupKm: '' }, { maxPickupKm: 501 }, { maxWaitHours: 0 }, { maxWaitHours: 169 }]) assert.ok(plan(fixture(), patch).error);
});
test('missing driver and nonfinite capacity cannot produce an opportunity', () => {
  const data = fixture(); data.deliveries[0].driver_id = null; assert.ok(plan(data).error);
  data.deliveries[0].driver_id = 'driver'; data.trucks[0].capacity_kg = Infinity; assert.ok(plan(data).error);
});
