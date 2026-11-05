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
