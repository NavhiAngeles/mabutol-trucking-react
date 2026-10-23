import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
