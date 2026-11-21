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
        assert.equal(columns.includes('route_geometry'), false);
        assert.equal(
          columns,
          'id,tracking_number,customer_id,billing_customer_id,status,booking_source,cargo_category_id,cargo_description,weight_kg,special_handling,requested_vehicle_type_id,pickup_address,dropoff_address,distance_km,scheduled_departure,estimated_arrival,actual_delivery_at,quoted_amount,override_amount,override_reason,final_amount,driver_notes,cancelled_reason,cancelled_at,created_at,updated_at,customer:customers!customer_id(name)'
        );
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
  const body = source.split('const stats = useMemo(() => {')[1].split('}, [shipments, weeklyTrips, clock]);')[0];
  const scope = vm.createContext({ shipments: ['ON TIME', 'LATE', 'UNKNOWN'].map(deliveryStatus => ({ status: 'completed', deliveryStatus, actualAt: new Date() })),
    isToday: () => true, formatDuration: () => '', reviewAgeLabel: () => 'Unavailable', weeklyTrips: 0, clock: 0 });
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

test('review mapping preserves missing timestamps as unknown instead of inventing the current time', () => {
  const api = service();
  assert.equal(api.mapShipmentRow({ id: 'missing', status: 'under_review' }).flaggedAt, null);
  const timestamp = '2026-11-05T04:00:00Z';
  assert.equal(api.mapShipmentRow({ id: 'known', status: 'under_review', updated_at: timestamp }).flaggedAt.getTime(), Date.parse(timestamp));
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

test('createShipment gracefully recovers from schema cache missing column error', async () => {
  let attempt = 0;
  const insertedPayloads = [];
  const context = { console, supabase: {
    from(table) {
      const q = {
        insert(payload) {
          insertedPayloads.push({ ...payload });
          return q;
        },
        select() { return q; }, eq() { return q; }, neq() { return q; },
        async single() {
          attempt++;
          if (attempt === 1) {
            return {
              data: null,
              error: { message: "Could not find the 'driver_allowance' column of 'shipments' in the schema cache", code: "PGRST204" }
            };
          }
          return { data: { id: 's-fallback', status: 'booked' }, error: null };
        },
        async maybeSingle() { return { data: null, error: null }; }
      };
      assert.ok(['shipments', 'deliveries'].includes(table));
      return q;
    }
  }};
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api = {createShipment};', context);
  const result = await context.api.createShipment({
    pickup_address: 'A',
    dropoff_address: 'B',
    driver_allowance: 500,
    toll_fees: 100
  });
  assert.equal(result.id, 's-fallback');
  assert.equal(attempt, 2);
  assert.equal(insertedPayloads[0].driver_allowance, 500);
  assert.equal('driver_allowance' in insertedPayloads[1], false);
  assert.equal(insertedPayloads[1].toll_fees, 100);
});

test('createShipment strips generated final_amount upfront and recovers from generated-column insert errors', async () => {
  let attempt = 0;
  const insertedPayloads = [];
  const context = { console, supabase: {
    from(table) {
      const q = {
        insert(payload) {
          insertedPayloads.push({ ...payload });
          return q;
        },
        select() { return q; }, eq() { return q; }, neq() { return q; },
        async single() {
          attempt++;
          if (attempt === 1) {
            return {
              data: null,
              error: { message: 'cannot insert a non-DEFAULT value into column "computed_col"', code: '428C9' }
            };
          }
          return { data: { id: 's-gen', status: 'booked', final_amount: 2500 }, error: null };
        },
        async maybeSingle() { return { data: null, error: null }; }
      };
      assert.ok(['shipments', 'deliveries'].includes(table));
      return q;
    }
  }};
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api = {createShipment};', context);
  const result = await context.api.createShipment({
    pickup_address: 'A',
    dropoff_address: 'B',
    quoted_amount: 2500,
    override_amount: null,
    final_amount: 2500,
    computed_col: 123,
  });
  assert.equal(result.id, 's-gen');
  assert.equal(result.final_amount, 2500);
  assert.equal(attempt, 2);
  assert.equal('final_amount' in insertedPayloads[0], false);
  assert.equal(insertedPayloads[0].computed_col, 123);
  assert.equal('computed_col' in insertedPayloads[1], false);
});

test('fetchShipments marks active shipments with pending driver payments for review and subscribes to payments', async () => {
  const shipments = [
    { id: 'shp-pay', status: 'loading', created_at: '2026-11-05T04:00:00Z', updated_at: '2026-11-05T04:10:00Z' },
    { id: 'shp-clean', status: 'loading', created_at: '2026-11-05T03:00:00Z', updated_at: '2026-11-05T03:10:00Z' },
  ];
  const deliveries = [
    { id: 'del-1', shipment_id: 'shp-pay', status: 'loading', driver: { full_name: 'Driver One' }, truck: { plate_number: 'TRK-01' } },
    { id: 'del-2', shipment_id: 'shp-clean', status: 'loading', driver: { full_name: 'Driver Two' }, truck: { plate_number: 'TRK-02' } },
  ];
  const pendingPayments = [
    { id: 'pay-1', shipment_id: 'shp-pay', amount: 12000, method: 'gcash', status: 'pending', proof_path: 'del-1/payment-1.jpg', created_at: '2026-11-05T04:30:00Z', updated_at: '2026-11-05T04:30:00Z' },
  ];
  const subscribedTables = [];
  let cleared = 0;

  const context = vm.createContext({
    console: { log() {}, error() {} },
    pendingDeparture: () => false,
    clearOperationalCache: () => { cleared++; },
    async fetchOperationalRows(table) {
      return table === 'shipments' ? shipments : deliveries;
    },
    supabase: {
      from(table) {
        assert.equal(table, 'payments');
        return {
          select() { return this; },
          eq() { return this; },
          not() { return this; },
          async order() { return { data: pendingPayments, error: null }; },
        };
      },
      channel() {
        const ch = {
          on(_ev, filter, cb) { subscribedTables.push({ table: filter.table, cb }); return ch; },
          subscribe() { return ch; },
        };
        return ch;
      },
      removeChannel() {},
    },
  });
  const source = fs.readFileSync(new URL('./shipmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api = { fetchShipments, mapShipmentRow, subscribeToShipments };', context);

  const rows = await context.api.fetchShipments();
  assert.equal(rows[0].dbId, 'shp-pay');
  assert.equal(rows[0].pendingPaymentReview, true);
  assert.equal(rows[0].pendingPaymentAmount, 12000);
  assert.equal(rows[0].etaNote, 'Payment verification required');
  assert.equal(rows[0].etaNoteClass, 'text-warning-amber');
  assert.equal(rows[0].flaggedAt.getTime(), Date.parse('2026-11-05T04:30:00Z'));

  assert.equal(rows[1].dbId, 'shp-clean');
  assert.equal(rows[1].pendingPaymentReview, false);
  assert.equal(rows[1].etaNote, 'Awaiting Dispatch');

  // Pending payment on completed/cancelled shipment should not flag active review
  const completedWithPayment = context.api.mapShipmentRow({
    id: 'shp-done',
    status: 'completed',
    pendingPayment: pendingPayments[0],
  });
  assert.equal(completedWithPayment.pendingPaymentReview, false);

  let refreshed = 0;
  const unsub = context.api.subscribeToShipments(() => { refreshed++; });
  assert.deepEqual(subscribedTables.map(s => s.table), ['shipments', 'deliveries', 'payments']);
  subscribedTables[2].cb();
  assert.equal(cleared, 1);
  assert.equal(refreshed, 1);
  unsub();
});


