import { useEffect, useRef, useState } from "react";
import {
  formatManilaDateTime,
  formatStandingError,
  reviewCustomerAppeal,
} from "../../services/customerStandingService";

const CloseIcon = () => (
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
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function AppealReviewDialog({
  appeal,
  customer,
  mode = "approve",
  strikeHistory = [],
  onClose,
  onReviewed,
}) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isApprove = mode === "approve";
  const strikeCount = Math.max(
    strikeHistory.length,
    Number(customer?.no_show_strike_count ?? 0) || 0
  );
  const title = isApprove
    ? "Approve Appeal & Reinstate Customer"
    : "Reject Suspension Appeal";

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialogRef.current?.showModal();
    return () => {
      alive.current = false;
      previous?.focus?.();
    };
  }, []);

  function close() {
    if (!locked.current) onClose?.();
  }

  const trimmedNotes = adminNotes.trim();
  const isFormValid = isApprove || trimmedNotes.length >= 5;

  async function submit(event) {
    event.preventDefault();
    if (locked.current || !appeal?.id) return;
    if (!isApprove && trimmedNotes.length < 5) {
      setError("Please enter admin notes of at least 5 characters when rejecting an appeal.");
      return;
    }

    locked.current = true;
    setSubmitting(true);
    setError("");
    try {
      const decision = isApprove ? "approved" : "rejected";
      const result = await reviewCustomerAppeal({
        appealId: appeal.id,
        decision,
        adminNotes: trimmedNotes,
      });
      if (alive.current) {
        onReviewed?.({ appeal, decision, result });
      }
    } catch (err) {
      if (alive.current) {
        setError(formatStandingError(err));
      }
    } finally {
      locked.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="customer-status-dialog customer-appeal-dialog"
      aria-labelledby="appeal-review-title"
      aria-describedby="appeal-review-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <form onSubmit={submit} aria-busy={submitting}>
        <div className="cp-modal-header">
          <h2 id="appeal-review-title" className="cp-modal-title">{title}</h2>
          <button
            type="button"
            className="cp-close-btn"
            aria-label={`Close ${title.toLowerCase()}`}
            disabled={submitting}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="customer-status-body">
          <p id="appeal-review-description">
            {isApprove
              ? `Reinstating ${customer?.name || "this customer"} restores booking access while retaining existing strike history.`
              : `Rejecting this appeal keeps ${customer?.name || "this customer"} permanently suspended from creating mobile bookings.`}
          </p>

          <div className="customer-status-summary appeal-review-summary">
            <div>
              <strong>Customer:</strong> {customer?.name || "Unnamed customer"}
              {customer?.customer_code ? ` (${customer.customer_code})` : ""}
            </div>
            <div className="tabular-nums">
              <strong>Strikes on record:</strong> {strikeCount} (cumulative)
            </div>
            <div className="tabular-nums">
              <strong>Suspended since:</strong> {formatManilaDateTime(customer?.suspended_at)}
            </div>
            <div>
              <strong>Submitted:</strong>{" "}
              <span className="tabular-nums">{formatManilaDateTime(appeal?.created_at)}</span>
            </div>
            {appeal?.contact_number && (
              <div className="tabular-nums">
                <strong>Appeal contact:</strong> {appeal.contact_number}
              </div>
            )}
          </div>

          <div className="appeal-review-quote">
            <span className="appeal-review-quote-label">Customer Appeal Statement</span>
            <p>{appeal?.reason || "No reason text provided."}</p>
          </div>

          <div className={`appeal-policy-callout ${isApprove ? "is-reinstate" : "is-reject"}`}>
            {isApprove
              ? `Approving restores mobile booking access (standing becomes Reinstated), clears cooldown, and keeps all ${strikeCount} existing no-show strikes intact. A 4th confirmed no-show will trigger suspension again.`
              : "Customer booking access remains blocked. The customer will see your review decision and notes in Tanaw Mobile."}
          </div>

          <label htmlFor="appeal-admin-notes" className="customer-status-reason-label">
            {isApprove ? "Admin review notes (optional)" : "Rejection reason & admin notes *"}
            <textarea
              id="appeal-admin-notes"
              name="admin_notes"
              rows={3}
              required={!isApprove}
              autoFocus={isApprove}
              disabled={submitting}
              placeholder={
                isApprove
                  ? "Optional note recorded on the appeal audit trail..."
                  : "Explain why this suspension appeal is rejected (at least 5 characters)..."
              }
              value={adminNotes}
              onChange={(e) => {
                setAdminNotes(e.target.value);
                if (error) setError("");
              }}
            />
          </label>

          {error && (
            <p className="customer-status-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="customer-status-footer">
          <button
            type="button"
            className="filter-btn"
            autoFocus={!isApprove}
            disabled={submitting}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={isApprove ? "btn-status-confirm" : "btn-status-danger"}
            disabled={submitting || !isFormValid}
          >
            {submitting
              ? isApprove
                ? "Approving..."
                : "Rejecting..."
              : isApprove
                ? "Approve & Reinstate"
                : "Confirm Reject"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
