import { supabase } from './supabaseClient';

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
];

export const PAYMENT_STATUS_LABELS = {
  pending: 'Pending Review',
  verified: 'Verified',
  rejected: 'Rejected',
  refunded: 'Refunded',
};

export const PAYMENT_STATUS_CLASSES = {
  pending: 'review-pill',
  verified: 'transit-pill',
  rejected: 'delayed-pill',
  refunded: 'delayed-pill',
};

export function formatPaymentMethod(method) {
  const match = PAYMENT_METHODS.find(m => m.value === method);
  if (match) return match.label;
  return String(method || 'Unavailable').replaceAll('_', ' ');
}

export function formatPaymentStatus(status) {
  return PAYMENT_STATUS_LABELS[status] || String(status || 'Unavailable').replaceAll('_', ' ');
}

export function formatPaymentCurrency(amount) {
  if (amount == null || amount === '') return 'Unavailable';
  const num = Number(amount);
  if (!Number.isFinite(num)) return 'Unavailable';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

export function calculatePaymentTotals(shipment, payments = []) {
  const totalCharged = Number(shipment?.final_amount ?? shipment?.quoted_amount ?? 0) || 0;
  let totalVerified = 0;
  let totalPending = 0;
  let totalRejected = 0;

  for (const p of payments) {
    const amount = Number(p?.amount) || 0;
    if (p?.status === 'verified') {
      totalVerified += amount;
    } else if (p?.status === 'pending') {
      totalPending += amount;
    } else if (p?.status === 'rejected') {
      totalRejected += amount;
    }
  }

  const balanceDue = Math.max(0, totalCharged - totalVerified);
  const isFullyPaid = totalCharged > 0 && totalVerified >= totalCharged;

  return {
    totalCharged,
    totalVerified,
    totalPending,
    totalRejected,
    balanceDue,
    isFullyPaid,
  };
}

export async function fetchShipmentPayments(shipmentId) {
  if (!shipmentId) throw new Error('Shipment ID is required to fetch payments.');

  let { data, error } = await supabase
    .from('payments')
    .select(`
      id,
      shipment_id,
      amount,
      method,
      status,
      reference_number,
      paid_at,
      proof_path,
      notes,
      created_by,
      verified_by,
      verified_at,
      created_at,
      updated_at,
      created_user:users!created_by(id, full_name, email),
      verified_user:users!verified_by(id, full_name, email)
    `)
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false });

  if (error && (error.code === 'PGRST200' || error.code === '42703' || String(error.message || '').includes('relationship'))) {
    const fallback = await supabase
      .from('payments')
      .select('id, shipment_id, amount, method, status, reference_number, paid_at, proof_path, notes, created_by, verified_by, verified_at, created_at, updated_at')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false });

    if (fallback.error) throw fallback.error;
    data = fallback.data;
  } else if (error) {
    throw error;
  }

  return (data || []).map(row => ({
    ...row,
    amount: Number(row.amount) || 0,
  }));
}

export async function recordShipmentPayment({
  shipmentId,
  amount,
  method,
  referenceNumber,
  paidAt,
  notes,
}) {
  if (!shipmentId) throw new Error('Shipment ID is required.');

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Enter a valid payment amount greater than zero.');
  }

  if (!method || !PAYMENT_METHODS.some(m => m.value === method)) {
    throw new Error('Select a valid payment method.');
  }

  const trimmedRef = referenceNumber ? String(referenceNumber).trim() : null;
  const trimmedNotes = notes ? String(notes).trim() : null;

  const paidDateIso = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString();

  const { data, error } = await supabase.rpc('office_record_payment', {
    p_shipment_id: shipmentId,
    p_amount: Math.round(numericAmount * 100) / 100,
    p_method: method,
    p_reference: trimmedRef || null,
    p_paid_at: paidDateIso,
    p_notes: trimmedNotes || null,
  });

  if (error) {
    if (error.code === '42501' || String(error.message).includes('ACTIVE_OFFICE_REQUIRED')) {
      throw new Error('Active office permissions required to record payments.');
    }
    throw error;
  }

  return data;
}

export async function reviewShipmentPayment({
  paymentId,
  expectedUpdatedAt,
  action,
  reason,
}) {
  if (!paymentId) throw new Error('Payment ID is required.');
  if (!expectedUpdatedAt) {
    throw new Error('Missing expected payment update timestamp. Reload payments before reviewing.');
  }

  const normalizedAction = String(action || '').toLowerCase().trim();
  if (!['verify', 'reject'].includes(normalizedAction)) {
    throw new Error('Action must be either verify or reject.');
  }

  const trimmedReason = reason ? String(reason).trim() : '';
  if (normalizedAction === 'reject' && trimmedReason.length < 5) {
    throw new Error('Please provide an audit rejection reason of at least 5 characters.');
  }

  const { data, error } = await supabase.rpc('office_review_payment', {
    p_payment_id: paymentId,
    p_expected: expectedUpdatedAt,
    p_action: normalizedAction,
    p_reason: normalizedAction === 'reject' ? trimmedReason : null,
  });

  if (error) {
    if (error.code === '40001' || String(error.message).includes('PAYMENT_CHANGED_RELOAD')) {
      const err = new Error('This payment record was modified by another user. Reloading latest ledger details.');
      err.concurrencyConflict = true;
      throw err;
    }
    if (error.code === '42501' || String(error.message).includes('ACTIVE_OFFICE_REQUIRED')) {
      throw new Error('Active office permissions required to review payments.');
    }
    throw error;
  }

  return data;
}
