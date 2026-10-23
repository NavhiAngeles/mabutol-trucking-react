import { dispatchReadyIds } from './operationalStats.js';

export const manilaDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
};
export function complianceState(doc, now = Date.now()) {
  if (!doc) return 'missing';
  if (doc.review_status === 'rejected') return 'rejected';
  const today = manilaDate(now);
  if (doc.expiry_date && doc.expiry_date < today) return 'expired';
  const cutoff = manilaDate(now + 30 * 86400000);
  if (doc.expiry_date && doc.expiry_date <= cutoff) return 'expiring_soon';
  return doc.review_status === 'approved' ? 'valid' : 'pending_review';
}
export function latestDocuments(docs) {
  const latest = new Map();
  for (const doc of docs) {
    const key = [doc.truck_id || doc.driver_id, doc.doc_type, doc.remarks?.startsWith('OR copy') ? 'or' : doc.remarks?.startsWith('CR copy') ? 'cr' : ''].join(':');
    if (!latest.has(key) || doc.created_at > latest.get(key).created_at) latest.set(key, doc);
  }
  return [...latest.values()];
}
export function calculateDashboardAnalytics(shipments, trucks, deliveries, maintenance, docs, now = Date.now()) {
  const today = manilaDate(now);
  const trends = Array.from({ length: 7 }, (_, index) => {
    const instant = now - (6 - index) * 86400000;
    const date = manilaDate(instant);
    return { date, day: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Asia/Manila' }).format(instant),
      value: shipments.filter(s => manilaDate(s.created_at) === date).length };
  });
  const completed = shipments.filter(s => s.status === 'completed');
  const timed = completed.filter(s => s.actual_delivery_at && s.estimated_arrival && Number.isFinite(Date.parse(s.actual_delivery_at)) && Number.isFinite(Date.parse(s.estimated_arrival)));
  const busy = new Set(deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status)).map(d => d.truck_id));
  const servicing = new Set(maintenance.filter(m => m.status === 'in_progress').map(m => m.truck_id));
  const ready = new Set(dispatchReadyIds(trucks, deliveries, maintenance));
  const resources = { available: ready.size, inUse: 0, maintenance: 0, other: 0, total: trucks.length };
  for (const truck of trucks) {
    if (ready.has(truck.id)) continue;
    if (truck.status === 'maintenance' || servicing.has(truck.id)) resources.maintenance++;
    else if (truck.status === 'on_trip' || busy.has(truck.id)) resources.inUse++;
    else resources.other++;
  }
  const compliance = { expiring: 0, expired: 0, review: 0 };
  for (const doc of latestDocuments(docs)) {
    const state = complianceState(doc, now);
    if (state === 'expired') compliance.expired++;
    if (state === 'expiring_soon') compliance.expiring++;
    if (doc.review_status === 'pending_review') compliance.review++;
  }
  const durations = deliveries.filter(d => d.status === 'delivered' && d.departed_at && d.arrived_at)
    .map(d => (Date.parse(d.arrived_at) - Date.parse(d.departed_at)) / 3600000).filter(h => Number.isFinite(h) && h >= 0);
  const alerts = [];
  const delayed = shipments.filter(s => s.status === 'delayed');
  if (delayed.length) alerts.push({ id: 'delays', color: 'red', title: 'Delayed shipments', body: delayed.length + ' shipment(s) need attention.', path: '/shipment?tab=delayed', action: 'View shipments' });
  if (compliance.expired || compliance.expiring || compliance.review) alerts.push({ id: 'compliance', color: 'orange', title: 'Compliance attention', body: compliance.expired + ' expired · ' + compliance.expiring + ' expiring within 30 days · ' + compliance.review + ' awaiting review', path: '/fleet?view=compliance', action: 'View compliance' });
  const pending = shipments.filter(s => s.status === 'pending');
  if (pending.length) alerts.push({ id: 'bookings', color: 'blue', title: 'Booking requests', body: pending.length + ' booking(s) pending review.', path: '/shipment?tab=all&status=pending', action: 'Review bookings' });
  const overdue = maintenance.filter(m => m.status === 'scheduled' && m.scheduled_date < today);
  if (overdue.length) alerts.push({ id: 'maintenance', color: 'orange', title: 'Overdue maintenance', body: overdue.length + ' scheduled service(s) are overdue.', path: '/fleet?view=maintenance', action: 'View maintenance' });
  return { trends, resources, compliance, alerts, completedToday: completed.filter(s => manilaDate(s.actual_delivery_at) === today).length,
    onTimeRate: timed.length ? Math.round(timed.filter(s => Date.parse(s.actual_delivery_at) <= Date.parse(s.estimated_arrival)).length / timed.length * 1000) / 10 : null,
    timedDeliveries: timed.length, averageTripHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null };
}
export function latestTracking(rows, deliveries, now = Date.now()) {
  const active = new Set(deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status)).map(d => d.id));
  const latest = new Map();
  for (const row of rows) {
    const lat = Number(row.latitude), lng = Number(row.longitude), time = Date.parse(row.recorded_at);
    if (!active.has(row.delivery_id) || row.latitude == null || row.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isFinite(time) || time > now) continue;
    if (!latest.has(row.truck_id) || time > Date.parse(latest.get(row.truck_id).recorded_at)) latest.set(row.truck_id, { ...row, latitude: lat, longitude: lng, stale: now - time > 5 * 60000 });
  }
  return [...latest.values()];
}
