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
      'fetchShipmentPayments,recordShipmentPayment,reviewShipmentPayment,getPaymentReceiptUrl,subscribeToShipmentPayments' +
      '};',
    context
  );
  return context.api;
}

test('formatPaymentMethod and formatPaymentStatus map values accurately', () => {
  const api = setup();

  assert.equal(api.formatPaymentMethod('cash'), 'Cash');
  assert.equal(api.formatPaymentMethod('gcash'), 'GCash');
  assert.equal(api.formatPaymentMethod('bank_transfer'), 'Bank Transfer');
  assert.equal(api.formatPaymentMethod('check'), 'Check');
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

test('getPaymentReceiptUrl resolves signed URL via mobile_delivery_evidence_file and guards unsafe paths', async () => {
  const calls = [];
  const fakeSupabase = {
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return { data: 'del-1/payment-req-1.jpg', error: null };
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, ttl) => {
          calls.push(['sign', bucket, path, ttl]);
          return { data: { signedUrl: 'https://example.test/signed-receipt.jpg' }, error: null };
        },
      }),
    },
  };

  const api = setup(fakeSupabase);
  const url = await api.getPaymentReceiptUrl('ship-1', 'pay-1', null, fakeSupabase);
  assert.equal(url, 'https://example.test/signed-receipt.jpg');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['rpc', 'mobile_delivery_evidence_file', { p_shipment: 'ship-1', p_kind: 'payment', p_record: 'pay-1' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), ['sign', 'delivery-documents', 'del-1/payment-req-1.jpg', 300]);

  const unsafeSupabase = {
    rpc: async () => ({ data: '../secret.jpg', error: null }),
    storage: fakeSupabase.storage,
  };
  await assert.rejects(() => api.getPaymentReceiptUrl('ship-1', 'pay-1', null, unsafeSupabase), /not found/);

  const fallbackSupabase = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'missing function' } }),
    storage: fakeSupabase.storage,
  };
  const fallbackUrl = await api.getPaymentReceiptUrl('ship-1', 'pay-1', 'del-1/payment-fallback.jpg', fallbackSupabase);
  assert.equal(fallbackUrl, 'https://example.test/signed-receipt.jpg');

  // Pre-D06 mobile_delivery_evidence_file returns 42501 RECORDED_FILE_NOT_FOUND for p_kind='payment'
  const legacyRpcCalls = [];
  const legacyRpcSupabase = {
    rpc: async () => ({ data: null, error: { code: '42501', message: 'RECORDED_FILE_NOT_FOUND' } }),
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, ttl) => {
          legacyRpcCalls.push([bucket, path, ttl]);
          return { data: { signedUrl: 'https://example.test/legacy-fallback.jpg' }, error: null };
        },
      }),
    },
  };
  const legacyFallbackUrl = await api.getPaymentReceiptUrl(
    'ship-1',
    'pay-1',
    'del-1/payment-legacy.jpg',
    legacyRpcSupabase
  );
  assert.equal(legacyFallbackUrl, 'https://example.test/legacy-fallback.jpg');
  assert.deepEqual(JSON.parse(JSON.stringify(legacyRpcCalls)), [
    ['delivery-documents', 'del-1/payment-legacy.jpg', 300],
  ]);

  // Unsafe fallback path or missing fallback must still reject
  await assert.rejects(
    () => api.getPaymentReceiptUrl('ship-1', 'pay-1', '../escape.jpg', legacyRpcSupabase),
    { code: '42501', message: 'RECORDED_FILE_NOT_FOUND' }
  );
  await assert.rejects(
    () => api.getPaymentReceiptUrl('ship-1', 'pay-1', null, legacyRpcSupabase),
    { code: '42501', message: 'RECORDED_FILE_NOT_FOUND' }
  );

  // Explicit role authorization failures must never bypass via fallbackProofPath
  const unauthorizedSupabase = {
    rpc: async () => ({ data: null, error: { code: '42501', message: 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' } }),
    storage: fakeSupabase.storage,
  };
  await assert.rejects(
    () => api.getPaymentReceiptUrl('ship-1', 'pay-1', 'del-1/payment-legacy.jpg', unauthorizedSupabase),
    { code: '42501', message: 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' }
  );
});

test('subscribeToShipmentPayments subscribes to public.payments filtered by shipment_id and cleans up', () => {
  let registered = null;
  let removed = null;
  const fakeChannel = {
    on(eventType, filter, cb) {
      registered = { eventType, filter, cb };
      return fakeChannel;
    },
    subscribe() {
      return fakeChannel;
    },
  };
  const fakeSupabase = {
    channel: () => fakeChannel,
    removeChannel: (ch) => { removed = ch; },
  };

  const api = setup(fakeSupabase);
  let called = 0;
  const unsub = api.subscribeToShipmentPayments('ship-99', () => { called++; }, fakeSupabase);
  assert.equal(registered.eventType, 'postgres_changes');
  assert.equal(registered.filter.table, 'payments');
  assert.equal(registered.filter.filter, 'shipment_id=eq.ship-99');
  registered.cb();
  assert.equal(called, 1);
  unsub();
  assert.equal(removed, fakeChannel);
});

