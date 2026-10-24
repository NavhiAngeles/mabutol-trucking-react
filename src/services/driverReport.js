import { manilaDate } from './dashboardAnalytics.js';

export const DRIVER_STATUSES = ['available', 'on_trip', 'off_duty', 'on_leave', 'inactive'];
const validTime = value => !!value && Number.isFinite(Date.parse(value));
const inRange = (value, range) => {
  const date = validTime(value) && manilaDate(value);
  return date && date >= range.start && date <= range.end;
};
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const label = value => String(value || 'other').replaceAll('_', ' ');

export function buildDriverReport(records, range, search = '', status = 'all') {
  const query = search.trim().toLowerCase();
  const drivers = records.drivers.filter(d => (status === 'all' || d.status === status) &&
    (!query || [d.id, d.full_name].some(value => String(value || '').toLowerCase().includes(query))));
  const selected = new Set(drivers.map(d => d.id));
  const knownDrivers = new Set(records.drivers.map(d => d.id));
  const shipments = new Map(records.shipments.map(s => [s.id, s]));
  const deliveries = [...new Map(records.deliveries.map(d => [d.id, d])).values()];
  const deliveryById = new Map(deliveries.map(d => [d.id, d]));
  const tripsByDriver = new Map();
  for (const d of deliveries) {
    const shipment = shipments.get(d.shipment_id);
    if (!selected.has(d.driver_id) || d.status === 'cancelled' || !shipment || !inRange(shipment.created_at, range)) continue;
    if (!tripsByDriver.has(d.driver_id)) tripsByDriver.set(d.driver_id, []);
    tripsByDriver.get(d.driver_id).push(d);
  }
  const incidentsByDriver = new Map();
  let unattributedIncidents = 0;
  for (const incident of new Map(records.incidents.map(i => [i.id, i])).values()) {
    if (!inRange(incident.created_at, range)) continue;
    const delivery = deliveryById.get(incident.delivery_id);
    // The reporting user and current vehicle assignment do not identify the trip driver.
    const driverId = delivery && (!incident.shipment_id || incident.shipment_id === delivery.shipment_id) ? delivery.driver_id : null;
    if (!knownDrivers.has(driverId)) { unattributedIncidents++; continue; }
    if (!selected.has(driverId)) continue;
    if (!incidentsByDriver.has(driverId)) incidentsByDriver.set(driverId, []);
    incidentsByDriver.get(driverId).push({ ...incident, shipmentId: delivery.shipment_id });
  }
  const rows = drivers.map(driver => {
    const trips = tripsByDriver.get(driver.id) || [];
    const completed = trips.filter(d => d.status === 'delivered');
    const timed = completed.filter(d => validTime(d.arrived_at) && validTime(shipments.get(d.shipment_id)?.estimated_arrival));
    const onTime = timed.filter(d => Date.parse(d.arrived_at) <= Date.parse(shipments.get(d.shipment_id).estimated_arrival)).length;
    const distances = completed.map(d => {
      const start = number(d.odometer_start), end = number(d.odometer_end);
      return start != null && end != null && start >= 0 && end >= start ? end - start : null;
    }).filter(value => value != null);
    const incidents = (incidentsByDriver.get(driver.id) || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id)));
    return { id: driver.id, name: driver.full_name || 'Unnamed driver', status: driver.status || 'unknown',
      trips: trips.length, completed: completed.length, timed: timed.length, onTime,
      rate: timed.length ? Math.round(onTime / timed.length * 1000) / 10 : null,
      km: distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      measuredTrips: distances.length, incidents };
  }).sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
  const timed = rows.reduce((sum, row) => sum + row.timed, 0);
  const onTime = rows.reduce((sum, row) => sum + row.onTime, 0);
  const categories = new Map();
  for (const row of rows) for (const incident of row.incidents) {
    const category = label(incident.category);
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  return { rows, totalTrips: rows.reduce((sum, row) => sum + row.trips, 0), driversWithTrips: rows.filter(r => r.trips).length,
    rate: timed ? Math.round(onTime / timed * 1000) / 10 : null, timed, unattributedIncidents,
    driverRates: rows.filter(r => r.rate != null).sort((a, b) => b.rate - a.rate || b.timed - a.timed || a.name.localeCompare(b.name)).slice(0, 5),
    incidents: [...categories].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) };
}
