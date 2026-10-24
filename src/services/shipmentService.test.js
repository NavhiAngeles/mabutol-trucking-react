import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
