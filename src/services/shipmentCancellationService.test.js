import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./shipmentCancellationService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function setup(supabase = {}) {
  const context = vm.createContext({ supabase, Error });
  vm.runInContext(source + '\nthis.api={cancellationPolicy,fetchShipmentForCancellation,cancelShipment};', context);
  return context.api;
}
const booked = { id: 's', status: 'booked', updated_at: 'version', deliveries: [] };

test('cancellation permits pending/mobile requests and booked records without deliveries, plus only unstarted assignments', () => {
  const { cancellationPolicy: policy } = setup();
  for (const status of ['pending', 'booked']) assert.equal(policy({ status, booking_source: 'mobile', deliveries: [{ status: 'cancelled' }] }).allowed, true);
  assert.equal(policy({ status: 'assigned', deliveries: [{ id: 'd', status: 'assigned' }] }).allowed, true);
  for (const key of ['departed_at', 'route_started_at', 'pickup_arrived_at', 'customer_showed_at', 'grace_ends_at', 'auto_cancel_at']) {
    assert.equal(policy({ status: 'assigned', deliveries: [{ status: 'assigned', [key]: 'now' }] }).allowed, false, key);
  }
  for (const status of ['loading', 'in_transit', 'delayed', 'review', 'completed', 'cancelled', 'unknown']) assert.equal(policy({ status }).allowed, false);
  for (const deliveries of [[], [{ status: 'loading' }], [{ status: 'assigned' }, { status: 'assigned' }]]) assert.equal(policy({ status: 'assigned', deliveries }).allowed, false);
  assert.equal(policy({ ...booked, deliveries: [{ status: 'assigned' }] }).allowed, false);
});

test('cancellation requires a valid reason, explicit financial acknowledgement and confirmed RPC response', async () => {
  const calls = [];
  let response = { data: { id: 's', status: 'cancelled', updated_at: 'new', cancelled_at: 'now' } };
  const { cancelShipment } = setup({ rpc: async (...args) => { calls.push(args); return response; } });
  for (const reason of ['', 'abcd', 'x'.repeat(1001)]) await assert.rejects(cancelShipment(booked, reason, true), /reason/);
  await assert.rejects(cancelShipment(booked, 'Customer requested', false), /Acknowledge/);
  await assert.rejects(cancelShipment({ ...booked, status: 'completed' }, 'Customer requested', true), /Reload/);
  assert.equal(calls.length, 0);
  await cancelShipment(booked, '  Customer requested  ', true);
  assert.equal(calls[0][0], 'office_cancel_shipment');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { p_shipment: 's', p_expected: 'version', p_expected_delivery: null, p_reason: 'Customer requested', p_financial_ack: true });
  await cancelShipment({ ...booked, status: 'assigned', deliveries: [{ id: 'd', status: 'assigned' }] }, 'Change of plans', true);
  assert.equal(calls[1][1].p_expected_delivery, 'd');
  for (const data of [null, { id: 'other', status: 'cancelled' }, { id: 's', status: 'booked' }, { id: 's', status: 'cancelled' }]) {
    response = { data }; await assert.rejects(cancelShipment(booked, 'Change of plans', true), /not confirmed/);
  }
  response = { error: Error('Shipment changed') };
  await assert.rejects(cancelShipment(booked, 'Change of plans', true), /Shipment changed/);
});

test('snapshot reads current lifecycle and exact payment count, and fails closed on any read failure', async () => {
  const replies = { shipments: { data: booked }, deliveries: { data: [] }, payments: { count: 4 } };
  const calls = [];
  const api = setup({ from(table) {
    const chain = { select(...args) { calls.push([table, ...args]); return chain; }, eq() { return chain; }, neq() { return chain; }, single() { return chain; }, then(resolve) { return Promise.resolve(replies[table]).then(resolve); } };
    return chain;
  } });
  assert.equal((await api.fetchShipmentForCancellation('s')).paymentCount, 4);
  assert.equal(calls.find(row => row[0] === 'payments')[2].count, 'exact');
  for (const table of ['shipments', 'deliveries', 'payments']) {
    const prior = replies[table]; replies[table] = { error: Error(`${table} denied`) };
    await assert.rejects(api.fetchShipmentForCancellation('s'), /denied/); replies[table] = prior;
  }
  replies.payments = { count: null }; await assert.rejects(api.fetchShipmentForCancellation('s'), /Payment information unavailable/);
});
