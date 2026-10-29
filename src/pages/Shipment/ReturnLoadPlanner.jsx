import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { loadReturnLoadData } from '../../services/returnLoadService';
import { outboundOptions, planReturnLoads } from '../../services/returnLoadPlanner';
import './deliveryWorkflow.css';

const time = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
export default function ReturnLoadPlanner({ onInspect }) {
  const { user, role } = useAuth();
  return user && ['admin', 'staff'].includes(role) && <Planner key={user.id} onInspect={onInspect} />;
}

function Planner({ onInspect }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [delivery, setDelivery] = useState(''), [ready, setReady] = useState('');
  const [radius, setRadius] = useState('50'), [hours, setHours] = useState('24');
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    loadReturnLoadData().then(result => { if (live) { setData({ ...result, loadedAt: Date.now() }); setError(''); } })
      .catch(() => { if (live) { setData(null); setError('Return-load data unavailable. Check your connection and office access, then retry.'); } });
    return () => { live = false; };
  }, [open, revision]);
  const stale = data && clock - data.loadedAt >= 60000;
  const plan = data && delivery && ready && !stale ? planReturnLoads(data, delivery, { readyAt: `${ready}+08:00`, maxPickupKm: radius, maxWaitHours: hours, now: clock }) : null;
  const refresh = () => { setData(null); setError(''); setRevision(value => value + 1); setClock(Date.now()); };
  return <section className="delivery-workflow-panel" aria-label="Return-load planning">
    <h3>Return-load planning</h3>
    <button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); setData(null); setError(''); setClock(Date.now()); }}>{open ? 'Close return-load planner' : 'Find return-load opportunities'}</button>
    {open && <>
      <p>Compare booked, unassigned loads with an outbound truck’s destination and return toward its original pickup. Suggestions do not reserve a truck or driver.</p>
      <button type="button" onClick={refresh}>Refresh return-load data</button>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading return-load data…</p>}
      {data && <>
        <p>Data checked {time(data.loadedAt)}. Refresh after changes to bookings or assignments.</p>
        <label>Outbound delivery<select value={delivery} onChange={event => { setDelivery(event.target.value); setReady(''); }}><option value="">Select an outbound delivery</option>{outboundOptions(data).map(row => <option key={row.delivery.id} value={row.delivery.id}>{row.shipment.tracking_number} · {row.shipment.dropoff_address} · {row.delivery.status}</option>)}</select></label>
        {!outboundOptions(data).length && <p>No outbound deliveries available for planning.</p>}
        <div className="delivery-workflow-grid">
          <label>Unloaded and ready for return pickup (Philippine time)<input type="datetime-local" value={ready} onChange={event => setReady(event.target.value)} /></label>
          <label>Maximum distance to return pickup (km)<input type="number" min="1" max="500" value={radius} onChange={event => setRadius(event.target.value)} /></label>
          <label>Maximum wait after ready time (hours)<input type="number" min="1" max="168" value={hours} onChange={event => setHours(event.target.value)} /></label>
        </div>
        {stale && <p role="status">Results expired. Refresh return-load data before reviewing opportunities.</p>}
        {plan?.error && <p role="alert">{plan.error}</p>}
        {plan && !plan.error && <>
          <p>{plan.truck.plate_number} · recorded capacity {Number(plan.truck.capacity_kg).toLocaleString('en-PH')} kg. Empty return baseline: {plan.baseline.toFixed(1)} km.</p>
          <p>All distances are straight-line comparisons, not road routes or verified savings. Confirm truck access, road travel time to pickup, unloading, cargo handling, driver availability and maintenance before dispatch. Current assignment rules still apply; this does not queue a second delivery on an occupied truck.</p>
          <p role="status">{plan.matches.length ? `${plan.matches.length} potential return loads` : 'No matching return loads within these limits.'}</p>
          {Object.entries(plan.excluded).map(([reason, count]) => <p key={reason}>{reason}: {count}</p>)}
          {plan.matches.map(match => <article className="delivery-workflow-panel" key={match.shipment.id}>
            <h4>{match.shipment.tracking_number}</h4>
            <p>{match.shipment.pickup_address} → {match.shipment.dropoff_address}</p>
            <p>Pickup {time(match.shipment.scheduled_departure)} · {Number(match.shipment.weight_kg).toLocaleString('en-PH')} kg · {match.waitHours.toFixed(1)} hours after ready time</p>
            <p>To pickup: {match.pickupKm.toFixed(1)} km · remaining empty return: {match.homeKm.toFixed(1)} km · potential empty-distance reduction: {match.reductionKm.toFixed(1)} km</p>
            <p>Special handling: {match.shipment.special_handling || 'Not recorded; confirm with office.'}</p>
            <button type="button" onClick={() => onInspect({ dbId: match.shipment.id, id: match.shipment.tracking_number })}>Review return shipment</button>
          </article>)}
        </>}
      </>}
    </>}
  </section>;
}
