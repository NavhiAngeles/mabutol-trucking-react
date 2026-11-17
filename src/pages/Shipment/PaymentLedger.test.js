import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

function textContent(node) {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textContent).join(' ');
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate)),
  ];
}

const tick = () => new Promise(resolve => setImmediate(resolve));

async function mount({
  shipment = { id: 'ship-1', tracking_number: 'TRK-1001', quoted_amount: 10000, final_amount: 10000, status: 'booked' },
  paymentsList = [],
  onChanged = () => {},
  fetchPaymentsMock = null,
  recordPaymentMock = null,
  reviewPaymentMock = null,
} = {}) {
  const { code } = await transformWithOxc(
    fs.readFileSync(new URL('./PaymentLedger.jsx', import.meta.url), 'utf8'),
    'PaymentLedger.jsx',
    { jsx: { runtime: 'classic' } }
  );

  const states = [];
  const refs = [];
  const effects = [];
  let index = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let pending = [];
  let idCounter = 0;

  const mockFetchPayments = fetchPaymentsMock || (async () => paymentsList);
  const mockRecordPayment = recordPaymentMock || (async () => ({ id: 'new-pay', status: 'pending' }));
  const mockReviewPayment = reviewPaymentMock || (async () => ({ id: 'reviewed-pay', status: 'verified' }));

  const context = vm.createContext({
    React: {
      createElement: (type, props, ...children) => {
        if (props?.ref) props.ref.current = { focus() {} };
        return { type, props: props || {}, children };
      },
    },
    document: { activeElement: null },
    useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === 'function' ? value(states[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = refIndex++;
      return (refs[i] ||= { current: initial });
    },
    useId() {
      return `id-${++idCounter}`;
    },
    useEffect(effect, deps) {
      const i = effectIndex++;
      const old = effects[i];
      if (!old || (deps && deps.some((d, j) => old.deps[j] !== d))) {
        pending.push(() => {
          old?.cleanup?.();
          effects[i] = { deps, cleanup: effect() };
        });
      }
    },
    PAYMENT_METHODS: [
      { value: 'cash', label: 'Cash' },
      { value: 'gcash', label: 'GCash' },
    ],
    PAYMENT_STATUS_CLASSES: {
      pending: 'review-pill',
      verified: 'transit-pill',
      rejected: 'delayed-pill',
      refunded: 'delayed-pill',
    },
    formatPaymentCurrency: (amt) => (amt == null ? 'Unavailable' : `₱${Number(amt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`),
    formatPaymentMethod: (m) => ({ gcash: 'GCash', cash: 'Cash' })[m] || m,
    formatPaymentStatus: (s) => ({ pending: 'Pending Review', verified: 'Verified', rejected: 'Rejected' })[s] || s,
    calculatePaymentTotals: (s, pList = []) => {
      const totalCharged = Number(s?.final_amount ?? s?.quoted_amount ?? 0) || 0;
      let totalVerified = 0;
      let totalPending = 0;
      let totalRejected = 0;
      for (const p of pList) {
        const a = Number(p.amount) || 0;
        if (p.status === 'verified') totalVerified += a;
        else if (p.status === 'pending') totalPending += a;
        else if (p.status === 'rejected') totalRejected += a;
      }
      return {
        totalCharged,
        totalVerified,
        totalPending,
        totalRejected,
        balanceDue: Math.max(0, totalCharged - totalVerified),
        isFullyPaid: totalCharged > 0 && totalVerified >= totalCharged,
      };
    },
    fetchShipmentPayments: mockFetchPayments,
    recordShipmentPayment: mockRecordPayment,
    reviewShipmentPayment: mockReviewPayment,
    Intl,
    Date,
    Number,
  });

  vm.runInContext(
    code.replace(/^import .*;$/gm, '').replace('export default function', 'function') +
      '\nthis.render = PaymentLedger;',
    context
  );

  const render = () => {
    index = 0;
    refIndex = 0;
    effectIndex = 0;
    pending = [];
    const tree = context.render({ shipment, onChanged });
    pending.forEach((run) => run());
    return tree;
  };

  return { render, states, refs, context };
}

test('PaymentLedger renders empty state and KPI totals correctly', async () => {
  const ui = await mount({ paymentsList: [] });
  // Initial render (triggers fetch)
  ui.render();
  await tick();
  const tree = ui.render();

  const text = JSON.stringify(tree);
  assert.ok(text.includes('Payment Ledger & Verification'));
  assert.ok(text.includes('No payments recorded for this shipment yet'));
  assert.ok(text.includes('₱10,000.00')); // Total Charge
  assert.ok(text.includes('₱0.00')); // Total Verified
});

test('PaymentLedger renders payments table with verification actions for pending records', async () => {
  const paymentsList = [
    {
      id: 'p-1',
      shipment_id: 'ship-1',
      amount: 6000,
      method: 'cash',
      status: 'pending',
      reference_number: 'OR-112233',
      notes: 'Initial installment',
      created_at: '2026-11-09T08:00:00Z',
      updated_at: '2026-11-09T08:00:00Z',
      created_user: { full_name: 'Ivhan Angeles' },
    },
    {
      id: 'p-2',
      shipment_id: 'ship-1',
      amount: 4000,
      method: 'gcash',
      status: 'verified',
      reference_number: 'GC-9988',
      notes: 'Prior payment',
      created_at: '2026-11-08T08:00:00Z',
      updated_at: '2026-11-08T08:00:00Z',
      created_user: { full_name: 'Admin Pro' },
      verified_user: { full_name: 'Ivhan Angeles' },
    },
  ];

  const ui = await mount({ paymentsList });
  ui.render();
  await tick();
  const tree = ui.render();

  const text = JSON.stringify(tree);
  assert.ok(text.includes('OR-112233'));
  assert.ok(text.includes('GC-9988'));
  assert.ok(text.includes('Pending Review'));
  assert.ok(text.includes('Verified'));

  // Pending payment has Verify and Reject action buttons
  const buttons = find(tree, (n) => n.type === 'button');
  const verifyBtn = buttons.find((b) => textContent(b).includes('Verify'));
  const rejectBtn = buttons.find((b) => textContent(b).includes('Reject'));
  assert.ok(verifyBtn, 'Verify button must be rendered for pending payment');
  assert.ok(rejectBtn, 'Reject button must be rendered for pending payment');
});

test('PaymentLedger handles verify payment confirmation flow', async () => {
  let reviewed = null;
  const payment = {
    id: 'p-verify',
    shipment_id: 'ship-1',
    amount: 5000,
    method: 'gcash',
    status: 'pending',
    updated_at: '2026-11-09T09:00:00Z',
  };

  const ui = await mount({
    paymentsList: [payment],
    reviewPaymentMock: async (args) => {
      reviewed = args;
      return { id: payment.id, status: 'verified' };
    },
  });

  ui.render();
  await tick();
  let tree = ui.render();

  // Click Verify button to open verification modal
  const verifyBtn = find(tree, (n) => n.type === 'button' && textContent(n).includes('Verify'))[0];
  verifyBtn.props.onClick();

  tree = ui.render();
  const verifyModal = find(tree, (n) => n.props['aria-labelledby'] === 'verify-payment-title')[0];
  assert.ok(verifyModal, 'Verification dialog must open');

  // Confirm verification
  const confirmBtn = find(verifyModal, (n) => n.type === 'button' && textContent(n).includes('Confirm Verification'))[0];
  await confirmBtn.props.onClick();

  assert.equal(reviewed.paymentId, 'p-verify');
  assert.equal(reviewed.action, 'verify');
  assert.equal(reviewed.expectedUpdatedAt, '2026-11-09T09:00:00Z');
});

test('PaymentLedger handles reject payment flow with reason validation', async () => {
  let rejected = null;
  const payment = {
    id: 'p-reject',
    shipment_id: 'ship-1',
    amount: 3000,
    method: 'cash',
    status: 'pending',
    updated_at: '2026-11-09T09:00:00Z',
  };

  const ui = await mount({
    paymentsList: [payment],
    reviewPaymentMock: async (args) => {
      rejected = args;
      return { id: payment.id, status: 'rejected' };
    },
  });

  ui.render();
  await tick();
  let tree = ui.render();

  // Click Reject button
  const rejectBtn = find(tree, (n) => n.type === 'button' && textContent(n).includes('Reject'))[0];
  rejectBtn.props.onClick();

  tree = ui.render();
  const rejectModal = find(tree, (n) => n.props['aria-labelledby'] === 'reject-payment-title')[0];
  assert.ok(rejectModal, 'Rejection dialog must open');

  const reasonInput = find(rejectModal, (n) => n.type === 'textarea')[0];
  reasonInput.props.onChange({ target: { value: 'Payment not found on bank record' } });

  tree = ui.render();
  const form = find(tree, (n) => n.type === 'form')[0];
  await form.props.onSubmit({ preventDefault() {} });

  assert.equal(rejected.paymentId, 'p-reject');
  assert.equal(rejected.action, 'reject');
  assert.equal(rejected.reason, 'Payment not found on bank record');
});

test('PaymentLedger displays concurrency conflict notice when record changed remotely', async () => {
  const payment = {
    id: 'p-conflict',
    shipment_id: 'ship-1',
    amount: 2000,
    method: 'gcash',
    status: 'pending',
    updated_at: '2026-11-09T09:00:00Z',
  };

  const ui = await mount({
    paymentsList: [payment],
    reviewPaymentMock: async () => {
      const err = new Error('This payment record was modified by another user. Reloading latest ledger details.');
      err.concurrencyConflict = true;
      throw err;
    },
  });

  ui.render();
  await tick();
  let tree = ui.render();

  const verifyBtn = find(tree, (n) => n.type === 'button' && textContent(n).includes('Verify'))[0];
  verifyBtn.props.onClick();

  tree = ui.render();
  const confirmBtn = find(tree, (n) => n.type === 'button' && textContent(n).includes('Confirm Verification'))[0];
  await confirmBtn.props.onClick();

  tree = ui.render();
  const text = JSON.stringify(tree);
  assert.ok(text.includes('modified by another user'));
});

test('Cancelled shipment disables Record Payment button', async () => {
  const ui = await mount({
    shipment: { id: 'ship-cancelled', status: 'cancelled', quoted_amount: 5000 },
    paymentsList: [],
  });

  ui.render();
  await tick();
  const tree = ui.render();

  const recordBtn = find(tree, (n) => n.type === 'button' && textContent(n).includes('Record Payment'))[0];
  assert.ok(recordBtn, 'Record Payment button should exist');
  assert.equal(recordBtn.props.disabled, true, 'Record payment button must be disabled for cancelled shipments');
});
