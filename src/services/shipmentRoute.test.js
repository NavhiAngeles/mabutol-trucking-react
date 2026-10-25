import test from 'node:test';
import assert from 'node:assert/strict';
import { shipmentRouteFields } from './shipmentRoute.js';

const pickup = { lat: 14.6, lng: 120.96 };
const destination = { lat: 14.8, lng: 121.1 };
const geometry = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[120.96, 14.6], [121.1, 14.8]] } }] };
test('office shipment retains confirmed pins, geometry and duration for the assigned driver', () => {
  assert.deepEqual(shipmentRouteFields(pickup, destination, geometry, '70'), {
    pickup_lat: 14.6, pickup_lng: 120.96, dropoff_lat: 14.8, dropoff_lng: 121.1,
    route_source: 'provider', route_geometry: geometry, route_duration_minutes: 70,
  });
});
test('missing pins or stale route cannot be silently saved', () => {
  for (const args of [[null, destination, geometry, 70], [pickup, destination, null, 70], [pickup, destination, geometry, ''], [{ lat: 91, lng: 120 }, destination, geometry, 70]]) {
    assert.throws(() => shipmentRouteFields(...args), /Confirm both map pins/);
  }
});
