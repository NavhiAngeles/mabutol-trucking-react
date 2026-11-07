import { useRef, useState } from 'react';
import { deliveryWorkflowService } from '../../services/deliveryWorkflowService';

const service = deliveryWorkflowService();
export default function OfficeQuoteForm({ request, onQuoted, disabled = false }) {
  const [form, setForm] = useState(() => ({ pickup_lat: request.pickup_lat ?? '', pickup_lng: request.pickup_lng ?? '', dropoff_lat: request.dropoff_lat ?? '', dropoff_lng: request.dropoff_lng ?? '', distance_km: request.distance_km ?? '', duration_minutes: request.route_duration_minutes ?? '', source: request.route_source || 'provider', reason: request.route_reason || '', geometry: request.route_geometry || null }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value, ...(key.includes('_lat') || key.includes('_lng') ? { distance_km: '', duration_minutes: '', geometry: null } : {}) }));
  const run = async calculate => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (calculate) setForm(await service.calculateRoute(form));
      else { await service.prepareQuote(request, form); onQuoted(); }
    } catch (err) { setError(err.message || 'Could not prepare quotation. Reload before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <section className="delivery-workflow-panel" aria-label="Prepare route and quotation">
      <h3>Route and quotation</h3>
      <p>Confirm pickup and destination coordinates. Prices are calculated on the server from current Pricing settings.</p>

      <div className="quote-locations-group">
        <div className="quote-location-card pickup-card">
          <div className="quote-location-header">
            <span className="quote-location-badge pickup">
              <span className="quote-location-badge-dot" aria-hidden="true">●</span>
              <span>Pickup (Origin)</span>
            </span>
            <div className="quote-location-address">
              {request.pickup_address || 'Address not specified'}
            </div>
          </div>
          <div className="delivery-workflow-grid">
            <label>
              Pickup latitude
              <input
                type="number"
                step="any"
                value={form.pickup_lat}
                disabled={busy || disabled}
                onChange={event => change('pickup_lat', event.target.value)}
              />
            </label>
            <label>
              Pickup longitude
              <input
                type="number"
                step="any"
                value={form.pickup_lng}
                disabled={busy || disabled}
                onChange={event => change('pickup_lng', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="quote-location-card dropoff-card">
          <div className="quote-location-header">
            <span className="quote-location-badge dropoff">
              <span className="quote-location-badge-dot" aria-hidden="true">●</span>
              <span>Destination (Drop-off)</span>
            </span>
            <div className="quote-location-address">
              {request.dropoff_address || 'Address not specified'}
            </div>
          </div>
          <div className="delivery-workflow-grid">
            <label>
              Destination latitude
              <input
                type="number"
                step="any"
                value={form.dropoff_lat}
                disabled={busy || disabled}
                onChange={event => change('dropoff_lat', event.target.value)}
              />
            </label>
            <label>
              Destination longitude
              <input
                type="number"
                step="any"
                value={form.dropoff_lng}
                disabled={busy || disabled}
                onChange={event => change('dropoff_lng', event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <label>Route source<select value={form.source} disabled={busy || disabled} onChange={event => change('source',event.target.value)}><option value="provider">Provider road route</option><option value="manual">Verified manual road route</option></select></label>
      <button type="button" disabled={busy || disabled} onClick={() => run(true)}>Calculate provider route</button>
      <div className="delivery-workflow-grid">{[['distance_km','Road distance (km)'],['duration_minutes','Travel duration (minutes)']].map(([key,label]) =>
        <label key={key}>{label}<input type="number" min="0.1" step="any" value={form[key]} readOnly={form.source==='provider'} disabled={busy || disabled} onChange={event => change(key,event.target.value)} /></label>)}</div>
      {form.source==='manual' && <label>Manual route verification reason<textarea maxLength={1000} value={form.reason} disabled={busy || disabled} onChange={event => change('reason',event.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy || disabled || (form.source==='provider' && !form.geometry)} onClick={() => run(false)}>{busy ? 'Preparing…' : 'Save calculated quotation'}</button>
    </section>
  );
}
