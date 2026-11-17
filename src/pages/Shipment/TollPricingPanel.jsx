export default function TollPricingPanel({ rates, loading, error, vehicleClass, vehicleName, sections, matchedRates, total,
  validationError, disabled, onRefresh, currency }) {
  const highways = [...new Set(sections.filter(section => section.highway && section.highway !== 'UNKNOWN').map(section => section.highway.replaceAll('_', ' ')))];
  return <fieldset className="shipment-toll-rates" disabled={disabled}>
    <legend>Expressway tolls</legend>
    <div className="toll-panel-heading">
      <div><strong>Automatic toll pricing</strong><p>From the selected truck and calculated route</p></div>
      <span className={`toll-price-chip${total == null ? ' is-pending' : ''}`}>{total == null ? 'Fee pending' : currency(total)}</span>
    </div>
    <dl className="toll-auto-summary">
      <div><dt>Truck type</dt><dd>{vehicleName || 'Choose a truck in Step 2'}</dd></div>
      <div><dt>Toll class</dt><dd>{vehicleClass || 'Not configured'}<small>Assigned from the selected truck type</small></dd></div>
      <div><dt>Expressways</dt><dd>{highways.length ? highways.join(' → ') : 'Awaiting route identification'}</dd></div>
    </dl>
    {loading && <div className="toll-panel-message" role="status">Matching toll rates…</div>}
    {error && <div className="toll-panel-message is-warning" role="alert"><strong>Unable to load toll rates.</strong><p>Check the connection, then retry.</p></div>}
    {!loading && !error && total == null && <div className="toll-panel-message is-warning" role="status">
      <span className="toll-message-icon" aria-hidden="true">₱</span>
      <div><strong>{rates.length === 0 ? 'No toll rates configured.' : 'Matching toll rate needed'}</strong>
        <p>{validationError || 'An administrator must configure the fee for this exact route.'}</p></div>
    </div>}
    {!loading && !error && matchedRates.map(rate => <div className="shipment-toll-rate" key={rate.id}>
      <span>{rate.highway.replaceAll('_', ' ')} · {rate.gate_name}<small>{rate.vehicle_class} · {rate.pricing_scope === 'flat' ? 'Fixed toll system fee' : 'Entry and exit matched automatically'}</small></span><strong>{currency(rate.fee)}</strong>
    </div>)}
    <div className="toll-panel-actions">
      <a href="/Settings/pricing#toll-gates" target="_blank" rel="noopener noreferrer">Open toll pricing <span aria-hidden="true">↗</span><span className="toll-link-context"> (new tab)</span></a>
      <button type="button" disabled={loading} onClick={onRefresh}>{error ? 'Retry toll rates' : 'Refresh toll rates'}</button>
    </div>
    <p className="toll-panel-hint toll-draft-hint">Fees update automatically when the truck or route changes. No manual class or fee selection is needed.</p>
  </fieldset>;
}
