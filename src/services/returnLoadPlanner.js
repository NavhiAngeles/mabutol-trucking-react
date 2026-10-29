const number = value => value === null || value === undefined || String(value).trim() === '' ? NaN : Number(value);
const timestamp = value => value ? Date.parse(value) : NaN;
const active = new Set(['assigned', 'loading', 'in_transit']);

export function coordinates(row, prefix) {
  const lat = number(row?.[`${prefix}_lat`]), lng = number(row?.[`${prefix}_lng`]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function outboundOptions({ shipments, deliveries }) {
  const byId = new Map(shipments.map(row => [row.id, row]));
  return deliveries.filter(row => active.has(row.status) || row.status === 'delivered')
    .filter(row => byId.has(row.shipment_id) && !['cancelled', 'pending', 'booked'].includes(byId.get(row.shipment_id).status))
    .map(delivery => ({ delivery, shipment: byId.get(delivery.shipment_id) }));
}

/** Office decision support only: no reservations, dispatch, road feasibility or fuel-saving claim. */
export function planReturnLoads(data, deliveryId, { readyAt, maxPickupKm = 50, maxWaitHours = 24, now = Date.now() } = {}) {
  const selected = outboundOptions(data).find(row => row.delivery.id === deliveryId);
  const blocked = message => ({ error: message, matches: [], excluded: {} });
  if (!selected) return blocked('Select an outbound delivery that is still available.');
  const { delivery, shipment } = selected;
  if (!delivery.driver_id) return blocked('The outbound delivery needs an assigned driver before planning.');
  const home = coordinates(shipment, 'pickup'), end = coordinates(shipment, 'dropoff');
  if (!home || !end) return blocked('The outbound trip needs recorded pickup and destination coordinates.');
  const truck = data.trucks.find(row => row.id === delivery.truck_id);
  if (!truck?.vehicle_type_id || !Number.isFinite(number(truck.capacity_kg)) || !(number(truck.capacity_kg) > 0)) return blocked('The assigned truck needs a recorded vehicle type and positive capacity.');
  if (!['available', 'on_trip'].includes(truck.status) || data.maintenance.some(row => row.truck_id === truck.id && row.status === 'in_progress')) return blocked('The truck is unavailable or under maintenance.');
  if (data.deliveries.some(row => row.id !== delivery.id && active.has(row.status) && (row.truck_id === delivery.truck_id || row.driver_id === delivery.driver_id))) return blocked('The truck or driver has another active delivery. Refresh and review assignments.');
  const ready = timestamp(readyAt), earliest = timestamp(shipment.actual_delivery_at || shipment.estimated_arrival);
  const radius = number(maxPickupKm), hours = number(maxWaitHours);
  if (!Number.isFinite(ready) || ready < now || (Number.isFinite(earliest) && ready < earliest)) return blocked('Enter an unload-ready time at or after now and the recorded outbound arrival.');
  if (!(radius >= 1 && radius <= 500 && hours >= 1 && hours <= 168)) return blocked('Use a pickup radius of 1–500 km and a waiting window of 1–168 hours.');
  const occupied = new Set(data.deliveries.filter(row => row.status !== 'cancelled').map(row => row.shipment_id));
  const excluded = {}, matches = [];
  const exclude = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  const baseline = distanceKm(end, home);
  for (const candidate of data.shipments) {
    if (candidate.id === shipment.id || candidate.status !== 'booked') continue;
    if (occupied.has(candidate.id)) { exclude('Already assigned'); continue; }
    if (!candidate.requested_vehicle_type_id || candidate.requested_vehicle_type_id !== truck.vehicle_type_id || !(number(candidate.weight_kg) > 0) || number(candidate.weight_kg) > number(truck.capacity_kg)) { exclude('Vehicle type or recorded capacity mismatch'); continue; }
    const pickup = coordinates(candidate, 'pickup'), dropoff = coordinates(candidate, 'dropoff');
    if (!pickup || !dropoff) { exclude('Missing or invalid coordinates'); continue; }
    const departure = timestamp(candidate.scheduled_departure);
    if (!Number.isFinite(departure) || departure < ready || departure > ready + hours * 3600000) { exclude('Outside ready time / waiting window'); continue; }
    const pickupKm = distanceKm(end, pickup), homeKm = distanceKm(dropoff, home);
    const emptyKm = pickupKm + homeKm, reductionKm = baseline - emptyKm;
    if (pickupKm > radius || reductionKm <= 0 || homeKm >= baseline) { exclude('Outside pickup radius or no empty-distance improvement'); continue; }
    matches.push({ shipment: candidate, pickupKm, homeKm, emptyKm, reductionKm, waitHours: (departure - ready) / 3600000 });
  }
  matches.sort((a, b) => b.reductionKm - a.reductionKm || a.pickupKm - b.pickupKm || timestamp(a.shipment.scheduled_departure) - timestamp(b.shipment.scheduled_departure) || String(a.shipment.id).localeCompare(String(b.shipment.id)));
  return { matches, excluded, baseline, truck, shipment, delivery, readyAt };
}
