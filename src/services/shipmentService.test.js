import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('shipment list retrieves linked customer names for display and search without losing assignments or orphan rows', async () => {
  const shipments = [
    { id: 'linked', customer_id: 'customer-1', customer: { name: 'Sample Trading' }, created_at: '2026-11-05' },
    { id: 'deleted', customer_id: null, customer: null, created_at: '2026-11-04' },
    { id: 'unavailable', customer_id: 'customer-2', customer: null, created_at: '2026-11-03' },
  ];
  const deliveries = [
    { id: 'cancelled', shipment_id: 'linked', status: 'cancelled', driver: { full_name: 'Previous Driver' } },
    { id: 'active', shipment_id: 'linked', status: 'assigned', driver: { full_name: 'Current Driver' }, truck: { plate_number: 'TEST-01' } },
  ];
  const calls = [];
  const context = vm.createContext({ console: { log() {}, error() {} },
    pendingDeparture: row => row.id === 'linked',
    async fetchOperationalRows(table, columns) {
      calls.push(table);
      if (table === 'shipments') {
        assert.equal(columns, '*,customer:customers!customer_id(name)');
        return shipments;
      }
      assert.equal(table, 'deliveries');
      assert.equal(columns, 'id,shipment_id,truck_id,driver_id,status,departed_at,driver:drivers(full_name),truck:trucks(plate_number)');
      return deliveries;
    },
  });
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.fetchList = fetchShipments;', context);
  const rows = await context.fetchList();
  assert.deepEqual(calls.sort(), ['deliveries', 'shipments']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].customer, 'Sample Trading');
  assert.equal(rows[0].customerInitials, 'ST');
  assert.equal(rows[0].assignmentId, 'active');
  assert.equal(rows[0].driver, 'Current Driver');
  assert.equal(rows[0].fleet, 'TEST-01');
  assert.equal(rows[0].pendingDispatch, true);
  for (const row of rows.slice(1)) {
    assert.equal(row.customer, '—');
    assert.equal(row.driver, 'Unassigned');
    assert.equal(row.assignmentId, null);
  }

  // Execute the existing viewmodel search against the fetched/mapped rows.
  const viewmodel = fs.readFileSync(new URL('../viewmodels/ShipmentViewModel.js', import.meta.url), 'utf8');
  const search = viewmodel.split('const matchesSearch = ')[1].split('export function useShipmentViewModel')[0];
  const matchesSearch = vm.runInNewContext('(' + search.trim().replace(/;$/, '') + ')');
  assert.equal(rows.filter(row => matchesSearch(row, 'sample trad')).length, 1);
  assert.equal(rows.filter(row => matchesSearch(row, 'missing customer')).length, 0);
});

test('customer mapping tolerates absent relationships and preserves legacy customer names', () => {
  const api = service();
  for (const customer of [undefined, null, {}]) {
    assert.equal(api.mapShipmentRow({ customer_id: 'unavailable', customer }).customer, '—');
    assert.equal(api.mapShipmentRow({ customer_name: 'Legacy Customer', customer }).customer, 'Legacy Customer');
  }
});

test('completed timing is unknown for missing or invalid timestamps, preserving known outcomes', () => {
  const api = service();
  const base = { id: 's', status: 'completed', estimated_arrival: '2026-11-05T04:00:00Z', actual_delivery_at: '2026-11-05T04:00:00Z' };
  assert.equal(api.mapShipmentRow(base).deliveryStatus, 'ON TIME');
  assert.equal(api.mapShipmentRow({ ...base, actual_delivery_at: '2026-11-05T04:01:00Z' }).deliveryStatus, 'LATE');
  for (const field of ['actual_delivery_at', 'estimated_arrival']) {
    for (const value of [null, '', 'invalid']) assert.equal(api.mapShipmentRow({ ...base, [field]: value }).deliveryStatus, 'UNKNOWN');
  }
});

test('completed-day metrics exclude unknown timing from on-time denominator and late count', () => {
  const source = fs.readFileSync(new URL('../viewmodels/ShipmentViewModel.js', import.meta.url), 'utf8');
  const body = source.split('const stats = useMemo(() => {')[1].split('}, [shipments, weeklyTrips]);')[0];
  const scope = vm.createContext({ shipments: ['ON TIME', 'LATE', 'UNKNOWN'].map(deliveryStatus => ({ status: 'completed', deliveryStatus, actualAt: new Date() })),
    isToday: () => true, formatDuration: () => '', weeklyTrips: 0 });
  const compute = () => vm.runInContext('(function(){'+body+'})()', scope);
  assert.equal(compute().completedToday, 3); assert.equal(compute().onTimePct, 50); assert.equal(compute().lateToday, 1);
  scope.shipments = [scope.shipments[2]];
  assert.equal(compute().onTimePct, null); assert.equal(compute().lateToday, 0);
});

