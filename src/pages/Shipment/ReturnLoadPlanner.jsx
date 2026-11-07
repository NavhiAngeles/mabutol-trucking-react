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
  return <section className={`delivery-workflow-panel return-load-panel ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Return-load planning">
    <div className="return-load-header">
      <div className="return-load-title-group">
        <div className="return-load-title-row">
          <span className="return-load-tag"><i className="las la-route" /> Fleet Optimization</span>
          <h3>Return-load planning</h3>
        </div>
        <p className="return-load-subtitle">Compare booked, unassigned loads with an outbound truck’s destination and return toward its original pickup. Suggestions do not reserve a truck or driver.</p>
      </div>
      <div className="return-load-actions">
        {open && (
          <button type="button" className="planner-action-btn refresh-btn" onClick={refresh}>
            <i className="las la-sync" />{'Refresh return-load data'}
          </button>
        )}
        <button
          type="button"
          className={`planner-toggle-btn ${open ? 'close-btn' : 'open-btn'}`}
          aria-expanded={open}
          onClick={() => { setOpen(value => !value); setData(null); setError(''); setClock(Date.now()); }}
        >
          <i className={`las ${open ? 'la-times' : 'la-compass'}`} />{open ? 'Close return-load planner' : 'Find return-load opportunities'}
        </button>
      </div>
    </div>
    {open && <div className="return-load-body">
      {error && <div className="shipment-dialog-alert is-error" role="alert"><i className="las la-exclamation-circle" /> <span>{error}</span></div>}
      {!data && !error && <div className="shipment-dialog-alert is-loading" role="status"><i className="las la-spinner la-spin" /> <span>Loading return-load data…</span></div>}
      {data && <>
        <div className="return-load-meta-bar">
          <i className="las la-history" />
          <span>Data checked {time(data.loadedAt)}. Refresh after changes to bookings or assignments.</span>
        </div>
        <div className="return-load-filters-card">
          <label className="return-load-field">
            <span className="field-label"><i className="las la-truck" /> Outbound delivery</span>
            <select value={delivery} onChange={event => { setDelivery(event.target.value); setReady(''); }}>
              <option value="">Select an outbound delivery</option>
              {outboundOptions(data).map(row => <option key={row.delivery.id} value={row.delivery.id}>{row.shipment.tracking_number} · {row.shipment.dropoff_address} · {row.delivery.status}</option>)}
            </select>
          </label>
          {!outboundOptions(data).length && <p className="no-outbound-note">No outbound deliveries available for planning.</p>}
          <div className="return-load-inputs-grid">
            <label className="return-load-field">
              <span className="field-label"><i className="las la-calendar-check" /> Unloaded and ready for return pickup (Philippine time)</span>
              <input type="datetime-local" value={ready} onChange={event => setReady(event.target.value)} />
            </label>
            <label className="return-load-field">
              <span className="field-label"><i className="las la-map-marker-alt" /> Maximum distance to return pickup (km)</span>
              <input type="number" min="1" max="500" value={radius} onChange={event => setRadius(event.target.value)} />
            </label>
            <label className="return-load-field">
              <span className="field-label"><i className="las la-hourglass-half" /> Maximum wait after ready time (hours)</span>
              <input type="number" min="1" max="168" value={hours} onChange={event => setHours(event.target.value)} />
            </label>
          </div>
        </div>
        {stale && <div className="shipment-dialog-alert is-warning" role="status"><i className="las la-clock" /> <span>Results expired. Refresh return-load data before reviewing opportunities.</span></div>}
        {plan?.error && <div className="shipment-dialog-alert is-error" role="alert"><i className="las la-exclamation-circle" /> <span>{plan.error}</span></div>}
        {plan && !plan.error && <>
          <div className="plan-baseline-card">
            <div className="plan-truck-info">
              <span className="truck-plate"><i className="las la-truck-moving" /> {plan.truck.plate_number}</span>
              <span className="truck-capacity">Recorded capacity: {Number(plan.truck.capacity_kg).toLocaleString('en-PH')} kg</span>
              <span className="truck-baseline">Empty return baseline: {plan.baseline.toFixed(1)} km</span>
            </div>
            <p className="plan-disclaimer">All distances are straight-line comparisons, not road routes or verified savings. Confirm truck access, road travel time to pickup, unloading, cargo handling, driver availability and maintenance before dispatch. Current assignment rules still apply; this does not queue a second delivery on an occupied truck.</p>
          </div>
          <div className="plan-matches-header">
            <span className={`matches-count-badge ${plan.matches.length ? 'has-matches' : 'no-matches'}`} role="status">
              <i className={`las ${plan.matches.length ? 'la-check-circle' : 'la-info-circle'}`} />
              {plan.matches.length ? `${plan.matches.length} potential return loads` : 'No matching return loads within these limits.'}
            </span>
            {Object.entries(plan.excluded).length > 0 && (
              <div className="excluded-reasons-list">
                {Object.entries(plan.excluded).map(([reason, count]) => <span key={reason} className="excluded-chip">{reason}: {count}</span>)}
              </div>
            )}
          </div>
          {plan.matches.length > 0 && (
            <div className="return-matches-grid">
              {plan.matches.map(match => <article className="return-match-card" key={match.shipment.id}>
                <div className="match-card-top">
                  <div className="match-tracking">
                    <h4>{match.shipment.tracking_number}</h4>
                    <span className="match-weight">{Number(match.shipment.weight_kg).toLocaleString('en-PH')} kg</span>
                  </div>
                  <span className="match-reduction-badge">
                    <i className="las la-gas-pump" /> -{match.reductionKm.toFixed(1)} km empty return
                  </span>
                </div>
                <div className="match-route">
                  <span className="route-point pickup"><i className="las la-circle" /> {match.shipment.pickup_address}</span>
                  <span className="route-arrow">↓</span>
                  <span className="route-point dropoff"><i className="las la-map-marker" /> {match.shipment.dropoff_address}</span>
                </div>
                <div className="match-stats-row">
                  <div className="stat-item"><span className="stat-label">Pickup Time</span><span className="stat-val">{time(match.shipment.scheduled_departure)}</span></div>
                  <div className="stat-item"><span className="stat-label">Wait After Ready</span><span className="stat-val">{match.waitHours.toFixed(1)} hrs</span></div>
                  <div className="stat-item"><span className="stat-label">To Pickup</span><span className="stat-val">{match.pickupKm.toFixed(1)} km</span></div>
                  <div className="stat-item"><span className="stat-label">Remaining Return</span><span className="stat-val">{match.homeKm.toFixed(1)} km</span></div>
                </div>
                <p className="match-handling">{match.shipment.special_handling ? <><strong>Special handling:</strong> {match.shipment.special_handling}</> : 'Special handling: Not recorded; confirm with office.'}</p>
                <button type="button" className="btn-review-return" onClick={() => onInspect({ dbId: match.shipment.id, id: match.shipment.tracking_number })}>
                  <i className="las la-clipboard-list" />{'Review return shipment'}
                </button>
              </article>)}
            </div>
          )}
        </>}
      </>}
    </div>}
  </section>;
}
