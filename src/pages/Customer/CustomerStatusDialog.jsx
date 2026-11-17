import { useEffect, useRef, useState } from "react";
import { setCustomerActiveStatus } from "../../services/customerService";

export default function CustomerStatusDialog({ customer, callerRole, onClose, onConfirmed }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isActive = customer?.is_active === true;
  const targetActive = !isActive;
  const actionLabel = isActive ? "Suspend Account" : "Reactivate Account";
  const title = isActive ? "Suspend Customer Account" : "Reactivate Customer Account";

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.showModal();
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  function close() {
    if (!locked.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Please provide a reason of at least 3 characters.");
      return;
    }
    locked.current = true;
    setSubmitting(true);
    setError("");
    try {
      const updated = await setCustomerActiveStatus(customer, targetActive, trimmed, { callerRole });
      if (alive.current) onConfirmed(updated);
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      locked.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  const isFormValid = reason.trim().length >= 3;

  return (
    <dialog
      ref={dialogRef}
      className="customer-status-dialog"
      aria-labelledby="customer-status-title"
      aria-describedby="customer-status-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={submitting}>
        <div className="cp-modal-header">
          <h2 id="customer-status-title" className="cp-modal-title">{title}</h2>
          <button
            type="button"
            className="cp-close-btn"
            aria-label={`Close ${title.toLowerCase()}`}
            disabled={submitting}
            onClick={close}
          >
            ✕
          </button>
        </div>

        <div className="customer-status-body">
          <p id="customer-status-description">
            {isActive
              ? `Are you sure you want to suspend ${customer?.name || "this customer"}? The customer will no longer be able to sign in or create bookings. All historical shipments and invoices remain preserved.`
              : `Are you sure you want to reactivate ${customer?.name || "this customer"}? The customer will regain access to sign in and create bookings. All historical shipments and invoices remain preserved.`}
          </p>

          <div className="customer-status-summary">
            <div><strong>Customer:</strong> {customer?.name || "Unnamed customer"}</div>
            {customer?.customer_code && <div><strong>Customer ID:</strong> {customer.customer_code}</div>}
            <div>
              <strong>Current Status:</strong>{" "}
              <span className={`status-badge ${isActive ? "active" : "suspended"}`}>
                {isActive ? "ACTIVE" : "SUSPENDED"}
              </span>
            </div>
          </div>

          <label htmlFor="customer-status-reason" className="customer-status-reason-label">
            Reason for {isActive ? "suspension" : "reactivation"} *
            <textarea
              id="customer-status-reason"
              name="reason"
              rows={3}
              required
              autoFocus
              disabled={submitting}
              placeholder={`Enter reason for ${isActive ? "suspending" : "reactivating"} this account (required)...`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
            />
          </label>

          {error && <p className="customer-status-error" role="alert">{error}</p>}
        </div>

        <div className="customer-status-footer">
          <button type="button" className="filter-btn" disabled={submitting} onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className={isActive ? "btn-status-danger" : "btn-status-confirm"}
            disabled={submitting || !isFormValid}
          >
            {submitting ? (isActive ? "Suspending…" : "Reactivating…") : actionLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

