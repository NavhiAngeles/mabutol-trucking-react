import { useEffect, useRef, useState } from 'react';
import { fetchBookingRequest, reviewBookingRequest } from '../../services/shipmentService';
import OfficeQuoteForm from './OfficeQuoteForm';
import ShipmentEditDialog from './ShipmentEditDialog';
import VehicleSilhouette from '../../components/VehicleSilhouette/VehicleSilhouette';
import './deliveryWorkflow.css';

const SafeVehicleSilhouette = typeof VehicleSilhouette !== 'undefined' ? VehicleSilhouette : () => null;
const SafeShipmentEditDialog = typeof ShipmentEditDialog !== 'undefined' ? ShipmentEditDialog : () => null;

const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const departure = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';

function estimateTravelDistance(lat1, lon1, lat2, lon2) {
  const p1 = [Number(lat1), Number(lon1)];
  const p2 = [Number(lat2), Number(lon2)];
  if (!p1.every(Number.isFinite) || !p2.every(Number.isFinite)) return null;
  if (p1[0] === 0 && p1[1] === 0 && p2[0] === 0 && p2[1] === 0) return null;
  const rad = v => (v * Math.PI) / 180;
  const dlat = rad(p2[0] - p1[0]);
  const dlon = rad(p2[1] - p1[1]);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(rad(p1[0])) * Math.cos(rad(p2[0])) * Math.sin(dlon / 2) ** 2;
  const straightKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  const roadKm = Math.round(straightKm * 1.11 * 10) / 10;
  return roadKm > 0 ? roadKm : null;
}

function computeEstimatedCharge({ km, rate, minimumFee, handlingSurcharges, specialHandling }) {
  if (!km || !(km > 0) || !rate || rate.per_km_rate == null) return null;
  const perKm = Number(rate.per_km_rate) || 0;
  const minCharge = Number(rate.min_charge) || 0;
  const minFee = Number(minimumFee) || 0;
  const handlingMap = {
    'None': 'none',
    'Fragile': 'fragile',
    'Keep Dry': 'keepdry',
    'Temperature Sensitive': 'temp',
    'Perishable': 'perishable',
    'Cold Chain (Refrigerated)': 'cold',
  };
  const key = handlingMap[specialHandling] || 'none';
  const surcharge = Number(handlingSurcharges?.[key]) || 0;
  const base = Math.max(km * perKm, minCharge, minFee);
  const handling = key === 'cold' ? surcharge * km : surcharge;
  return Math.round((base + handling) * 100) / 100;
}