test('weekly count distinguishes confirmed zero from query errors, rejection and missing counts, then recovers', async () => {
  const results = [{ count: 0 }, { error: Error('Denied') }, Error('Offline'), { count: null }, {}, { count: 7 }];
  const context = vm.createContext({ console: { error() {} }, supabase: {
    from(table) {
      assert.equal(table, 'shipments');
      return {
        select(column, options) { assert.equal(column, 'id'); assert.equal(options.count, 'exact'); assert.equal(options.head, true); return this; },
        async gte(column, since) {
          assert.equal(column, 'created_at'); assert.ok(Number.isFinite(Date.parse(since)));
          const result = results.shift();
          if (result instanceof Error) throw result;
          return result;
        },
      };
    },
  } });
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.fetchCount = fetchWeeklyTripCount;', context);
  for (const expected of [0, null, null, null, null, 7]) assert.equal(await context.fetchCount(), expected);
});

function service({ insertError, lookupError, assignment = null, throws = false, rpcData = null, rpcError = null } = {}) {
  let inserts = 0;
  const context = { console, supabase: {
    async rpc(name, args) {
      assert.equal(name, 'assign_shipment_resources');
      assert.equal(args.p_shipment, 's');
      return { data: rpcData, error: rpcError };
    },
    from(table) {
      const q = {
        insert() { inserts++; return q; }, select() { return q; }, eq() { return q; }, neq() { return q; },
        async single() { return { data: { id: 's', status: 'booked' }, error: insertError }; },
        async maybeSingle() { if (throws) throw Error('offline'); return { data: assignment, error: lookupError }; },
      };
      assert.ok(['shipments', 'deliveries'].includes(table));
      return q;
    },
  } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api = {createShipment, mapShipmentRow, assignShipmentResources};', context);
  return { ...context.api, inserts: () => inserts };
}

test('creation returns assigned driver/truck and mapper displays them', async () => {
  const assignment = { driver: { full_name: 'Test Driver' }, truck: { plate_number: 'TEST-01' } };
  const api = service({ assignment });
  const created = await api.createShipment({});
  assert.equal(created.assignment, assignment);
  const row = api.mapShipmentRow(created);
  assert.equal(row.driver, 'Test Driver');
  assert.equal(row.fleet, 'TEST-01');
  assert.equal(api.inserts(), 1);
});

test('no availability is a successful booked shipment', async () => {
  const api = service();
  const created = await api.createShipment({});
  assert.equal(created.status, 'booked');
  assert.equal(api.mapShipmentRow(created).driver, 'Unassigned');
});

test('shipment mapping exposes stored instructions on assigned, in-transit and completed deliveries', () => {
  const api = service();
  for (const status of ['pending', 'booked', 'assigned', 'in_transit', 'completed']) {
    const row = api.mapShipmentRow({ id: 's', status, driver_notes: 'Call first.\nUse rear gate.' });
    assert.equal(row.driverNotes, 'Call first.\nUse rear gate.');
  }
  for (const driver_notes of [null, undefined, '']) assert.equal(api.mapShipmentRow({ id: 's', driver_notes }).driverNotes, '');
});

test('lookup failure after insert preserves success instead of inviting duplicate submission', async () => {
  for (const options of [{ lookupError: Error('denied') }, { throws: true }]) {
    const api = service(options);
    const created = await api.createShipment({});
    assert.equal(created.id, 's');
    assert.equal(created.assignmentLookupFailed, true);
    assert.equal(api.inserts(), 1);
  }
});

test('insert failure rejects', async () => {
  await assert.rejects(service({ insertError: Error('insert failed') }).createShipment({}), /insert failed/);
});

test('assignment retry returns delivery or no availability and propagates failure', async () => {
  assert.equal(await service({ rpcData: 'delivery' }).assignShipmentResources('s'), 'delivery');
  assert.equal(await service().assignShipmentResources('s'), null);
  await assert.rejects(service({ rpcError: Error('access denied') }).assignShipmentResources('s'), /access denied/);
});
