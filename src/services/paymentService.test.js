import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs
  .readFileSync(new URL('./paymentService.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace(/^export /gm, '');

function setup(supabase = {}) {
  const context = vm.createContext({
    supabase,
    Error,
    Number,
    Math,
    Intl,
    Date,
    String,
    Boolean,
    console,
  });
  vm.runInContext(
    source +
      '\nthis.api={' +
      'PAYMENT_METHODS,PAYMENT_STATUS_LABELS,PAYMENT_STATUS_CLASSES,' +
      'formatPaymentMethod,formatPaymentStatus,formatPaymentCurrency,calculatePaymentTotals,' +
      'fetchShipmentPayments,recordShipmentPayment,reviewShipmentPayment' +
      '};',
    context
  );
  return context.api;
}

test('formatPaymentMethod and formatPaymentStatus map values accurately', () => {
  const api = setup();

  assert.equal(api.formatPaymentMethod('cash'), 'Cash');
  assert.equal(api.formatPaymentMethod('gcash'), 'GCash');
  assert.equal(api.formatPaymentMethod('unknown_val'), 'unknown val');

  assert.equal(api.formatPaymentStatus('pending'), 'Pending Review');
  assert.equal(api.formatPaymentStatus('verified'), 'Verified');
  assert.equal(api.formatPaymentStatus('rejected'), 'Rejected');
  assert.equal(api.formatPaymentStatus('refunded'), 'Refunded');
  assert.equal(api.formatPaymentStatus('custom_state'), 'custom state');
});

test('formatPaymentCurrency formats PHP values correctly', () => {
  const api = setup();

  assert.match(api.formatPaymentCurrency(5000), /5,000/);
  assert.equal(api.formatPaymentCurrency(null), 'Unavailable');
  assert.equal(api.formatPaymentCurrency(undefined), 'Unavailable');
  assert.equal(api.formatPaymentCurrency('invalid'), 'Unavailable');
});

test('calculatePaymentTotals accurately computes charges, verified, pending, and balance due', () => {
  const api = setup();

  const shipment = {
    quoted_amount: 10000,
    final_amount: 12000,
  };

  const payments = [
    { amount: 5000, status: 'verified' },
    { amount: 3000, status: 'verified' },
    { amount: 2000, status: 'pending' },
    { amount: 1500, status: 'rejected' },
  ];

  const totals = api.calculatePaymentTotals(shipment, payments);

  assert.equal(totals.totalCharged, 12000);
  assert.equal(totals.totalVerified, 8000);
  assert.equal(totals.totalPending, 2000);
  assert.equal(totals.totalRejected, 1500);
  assert.equal(totals.balanceDue, 4000);
  assert.equal(totals.isFullyPaid, false);

  // Fully paid scenario
  const fullyPaidTotals = api.calculatePaymentTotals(shipment, [
    { amount: 12000, status: 'verified' },
  ]);
  assert.equal(fullyPaidTotals.balanceDue, 0);
  assert.equal(fullyPaidTotals.isFullyPaid, true);

  // Fallback to quoted_amount when final_amount is not set
  const quotedOnlyShipment = { quoted_amount: 8500 };
  const quotedTotals = api.calculatePaymentTotals(quotedOnlyShipment, [
    { amount: 5000, status: 'verified' },
  ]);
  assert.equal(quotedTotals.totalCharged, 8500);
  assert.equal(quotedTotals.balanceDue, 3500);
});

test('fetchShipmentPayments retrieves and parses payment records', async () => {
  const fakePayments = [
    {
      id: 'pay-1',
      shipment_id: 'ship-1',
      amount: '3500.00',
      method: 'gcash',
      status: 'pending',
      created_user: { full_name: 'Ivhan Angeles', email: 'ivhan@example.com' },
    },
  ];

  const fakeSupabase = {
    from: (table) => {
      assert.equal(table, 'payments');
      return {
        select: () => ({
          eq: (field, val) => {
            assert.equal(field, 'shipment_id');
            assert.equal(val, 'ship-1');
            return {
              order: (orderField, { ascending }) => {
                assert.equal(orderField, 'created_at');
                assert.equal(ascending, false);
                return Promise.resolve({ data: fakePayments, error: null });
              },
            };
          },
        }),
      };
    },
  };

  const api = setup(fakeSupabase);
  const result = await api.fetchShipmentPayments('ship-1');

  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 3500);
  assert.equal(result[0].method, 'gcash');
});

test('fetchShipmentPayments falls back gracefully on relation error', async () => {
  let fallbackCalled = false;
  const fallbackPayments = [
    { id: 'pay-2', shipment_id: 'ship-2', amount: 4000, method: 'cash', status: 'verified' },
  ];

  const fakeSupabase = {
    from: () => ({
      select: (cols) => ({
        eq: () => ({
          order: () => {
            if (cols.includes('created_user')) {
              return Promise.resolve({ data: null, error: { code: 'PGRST200', message: 'Could not find a relationship' } });
            }
            fallbackCalled = true;
            return Promise.resolve({ data: fallbackPayments, error: null });
          },
        }),
      }),
    }),
  };

  const api = setup(fakeSupabase);
  const result = await api.fetchShipmentPayments('ship-2');

  assert.equal(fallbackCalled, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 4000);
});

test('recordShipmentPayment validates inputs and calls RPC', async () => {
  let rpcArgs = null;
  const fakeSupabase = {
    rpc: (name, args) => {
      assert.equal(name, 'office_record_payment');
      rpcArgs = args;
      return Promise.resolve({ data: { id: 'new-pay-id', ...args, status: 'pending' }, error: null });
    },
  };

  const api = setup(fakeSupabase);

  // Validation failures
  await assert.rejects(
    () => api.recordShipmentPayment({ shipmentId: null, amount: 100, method: 'cash' }),
    /Shipment ID is required/
  );
  await assert.rejects(
    () => api.recordShipmentPayment({ shipmentId: 's1', amount: 0, method: 'cash' }),
    /Enter a valid payment amount/
  );
  await assert.rejects(
    () => api.recordShipmentPayment({ shipmentId: 's1', amount: -50, method: 'cash' }),
    /Enter a valid payment amount/
  );
  await assert.rejects(
    () => api.recordShipmentPayment({ shipmentId: 's1', amount: 500, method: 'invalid_method' }),
    /Select a valid payment method/
  );

  // Successful call
  const recorded = await api.recordShipmentPayment({
    shipmentId: 'ship-123',
    amount: 1500.75,
    method: 'gcash',
    referenceNumber: '  GCASH-REF-001  ',
    notes: 'Paid via GCash app',
  });

  assert.equal(recorded.id, 'new-pay-id');
  assert.equal(rpcArgs.p_shipment_id, 'ship-123');
  assert.equal(rpcArgs.p_amount, 1500.75);
  assert.equal(rpcArgs.p_method, 'gcash');
  assert.equal(rpcArgs.p_reference, 'GCASH-REF-001');
  assert.equal(rpcArgs.p_notes, 'Paid via GCash app');
});

test('reviewShipmentPayment validates inputs, optimistic concurrency, and calls RPC', async () => {
  let rpcArgs = null;
  const fakeSupabase = {
    rpc: (name, args) => {
      assert.equal(name, 'office_review_payment');
      rpcArgs = args;
      return Promise.resolve({ data: { id: args.p_payment_id, status: args.p_action === 'verify' ? 'verified' : 'rejected' }, error: null });
    },
  };

  const api = setup(fakeSupabase);

  // Validation checks
  await assert.rejects(
    () => api.reviewShipmentPayment({ paymentId: null, expectedUpdatedAt: 'stamp', action: 'verify' }),
    /Payment ID is required/
  );
  await assert.rejects(
    () => api.reviewShipmentPayment({ paymentId: 'p1', expectedUpdatedAt: null, action: 'verify' }),
    /Missing expected payment update timestamp/
  );
  await assert.rejects(
    () => api.reviewShipmentPayment({ paymentId: 'p1', expectedUpdatedAt: 'stamp', action: 'delete' }),
    /Action must be either verify or reject/
  );
  await assert.rejects(
    () => api.reviewShipmentPayment({ paymentId: 'p1', expectedUpdatedAt: 'stamp', action: 'reject', reason: 'bad' }),
    /rejection reason of at least 5 characters/
  );

  // Verify happy path
  const verified = await api.reviewShipmentPayment({
    paymentId: 'p1',
    expectedUpdatedAt: '2026-11-09T10:00:00Z',
    action: 'verify',
  });
  assert.equal(verified.status, 'verified');
  assert.equal(rpcArgs.p_payment_id, 'p1');
  assert.equal(rpcArgs.p_expected, '2026-11-09T10:00:00Z');
  assert.equal(rpcArgs.p_action, 'verify');

  // Reject happy path
  const rejected = await api.reviewShipmentPayment({
    paymentId: 'p1',
    expectedUpdatedAt: '2026-11-09T10:00:00Z',
    action: 'reject',
    reason: 'Incorrect deposit slip provided',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rpcArgs.p_action, 'reject');
  assert.equal(rpcArgs.p_reason, 'Incorrect deposit slip provided');

  // Concurrency conflict error handling
  const conflictSupabase = {
    rpc: () => Promise.resolve({ data: null, error: { code: '40001', message: 'PAYMENT_CHANGED_RELOAD' } }),
  };
  const conflictApi = setup(conflictSupabase);
  await assert.rejects(
    () => conflictApi.reviewShipmentPayment({ paymentId: 'p1', expectedUpdatedAt: 'stamp', action: 'verify' }),
    (err) => {
      assert.equal(err.concurrencyConflict, true);
      assert.match(err.message, /modified by another user/);
      return true;
    }
  );
});