export default function BookingReview({ shipment, onClose, onReviewed }) {
  const [request, setRequest] = useState(null);
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [editingDeparture, setEditingDeparture] = useState(false);
  const [isPastDeparture, setIsPastDeparture] = useState(false);
  const busy = useRef(false);
  const dialog = useRef(null);

  useEffect(() => {
    let active = true;
    fetchBookingRequest(shipment.dbId).then(data => {
      if (active) {
        setRequest(data);
        setIsPastDeparture(Boolean(data?.scheduled_departure && Number.isFinite(Date.parse(data.scheduled_departure)) && Date.parse(data.scheduled_departure) <= Date.now()));
        setNeedsReload(false);
      }
    }).catch(err => { if (active) setError(err.message || 'Could not load request.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shipment.dbId, revision]);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const reload = () => { setLoading(true); setRequest(null); setCalculatedRoute(null); setError(''); setRevision(value => value + 1); };
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

  const estimatedKm = request
    ? estimateTravelDistance(request.pickup_lat, request.pickup_lng, request.dropoff_lat, request.dropoff_lng)
    : null;
  const effectiveKm = request?.distance_km ?? calculatedRoute?.distance_km ?? estimatedKm;
  const estimatedQuote = request
    ? computeEstimatedCharge({
        km: effectiveKm,
        rate: request.pricing_rate,
        minimumFee: request.minimum_booking_fee,
        handlingSurcharges: request.handling_surcharges,
        specialHandling: request.special_handling,
      })
    : null;

  return <div className="booking-review-backdrop">
    <div className="booking-review-dialog shipment-details-dialog booking-review-modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="booking-review-title" aria-busy={saving} onKeyDown={onKeyDown}>
      <div className="shipment-details-header">
        <div className="shipment-details-header-main">
          <div className="shipment-details-title-row">
            <h2 id="booking-review-title">Review booking {shipment.id}</h2>
            <span className="status review-pill">● PENDING REVIEW</span>
          </div>
          <p className="shipment-details-subtitle">
            Customer: <strong>{request?.customer?.name || shipment.customer || 'Not recorded'}</strong> · Dates and times in Philippine time.
          </p>
        </div>
        <button type="button" className="shipment-details-close-x" aria-label="Close" onClick={onClose} disabled={saving}>
          ✕
        </button>
      </div>

      {loading && <div role="status" className="shipment-details-status-msg"><i className="las la-spinner la-spin" /> <span>Loading current request…</span></div>}
      {error && <div role="alert" className="shipment-details-error-msg"><i className="las la-exclamation-circle" /> <span>{error}</span></div>}
      {request && !loading && <>
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
            <div className="shipment-card-fields">
              <div>
                <dt>Cargo</dt>
                <dd>{request.cargo_description || 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{request.weight_kg ?? 'Unavailable'} kg</dd>
              </div>
              <div>
                <dt>Vehicle type</dt>
                <dd className="booking-review-vehicle-cell">
                  <SafeVehicleSilhouette category={request.vehicle?.name} size="sm" aria-hidden="true" />
                  <span>{request.vehicle?.name || 'Unavailable'}</span>
                </dd>
              </div>
              <div>
                <dt>Handling</dt>
                <dd>{request.special_handling || 'None'}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Driver instructions</dt>
                <dd className="shipment-details-notes">{request.driver_notes || 'None recorded'}</dd>
              </div>
            </div>
          </div>

          {/* CARD 2: ROUTE & SCHEDULE */}
          <div className="shipment-details-card">
            <div className="shipment-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <h4>Route & Schedule</h4>
            </div>
            <div className="shipment-card-fields">
              <div className="shipment-field-full">
                <dt>Pickup</dt>
                <dd className="shipment-address-val">{request.pickup_address}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Destination</dt>
                <dd className="shipment-address-val">{request.dropoff_address}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  {request.distance_km != null ? (
                    <span>{request.distance_km} km</span>
                  ) : calculatedRoute?.distance_km != null ? (
                    <span className="booking-review-estimated-distance">
                      <strong>{calculatedRoute.distance_km} km</strong>
                      <span className="booking-review-tag-badge">(Calculated road route)</span>
                    </span>
                  ) : estimatedKm != null ? (
                    <span className="booking-review-estimated-distance">
                      <strong>~{estimatedKm} km</strong>
                      <span className="booking-review-tag-badge">(Estimated travel distance)</span>
                    </span>
                  ) : (
                    <span>Unavailable</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Departure (Philippines)</dt>
                <dd className={isPastDeparture ? "booking-review-overdue-departure" : undefined}>
                  <span>{departure(request.scheduled_departure)}</span>
                  {isPastDeparture && (
                    <span className="overdue-departure-tag" title="Departure date/time is in the past">
                      ⚠️ Past date
                    </span>
                  )}
                </dd>
              </div>
              {isPastDeparture && (
                <div className="shipment-field-full">
                  <button
                    type="button"
                    className="btn-update-departure"
                    onClick={() => setEditingDeparture(true)}
                  >
                    <span>Update departure date & time</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: PRICING & QUOTATION */}
          <div className="shipment-details-card shipment-field-full">
            <div className="shipment-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <h4>Quotation & Charges</h4>
            </div>
            <div className="shipment-card-fields">
              <div>
                <dt>Quoted charge</dt>
                <dd className="shipment-money-val">
                  {request.quoted_amount != null ? (
                    money(request.quoted_amount)
                  ) : estimatedQuote != null ? (
                    <span className="booking-review-estimated-price">
                      <span>~{money(estimatedQuote)}</span>
                      <span className="booking-review-tag-badge">(Estimated from rate)</span>
                    </span>
                  ) : (
                    <span className="booking-review-pending-quote">
                      Pending route quotation
                      <small className="booking-review-quote-sub">Save calculated quotation below</small>
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Accepted charge</dt>
                <dd className="shipment-final-val">
                  {request.override_amount != null ? (
                    money(request.override_amount)
                  ) : request.quoted_amount != null ? (
                    money(request.quoted_amount)
                  ) : estimatedQuote != null ? (
                    <span className="booking-review-estimated-price">
                      <span>~{money(estimatedQuote)}</span>
                      <span className="booking-review-tag-badge">(Pending confirmation)</span>
                    </span>
                  ) : (
                    <span className="booking-review-pending-quote">
                      Pending route quotation
                    </span>
                  )}
                </dd>
              </div>
              {request.override_amount != null && (
                <div className="shipment-field-full">
                  <dt>Override reason</dt>
                  <dd>{request.override_reason || 'None recorded'}</dd>
                </div>
              )}
            </div>
          </div>
        </dl>

        <OfficeQuoteForm
          key={request.updated_at}
          request={request}
          onQuoted={reload}
          onRouteCalculated={setCalculatedRoute}
          onEditDeparture={() => setEditingDeparture(true)}
          disabled={saving || needsReload}
        />

        {(request.quoted_amount == null || !(request.distance_km > 0)) && (
          <div className="booking-review-warning-notice" role="status">
            <span aria-hidden="true" style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <div className="booking-review-warning-body">
              <strong className="booking-review-warning-title">Quotation required before approval</strong>
              <p>
                {isPastDeparture
                  ? 'The scheduled departure for this booking is in the past. Deliveries cannot be quoted or approved for past departures. Click "Update departure date & time" above to set a future date first.'
                  : 'This booking has no saved distance or quotation yet. Confirm the coordinates, click "Calculate provider route", and then click "Save calculated quotation" above. Once saved, the "Approve request" button will become active.'}
              </p>
            </div>
          </div>
        )}

        <div className="booking-review-notice">
          <p>Approval accepts this charge and attempts to assign an available driver and matching truck. Without availability, the approved booking waits for assignment.</p>
        </div>

        <div className="booking-review-rejection-box">
          <label htmlFor="booking-rejection-reason">Rejection reason (required to reject)</label>
          <textarea
            id="booking-rejection-reason"
            maxLength={1000}
            placeholder="Enter reason for rejecting this booking request..."
            value={reason}
            disabled={saving}
            onChange={event => setReason(event.target.value)}
          />
          <p className="booking-review-help-text">Rejection cancels this pending request and records your reason.</p>
        </div>
      </>}
      <div className="booking-review-actions">
        <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Close</button>
        <button type="button" className="btn-secondary" disabled={saving || loading} onClick={reload}>Reload request</button>
        <button type="button" className="btn-danger" disabled={saving || loading || !request || needsReload || !reason.trim()} onClick={() => decide('reject')}>Reject request</button>
        <button
          type="button"
          className="btn-primary"
          disabled={saving || loading || !request || needsReload || request.quoted_amount==null || !(request.distance_km>0)}
          title={request && (request.quoted_amount == null || !(request.distance_km > 0)) ? "Save a calculated quotation above to enable approval" : undefined}
          onClick={() => decide('approve')}
        >
          {saving ? 'Saving decision…' : 'Approve request'}
        </button>
      </div>
      {editingDeparture && (
        <SafeShipmentEditDialog
          shipment={shipment}
          onClose={() => setEditingDeparture(false)}
          onSaved={async () => {
            setEditingDeparture(false);
            reload();
          }}
        />
      )}
    </div>
  </div>;
}
