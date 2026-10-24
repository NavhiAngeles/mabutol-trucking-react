import { manilaDate } from './dashboardAnalytics.js';
import { ACTIVE_STATUSES } from './operationalStats.js';

export const shipmentGroup = status => ACTIVE_STATUSES.includes(status) ? 'active' : ['completed', 'delayed', 'cancelled', 'pending', 'booked'].includes(status) ? status : 'other';
const validTime = value => value && Number.isFinite(Date.parse(value));
export function deliveryVariance(planned, actual) {
  if (!validTime(planned) || !validTime(actual)) return '—';
  const minutes = Math.round((Date.parse(actual) - Date.parse(planned)) / 60000);
  if (!minutes) return '0m';
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${absolute >= 60 ? Math.floor(absolute / 60) + 'h ' : ''}${absolute % 60}m`;
}
export function buildShipmentReport(shipments, deliveries, range, search = '', status = 'all') {
  const query = search.trim().toLowerCase();
  const assignments = new Map();
  const rank = { delivered: 3, in_transit: 2, loading: 2, assigned: 2 };
  for (const d of deliveries) {
    if (d.status === 'cancelled') continue;
    const previous = assignments.get(d.shipment_id);
    if (!previous || (rank[d.status] || 0) > (rank[previous.status] || 0) || ((rank[d.status] || 0) === (rank[previous.status] || 0) && String(d.id) > String(previous.id))) assignments.set(d.shipment_id, d);
  }
  const rows = shipments.filter(s => {
    const date = s.created_at && manilaDate(s.created_at);
    return date && date >= range.start && date <= range.end;
  }).map(s => ({ ...s, group: shipmentGroup(s.status), customerName: s.customer?.name || 'Unavailable customer',
    driverName: assignments.get(s.id)?.driver?.full_name || 'Unassigned',
    route: `${s.pickup_address || 'Unknown pickup'} → ${s.dropoff_address || 'Unknown destination'}`,
    variance: deliveryVariance(s.estimated_arrival, s.actual_delivery_at),
  })).filter(s => (status === 'all' || s.group === status) && (!query || [s.tracking_number, s.customerName, s.route, s.driverName].some(v => String(v || '').toLowerCase().includes(query))))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id)));
  const breakdown = { completed: 0, active: 0, delayed: 0, cancelled: 0, pending: 0, booked: 0, other: 0 };
  rows.forEach(s => breakdown[s.group]++);
  const timed = rows.filter(s => s.status === 'completed' && validTime(s.estimated_arrival) && validTime(s.actual_delivery_at));
  const onTime = s => Date.parse(s.actual_delivery_at) <= Date.parse(s.estimated_arrival);
  const first = Date.parse(range.start + 'T00:00:00+08:00');
  const days = Math.round((Date.parse(range.end + 'T00:00:00+08:00') - first) / 86400000) + 1;
  const step = Math.max(1, Math.ceil(days / 8));
  const trend = Array.from({ length: Math.ceil(days / step) }, (_, i) => {
    const date = manilaDate(first + i * step * 86400000);
    const cohort = timed.filter(s => Math.floor((Date.parse(manilaDate(s.created_at) + 'T00:00:00+08:00') - first) / 86400000 / step) === i);
    return { date, rate: cohort.length ? Math.round(cohort.filter(onTime).length / cohort.length * 1000) / 10 : null, count: cohort.length };
  });
  return { rows, breakdown, total: rows.length, timed: timed.length, rate: timed.length ? Math.round(timed.filter(onTime).length / timed.length * 1000) / 10 : null, trend };
}
