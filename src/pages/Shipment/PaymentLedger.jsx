import { useEffect, useRef, useState, useId } from 'react';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUS_CLASSES,
  formatPaymentCurrency,
  formatPaymentMethod,
  formatPaymentStatus,
  calculatePaymentTotals,
  fetchShipmentPayments,
  recordShipmentPayment,
  reviewShipmentPayment,
} from '../../services/paymentService';

const timestamp = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
};

const getTodayManila = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

export default function PaymentLedger({ shipment, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [concurrencyNotice, setConcurrencyNotice] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [rejectingPayment, setRejectingPayment] = useState(null);
  const [verifyingPayment, setVerifyingPayment] = useState(null);

  // Form states for recording payment
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('cash');
  const [formReference, setFormReference] = useState('');
  const [formDate, setFormDate] = useState(getTodayManila());
  const [formNotes, setFormNotes] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Form state for rejecting payment
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Form state for verifying payment
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const shipmentId = shipment?.id;
  const isCancelled = shipment?.status === 'cancelled';

  const recordModalRef = useRef(null);
  const rejectModalRef = useRef(null);
  const verifyModalRef = useRef(null);
  const recordTriggerRef = useRef(null);
  const reqSeq = useRef(0);

  const amountInputId = useId();
  const methodSelectId = useId();
  const referenceInputId = useId();
  const dateInputId = useId();
  const notesInputId = useId();
  const rejectReasonId = useId();

  const loadPayments = async ({ silent = false } = {}) => {
    if (!shipmentId) return;
    const req = ++reqSeq.current;
    if (!silent) setLoading(true);
    try {
      const data = await fetchShipmentPayments(shipmentId);
      if (req !== reqSeq.current) return;
      setPayments(data);
      setError('');
    } catch (err) {
      if (req !== reqSeq.current) return;
      setError(err.message || 'Could not load shipment payments.');
    } finally {
      if (req === reqSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!shipmentId) return;
    let active = true;
    const seq = reqSeq;
    const req = ++seq.current;
    fetchShipmentPayments(shipmentId)
      .then((data) => {
        if (!active || req !== seq.current) return;
        setPayments(data);
        setError('');
      })
      .catch((err) => {
        if (!active || req !== seq.current) return;
        setError(err.message || 'Could not load shipment payments.');
      })
      .finally(() => {
        if (active && req === seq.current) setLoading(false);
      });
    return () => {
      active = false;
      seq.current++;
    };
  }, [shipmentId]);

  const totals = calculatePaymentTotals(shipment, payments);

  const openRecordModal = () => {
    setFormAmount('');
    setFormMethod('cash');
    setFormReference('');
    setFormDate(getTodayManila());
    setFormNotes('');
    setFormError('');
    setFormBusy(false);
    setShowRecordModal(true);
  };

  const closeRecordModal = () => {
    if (formBusy) return;
    setShowRecordModal(false);
    setFormError('');
    recordTriggerRef.current?.focus();
  };

  const submitRecordPayment = async (e) => {
    e.preventDefault();
    const num = Number(formAmount);
    if (!Number.isFinite(num) || num <= 0) {
      setFormError('Please enter a payment amount greater than zero.');
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      await recordShipmentPayment({
        shipmentId,
        amount: num,
        method: formMethod,
        referenceNumber: formReference,
        paidAt: formDate ? new Date(formDate).toISOString() : new Date().toISOString(),
        notes: formNotes,
      });
      setShowRecordModal(false);
      await loadPayments({ silent: true });
      if (typeof onChanged === 'function') onChanged({ preserve: true });
    } catch (err) {
      setFormError(err.message || 'Failed to record payment.');
    } finally {
      setFormBusy(false);
    }
  };

  const openVerifyModal = (payment) => {
    setVerifyingPayment(payment);
    setVerifyError('');
    setVerifyBusy(false);
  };

  const closeVerifyModal = () => {
    if (verifyBusy) return;
    setVerifyingPayment(null);
    setVerifyError('');
  };

  const confirmVerifyPayment = async () => {
    if (!verifyingPayment) return;
    setVerifyBusy(true);
    setVerifyError('');
    setConcurrencyNotice('');
    try {
      await reviewShipmentPayment({
        paymentId: verifyingPayment.id,
        expectedUpdatedAt: verifyingPayment.updated_at,
        action: 'verify',
      });
      setVerifyingPayment(null);
      await loadPayments({ silent: true });
      if (typeof onChanged === 'function') onChanged({ preserve: true });
    } catch (err) {
      if (err.concurrencyConflict) {
        setConcurrencyNotice(err.message);
        setVerifyingPayment(null);
        await loadPayments({ silent: true });
      } else {
        setVerifyError(err.message || 'Verification failed.');
      }
    } finally {
      setVerifyBusy(false);
    }
  };

  const openRejectModal = (payment) => {
    setRejectingPayment(payment);
    setRejectReason('');
    setRejectError('');
    setRejectBusy(false);
  };

  const closeRejectModal = () => {
    if (rejectBusy) return;
    setRejectingPayment(null);
    setRejectError('');
  };

  const confirmRejectPayment = async (e) => {
    e.preventDefault();
    if (!rejectingPayment) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 5) {
      setRejectError('Enter an audit rejection reason of at least 5 characters.');
      return;
    }
    setRejectBusy(true);
    setRejectError('');
    setConcurrencyNotice('');
    try {
      await reviewShipmentPayment({
        paymentId: rejectingPayment.id,
        expectedUpdatedAt: rejectingPayment.updated_at,
        action: 'reject',
        reason: trimmed,
      });
      setRejectingPayment(null);
      await loadPayments({ silent: true });
      if (typeof onChanged === 'function') onChanged({ preserve: true });
    } catch (err) {
      if (err.concurrencyConflict) {
        setConcurrencyNotice(err.message);
        setRejectingPayment(null);
        await loadPayments({ silent: true });
      } else {
        setRejectError(err.message || 'Rejection failed.');
      }
    } finally {
      setRejectBusy(false);
    }
  };

  // Focus trap / ESC handling for modals
  const handleModalKeyDown = (e, closeFn, modalRef) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFn();
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(
      modalRef.current.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusable.length) {
      e.preventDefault();
      modalRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modalRef.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !modalRef.current.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="payment-ledger-section">
      <div className="payment-ledger-header">
        <div className="payment-ledger-title-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <h4>Payment Ledger &amp; Verification</h4>
          {totals.isFullyPaid && (
            <span className="status transit-pill">● FULLY PAID</span>
          )}
        </div>
        <div className="payment-ledger-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadPayments()}
            disabled={loading}
            aria-label="Refresh payment ledger"
          >
            <i className={`las la-sync ${loading ? 'la-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            ref={recordTriggerRef}
            className="btn-primary"
            onClick={openRecordModal}
            disabled={isCancelled || loading}
            title={isCancelled ? 'Cannot record payments on cancelled shipments' : 'Record a new payment'}
          >
            <i className="las la-plus" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {concurrencyNotice && (
        <div role="status" className="payment-ledger-concurrency-alert">
          <i className="las la-info-circle" />
          <span>{concurrencyNotice}</span>
          <button
            type="button"
            className="payment-alert-dismiss"
            onClick={() => setConcurrencyNotice('')}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="shipment-details-error-msg">
          <i className="las la-exclamation-circle" />
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => loadPayments()}>
            Retry
          </button>
        </div>
      )}

      {/* Financial Summary KPI Cards */}
      <div className="payment-summary-grid">
        <div className="payment-summary-card">
          <span className="payment-summary-label">Total Charge</span>
          <span className="payment-summary-val">{formatPaymentCurrency(totals.totalCharged)}</span>
        </div>
        <div className="payment-summary-card">
          <span className="payment-summary-label">Total Verified</span>
          <span className="payment-summary-val payment-verified-val">
            {formatPaymentCurrency(totals.totalVerified)}
          </span>
        </div>
        <div className="payment-summary-card">
          <span className="payment-summary-label">Pending Verification</span>
          <span className="payment-summary-val payment-pending-val">
            {formatPaymentCurrency(totals.totalPending)}
          </span>
        </div>
        <div className="payment-summary-card">
          <span className="payment-summary-label">Balance Due</span>
          <span
            className={`payment-summary-val ${
              totals.balanceDue > 0 ? 'payment-due-val' : 'payment-settled-val'
            }`}
          >
            {formatPaymentCurrency(totals.balanceDue)}
          </span>
        </div>
      </div>

      {/* Payments Table */}
      <div className="payment-table-container">
        {payments.length === 0 ? (
          <div className="payment-table-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <p>No payments recorded for this shipment yet.</p>
            {!isCancelled && (
              <button
                type="button"
                className="btn-primary"
                onClick={openRecordModal}
              >
                <i className="las la-plus" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        ) : (
          <table className="payment-ledger-table">
            <thead>
              <tr>
                <th scope="col" className="payment-col-date">Date / Paid At</th>
                <th scope="col" className="payment-col-method">Method</th>
                <th scope="col" className="payment-col-ref">Reference #</th>
                <th scope="col" className="payment-col-amount">Amount</th>
                <th scope="col" className="payment-col-status">Status</th>
                <th scope="col" className="payment-col-notes">Audit / Notes</th>
                <th scope="col" className="payment-col-actions text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const isPending = p.status === 'pending';
                const creator = p.created_user?.full_name || p.created_user?.email || 'Office Staff';
                const verifier = p.verified_user?.full_name || p.verified_user?.email;

                return (
                  <tr key={p.id}>
                    <td>
                      <div className="payment-cell-date">{timestamp(p.paid_at || p.created_at)}</div>
                      <div className="payment-cell-meta">Created: {timestamp(p.created_at)}</div>
                    </td>
                    <td>
                      <span className="payment-method-badge">{formatPaymentMethod(p.method)}</span>
                    </td>
                    <td>
                      <span className="payment-ref-code">{p.reference_number || '—'}</span>
                    </td>
                    <td>
                      <span className="payment-amount-val">{formatPaymentCurrency(p.amount)}</span>
                    </td>
                    <td>
                      <span className={`status ${PAYMENT_STATUS_CLASSES[p.status] || 'loading-pill'}`}>
                        ● {formatPaymentStatus(p.status)}
                      </span>
                    </td>
                    <td>
                      <div className="payment-cell-notes">
                        {p.notes ? <span className="payment-notes-text">{p.notes}</span> : <span className="payment-notes-empty">No notes</span>}
                        <div className="payment-cell-meta">
                          By: {creator}
                          {verifier && ` · Verified: ${verifier}`}
                        </div>
                      </div>
                    </td>
                    <td className="text-right">
                      {isPending ? (
                        <div className="payment-actions-group">
                          <button
                            type="button"
                            className="btn-verify"
                            onClick={() => openVerifyModal(p)}
                            title="Verify and confirm this payment"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="btn-reject"
                            onClick={() => openRejectModal(p)}
                            title="Reject pending payment with reason"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="payment-action-settled">
                          {p.status === 'verified' ? 'Verified' : 'Processed'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL 1: RECORD PAYMENT */}
      {showRecordModal && (
        <div className="booking-review-backdrop" onClick={closeRecordModal}>
          <div
            className="booking-review-dialog payment-modal-dialog"
            ref={recordModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleModalKeyDown(e, closeRecordModal, recordModalRef)}
          >
            <div className="shipment-details-header">
              <div className="shipment-details-header-main">
                <h3 id="record-payment-title">Record Shipment Payment</h3>
                <p className="shipment-details-subtitle">
                  Record a customer settlement for Shipment {shipment?.tracking_number || shipment?.id}.
                </p>
              </div>
              <button
                type="button"
                className="shipment-details-close-x"
                aria-label="Close record payment modal"
                onClick={closeRecordModal}
                disabled={formBusy}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div role="alert" className="shipment-details-error-msg">
                <i className="las la-exclamation-circle" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={submitRecordPayment} className="payment-form">
              <div className="payment-form-grid">
                <div className="payment-form-field">
                  <label htmlFor={amountInputId}>Payment Amount (PHP) *</label>
                  <input
                    id={amountInputId}
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    disabled={formBusy}
                    autoFocus
                  />
                </div>

                <div className="payment-form-field">
                  <label htmlFor={methodSelectId}>Payment Method *</label>
                  <select
                    id={methodSelectId}
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    disabled={formBusy}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="payment-form-field">
                  <label htmlFor={referenceInputId}>
                    {formMethod === 'gcash' ? 'GCash Reference Number *' : 'Receipt / Reference # (Optional)'}
                  </label>
                  <input
                    id={referenceInputId}
                    type="text"
                    required={formMethod === 'gcash'}
                    placeholder={formMethod === 'gcash' ? 'e.g. 1002 9876 5432' : 'e.g. OR-887766 or Cash voucher #'}
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="payment-form-field">
                  <label htmlFor={dateInputId}>Payment Date (PHT) *</label>
                  <input
                    id={dateInputId}
                    type="date"
                    max={getTodayManila()}
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="payment-form-field payment-form-field-full">
                  <label htmlFor={notesInputId}>Payment Notes / Remarks (Optional)</label>
                  <textarea
                    id={notesInputId}
                    rows="2"
                    placeholder="e.g. Deposit slip verified via bank portal, 50% initial downpayment."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              <div className="booking-review-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeRecordModal}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formBusy}>
                  {formBusy ? (
                    <>
                      <i className="las la-spinner la-spin" /> Recording…
                    </>
                  ) : (
                    'Save Payment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VERIFY PAYMENT CONFIRMATION */}
      {verifyingPayment && (
        <div className="booking-review-backdrop" onClick={closeVerifyModal}>
          <div
            className="booking-review-dialog payment-modal-dialog payment-confirm-dialog"
            ref={verifyModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-payment-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleModalKeyDown(e, closeVerifyModal, verifyModalRef)}
          >
            <div className="shipment-details-header">
              <div className="shipment-details-header-main">
                <h3 id="verify-payment-title">Verify Payment Settlement</h3>
                <p className="shipment-details-subtitle">
                  Confirm receipt of {formatPaymentCurrency(verifyingPayment.amount)} via{' '}
                  {formatPaymentMethod(verifyingPayment.method)}.
                </p>
              </div>
              <button
                type="button"
                className="shipment-details-close-x"
                aria-label="Close verify modal"
                onClick={closeVerifyModal}
                disabled={verifyBusy}
              >
                ✕
              </button>
            </div>

            {verifyError && (
              <div role="alert" className="shipment-details-error-msg">
                <i className="las la-exclamation-circle" />
                <span>{verifyError}</span>
              </div>
            )}

            <div className="payment-verify-body">
              <p>
                You are verifying the payment of{' '}
                <strong>{formatPaymentCurrency(verifyingPayment.amount)}</strong>
                {verifyingPayment.reference_number && (
                  <> (Ref: <code>{verifyingPayment.reference_number}</code>)</>
                )}
                . This will update the verified balance and mark the transaction as verified in the ledger.
              </p>
            </div>

            <div className="booking-review-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeVerifyModal}
                disabled={verifyBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmVerifyPayment}
                disabled={verifyBusy}
                autoFocus
              >
                {verifyBusy ? (
                  <>
                    <i className="las la-spinner la-spin" /> Verifying…
                  </>
                ) : (
                  'Confirm Verification'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REJECT PAYMENT DIALOG */}
      {rejectingPayment && (
        <div className="booking-review-backdrop" onClick={closeRejectModal}>
          <div
            className="booking-review-dialog payment-modal-dialog payment-confirm-dialog"
            ref={rejectModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-payment-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleModalKeyDown(e, closeRejectModal, rejectModalRef)}
          >
            <div className="shipment-details-header">
              <div className="shipment-details-header-main">
                <h3 id="reject-payment-title">Reject Pending Payment</h3>
                <p className="shipment-details-subtitle">
                  Reject {formatPaymentCurrency(rejectingPayment.amount)} (Ref:{' '}
                  {rejectingPayment.reference_number || 'None'}).
                </p>
              </div>
              <button
                type="button"
                className="shipment-details-close-x"
                aria-label="Close reject modal"
                onClick={closeRejectModal}
                disabled={rejectBusy}
              >
                ✕
              </button>
            </div>

            {rejectError && (
              <div role="alert" className="shipment-details-error-msg">
                <i className="las la-exclamation-circle" />
                <span>{rejectError}</span>
              </div>
            )}

            <form onSubmit={confirmRejectPayment} className="payment-form">
              <div className="payment-form-field">
                <label htmlFor={rejectReasonId}>
                  Audit Rejection Reason * <span className="payment-form-hint">(minimum 5 characters)</span>
                </label>
                <textarea
                  id={rejectReasonId}
                  rows="3"
                  required
                  placeholder="e.g. Deposit slip does not appear in bank statement; amount mismatch."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={rejectBusy}
                  autoFocus
                />
              </div>

              <div className="booking-review-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeRejectModal}
                  disabled={rejectBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={rejectBusy || rejectReason.trim().length < 5}
                >
                  {rejectBusy ? (
                    <>
                      <i className="las la-spinner la-spin" /> Rejecting…
                    </>
                  ) : (
                    'Confirm Rejection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

