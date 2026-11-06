import { useEffect, useRef, useState } from 'react';
import { cancellationPolicy, fetchShipmentForCancellation, cancelShipment } from '../../services/shipmentCancellationService';
import './deliveryWorkflow.css';

export default function ShipmentCancellationDialog({ shipment, onClose, onCancelled }) {
  const [record, setRecord] = useState(null);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [revision, setRevision] = useState(0);
  const dialog = useRef(null), busy = useRef(false);

  useEffect(() => {
    let active = true;
    fetchShipmentForCancellation(shipment.dbId).then(value => {
      if (active) { setRecord(value); setNeedsReload(false); }
    }).catch(err => { if (active) setError(err.message || 'Could not load shipment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shipment.dbId, revision]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const reload = () => {
    if (busy.current) return;
    setLoading(true); setRecord(null); setError(''); setAcknowledged(false); setRevision(value => value + 1);
  };
  const allowed = cancellationPolicy(record).allowed;
  const confirm = async () => {
    if (busy.current || loading || needsReload || !allowed || !acknowledged || reason.trim().length < 5 || reason.trim().length > 1000) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await cancelShipment(record, reason, acknowledged);
      onCancelled(result);
    } catch (err) {
      setError(err.message || 'Could not confirm cancellation. Reload before retrying.'); setNeedsReload(true);
    } finally { busy.current = false; setSaving(false); }
  };

  return <dialog ref={dialog} className="booking-review-dialog shipment-cancellation-dialog" aria-labelledby="shipment-cancel-title" aria-busy={loading || saving}
    onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}>
    <h2 id="shipment-cancel-title">Cancel shipment {record?.tracking_number || shipment.id}?</h2>
    {loading && <p role="status">Checking current shipment and payment records…</p>}
    {error && <p role="alert">{error}</p>}
    {record && !loading && <>
      <p>Current status: {record.status}. Cancellation is available before a trip starts. No-show cancellation uses its separate review.</p>
      {!allowed ? <p>{cancellationPolicy(record).reason}</p> : <>
        <p>This ends the shipment and releases its driver and truck reservation. Existing history and evidence remain available. This action cannot be undone here.</p>
        <p>No cancellation fee or refund is applied automatically. Recorded charges and payments remain unchanged.
          {record.paymentCount > 0 ? ` ${record.paymentCount} payment record(s) require separate financial review.` : ' No payment records are currently recorded.'}</p>
        <label htmlFor="shipment-cancel-reason">Cancellation reason (5–1000 characters)</label>
        <textarea id="shipment-cancel-reason" maxLength={1000} value={reason} disabled={saving || needsReload} onChange={event => setReason(event.target.value)} />
        <label><input type="checkbox" checked={acknowledged} disabled={saving || needsReload} onChange={event => setAcknowledged(event.target.checked)} /> I understand that recorded charges and payments are preserved and any refund requires separate financial review.</label>
      </>}
    </>}
    <div className="booking-review-actions">
      <button type="button" disabled={saving} onClick={() => { if (!busy.current) onClose(); }}>Close</button>
      <button type="button" disabled={saving || loading} onClick={reload}>Reload shipment</button>
      <button type="button" className="action-danger" disabled={saving || loading || needsReload || !allowed || !acknowledged || reason.trim().length < 5 || reason.trim().length > 1000} onClick={confirm}>{saving ? 'Cancelling…' : 'Confirm cancellation'}</button>
    </div>
  </dialog>;
}
