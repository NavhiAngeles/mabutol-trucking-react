import { useEffect, useMemo, useState } from 'react';
import { fetchAssignmentOptions, saveManualAssignment } from '../../services/assignmentService';

export default function AssignmentManager({ shipmentId, onChanged }) {
  const [options, setOptions] = useState(null);
  const [driverId, setDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    fetchAssignmentOptions(shipmentId).then(result => { if (active) setOptions(result); })
      .catch(err => { if (active) setError(err.message || 'Could not load assignment options.'); });
    return () => { active = false; };
  }, [shipmentId, revision]);
  const currentDriverId = options?.current?.driver_id;
  const currentTruckId = options?.current?.truck_id;
  const shipmentWeight = Number(options?.shipment?.weight_kg || 0);
  const requestedVehicleTypeId = options?.shipment?.requested_vehicle_type_id;

  const drivers = useMemo(() => options?.drivers.filter(row =>
    row.status === 'available' || (row.status === undefined ? Boolean(row.eligible) : row.eligible || row.id === currentDriverId)
  ) || [], [options?.drivers, currentDriverId]);

  const trucks = useMemo(() => options?.trucks.filter(row => {
    const isAvailable = row.status === 'available' || (row.status === undefined ? Boolean(row.eligible) : row.eligible || row.id === currentTruckId);
    if (!isAvailable) return false;
    if (shipmentWeight > 0) {
      const cap = Number(row.capacity_kg);
      if (!(cap > 0) || cap < shipmentWeight) return false;
    }
    if (row.reason === 'Insufficient recorded capacity') return false;
    if (requestedVehicleTypeId && row.vehicle_type_id && row.vehicle_type_id !== requestedVehicleTypeId) return false;
    if (row.reason === 'Vehicle type mismatch') return false;
    return true;
  }) || [], [options?.trucks, currentTruckId, shipmentWeight, requestedVehicleTypeId]);

  const currentPair = options?.current && driverId === options.current.driver_id && truckId === options.current.truck_id;
  const canSave = driverId && truckId && reason.trim().length >= 5 && reason.trim().length <= 1000 && !currentPair && !busy;
  const excluded = useMemo(() => ({
    drivers: Math.max(0, (options?.drivers?.length || 0) - drivers.length),
    trucks: Math.max(0, (options?.trucks?.length || 0) - trucks.length),
  }), [options?.drivers, options?.trucks, drivers.length, trucks.length]);
  const selectedDriver = drivers.find(d => d.id === driverId);
  const selectedTruck = trucks.find(t => t.id === truckId);
  const submit = async event => {
    event.preventDefault(); if (!canSave) return;
    setBusy(true); setError('');
    try {
      await saveManualAssignment({ shipmentId, driverId, truckId, reason, expectedDelivery: options.current?.id || null });
      await onChanged();
    } catch (err) { setError(err.message || 'Could not save assignment. Reload and try again.'); }
    finally { setBusy(false); }
  };
  return <section className="assignment-manager" aria-labelledby="assignment-manager-title">
    <h3 id="assignment-manager-title">Office assignment</h3>
    {!options && !error && <p role="status">Loading eligible drivers and trucks…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setOptions(null); setRevision(value => value + 1); }}>Retry</button></p>}
    {options?.blockedReason && <p className="assignment-blocked" role="status">{options.blockedReason}</p>}
    {options && !options.blockedReason && <form onSubmit={submit}>
      <p>{options.current ? 'Reassignment is allowed only before pickup or route activity begins.' : 'Select the driver and truck for this booked shipment.'}</p>
      <label>Driver<select value={driverId} onChange={event => setDriverId(event.target.value)} disabled={busy}>
        <option value="">Choose a driver</option>
        {drivers.map(row => (
          <option key={row.id} value={row.id}>
            {row.full_name}{options?.current?.driver_id === row.id ? ' (Current)' : ''}{!row.eligible && row.reason ? ` (${row.reason})` : ''}
          </option>
        ))}
      </select></label>
      {selectedDriver && !selectedDriver.eligible && selectedDriver.reason && (
        <p className="assignment-warning" role="status">
          <strong>Driver note:</strong> {selectedDriver.reason}
        </p>
      )}
      <label>Truck{shipmentWeight > 0 ? ` (min. ${shipmentWeight.toLocaleString()} kg capacity)` : ''}
        <select value={truckId} onChange={event => setTruckId(event.target.value)} disabled={busy}>
        <option value="">Choose a truck</option>
        {trucks.map(row => (
          <option key={row.id} value={row.id}>
            {row.plate_number}{row.capacity_kg ? ` · ${Number(row.capacity_kg).toLocaleString()} kg` : ''}{options?.current?.truck_id === row.id ? ' (Current)' : ''}{!row.eligible && row.reason ? ` (${row.reason})` : ''}
          </option>
        ))}
      </select></label>
      {selectedTruck && !selectedTruck.eligible && selectedTruck.reason && (
        <p className="assignment-warning" role="status">
          <strong>Truck note:</strong> {selectedTruck.reason}
        </p>
      )}
      {(!drivers.length || !trucks.length) && <p role="status">No eligible pair is currently available. Review Fleet availability, maintenance, reservations and Compliance. Excluded: {excluded.drivers} driver(s), {excluded.trucks} truck(s).</p>}
      <label>Assignment reason<textarea value={reason} maxLength={1000} disabled={busy}
        onChange={event => setReason(event.target.value)} placeholder="Record why this pair was selected or changed." /></label>
      {currentPair && <p role="alert">Choose a different driver or truck for reassignment.</p>}
      <button type="submit" disabled={!canSave}>{busy ? 'Saving…' : options.current ? 'Reassign before trip' : 'Assign driver and truck'}</button>
    </form>}
  </section>;
}
