import { useEffect, useRef, useState } from 'react';
import { fetchBookingRequest, reviewBookingRequest } from '../../services/shipmentService';
import OfficeQuoteForm from './OfficeQuoteForm';
import './deliveryWorkflow.css';

const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const departure = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';

export default function BookingReview({ shipment, onClose, onReviewed }) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const busy = useRef(false);
  const dialog = useRef(null);

  useEffect(() => {
    let active = true;
    fetchBookingRequest(shipment.dbId).then(data => {
      if (active) { setRequest(data); setNeedsReload(false); }
    }).catch(err => { if (active) setError(err.message || 'Could not load request.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shipment.dbId, revision]);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const reload = () => { setLoading(true); setRequest(null); setError(''); setRevision(value => value + 1); };
  const decide = async decision => {
    if (busy.current || !request || needsReload) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await reviewBookingRequest(request, decision, reason);
      onReviewed(result);
    } catch (err) {
      setError(err.message || 'Could not confirm the decision. Reload before retrying.');
      setNeedsReload(true);
    } finally { busy.current = false; setSaving(false); }
  };
  const onKeyDown = event => {
    if (event.key === 'Escape' && !busy.current) { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
  };

  return <div className="booking-review-backdrop">
    <div className="booking-review-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="booking-review-title" aria-busy={saving} onKeyDown={onKeyDown}>
      <h2 id="booking-review-title">Review booking {shipment.id}</h2>
      <p>Customer: {request?.customer?.name || shipment.customer || 'Not recorded'}</p>
      {loading && <p role="status">Loading current request…</p>}
      {error && <p role="alert">{error}</p>}
      {request && !loading && <>
        <dl>
          <dt>Cargo</dt><dd>{request.cargo_description || 'Unavailable'} · {request.weight_kg ?? 'Unavailable'} kg</dd>
          <dt>Pickup</dt><dd>{request.pickup_address}</dd>
          <dt>Destination</dt><dd>{request.dropoff_address}</dd>
          <dt>Distance</dt><dd>{request.distance_km ?? 'Unavailable'} km</dd>
          <dt>Vehicle type</dt><dd>{request.vehicle?.name || 'Unavailable'}</dd>
          <dt>Departure (Philippines)</dt><dd>{departure(request.scheduled_departure)}</dd>
          <dt>Quoted charge</dt><dd>{money(request.quoted_amount)}</dd>
          <dt>Accepted charge</dt><dd>{money(request.override_amount ?? request.quoted_amount)}</dd>
          {request.override_amount != null && <><dt>Override reason</dt><dd>{request.override_reason || 'None recorded'}</dd></>}
          <dt>Handling</dt><dd>{request.special_handling || 'None'}</dd>
          <dt>Driver instructions</dt><dd>{request.driver_notes || 'None recorded'}</dd>
        </dl>
        <OfficeQuoteForm key={request.updated_at} request={request} onQuoted={reload} disabled={saving || needsReload} />
        <p>Approval accepts this charge and attempts to assign an available driver and matching truck. Without availability, the approved booking waits for assignment.</p>
        <label htmlFor="booking-rejection-reason">Rejection reason (required to reject)</label>
        <textarea id="booking-rejection-reason" maxLength={1000} value={reason} disabled={saving} onChange={event => setReason(event.target.value)} />
        <p>Rejection cancels this pending request and records your reason.</p>
      </>}
      <div className="booking-review-actions">
        <button type="button" disabled={saving} onClick={onClose}>Close</button>
        <button type="button" disabled={saving || loading} onClick={reload}>Reload request</button>
        <button type="button" disabled={saving || loading || !request || needsReload || !reason.trim()} onClick={() => decide('reject')}>Reject request</button>
        <button type="button" className="btn-primary" disabled={saving || loading || !request || needsReload || request.quoted_amount==null || !(request.distance_km>0)} onClick={() => decide('approve')}>{saving ? 'Saving decision…' : 'Approve request'}</button>
      </div>
    </div>
  </div>;
}
