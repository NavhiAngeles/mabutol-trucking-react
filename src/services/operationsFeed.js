export const EVENT_STATUSES = ['pending', 'booked', 'assigned', 'loading', 'in_transit', 'delayed', 'completed', 'cancelled', 'review'];
const STATUS_EVENTS = {
  pending: ['Booking submitted', 'navy'], booked: ['Booking confirmed', 'navy'],
  assigned: ['Assigned', 'blue'], loading: ['Loading started', 'blue'],
  in_transit: ['Departed', 'blue'], delayed: ['Delayed', 'red'],
  completed: ['Completed', 'green'], cancelled: ['Cancelled', 'red'], review: ['Review requested', 'navy'],
};
export const SOURCE_RANK = { history: 2, incident: 1, audit: 0 };

// Preserve PostgreSQL microseconds for stable ordering at equal millisecond timestamps.
export function timestampKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const fraction = /\.(\d+)/.exec(value)?.[1] || '';
  return `${new Date(time).toISOString().slice(0, 19)}.${fraction.padEnd(6, '0').slice(0, 6)}Z`;
}
export function compareEvents(a, b) {
  const time = timestampKey(b.created_at).localeCompare(timestampKey(a.created_at));
  if (time) return time;
  const source = SOURCE_RANK[b.source] - SOURCE_RANK[a.source];
  if (source) return source;
  if (a.source !== 'incident') return BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0;
  return String(b.id).localeCompare(String(a.id));
}
export function relativeEventTime(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Time unavailable';
  if (time > now + 60000) return 'Timestamp is in the future';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
export function absoluteEventTime(value) {
  return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) : 'Time unavailable';
}
export function mapOperationEvent(source, row, shipment = null) {
  let [label, color] = source === 'history' ? STATUS_EVENTS[row.to_status] || ['Status changed', 'navy']
    : source === 'incident' ? ['Incident reported', 'red'] : ['Shipment removed', 'navy'];
  if (source === 'history' && row.from_status === null) {
    // Imported records can begin in transit/completed. Their initial status is not evidence of departure/delivery at creation.
    label = row.to_status === 'booked' ? 'New booking' : row.to_status === 'pending' ? 'Booking submitted'
      : `Recorded ${String(row.to_status || 'unknown').replaceAll('_', ' ')}`;
  }
  const shipmentId = source === 'audit' ? row.entity_id : row.shipment_id;
  return {
    key: `${source}:${row.id}`, id: String(row.id), source, created_at: row.created_at,
    label, color, shipmentId, title: `${label}: ${shipment?.tracking_number || 'Shipment unavailable'}`,
    customer: shipment?.customer?.name || 'Customer unavailable',
    description: source === 'incident' ? String(row.category || 'Unspecified incident').replaceAll('_', ' ')
      : source === 'audit' ? 'The shipment record was removed.'
      : [shipment?.pickup_address || 'Pickup unavailable', shipment?.dropoff_address || 'Destination unavailable'].join(' → '),
    // Details is currently a placeholder. Open an exact-ID filter across all shipment statuses instead.
    href: shipment && source !== 'audit' ? `/shipment?tab=all&record=${encodeURIComponent(shipmentId)}` : null,
  };
}
