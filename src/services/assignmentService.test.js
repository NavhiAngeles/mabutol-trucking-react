import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./assignmentService.js', import.meta.url), 'utf8')
  .split('async function read')[0].replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const scope = vm.createContext({ Intl, Date, Number, Map });
vm.runInContext(source + '\nthis.buildAssignmentOptions=buildAssignmentOptions;', scope);
const { buildAssignmentOptions } = scope;

const today = '2026-11-05';
const docs = (owner, field, types) => types.map((doc_type, index) => ({ id: String(index), [field]: owner, doc_type,
  review_status: 'approved', expiry_date: '2027-01-01', created_at: '2026-01-01' }));
const fixture = () => ({
  shipment: { id: 's', status: 'booked', booking_source: 'web', requested_vehicle_type_id: 'van', weight_kg: 1000 },
  deliveries: [], users: [], maintenance: [],
  drivers: [{ id: 'd', full_name: 'Driver', status: 'available' }],
  trucks: [{ id: 't', plate_number: 'TEST-1', status: 'available', vehicle_type_id: 'van', capacity_kg: 1000, assigned_driver_id: null }],
  documents: [...docs('d', 'driver_id', ['drivers_license','medical_certificate','nbi_clearance']),
    ...docs('t', 'truck_id', ['lto_registration','franchise_permit','emission_test'])],
});

test('eligible manual pair requires exact capacity, type, availability and current compliance', () => {
  const data = fixture(); let result = buildAssignmentOptions(data, today);
  assert.equal(result.drivers[0].eligible, true); assert.equal(result.trucks[0].eligible, true); assert.equal(result.blockedReason, null);
  data.trucks[0].capacity_kg = 999; result = buildAssignmentOptions(data, today); assert.match(result.trucks[0].reason, /capacity/i);
  data.trucks[0].capacity_kg = 1000; data.documents.find(row => row.doc_type === 'emission_test').expiry_date = '2026-11-04';
  result = buildAssignmentOptions(data, today); assert.match(result.trucks[0].reason, /compliance/i);
});

test('reservations, maintenance, mobile identity and missing documents fail closed', () => {
  const data = fixture(); data.deliveries.push({ id: 'other', shipment_id: 'other', status: 'assigned', driver_id: 'd' });
  assert.match(buildAssignmentOptions(data, today).drivers[0].reason, /Reserved/);
  data.deliveries = []; data.maintenance.push({ truck_id: 't', status: 'in_progress' });
  assert.match(buildAssignmentOptions(data, today).trucks[0].reason, /maintenance/);
  data.maintenance = []; data.shipment.booking_source = 'mobile';
  assert.match(buildAssignmentOptions(data, today).drivers[0].reason, /account/);
  data.shipment.booking_source = 'web'; data.documents = [];
  const result = buildAssignmentOptions(data, today); assert.equal(result.drivers[0].eligible, false); assert.equal(result.trucks[0].eligible, false);
});

test('only unstarted assigned deliveries permit reassignment', () => {
  const data = fixture();
  data.deliveries = [{ id: 'current', shipment_id: 's', status: 'assigned', driver_id: 'old', truck_id: 'old-truck' }];
  data.shipment.status = 'assigned'; assert.equal(buildAssignmentOptions(data, today).blockedReason, null);
  for (const patch of [{ status: 'loading' }, { route_started_at: '2026-11-05' }, { pickup_arrived_at: '2026-11-05' }]) {
    Object.assign(data.deliveries[0], { status: 'assigned', route_started_at: null, pickup_arrived_at: null }, patch);
    assert.match(buildAssignmentOptions(data, today).blockedReason, /cannot be reassigned/);
  }
});

