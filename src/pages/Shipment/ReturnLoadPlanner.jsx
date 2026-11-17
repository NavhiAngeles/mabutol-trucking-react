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
          <span className="return-load-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="19" r="3" />
              <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
              <circle cx="18" cy="5" r="3" />
            </svg>
            {' Fleet Optimization'}
          </span>
          <h2>Return-load planning</h2>
        </div>
        <p className="return-load-subtitle">Compare booked, unassigned loads with an outbound truck’s destination and return toward its original pickup. Suggestions do not reserve a truck or driver.</p>
      </div>
      <div className="return-load-actions">
        {open && (
          <button type="button" className="planner-action-btn refresh-btn" onClick={refresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {'Refresh return-load data'}
          </button>
        )}
        <button
          type="button"
          className={`planner-toggle-btn ${open ? 'close-btn' : 'open-btn'}`}
          aria-expanded={open}
          onClick={() => { setOpen(value => !value); setData(null); setError(''); setClock(Date.now()); }}
        >
          {open ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          )}
          {open ? 'Close return-load planner' : 'Find return-load opportunities'}
        </button>
      </div>
    </div>
    {open && <div className="return-load-body">
      {error && (
        <div className="shipment-dialog-alert is-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {!data && !error && (
        <div className="shipment-dialog-alert is-loading" role="status">
          <svg className="shipment-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Loading return-load data…</span>
        </div>
      )}
      {data && <>
        <div className="return-load-meta-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Data checked {time(data.loadedAt)}. Refresh after changes to bookings or assignments.</span>
        </div>
        <div className="return-load-filters-card">
          <label className="return-load-field" htmlFor="return-load-outbound">
            <span className="field-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <path d="M16 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              {' Outbound delivery'}
            </span>
            <select id="return-load-outbound" value={delivery} onChange={event => { setDelivery(event.target.value); setReady(''); }}>
              <option value="">Select an outbound delivery</option>
              {outboundOptions(data).map(row => <option key={row.delivery.id} value={row.delivery.id}>{row.shipment.tracking_number} · {row.shipment.dropoff_address} · {row.delivery.status}</option>)}
            </select>
          </label>
          {!outboundOptions(data).length && <p className="no-outbound-note">No outbound deliveries available for planning.</p>}
          <div className="return-load-inputs-grid">
            <label className="return-load-field" htmlFor="return-load-ready">
              <span className="field-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {' Unloaded and ready for return pickup (Philippine time)'}
              </span>
              <input id="return-load-ready" type="datetime-local" value={ready} onChange={event => setReady(event.target.value)} />
            </label>
            <label className="return-load-field" htmlFor="return-load-radius">
              <span className="field-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {' Maximum distance to return pickup (km)'}
              </span>
              <input id="return-load-radius" type="number" min="1" max="500" value={radius} onChange={event => setRadius(event.target.value)} />
            </label>
            <label className="return-load-field" htmlFor="return-load-hours">
              <span className="field-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {' Maximum wait after ready time (hours)'}
              </span>
              <input id="return-load-hours" type="number" min="1" max="168" value={hours} onChange={event => setHours(event.target.value)} />
            </label>
          </div>
        </div>
        {stale && (
          <div className="shipment-dialog-alert is-warning" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Results expired. Refresh return-load data before reviewing opportunities.</span>
          </div>
        )}
        {plan?.error && (
          <div className="shipment-dialog-alert is-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{plan.error}</span>
          </div>
        )}
        {plan && !plan.error && <>
          <div className="plan-baseline-card">
            <div className="plan-truck-info">
              <span className="truck-plate">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1" y="3" width="15" height="13" rx="2" />
                  <path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                {' '}{plan.truck.plate_number}
              </span>
              <span className="truck-capacity">Recorded capacity: {Number(plan.truck.capacity_kg).toLocaleString('en-PH')} kg</span>
              <span className="truck-baseline">Empty return baseline: {plan.baseline.toFixed(1)} km</span>
            </div>
            <p className="plan-disclaimer">All distances are straight-line comparisons, not road routes or verified savings. Confirm truck access, road travel time to pickup, unloading, cargo handling, driver availability and maintenance before dispatch. Current assignment rules still apply; this does not queue a second delivery on an occupied truck.</p>
          </div>
          <div className="plan-matches-header">
            <span className={`matches-count-badge ${plan.matches.length ? 'has-matches' : 'no-matches'}`} role="status">
              {plan.matches.length ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
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
                    <h3>{match.shipment.tracking_number}</h3>
                    <span className="match-weight">{Number(match.shipment.weight_kg).toLocaleString('en-PH')} kg</span>
                  </div>
                  <span className="match-reduction-badge">
                    -{match.reductionKm.toFixed(1)} km empty return
                  </span>
                </div>
                <div className="match-route">
                  <span className="route-point pickup">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="12" r="5" />
                    </svg>
                    {' '}{match.shipment.pickup_address}
                  </span>
                  <span className="route-arrow">↓</span>
                  <span className="route-point dropoff">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {' '}{match.shipment.dropoff_address}
                  </span>
                </div>
                <div className="match-stats-row">
                  <div className="stat-item"><span className="stat-label">Pickup Time</span><span className="stat-val">{time(match.shipment.scheduled_departure)}</span></div>
                  <div className="stat-item"><span className="stat-label">Wait After Ready</span><span className="stat-val">{match.waitHours.toFixed(1)} hrs</span></div>
                  <div className="stat-item"><span className="stat-label">To Pickup</span><span className="stat-val">{match.pickupKm.toFixed(1)} km</span></div>
                  <div className="stat-item"><span className="stat-label">Remaining Return</span><span className="stat-val">{match.homeKm.toFixed(1)} km</span></div>
                </div>
                <p className="match-handling">{match.shipment.special_handling ? <><strong>Special handling:</strong> {match.shipment.special_handling}</> : 'Special handling: Not recorded; confirm with office.'}</p>
                <button
                  type="button"
                  className="btn-review-return"
                  onClick={() => onInspect({
                    dbId: match.shipment.id,
                    id: match.shipment.tracking_number,
                    draftSuggestion: {
                      driverId: plan.delivery.driver_id,
                      truckId: plan.truck.id,
                      truckPlate: plan.truck.plate_number,
                      outboundDeliveryId: plan.delivery.id,
                      outboundTracking: plan.shipment?.tracking_number,
                      reason: `Backhaul return load recommendation for returning truck ${plan.truck.plate_number}${plan.shipment?.tracking_number ? ` (outbound: ${plan.shipment.tracking_number})` : ''}`,
                    },
                  })}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <line x1="9" y1="12" x2="15" y2="12" />
                    <line x1="9" y1="16" x2="15" y2="16" />
                  </svg>
                  {'Review return shipment'}
                </button>
              </article>)}
            </div>
          )}
        </>}
      </>}
    </div>}
  </section>;
}
