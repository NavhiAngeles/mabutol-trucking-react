import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { calculateOperationalStats, dispatchReadyIds } from './operationalStats.js';
function service(tables = {}, fail = '') {
  const subscriptions = [], removed = [];
  const context = { calculateOperationalStats, dispatchReadyIds, supabase: {
    from(table) { const q = { select() { return q; }, order() { return q; }, async range(start, end) {
      return table === fail ? { error: new Error('Permission denied') } : { data: (tables[table] || []).slice(start, end + 1) };
    } }; return q; },
    channel() { const c = { on(event, filter, callback) { subscriptions.push({ filter, callback }); return c; }, subscribe(callback) { callback('SUBSCRIBED'); return c; } }; return c; },
    removeChannel(c) { removed.push(c); },
  } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./dashboardService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api={getDashboardStats,getDispatchReadyTruckIds,subscribeToDashboardChanges};', context);
  return { ...context.api, subscriptions, removed };
}
test('service counts all pages and Fleet uses identical readiness logic', async () => {
  const api = service({ shipments: Array.from({ length: 501 }, (_, id) => ({ id: String(id), status: 'assigned' })),
    trucks: [{ id: 't', status: 'available' }], deliveries: [{ id: 'd', truck_id: 't', status: 'assigned' }] });
  const result = await api.getDashboardStats();
  assert.equal(result.activeShipments, 501); assert.equal(result.pendingDispatch, 501);
  assert.equal(result.availableTrucks, (await api.getDispatchReadyTruckIds()).length);
  assert.equal(result.availableTrucks, 0);
});
test('operational query failures reject counts; inaccessible history is neutral; empty tables are zero', async () => {
  await assert.rejects(service({}, 'deliveries').getDashboardStats(), /Permission denied/);
  assert.equal((await service({}, 'shipment_status_history').getDashboardStats()).activeDelta, null);
  assert.equal((await service().getDashboardStats()).pendingDispatch, 0);
});
test('subscriptions refresh on reconnect and unsubscribe every channel', () => {
  const api = service(); let refreshed = 0;
  const cleanup = api.subscribeToDashboardChanges(() => refreshed++);
  assert.equal(refreshed, 1);
  assert.deepEqual(api.subscriptions.map(s => s.filter.table), ['shipments', 'deliveries', 'trucks', 'maintenance_records']);
  api.subscriptions[0].callback(); assert.equal(refreshed, 2);
  cleanup(); assert.equal(api.removed.length, 1);
});
test('KPI navigation uses valid routes and destination filters consume URL parameters', () => {
  const dashboard = fs.readFileSync(new URL('../pages/Dashboard/dashboard.jsx', import.meta.url), 'utf8');
  for (const url of ['/shipment?tab=active', '/shipment?tab=delayed', '/shipment?tab=dispatch', '/fleet?availability=dispatch-ready']) assert.ok(dashboard.includes(url));
  const shipment = fs.readFileSync(new URL('../viewmodels/ShipmentViewModel.js', import.meta.url), 'utf8');
  assert.ok(shipment.includes("params.get('tab')")); assert.ok(shipment.includes('ACTIVE_STATUSES.includes(s.rawStatus)'));
  const fleet = fs.readFileSync(new URL('../pages/Fleet/fleet.jsx', import.meta.url), 'utf8');
  assert.ok(fleet.includes("params.get('availability')")); assert.ok(fleet.includes('getDispatchReadyTruckIds'));
});
