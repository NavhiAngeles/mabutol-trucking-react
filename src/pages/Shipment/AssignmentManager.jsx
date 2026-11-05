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
  const drivers = options?.drivers.filter(row => row.eligible && (!truckId || !options.trucks.find(truck => truck.id === truckId)?.assigned_driver_id ||
    options.trucks.find(truck => truck.id === truckId)?.assigned_driver_id === row.id)) || [];
  const trucks = options?.trucks.filter(row => row.eligible && (!driverId || !row.assigned_driver_id || row.assigned_driver_id === driverId)) || [];
  const currentPair = options?.current && driverId === options.current.driver_id && truckId === options.current.truck_id;
  const canSave = driverId && truckId && reason.trim().length >= 5 && reason.trim().length <= 1000 && !currentPair && !busy;
  const excluded = useMemo(() => ({
    drivers: options?.drivers.filter(row => !row.eligible).length || 0,
    trucks: options?.trucks.filter(row => !row.eligible).length || 0,
  }), [options]);
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
        <option value="">Choose an eligible driver</option>
        {drivers.map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}
      </select></label>
      <label>Truck<select value={truckId} onChange={event => setTruckId(event.target.value)} disabled={busy}>
        <option value="">Choose an eligible truck</option>
        {trucks.map(row => <option key={row.id} value={row.id}>{row.plate_number} · {Number(row.capacity_kg).toLocaleString()} kg</option>)}
      </select></label>
      {(!drivers.length || !trucks.length) && <p role="status">No eligible pair is currently available. Review Fleet availability, maintenance, reservations and Compliance. Excluded: {excluded.drivers} driver(s), {excluded.trucks} truck(s).</p>}
      <label>Assignment reason<textarea value={reason} maxLength={1000} disabled={busy}
        onChange={event => setReason(event.target.value)} placeholder="Record why this pair was selected or changed." /></label>
      {currentPair && <p role="alert">Choose a different driver or truck for reassignment.</p>}
      <button type="submit" disabled={!canSave}>{busy ? 'Saving…' : options.current ? 'Reassign before trip' : 'Assign driver and truck'}</button>
    </form>}
  </section>;
}
