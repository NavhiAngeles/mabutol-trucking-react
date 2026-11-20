import { useEffect, useMemo, useRef, useState } from "react";
import StrikeStatusIndicator from "../../components/StrikeStatusIndicator/StrikeStatusIndicator";
import {
  confirmNoShowCancellation,
  formatManilaDateTime,
  formatStandingError,
  getPickupWaitState,
  previewNextNoShowStrike,
} from "../../services/customerStandingService";
import "./deliveryWorkflow.css";

const QUICK_REASONS = [
  "No customer response after pickup waiting window elapsed.",
  "Customer unreachable via phone or delivery chat at pickup.",
];

export default function NoShowConfirmDialog({
  delivery,
  trackingNumber = "",
  customer = null,
  defaultReason = "",
  onSubmit = null,
  onClose,
  onConfirmed,
}) {
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const [reason, setReason] = useState(defaultReason || "");
  const [attemptNotes, setAttemptNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const waitState = useMemo(() => getPickupWaitState(delivery), [delivery]);
  const impact = useMemo(() => previewNextNoShowStrike(customer), [customer]);

  useEffect(() => {
    aliveRef.current = true;
    const previous = document.activeElement;
    dialogRef.current?.showModal?.();
    return () => {
      aliveRef.current = false;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const close = () => {
    if (!busyRef.current) onClose?.();
  };

  const trimmedReason = reason.trim();
  const canConfirm = !submitting && Boolean(delivery?.id) && trimmedReason.length >= 5;

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (busyRef.current || !canConfirm) return;

    busyRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        deliveryId: delivery.id,
        reason: trimmedReason,
        attemptNotes: attemptNotes.trim(),
      };
      const result = onSubmit
        ? await onSubmit(payload)
        : await confirmNoShowCancellation(payload);
      if (aliveRef.current) {
        onConfirmed?.({ delivery, result, impact });
      }
    } catch (err) {
      if (aliveRef.current) {
        setError(formatStandingError(err));
      }
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="booking-review-dialog shipment-cancellation-dialog no-show-confirm-dialog"
      aria-labelledby="no-show-confirm-title"
      aria-describedby="no-show-confirm-description"
      aria-busy={submitting}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <form onSubmit={handleConfirm}>
        <h2 id="no-show-confirm-title">
          Confirm customer no-show{trackingNumber ? ` (${trackingNumber})` : ""}?
        </h2>

        <p id="no-show-confirm-description">
          Confirming a no-show cancels the shipment and active delivery assignment, releases the driver and truck, and records an immutable strike on the customer profile.
        </p>

        {waitState.customerOnWay && (
          <div className="no-show-warning-callout" role="status">
            <strong>Customer signaled "I'm On My Way"</strong>
            <p className="tabular-nums">
              Ping recorded at {formatManilaDateTime(waitState.customerOnWayAt)}. Verify with the assigned driver before cancelling.
            </p>
          </div>
        )}

        <div className="no-show-timeline-summary">
          <div className="tabular-nums">
            <strong>Pickup arrived:</strong> {formatManilaDateTime(delivery?.pickup_arrived_at)}
          </div>
          <div className="tabular-nums">
            <strong>15m grace ended:</strong> {formatManilaDateTime(waitState.graceEndsAt)}
          </div>
          <div className="tabular-nums">
            <strong>30m threshold:</strong> {formatManilaDateTime(waitState.autoCancelAt)}
          </div>
        </div>

        <div className="no-show-impact-box">
          <div className="no-show-impact-header">
            <div>
              <span className="no-show-impact-kicker">Strike Impact Preview</span>
              <div className="no-show-impact-customer">
                {customer?.name || "Customer account"} (Current strikes: {impact.currentStrikes})
              </div>
            </div>
            <StrikeStatusIndicator
              strikeCount={impact.nextStrikeNumber}
              size="sm"
              showCountText
            />
          </div>
          <p className="no-show-impact-text">{impact.impactText}</p>
        </div>

        <div className="no-show-presets" role="group" aria-label="Quick no-show reason presets">
          {QUICK_REASONS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="no-show-preset-btn"
              disabled={submitting}
              onClick={() => {
                setReason(preset);
                if (error) setError("");
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="no-show-field-block">
          <div className="no-show-label-row">
            <label htmlFor="no-show-reason">No-show reason *</label>
            <span className={`no-show-char-count tabular-nums ${trimmedReason.length < 5 ? "is-invalid" : "is-valid"}`}>
              {trimmedReason.length < 5
                ? `${trimmedReason.length}/5 characters (minimum 5)`
                : `${trimmedReason.length}/1000 characters`}
            </span>
          </div>
          <textarea
            id="no-show-reason"
            maxLength={1000}
            rows={2}
            disabled={submitting}
            placeholder="Describe verified pickup no-show details..."
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError("");
            }}
          />
        </div>

        <div className="no-show-field-block">
          <label htmlFor="no-show-attempt-notes">Driver attempt notes (optional)</label>
          <textarea
            id="no-show-attempt-notes"
            maxLength={1000}
            rows={2}
            disabled={submitting}
            placeholder="Optional call attempts, gate wait notes, or dispatch verification..."
            value={attemptNotes}
            onChange={(event) => setAttemptNotes(event.target.value)}
          />
        </div>

        {error && (
          <div role="alert" className="shipment-dialog-alert is-error error-message">
            <span>{error}</span>
          </div>
        )}

        <div className="booking-review-actions">
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            disabled={submitting}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={!canConfirm}
          >
            {submitting
              ? "Confirming No-Show..."
              : `Confirm No-Show (Strike ${impact.nextStrikeNumber})`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
