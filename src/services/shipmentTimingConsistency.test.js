import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardAnalytics } from './dashboardAnalytics.js';
import { buildDriverReport } from './driverReport.js';
import { summarizeOverview } from './reportOverview.js';
import { buildShipmentReport } from './shipmentReport.js';

const range = { start: '2026-11-05', end: '2026-11-05' };
const onTime = {
  id: 'on-time', status: 'completed', created_at: '2026-11-05T01:00:00Z',
  estimated_arrival: '2026-11-05T03:00:00Z', actual_delivery_at: '2026-11-05T02:00:00Z',
};
const late = {
  id: 'late', status: 'completed', created_at: '2026-11-05T01:00:00Z',
  estimated_arrival: '2026-11-05T03:00:00Z', actual_delivery_at: '2026-11-05T04:00:00Z',
};
const unassessable = [
  { id: 'missing-actual', status: 'completed', created_at: '2026-11-05T01:00:00Z', estimated_arrival: '2026-11-05T03:00:00Z', actual_delivery_at: null },
  { id: 'missing-plan', status: 'completed', created_at: '2026-11-05T01:00:00Z', estimated_arrival: null, actual_delivery_at: '2026-11-05T02:00:00Z' },
  { id: 'invalid-plan', status: 'completed', created_at: '2026-11-05T01:00:00Z', estimated_arrival: 'invalid', actual_delivery_at: '2026-11-05T02:00:00Z' },
];

test('punctuality reports count only completed records with comparable planned and actual arrivals', () => {
  const shipments = [onTime, late, ...unassessable];

  const shipmentReport = buildShipmentReport(shipments, [], range);
  assert.equal(shipmentReport.total, 5);
  assert.equal(shipmentReport.timed, 2);
  assert.equal(shipmentReport.rate, 50);
  assert.deepEqual(shipmentReport.rows.filter(row => row.variance === '—').map(row => row.id).sort(),
    ['invalid-plan', 'missing-actual', 'missing-plan']);

  const overview = summarizeOverview({ shipments, deliveries: [], drivers: [], compliance: [] }, range);
  assert.equal(overview.completed, 5);
  assert.equal(overview.timed, 2);
  assert.equal(overview.onTime, 50);

  const dashboard = calculateDashboardAnalytics(shipments, [], [], [], [], Date.parse('2026-11-05T12:00:00+08:00'));
  assert.equal(dashboard.onTimeRate, 50);

  const driverRecords = {
    drivers: [{ id: 'driver', full_name: 'Driver', status: 'available' }],
    shipments,
    deliveries: shipments.map(shipment => ({
      id: `delivery-${shipment.id}`, shipment_id: shipment.id, driver_id: 'driver', status: 'delivered',
      arrived_at: shipment.actual_delivery_at,
    })),
    incidents: [],
  };
  const driverReport = buildDriverReport(driverRecords, range);
  assert.equal(driverReport.rows[0].completed, 5);
  assert.equal(driverReport.timed, 2);
  assert.equal(driverReport.rate, 50);
});

test('punctuality reports expose unavailable rates when every completed record is unassessable', () => {
  const shipmentReport = buildShipmentReport(unassessable, [], range);
  assert.equal(shipmentReport.timed, 0);
  assert.equal(shipmentReport.rate, null);
  assert.ok(shipmentReport.trend.every(bucket => bucket.rate === null));

  const overview = summarizeOverview({ shipments: unassessable, deliveries: [], drivers: [], compliance: [] }, range);
  assert.equal(overview.timed, 0);
  assert.equal(overview.onTime, null);

  const dashboard = calculateDashboardAnalytics(unassessable, [], [], [], [], Date.parse('2026-11-05T12:00:00+08:00'));
  assert.equal(dashboard.onTimeRate, null);
});
