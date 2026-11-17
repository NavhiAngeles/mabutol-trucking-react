import { useRef, useState } from 'react';
import { deliveryWorkflowService } from '../../services/deliveryWorkflowService';

const service = deliveryWorkflowService();
export default function OfficeQuoteForm({ request, onQuoted, onRouteCalculated, onEditDeparture, disabled = false }) {
  const [form, setForm] = useState(() => ({ pickup_lat: request.pickup_lat ?? '', pickup_lng: request.pickup_lng ?? '', dropoff_lat: request.dropoff_lat ?? '', dropoff_lng: request.dropoff_lng ?? '', distance_km: request.distance_km ?? '', duration_minutes: request.route_duration_minutes ?? '', source: request.route_source || 'provider', reason: request.route_reason || '', geometry: request.route_geometry || null }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const change = (key, value) => setForm(previous => {
    const next = { ...previous, [key]: value, ...(key.includes('_lat') || key.includes('_lng') ? { distance_km: '', duration_minutes: '', geometry: null } : {}) };
    if (key === 'distance_km' && Number(value) > 0) {
      onRouteCalculated?.({ distance_km: Number(value), duration_minutes: Number(next.duration_minutes) });
    }
    return next;
  });
  const run = async calculate => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (calculate) {
        const calculated = await service.calculateRoute(form);
        setForm(calculated);
        onRouteCalculated?.({ distance_km: calculated.distance_km, duration_minutes: calculated.duration_minutes });
      }
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
            <label htmlFor="quote-pickup-lat">
              Pickup latitude
              <input
                id="quote-pickup-lat"
                type="number"
                step="any"
                value={form.pickup_lat}
                disabled={busy || disabled}
                onChange={event => change('pickup_lat', event.target.value)}
              />
            </label>
            <label htmlFor="quote-pickup-lng">
              Pickup longitude
              <input
                id="quote-pickup-lng"
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
            <label htmlFor="quote-dropoff-lat">
              Destination latitude
              <input
                id="quote-dropoff-lat"
                type="number"
                step="any"
                value={form.dropoff_lat}
                disabled={busy || disabled}
                onChange={event => change('dropoff_lat', event.target.value)}
              />
            </label>
            <label htmlFor="quote-dropoff-lng">
              Destination longitude
              <input
                id="quote-dropoff-lng"
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

      <label htmlFor="quote-route-source">Route source<select id="quote-route-source" value={form.source} disabled={busy || disabled} onChange={event => change('source',event.target.value)}><option value="provider">Provider road route</option><option value="manual">Verified manual road route</option></select></label>
      <button type="button" disabled={busy || disabled} onClick={() => run(true)}>Calculate provider route</button>
      <div className="delivery-workflow-grid">{[['distance_km','Road distance (km)'],['duration_minutes','Travel duration (minutes)']].map(([key,label]) =>
        <label key={key} htmlFor={`quote-${key}`}>{label}<input id={`quote-${key}`} type="number" min="0.1" step="any" value={form[key]} readOnly={form.source==='provider'} disabled={busy || disabled} onChange={event => change(key,event.target.value)} /></label>)}</div>
      {form.source==='manual' && <label htmlFor="quote-manual-reason">Manual route verification reason<textarea id="quote-manual-reason" maxLength={1000} value={form.reason} disabled={busy || disabled} onChange={event => change('reason',event.target.value)} /></label>}
      {error && (
        <div className="quote-form-error-banner" role="alert">
          <span className="quote-form-error-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <div className="quote-form-error-body">
            <strong>Cannot save quotation:</strong>
            <p>
              {error.includes('INVALID_DEPARTURE')
                ? 'The scheduled departure date and time for this booking is in the past. Shipments cannot be quoted or approved for past departures. Please update the departure date/time before saving.'
                : error.includes('REQUEST_CHANGED_RELOAD')
                ? 'This booking was modified in another session. Please reload the request before saving.'
                : error.includes('PRICING_CONFIGURATION_REQUIRED')
                ? 'Pricing configuration is missing for this vehicle category. Please configure active pricing in Settings > Pricing.'
                : error}
            </p>
            {error.includes('INVALID_DEPARTURE') && onEditDeparture && (
              <button
                type="button"
                className="btn-update-departure-error"
                onClick={onEditDeparture}
              >
                Update departure date & time
              </button>
            )}
          </div>
        </div>
      )}
      {Boolean(form.distance_km && (form.source !== 'provider' || form.geometry) && (request.quoted_amount == null || !(request.distance_km > 0))) && (
        <div className="quote-action-prompt" role="status">
          <span className="quote-action-prompt-dot" aria-hidden="true">●</span>
          <span>Route calculated ({form.distance_km} km). Click <strong>"Save calculated quotation"</strong> below to lock in charges and enable approval.</span>
        </div>
      )}
      <button type="button" className="btn-primary" disabled={busy || disabled || (form.source==='provider' && !form.geometry)} onClick={() => run(false)}>{busy ? 'Preparing…' : 'Save calculated quotation'}</button>
    </section>
  );
}
