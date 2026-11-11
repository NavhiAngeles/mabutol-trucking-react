import { useEffect, useRef, useState } from 'react';
import { fetchShipmentForEdit, saveShipmentEdit } from '../../services/shipmentEditService';
import { parsePhilippineDeparture, validateDeparture } from './departureSchedule';
import ShipmentDiscardDialog from './ShipmentDiscardDialog';

const civil = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : '';
const draftOf = row => { const when = civil(row.scheduled_departure); return { cargo_description: row.cargo_description || '', weight_kg: String(row.weight_kg ?? ''), requested_vehicle_type_id: row.requested_vehicle_type_id || '', special_handling: row.special_handling || '', date: when.slice(0, 10), time: when.slice(11, 16), driver_notes: row.driver_notes || '' }; };

const statusLabel = val =>
  ({
    transit: 'IN TRANSIT',
    loading: 'LOADING',
    delayed: 'DELAYED',
    review: 'REVIEW',
    completed: 'COMPLETED',
    pending: 'PENDING REVIEW',
    booked: 'BOOKED',
    assigned: 'ASSIGNED',
    cancelled: 'CANCELLED',
  })[val] ?? String(val || 'UNAVAILABLE').replaceAll('_', ' ').toUpperCase();

const statusClass = val =>
  ({
    transit: 'transit-pill',
    loading: 'loading-pill',
    delayed: 'delayed-pill',
    review: 'review-pill',
    pending: 'review-pill',
    booked: 'loading-pill',
    assigned: 'loading-pill',
    completed: 'transit-pill',
    cancelled: 'delayed-pill',
  })[val] ?? 'loading-pill';

