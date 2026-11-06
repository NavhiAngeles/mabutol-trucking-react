import { useEffect, useRef, useState } from 'react';
import { fetchShipmentDetails } from '../../services/shipmentService';
import DeliveryOperations from './DeliveryOperations';
import AssignmentManager from './AssignmentManager';

const timestamp = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';
const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const status = value => String(value || 'Unavailable').replaceAll('_', ' ');

export default function ShipmentDetails({ shipment, onClose }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dialog = useRef(null);
  const detailSequence = useRef(0);

  useEffect(() => {
    let active = true;
    const request = ++detailSequence.current;
    fetchShipmentDetails(shipment.dbId).then(data => { if (active && request === detailSequence.current) { setDetails(data); setError(''); setRefreshVersion(value => value + 1); } })
      .catch(err => { if (active && request === detailSequence.current) setError(err.message || 'Could not load shipment details.'); })
      .finally(() => { if (active && request === detailSequence.current) setLoading(false); });
    return () => { active = false; detailSequence.current++; };
  }, [shipment.dbId]);

  useEffect(() => { dialog.current?.focus(); }, []);

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
    const controls = Array.from(dialog.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
  };

  return <div className="booking-review-backdrop">
    <div className="booking-review-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="shipment-details-title" aria-busy={loading} onKeyDown={onKeyDown}>
      <h2 id="shipment-details-title">Shipment {details?.tracking_number || shipment.id}</h2>
      <p>Dates and times are shown in Philippine time.</p>
      {loading && <p role="status">{details ? 'Refreshing shipment details… Showing the last successfully loaded details.' : 'Loading current shipment details…'}</p>}
      {error && <p role="alert">{error}{details && ' Showing the last successfully loaded shipment details.'}</p>}
      {details && <>
        <dl>
          <dt>Status</dt><dd>{status(details.status)}</dd>
          <dt>Customer</dt><dd>{details.customer?.name || 'Unavailable'}</dd>
          <dt>Booking source</dt><dd>{details.booking_source || 'Unavailable'}</dd>
          <dt>Cargo</dt><dd>{details.cargo_description || 'Unavailable'}</dd>
          <dt>Weight</dt><dd>{details.weight_kg ?? 'Unavailable'} kg</dd>
          <dt>Vehicle type</dt><dd>{details.vehicle?.name || 'Unavailable'}</dd>
          <dt>Pickup</dt><dd>{details.pickup_address}</dd>
          <dt>Destination</dt><dd>{details.dropoff_address}</dd>
          <dt>Distance</dt><dd>{details.distance_km ?? 'Unavailable'} km</dd>
          <dt>Scheduled departure</dt><dd>{timestamp(details.scheduled_departure)}</dd>
          <dt>Estimated arrival</dt><dd>{timestamp(details.estimated_arrival)}</dd>
          <dt>Actual delivery</dt><dd>{timestamp(details.actual_delivery_at)}</dd>
          <dt>Handling</dt><dd>{details.special_handling || 'None'}</dd>
          <dt>Driver instructions</dt><dd className="shipment-details-notes">{details.driver_notes || 'None recorded'}</dd>
          <dt>Quoted charge</dt><dd>{money(details.quoted_amount)}</dd>
          {details.route_geometry?.booking_pricing?.version === 1 && <>
            <dt>Toll routing</dt><dd>{details.route_geometry.booking_pricing.toll_preference === 'expressway' ? 'Toll expressway' : 'Avoid toll roads'}</dd>
            <dt>Toll fees included in quote</dt><dd>{money(details.route_geometry.booking_pricing.toll_amount)}
              <ul>{details.route_geometry.booking_pricing.toll_rates?.map(rate => <li key={rate.id}>{rate.highway} · {rate.gate_name} · {rate.vehicle_class}: {money(rate.fee)}</li>)}</ul>
            </dd>
          </>}
          <dt>Override charge</dt><dd>{details.override_amount == null ? 'No override' : money(details.override_amount)}</dd>
          {details.override_amount != null && <><dt>Override reason</dt><dd>{details.override_reason || 'None recorded'}</dd></>}
          <dt>Final charge</dt><dd>{money(details.final_amount)}</dd>
          {details.status === 'cancelled' && <>
            <dt>Cancellation reason</dt><dd>{details.cancelled_reason || 'None recorded'}</dd>
            <dt>Cancelled at</dt><dd>{timestamp(details.cancelled_at)}</dd>
          </>}
          <dt>Created</dt><dd>{timestamp(details.created_at)}</dd>
          <dt>Last updated</dt><dd>{timestamp(details.updated_at)}</dd>
        </dl>
        <h3>Delivery assignments</h3>
        {details.deliveries.length ? <ul>{details.deliveries.map(delivery => <li key={delivery.id}>
          {delivery.driver?.full_name || 'Driver unavailable'} · {delivery.truck?.plate_number || 'Vehicle unavailable'} · {status(delivery.status)}
        </li>)}</ul> : <p>No delivery assignment recorded.</p>}
        <AssignmentManager shipmentId={details.id} onChanged={reload} />
        <DeliveryOperations shipmentId={details.id} shipmentStatus={details.status} shipmentRefreshVersion={refreshVersion} onChanged={reload} />
      </>}
      <div className="booking-review-actions">
        <button type="button" onClick={onClose}>Close</button>
        <button type="button" disabled={loading} onClick={() => reload({ preserve: Boolean(error && details) })}>{error ? (details ? 'Retry details refresh' : 'Retry') : 'Refresh details'}</button>
      </div>
    </div>
  </div>;
}