test('manual save sends the expected delivery version and rejects unconfirmed responses', async () => {
  const calls = [];
  const context = vm.createContext({ Intl, Date, Number, Map, supabase: {
    async rpc(name, args) { calls.push({ name, args }); return { data: { shipment_id: 's', delivery_id: 'new', status: 'assigned', mode: 'reassigned' } }; },
  } });
  const whole = fs.readFileSync(new URL('./assignmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(whole + '\nthis.save=saveManualAssignment;', context);
  const result = await context.save({ shipmentId: 's', driverId: 'd', truckId: 't', reason: '  Operational change  ', expectedDelivery: 'old' });
  assert.equal(result.mode, 'reassigned');
  assert.equal(calls[0].name, 'office_assign_shipment_resources');
  assert.equal(calls[0].args.p_reason, 'Operational change');
  assert.equal(calls[0].args.p_expected_delivery, 'old');
  context.supabase.rpc = async () => ({ data: { shipment_id: 'wrong' } });
  await assert.rejects(context.save({ shipmentId: 's', driverId: 'd', truckId: 't', reason: 'Valid reason' }), /not confirmed/);
});

test('manual save falls back to table mutations when office_assign_shipment_resources is missing in schema cache', async () => {
  const tableOps = [];
  const fakeDeliveries = {
    update(patch) {
      tableOps.push({ op: 'update_deliveries', patch });
      return { eq: (col, val) => { tableOps.push({ op: 'eq', col, val }); return Promise.resolve({ error: null }); } };
    },
    insert(payload) {
      tableOps.push({ op: 'insert_deliveries', payload });
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'fallback-delivery-123', shipment_id: payload.shipment_id, status: 'assigned' }, error: null }),
        }),
      };
    },
  };
  const fakeShipments = {
    update(patch) {
      tableOps.push({ op: 'update_shipments', patch });
      return { eq: (col, val) => { tableOps.push({ op: 'eq_shipments', col, val }); return Promise.resolve({ error: null }); } };
    },
  };
  const fakeEvents = {
    insert(payload) {
      tableOps.push({ op: 'insert_events', payload });
      return Promise.resolve({ error: null });
    },
  };

  const context = vm.createContext({
    Intl, Date, Number, Map, console,
    supabase: {
      async rpc() {
        return {
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.office_assign_shipment_resources(p_driver, p_expected_delivery, p_reason, p_shipment, p_truck) in the schema cache',
          },
        };
      },
      from(tableName) {
        if (tableName === 'deliveries') return fakeDeliveries;
        if (tableName === 'shipments') return fakeShipments;
        if (tableName === 'shipment_events') return fakeEvents;
        throw new Error(`Unexpected table ${tableName}`);
      },
      auth: {
        async getUser() {
          return { data: { user: { id: 'admin-user-id' } } };
        },
      },
    },
  });

  const whole = fs.readFileSync(new URL('./assignmentService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(whole + '\nthis.save=saveManualAssignment;', context);

  const result = await context.save({
    shipmentId: 'ship-123',
    driverId: 'driver-456',
    truckId: 'truck-789',
    reason: 'Driver assignment adjusted for route',
    expectedDelivery: 'old-del-999',
  });

  assert.equal(result.shipment_id, 'ship-123');
  assert.equal(result.delivery_id, 'fallback-delivery-123');
  assert.equal(result.status, 'assigned');
  assert.equal(result.mode, 'reassigned');

  // Verify previous delivery cancelled
  const updateDel = tableOps.find(op => op.op === 'update_deliveries');
  assert.equal(updateDel.patch.status, 'cancelled');

  // Verify new delivery inserted with assigned_by
  const insertDel = tableOps.find(op => op.op === 'insert_deliveries');
  assert.equal(insertDel.payload.shipment_id, 'ship-123');
  assert.equal(insertDel.payload.driver_id, 'driver-456');
  assert.equal(insertDel.payload.truck_id, 'truck-789');
  assert.equal(insertDel.payload.assigned_by, 'admin-user-id');

  // Verify shipment status updated to assigned
  const updateShip = tableOps.find(op => op.op === 'update_shipments');
  assert.equal(updateShip.patch.status, 'assigned');
});
