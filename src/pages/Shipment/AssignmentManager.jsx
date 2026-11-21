import { useEffect, useMemo, useState } from 'react';
import { fetchAssignmentOptions, saveManualAssignment } from '../../services/assignmentService';

export default function AssignmentManager({ shipmentId, onChanged, draftSuggestion, shipmentRefreshVersion = 0 }) {
  const [options, setOptions] = useState(null);
  const [driverId, setDriverId] = useState(draftSuggestion?.driverId || '');
  const [truckId, setTruckId] = useState(draftSuggestion?.truckId || '');
  const [reason, setReason] = useState(draftSuggestion?.reason || '');
  const [prevDraft, setPrevDraft] = useState(draftSuggestion);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  if (draftSuggestion !== prevDraft) {
    setPrevDraft(draftSuggestion);
    setDriverId(draftSuggestion?.driverId || '');
    setTruckId(draftSuggestion?.truckId || '');
    setReason(draftSuggestion?.reason || '');
  }

  useEffect(() => {
    let active = true;
    fetchAssignmentOptions(shipmentId).then(result => { if (active) setOptions(result); })
      .catch(err => { if (active) setError(err.message || 'Could not load assignment options.'); });
    return () => { active = false; };
  }, [shipmentId, revision, shipmentRefreshVersion]);

  const currentDriverId = options?.current?.driver_id;
  const currentTruckId = options?.current?.truck_id;
  const shipmentWeight = Number(options?.shipment?.weight_kg || 0);
  const requestedVehicleTypeId = options?.shipment?.requested_vehicle_type_id;

  const isReservedOrAssignedElsewhere = (row, currentId) => {
    if (!row) return true;
    if (row.id === currentId) return false;
    if (row.reason === 'Reserved by another delivery' || row.reserved === true) return true;
    if (['assigned', 'loading', 'in_transit', 'on_trip', 'on_route', 'reserved'].includes(row.status)) return true;
    return false;
  };

  const drivers = useMemo(() => options?.drivers.filter(row => {
    if (isReservedOrAssignedElsewhere(row, currentDriverId)) return false;
    return row.status === 'available' || (row.status === undefined ? Boolean(row.eligible) : row.eligible || row.id === currentDriverId || row.id === draftSuggestion?.driverId);
  }) || [], [options?.drivers, currentDriverId, draftSuggestion?.driverId]);

  const trucks = useMemo(() => options?.trucks.filter(row => {
    if (isReservedOrAssignedElsewhere(row, currentTruckId)) return false;
    const isAvailable = row.status === 'available' || (row.status === undefined ? Boolean(row.eligible) : row.eligible || row.id === currentTruckId || row.id === draftSuggestion?.truckId);
    if (!isAvailable) return false;
    if (shipmentWeight > 0) {
      const cap = Number(row.capacity_kg);
      if (!(cap > 0) || cap < shipmentWeight) return false;
    }
    if (row.reason === 'Insufficient recorded capacity') return false;
    if (requestedVehicleTypeId && row.vehicle_type_id && row.vehicle_type_id !== requestedVehicleTypeId) return false;
    if (row.reason === 'Vehicle type mismatch') return false;
    return true;
  }) || [], [options?.trucks, currentTruckId, shipmentWeight, requestedVehicleTypeId, draftSuggestion?.truckId]);

  const selectedDriver = drivers.find(d => d.id === driverId);
  const selectedTruck = trucks.find(t => t.id === truckId);
  const effectiveDriverId = selectedDriver ? driverId : '';
  const effectiveTruckId = selectedTruck ? truckId : '';
  const currentPair = options?.current && effectiveDriverId === options.current.driver_id && effectiveTruckId === options.current.truck_id;
  const canSave = Boolean(selectedDriver && selectedTruck && selectedDriver.eligible !== false && selectedTruck.eligible !== false)
    && reason.trim().length >= 5 && reason.trim().length <= 1000 && !currentPair && !busy;
  const hasEligibleDriver = drivers.some(d => d.eligible !== false);
  const hasEligibleTruck = trucks.some(t => t.eligible !== false);
  const excluded = useMemo(() => ({
    drivers: Math.max(0, (options?.drivers?.length || 0) - drivers.length),
    trucks: Math.max(0, (options?.trucks?.length || 0) - trucks.length),
  }), [options?.drivers, options?.trucks, drivers.length, trucks.length]);
  const submit = async event => {
    event.preventDefault(); if (!canSave) return;
    setBusy(true); setError('');
    try {
      await saveManualAssignment({ shipmentId, driverId: effectiveDriverId, truckId: effectiveTruckId, reason, expectedDelivery: options.current?.id || null });
      setRevision(value => value + 1);
      await onChanged();
    } catch (err) {
      setError(err.message || 'Could not save assignment. Reload and try again.');
      setRevision(value => value + 1);
    }
    finally { setBusy(false); }
  };
  return <section className="assignment-manager" aria-labelledby="assignment-manager-title">
    <div className="assignment-manager-header">
      <div className="assignment-manager-header-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <polyline points="17 11 19 13 23 9" />
        </svg>
      </div>
      <div className="assignment-manager-header-text">
        <h3 id="assignment-manager-title">Office assignment</h3>
        <p className="assignment-manager-subtitle">
          {options?.current
            ? 'Reassignment is allowed only before pickup or route activity begins.'
            : 'Select the driver and truck for this booked shipment.'}
        </p>
      </div>
    </div>

    {!options && !error && (
      <div role="status" className="shipment-dialog-alert is-loading">
        <svg className="shipment-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span>Loading eligible drivers and trucks…</span>
      </div>
    )}

    {error && (
      <div className="shipment-dialog-alert is-error" role="alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span style={{ flex: 1 }}>{error}</span>
        <button
          type="button"
          className="retry-btn"
          onClick={() => { setOptions(null); setRevision(value => value + 1); }}
        >
          Retry
        </button>
      </div>
    )}

    {options?.blockedReason && (
      <div className="assignment-blocked shipment-dialog-alert is-warning" role="status">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <span>{options.blockedReason}</span>
      </div>
    )}

    {options && !options.blockedReason && (
      <form onSubmit={submit}>
        {draftSuggestion && (
          <div className="shipment-dialog-alert is-info return-load-draft-notice" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="19" r="3" />
              <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
              <circle cx="18" cy="5" r="3" />
            </svg>
            <span>
              <strong>Return load suggestion:</strong> Returning driver and truck pre-selected for backhaul review. Verify capacity and compliance before assigning.
            </span>
          </div>
        )}

        <div className="assignment-fields-card">
          <div className="assignment-fields-row">
            <div className="assignment-field-col">
              <label htmlFor={`assignment-driver-${shipmentId}`}>
                Driver
                <select id={`assignment-driver-${shipmentId}`} value={effectiveDriverId} onChange={event => setDriverId(event.target.value)} disabled={busy}>
                  <option value="">Choose a driver</option>
                  {drivers.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.full_name}{options?.current?.driver_id === row.id ? ' (Current)' : row.id === draftSuggestion?.driverId ? ' (Suggested return driver)' : ''}{!row.eligible && row.reason ? ` (${row.reason})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedDriver && !selectedDriver.eligible && selectedDriver.reason && (
                <p className="assignment-warning" role="status">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span><strong>Driver note:</strong> {selectedDriver.reason}</span>
                </p>
              )}
            </div>

            <div className="assignment-field-col">
              <label htmlFor={`assignment-truck-${shipmentId}`}>
                Truck{shipmentWeight > 0 ? ` (min. ${shipmentWeight.toLocaleString()} kg capacity)` : ''}
                <select id={`assignment-truck-${shipmentId}`} value={effectiveTruckId} onChange={event => setTruckId(event.target.value)} disabled={busy}>
                  <option value="">Choose a truck</option>
                  {trucks.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.plate_number}{row.capacity_kg ? ` · ${Number(row.capacity_kg).toLocaleString()} kg` : ''}{options?.current?.truck_id === row.id ? ' (Current)' : row.id === draftSuggestion?.truckId ? ' (Suggested return truck)' : ''}{!row.eligible && row.reason ? ` (${row.reason})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTruck && !selectedTruck.eligible && selectedTruck.reason && (
                <p className="assignment-warning" role="status">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span><strong>Truck note:</strong> {selectedTruck.reason}</span>
                </p>
              )}
            </div>
          </div>

          {(!hasEligibleDriver || !hasEligibleTruck) && (
            <div role="status" className="assignment-warning shipment-dialog-alert is-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>No eligible pair is currently available. Review Fleet availability, maintenance, reservations and Compliance. Excluded: {excluded.drivers} driver(s), {excluded.trucks} truck(s).</span>
            </div>
          )}

          <div className="assignment-field-group">
            <label htmlFor={`assignment-reason-${shipmentId}`}>
              Assignment reason
              <textarea
                id={`assignment-reason-${shipmentId}`}
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={event => setReason(event.target.value)}
                placeholder="Record why this pair was selected or changed."
              />
            </label>
            <div className="assignment-char-count">
              {reason.trim().length} / 1000 characters (min. 5)
            </div>
          </div>

          {currentPair && (
            <div role="alert" className="assignment-warning shipment-dialog-alert is-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Choose a different driver or truck for reassignment.</span>
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary assignment-submit-btn" disabled={!canSave}>
          {busy ? (
            <svg className="shipment-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : options.current ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
          <span>{busy ? 'Saving…' : options.current ? 'Reassign before trip' : 'Assign driver and truck'}</span>
        </button>
      </form>
    )}
  </section>;
}
