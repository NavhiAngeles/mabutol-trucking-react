import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { calculateDashboardAnalytics } from './dashboardAnalytics.js';
import { reportRange, summarizeOverview } from './reportOverview.js';

const empty = () => ({ shipments: [], deliveries: [], drivers: [], compliance: [] });
test('report loader retains live fleet counts and propagates inaccessible data', async () => {
  const source = fs.readFileSync(new URL('./reportOverviewService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const scope = { calculateDashboardAnalytics, getTruckComplianceRows: async () => [], getDriverComplianceRows: async () => [],
    fetchOperationalRows: async table => table === 'trucks' ? [{ id: 't', status: 'available' }] : [] };
  vm.createContext(scope); vm.runInContext(source + '\nthis.load = getReportOverview;', scope);
  assert.equal((await scope.load()).resources.available, 1);
  scope.fetchOperationalRows = async () => { throw new Error('Permission denied'); };
  await assert.rejects(scope.load(), /Permission denied/);
});
test('Philippine date boundaries and calendar ranges', () => {
  const now = Date.parse('2026-01-01T17:00:00Z');
  assert.deepEqual(reportRange('today', null, null, now), { start: '2026-01-02', end: '2026-01-02' });
  assert.equal(reportRange('thisWeek', null, null, now).start, '2025-12-29');
  assert.equal(reportRange('last3Months', null, null, now).start, '2025-11-01');
  assert.throws(() => reportRange('custom', '2026-02-30', '2026-03-01'));
  assert.throws(() => reportRange('custom', '2026-03-02', '2026-03-01'));
});
test('empty records do not invent rates or revenue', () => {
  const result = summarizeOverview(empty(), { start: '2026-01-01', end: '2026-01-01' });
  assert.equal(result.total, 0); assert.equal(result.onTime, null);
  assert.equal(result.revenue, 0); assert.equal(result.complianceTotal, 0);
  assert.equal(result.buckets.length, 1);
});
test('cohort uses creation date, excludes untimed rates and missing charges, deduplicates driver assignments', () => {
  const rows = empty();
  rows.shipments = [
    { id: '1', created_at: '2026-01-01T16:00:00Z', status: 'completed', final_amount: '1200', estimated_arrival: '2026-01-04T10:00Z', actual_delivery_at: '2026-01-04T09:00Z' },
    { id: '2', created_at: '2026-01-02T04:00Z', status: 'completed', final_amount: null },
    { id: '3', created_at: '2026-01-01T15:59:59Z', status: 'completed', final_amount: 999 },
    { id: '4', created_at: '2026-01-02T04:00Z', status: 'delayed', final_amount: 999 },
  ];
  rows.deliveries = [{ id: 'a', shipment_id: '1', driver_id: 'd', status: 'delivered' }, { id: 'b', shipment_id: '1', driver_id: 'd', status: 'delivered' }];
  rows.drivers = [{ id: 'd', full_name: 'Driver' }];
  rows.compliance = [{ docs: [{ badge: { state: 'missing' } }] }, { docs: [{ badge: { state: 'valid' } }] }];
  const result = summarizeOverview(rows, { start: '2026-01-02', end: '2026-01-02' });
  assert.equal(result.total, 3); assert.equal(result.revenue, 1200);
  assert.equal(result.missingAmounts, 1); assert.equal(result.onTime, 100);
  assert.equal(result.drivers[0].trips, 1); assert.equal(result.compliance.attention, 1);
  assert.equal(result.buckets[0].completed, 2); assert.equal(result.buckets[0].delayed, 1);
});
