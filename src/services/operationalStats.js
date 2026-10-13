export const ACTIVE_STATUSES = ['assigned', 'loading', 'in_transit'];
const LIVE_DELIVERIES = ['assigned', 'loading', 'in_transit'];

export function pendingDeparture(shipment, deliveries) {
  return ['booked', 'assigned'].includes(shipment.status) && !deliveries.some(d =>
    d.shipment_id === shipment.id && d.status !== 'cancelled' &&
    (d.departed_at || ['loading', 'in_transit', 'delivered'].includes(d.status)));
}

export function dispatchReadyIds(trucks, deliveries, maintenance) {
  const blocked = new Set(deliveries.filter(d => LIVE_DELIVERIES.includes(d.status)).map(d => d.truck_id));
  const servicing = new Set(maintenance.filter(m => m.status === 'in_progress').map(m => m.truck_id));
  return trucks.filter(t => t.status === 'available' && !blocked.has(t.id) && !servicing.has(t.id)).map(t => t.id);
}

// Manila has no daylight-saving changes: the same local time yesterday is 24 hours ago.
export function historicalCounts(shipments, history, now) {
  const cutoff = now - 86400000;
  let active = 0, delayed = 0;
  for (const s of shipments) {
    const created = Date.parse(s.created_at);
    if (!Number.isFinite(created)) return null;
    if (created > cutoff) continue;
    const events = history.filter(h => h.shipment_id === s.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    // Require an initial status and a continuous, current chain; never infer history from current status.
    if (!events.length || events[0].from_status !== null || Date.parse(events[0].created_at) !== created) return null;
    let status = null, previousTime = -Infinity, atCutoff = null;
    for (const event of events) {
      const time = Date.parse(event.created_at);
      if (!Number.isFinite(time) || time <= previousTime || time > now || event.from_status !== status) return null;
      status = event.to_status;
      previousTime = time;
      if (time <= cutoff) atCutoff = status;
    }
    if (status !== s.status || !atCutoff) return null;
    if (ACTIVE_STATUSES.includes(atCutoff)) active++;
    if (atCutoff === 'delayed') delayed++;
  }
  return { active, delayed };
}

export function calculateOperationalStats(shipments, trucks, deliveries, maintenance, history, now = Date.now()) {
  const activeShipments = shipments.filter(s => ACTIVE_STATUSES.includes(s.status)).length;
  const delayedShipments = shipments.filter(s => s.status === 'delayed').length;
  const pending = shipments.filter(s => pendingDeparture(s, deliveries));
  const previous = history === null ? null : historicalCounts(shipments, history, now);
  return {
    activeShipments, delayedShipments,
    availableTrucks: dispatchReadyIds(trucks, deliveries, maintenance).length,
    pendingDispatch: pending.length,
    awaitingAssignment: pending.filter(s => !deliveries.some(d => d.shipment_id === s.id && d.status === 'assigned' && d.truck_id && d.driver_id)).length,
    awaitingDispatch: pending.filter(s => deliveries.some(d => d.shipment_id === s.id && d.status === 'assigned' && d.truck_id && d.driver_id)).length,
    activeDelta: previous ? activeShipments - previous.active : null,
    delayedDelta: previous ? delayedShipments - previous.delayed : null,
  };
}

export function comparisonLabel(delta) {
  return delta === null ? 'Historical comparison unavailable' : delta === 0 ? 'No change from this time yesterday' : `${delta > 0 ? '+' : ''}${delta} from this time yesterday`;
}
