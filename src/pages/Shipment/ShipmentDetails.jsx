import { useEffect, useRef, useState } from 'react';
import { fetchShipmentDetails } from '../../services/shipmentService';
import DeliveryOperations from './DeliveryOperations';
import AssignmentManager from './AssignmentManager';
import VehicleSilhouette from '../../components/VehicleSilhouette/VehicleSilhouette';

const SafeVehicleSilhouette = typeof VehicleSilhouette !== 'undefined' ? VehicleSilhouette : () => null;

const timestamp = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';
const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const status = value => String(value || 'Unavailable').replaceAll('_', ' ');

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

export default function ShipmentDetails({ shipment, onClose }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dialog = useRef(null);
  const detailSequence = useRef(0);

  useEffect(() => {
    let active = true;
    const seq = detailSequence;
    const request = ++seq.current;
    fetchShipmentDetails(shipment.dbId).then(data => { if (active && request === seq.current) { setDetails(data); setError(''); setRefreshVersion(value => value + 1); } })
      .catch(err => { if (active && request === seq.current) setError(err.message || 'Could not load shipment details.'); })
      .finally(() => { if (active && request === seq.current) setLoading(false); });
    return () => { active = false; seq.current++; };
  }, [shipment.dbId]);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const reload = async ({ preserve = false } = {}) => {
    const request = ++detailSequence.current;
    if (!preserve) setDetails(null);
    setLoading(true);
    try {
      const result = await fetchShipmentDetails(shipment.dbId);
      if (request !== detailSequence.current) return false;
      setDetails(result);
      setError('');
      setRefreshVersion(value => value + 1);
      return true;
    } catch (err) {
      if (request !== detailSequence.current) return false;
      setError(err.message || 'Could not load shipment details.');
      return false;
    } finally { if (request === detailSequence.current) setLoading(false); }
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
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

  return <div className="booking-review-backdrop">
    <div className="booking-review-dialog shipment-details-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="shipment-details-title" aria-busy={loading} onKeyDown={onKeyDown}>
      <div className="shipment-details-header">
        <div className="shipment-details-header-main">
          <div className="shipment-details-title-row">
            <h2 id="shipment-details-title">Shipment {details?.tracking_number || shipment.id}</h2>
            {details?.status && (
              <span className={`status ${statusClass(details.status)}`}>
                ● {statusLabel(details.status)}
              </span>
            )}
          </div>
          <p className="shipment-details-subtitle">Dates and times are shown in Philippine time.</p>
        </div>
        <button type="button" className="shipment-details-close-x" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      {loading && <div role="status" className="shipment-details-status-msg"><i className="las la-spinner la-spin" /> <span>{details ? 'Refreshing shipment details… Showing the last successfully loaded details.' : 'Loading current shipment details…'}</span></div>}
      {error && <div role="alert" className="shipment-details-error-msg"><i className="las la-exclamation-circle" /> <span>{error}{details && ' Showing the last successfully loaded shipment details.'}</span></div>}
      {details && <>
        <dl className="shipment-details-grid">
          {/* CARD 1: ROUTE & SCHEDULE */}
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
                <dd className="shipment-address-val">{details.pickup_address}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Destination</dt>
                <dd className="shipment-address-val">{details.dropoff_address}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>{details.distance_km ?? 'Unavailable'} km</dd>
              </div>
              {details.route_duration_minutes != null && (
                <div>
                  <dt>Estimated travel time</dt>
                  <dd>{Math.round(details.route_duration_minutes)} mins</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{status(details.status)}</dd>
              </div>
              <div>
                <dt>Scheduled departure</dt>
                <dd>{timestamp(details.scheduled_departure)}</dd>
              </div>
              <div>
                <dt>Estimated arrival</dt>
                <dd>{timestamp(details.estimated_arrival)}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Actual delivery</dt>
                <dd>{timestamp(details.actual_delivery_at)}</dd>
              </div>
            </div>
          </div>

          {/* CARD 2: CARGO & VEHICLE SPECS */}
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
                <dt>Vehicle type</dt>
                <dd className="shipment-vehicle-val">
                  <SafeVehicleSilhouette category={details.vehicle?.name} size="sm" aria-hidden="true" />
                  <span>{details.vehicle?.name || 'Unavailable'}</span>
                </dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{details.weight_kg ?? 'Unavailable'} kg</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Cargo</dt>
                <dd>{details.cargo_description || 'Unavailable'}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Handling</dt>
                <dd>{details.special_handling || 'None'}</dd>
              </div>
              <div className="shipment-field-full">
                <dt>Driver instructions</dt>
                <dd className="shipment-details-notes">{details.driver_notes || 'None recorded'}</dd>
              </div>
            </div>
          </div>

          {/* CARD 3: CUSTOMER & BOOKING INFO */}
          <div className="shipment-details-card">
            <div className="shipment-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <h4>Customer & Booking</h4>
            </div>
            <div className="shipment-card-fields">
              <div>
                <dt>Customer</dt>
                <dd>{details.customer?.name || 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Booking source</dt>
                <dd className="shipment-tag-val">{details.booking_source || 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{timestamp(details.created_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{timestamp(details.updated_at)}</dd>
              </div>
              {details.status === 'cancelled' && <>
                <div className="shipment-field-full">
                  <dt>Cancellation reason</dt>
                  <dd className="shipment-cancelled-val">{details.cancelled_reason || 'None recorded'}</dd>
                </div>
                <div className="shipment-field-full">
                  <dt>Cancelled at</dt>
                  <dd>{timestamp(details.cancelled_at)}</dd>
                </div>
              </>}
            </div>
          </div>

          {/* CARD 4: CHARGES & TOLL DETAILS */}
          <div className="shipment-details-card">
            <div className="shipment-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <h4>Financials & Tolls</h4>
            </div>
            <div className="shipment-card-fields">
              <div>
                <dt>Quoted charge</dt>
                <dd className="shipment-money-val">{money(details.quoted_amount)}</dd>
              </div>
              <div>
                <dt>Final charge</dt>
                <dd className="shipment-final-val">{money(details.final_amount)}</dd>
              </div>
              {details.route_geometry?.booking_pricing?.version === 1 ? (
                <>
                  <div>
                    <dt>Toll routing</dt>
                    <dd>{details.route_geometry.booking_pricing.toll_preference === 'expressway' ? 'Toll expressway' : 'Avoid toll roads'}</dd>
                  </div>
                  <div>
                    <dt>Toll fees included in quote</dt>
                    <dd>{money(details.route_geometry.booking_pricing.toll_amount)}
                      {Boolean(details.route_geometry.booking_pricing.toll_rates?.length) && (
                        <ul className="shipment-toll-rates-list">
                          {details.route_geometry.booking_pricing.toll_rates.map(rate => (
                            <li key={rate.id}>{rate.highway} · {rate.gate_name} · {rate.vehicle_class}: {money(rate.fee)}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </>
              ) : (details.toll_fees != null && details.toll_fees > 0) ? (
                <div>
                  <dt>Toll fees included in quote</dt>
                  <dd>{money(details.toll_fees)}</dd>
                </div>
              ) : null}
              {details.driver_allowance != null && (
                <div>
                  <dt>Driver trip allowance</dt>
                  <dd>{money(details.driver_allowance)}</dd>
                </div>
              )}
              <div>
                <dt>Override charge</dt>
                <dd>{details.override_amount == null ? 'No override' : money(details.override_amount)}</dd>
              </div>
              {details.override_amount != null && (
                <div className="shipment-field-full">
                  <dt>Override reason</dt>
                  <dd>{details.override_reason || 'None recorded'}</dd>
                </div>
              )}
            </div>
          </div>
        </dl>

        <div className="shipment-details-assignments-section">
          <h3>Delivery assignments</h3>
          {details.deliveries.length ? (
            <ul className="shipment-assignments-list">
              {details.deliveries.map(delivery => (
                <li key={delivery.id} className="shipment-assignment-item">
                  <span className="assignment-badge">
                    {delivery.driver?.full_name || 'Driver unavailable'}
                  </span>
                  <span className="assignment-sep">·</span>
                  <span className="assignment-badge">
                    {delivery.truck?.plate_number || 'Vehicle unavailable'}
                  </span>
                  <span className="assignment-sep">·</span>
                  <span className={`status ${statusClass(delivery.status)}`}>
                    {status(delivery.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="shipment-no-assignments">No delivery assignment recorded.</p>
          )}

          <AssignmentManager shipmentId={details.id} onChanged={reload} draftSuggestion={shipment?.draftSuggestion} />
          <DeliveryOperations shipmentId={details.id} shipmentStatus={details.status} shipmentRefreshVersion={refreshVersion} onChanged={reload} />
        </div>
      </>}
      <div className="booking-review-actions">
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => reload({ preserve: Boolean(error && details) })}>
          {error ? (details ? 'Retry details refresh' : 'Retry') : 'Refresh details'}
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>;
}
