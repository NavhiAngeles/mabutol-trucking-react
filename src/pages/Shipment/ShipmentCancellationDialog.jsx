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
  const policy = cancellationPolicy(record);
  const allowed = policy.allowed;
  const canConfirm = !loading && !saving && !needsReload && allowed && acknowledged && reason.trim().length >= 5 && reason.trim().length <= 1000;

  const confirm = async () => {
    if (busy.current || !canConfirm) return;
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
    {loading && <div role="status" className="shipment-dialog-alert is-loading"><i className="las la-spinner la-spin" /> <span>Checking current shipment and payment records…</span></div>}
    {error && <div role="alert" className="shipment-dialog-alert is-error error-message"><i className="las la-exclamation-circle" /> <span>{error}</span></div>}
    {record && !loading && <>
      <p>Current status: {record.status}. Cancellation is available before a trip starts. No-show cancellation uses its separate review.</p>
      {policy.overdue12h && (
        <div className="cancellation-overdue-alert" role="status" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', color: '#92400e', margin: '10px 0' }}>
          <strong>Departure Overdue (12+ Hours)</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>More than 12 hours have passed since the scheduled departure time and the driver has not arrived at the pickup location. Cancellation is permitted.</p>
        </div>
      )}
      {!allowed ? (
        <div className="cancellation-policy-alert" role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#991b1b', margin: '12px 0' }}>
          <strong>Cancellation unavailable</strong>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px' }}>{policy.reason}</p>
        </div>
      ) : <>
        <p>This ends the shipment and releases any driver and truck reservation. Existing history and evidence remain available. This action cannot be undone here.</p>
        <p>No cancellation fee or refund is applied automatically. Recorded charges and payments remain unchanged.
          {record.paymentCount > 0 ? ` ${record.paymentCount} payment record(s) require separate financial review.` : ' No payment records are currently recorded.'}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <label htmlFor="shipment-cancel-reason" style={{ margin: 0, fontWeight: 600 }}>Cancellation reason</label>
          <span style={{ fontSize: '12px', color: reason.trim().length < 5 ? '#dc2626' : '#16a34a', fontWeight: 500 }}>
            {reason.trim().length < 5 ? `${reason.trim().length}/5 characters (minimum 5)` : `${reason.trim().length}/1000 characters`}
          </span>
        </div>
        <textarea id="shipment-cancel-reason" maxLength={1000} placeholder="Provide a reason for cancelling this shipment..." value={reason} disabled={saving || needsReload} onChange={event => setReason(event.target.value)} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
          <input type="checkbox" checked={acknowledged} disabled={saving || needsReload} onChange={event => setAcknowledged(event.target.checked)} style={{ marginTop: '3px' }} />
          <span>I understand that recorded charges and payments are preserved and any refund requires separate financial review.</span>
        </label>
        {!canConfirm && (
          <p className="cancellation-hint" style={{ fontSize: '12px', color: '#dc2626', margin: '8px 0 0 0', fontWeight: 500 }}>
            {reason.trim().length < 5
              ? `⚠️ Enter at least ${5 - reason.trim().length} more character${5 - reason.trim().length > 1 ? 's' : ''} for the reason to proceed.`
              : !acknowledged
                ? '⚠️ Please check the financial acknowledgement box above to enable cancellation.'
                : ''}
          </p>
        )}
      </>}
    </>}
    <div className="booking-review-actions">
      <button type="button" disabled={saving} onClick={() => { if (!busy.current) onClose(); }}>Close</button>
      <button type="button" disabled={saving || loading} onClick={reload}>Reload shipment</button>
      {allowed && (
        <button type="button" className="action-danger" disabled={!canConfirm} onClick={confirm}>
          {saving ? 'Cancelling…' : 'Confirm cancellation'}
        </button>
      )}
    </div>
  </dialog>;
}