export default function ShipmentEditDialog({ shipment, onClose, onSaved }) {
  const [record, setRecord] = useState(null);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [revision, setRevision] = useState(0);
  const dialog = useRef(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    fetchShipmentForEdit(shipment.dbId).then(row => {
      if (active) {
        const next = draftOf(row);
        setRecord(row);
        setDraft(next);
        setBaseline(JSON.stringify(next));
      }
    }).catch(err => {
      if (active) setError(err.message || 'Could not load shipment.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [shipment.dbId, revision]);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const dirty = draft && JSON.stringify(draft) !== baseline;
  const close = () => dirty ? setDiscard(true) : onClose();
  const reload = () => {
    setRecord(null);
    setDraft(null);
    setError('');
    setNotice('');
    setLoading(true);
    setRevision(value => value + 1);
  };
  const set = key => event => setDraft(value => ({ ...value, [key]: event.target.value }));

  const save = async () => {
    if (busy.current || !record || !draft || !dirty) return;
    setError('');
    setNotice('');
    const changes = {};
    for(const key of record.policy.fields) {
      if (key === 'scheduled_departure') {
        const problem = validateDeparture(draft.date,draft.time);
        if (problem) {
          setError(problem);
          return;
        }
        changes[key] = parsePhilippineDeparture(draft.date, draft.time).toISOString();
      } else if (key === 'weight_kg') {
        changes[key] = Number(draft[key]);
      } else {
        changes[key] = draft[key];
      }
    }
    busy.current = true;
    setSaving(true);
    try {
      const result = await saveShipmentEdit(record, changes);
      setRecord(value => ({ ...value, updated_at: result.updated_at }));
      setBaseline(JSON.stringify(draft));
      setNotice(result.quotation_invalidated ? 'Saved. The previous quotation was cleared; prepare a new quote before approval.' : 'Shipment changes saved.');
      await onSaved(result);
    } catch (err) {
      setError(err.message || 'Could not save. Reload the shipment before retrying.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const onKeyDown = event => {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    if (!dialog.current) return;
    const controls = Array.from(dialog.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'));
    if (controls.length === 0) {
      event.preventDefault();
      dialog.current.focus();
      return;
    }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current || !dialog.current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current || !dialog.current.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="booking-review-backdrop">
      <div
        className="booking-review-dialog shipment-details-dialog shipment-edit-dialog"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-edit-title"
        aria-busy={loading || saving}
        onKeyDown={onKeyDown}
      >
        {/* HEADER */}
        <div className="shipment-details-header">
          <div className="shipment-details-header-main">
            <div className="shipment-details-title-row">
              <h2 id="shipment-edit-title">Edit shipment {record?.tracking_number || shipment.id}</h2>
              {record?.status && (
                <span className={`status ${statusClass(record.status)}`}>
                  ● {statusLabel(record.status)}
                </span>
              )}
            </div>
            <p className="shipment-details-subtitle">
              Customer: <strong>{record?.customer?.name || shipment.customer || 'Customer'}</strong> · Booking source: <span style={{ textTransform: 'capitalize' }}>{record?.booking_source || 'Standard'}</span> · Philippine time.
            </p>
          </div>
          <button type="button" className="shipment-details-close-x" aria-label="Close" onClick={close} disabled={saving}>
            ✕
          </button>
        </div>

        {/* NOTICES & ALERTS */}
        {loading && (
          <div role="status" className="shipment-details-status-msg">
            <i className="las la-spinner la-spin" />
            <span>Loading current shipment details…</span>
          </div>
        )}
        {error && (
          <div role="alert" className="shipment-details-error-msg">
            <i className="las la-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="shipment-edit-success-msg">
            <i className="las la-check-circle" />
            <span>{notice}</span>
          </div>
        )}

        {/* POLICY BANNER */}
        {record && !loading && (
          <div className={`shipment-edit-policy-banner ${record.policy.editable ? 'is-editable' : 'is-locked'}`} role="status">
            <div className="shipment-edit-policy-icon" aria-hidden="true">
              {record.policy.editable ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </div>
            <div className="shipment-edit-policy-body">
              <strong>
                {record.policy.editable
                  ? 'Operational Modification Permitted'
                  : record.booking_source === 'mobile'
                  ? 'Customer Consent Protected'
                  : 'Shipment Terms Locked'}
              </strong>
              <p>{record.policy.reason}</p>
              {!record.policy.editable && record.booking_source === 'mobile' && record.status === 'pending' && (
                <small className="shipment-edit-policy-subtext">
                  Customer-submitted requests cannot be rewritten directly by office dispatch without customer agreement. To reschedule or adjust cargo details, confirm with the customer or submit a revised customer booking request.
                </small>
              )}
            </div>
          </div>
        )}

        {/* CARDS GRID */}
        {record && draft && !loading && (
          <dl className="shipment-details-grid">
            {/* CARD 1: CARGO & VEHICLE */}
            <div className="shipment-details-card">
              <div className="shipment-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1" y="3" width="15" height="13" rx="2" />
                  <path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <h4>Cargo & Vehicle</h4>
              </div>
              <div className="shipment-edit-card-fields">
                {record.policy.fields.includes('cargo_description') ? (
                  <label className="shipment-edit-field">
                    <span>Cargo description</span>
                    <input
                      className="shipment-edit-input"
                      value={draft.cargo_description}
                      maxLength={500}
                      onChange={set('cargo_description')}
                      placeholder="e.g. Biscuits, Commercial freight"
                    />
                  </label>
                ) : (
                  <div className="shipment-edit-readonly-field">
                    <span className="shipment-edit-field-label">Cargo description</span>
                    <span className="shipment-edit-field-val">{record.cargo_description || 'None specified'}</span>
                  </div>
                )}

                {record.policy.fields.includes('weight_kg') ? (
                  <label className="shipment-edit-field">
                    <span>Weight (kg)</span>
                    <input
                      className="shipment-edit-input"
                      type="number"
                      min="2000"
                      max="4000"
                      value={draft.weight_kg}
                      onChange={set('weight_kg')}
                    />
                  </label>
                ) : (
                  <div className="shipment-edit-readonly-field">
                    <span className="shipment-edit-field-label">Weight</span>
                    <span className="shipment-edit-field-val">{record.weight_kg != null ? `${record.weight_kg} kg` : 'None specified'}</span>
                  </div>
                )}

                {record.policy.fields.includes('requested_vehicle_type_id') ? (
                  <label className="shipment-edit-field">
                    <span>Vehicle type</span>
                    <select
                      className="shipment-edit-select"
                      value={draft.requested_vehicle_type_id}
                      onChange={set('requested_vehicle_type_id')}
                    >
                      {record.vehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {Number(v.default_capacity_kg).toLocaleString()} kg
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="shipment-edit-readonly-field">
                    <span className="shipment-edit-field-label">Vehicle type</span>
                    <span className="shipment-edit-field-val">
                      {record.vehicles.find(v => v.id === record.requested_vehicle_type_id)?.name || 'Standard vehicle'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 2: SCHEDULE & ROUTE */}
            <div className="shipment-details-card">
              <div className="shipment-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <h4>Route & Schedule</h4>
              </div>
              <div className="shipment-edit-card-fields">
                {record.policy.fields.includes('scheduled_departure') ? (
                  <div className="shipment-edit-schedule-row">
                    <label className="shipment-edit-field">
                      <span>Departure date</span>
                      <input className="shipment-edit-input" type="date" value={draft.date} onChange={set('date')} />
                    </label>
                    <label className="shipment-edit-field">
                      <span>Departure time (PST)</span>
                      <input className="shipment-edit-input" type="time" value={draft.time} onChange={set('time')} />
                    </label>
                  </div>
                ) : (
                  <div className="shipment-edit-readonly-field">
                    <span className="shipment-edit-field-label">Scheduled departure (Philippines)</span>
                    <span className="shipment-edit-field-val">
                      {civil(record.scheduled_departure)
                        ? new Date(record.scheduled_departure).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
                        : 'Not scheduled'}
                    </span>
                  </div>
                )}

                <div className="shipment-edit-readonly-field shipment-field-full">
                  <span className="shipment-edit-field-label">Pickup (Origin)</span>
                  <span className="shipment-edit-address-val">{record.pickup_address || 'Address recorded'}</span>
                </div>
                <div className="shipment-edit-readonly-field shipment-field-full">
                  <span className="shipment-edit-field-label">Destination (Drop-off)</span>
                  <span className="shipment-edit-address-val">{record.dropoff_address || 'Address recorded'}</span>
                </div>
              </div>
            </div>

            {/* CARD 3: INSTRUCTIONS & SPECIAL HANDLING */}
            <div className="shipment-details-card shipment-field-full">
              <div className="shipment-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <h4>Instructions & Special Handling</h4>
              </div>
              <div className="shipment-edit-card-fields">
                {record.policy.fields.includes('special_handling') ? (
                  <label className="shipment-edit-field shipment-field-full">
                    <span>Special handling</span>
                    <textarea
                      className="shipment-edit-textarea"
                      value={draft.special_handling}
                      maxLength={1000}
                      onChange={set('special_handling')}
                      placeholder="Special handling instructions (e.g. Fragile, Temperature Sensitive)..."
                    />
                  </label>
                ) : (
                  <div className="shipment-edit-readonly-field shipment-field-full">
                    <span className="shipment-edit-field-label">Special handling</span>
                    <span className="shipment-edit-field-val">{record.special_handling || 'None recorded'}</span>
                  </div>
                )}

                {record.policy.fields.includes('driver_notes') ? (
                  <label className="shipment-edit-field shipment-field-full">
                    <span>Driver instructions</span>
                    <textarea
                      className="shipment-edit-textarea"
                      value={draft.driver_notes}
                      maxLength={1000}
                      onChange={set('driver_notes')}
                      placeholder="Instructions for the assigned driver..."
                    />
                  </label>
                ) : (
                  <div className="shipment-edit-readonly-field shipment-field-full">
                    <span className="shipment-edit-field-label">Driver instructions</span>
                    <span className="shipment-edit-field-val">{record.driver_notes || 'None recorded'}</span>
                  </div>
                )}
              </div>
            </div>
          </dl>
        )}

        {/* ACTIONS */}
        <div className="booking-review-actions shipment-edit-actions">
          <button type="button" className="btn-secondary" disabled={saving} onClick={close}>
            Close
          </button>
          <button type="button" className="btn-secondary" disabled={saving || loading} onClick={reload}>
            Reload
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving||loading||!record?.policy.editable||!dirty}
            title={!record?.policy.editable ? "Shipment terms are protected by current lifecycle policy" : !dirty ? "Make a change to enable saving" : undefined}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {discard && (
          <ShipmentDiscardDialog
            title="Discard shipment changes?"
            description="Your edits have not been saved. Closing now will discard them."
            discardLabel="Discard changes"
            onKeepEditing={() => setDiscard(false)}
            onDiscard={onClose}
          />
        )}
      </div>
    </div>
  );
}
