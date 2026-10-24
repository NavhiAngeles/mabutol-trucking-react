import { manilaDate } from './dashboardAnalytics.js';

const DAY = 86400000;
const instant = date => Date.parse(date + 'T00:00:00+08:00');
export function reportRange(key, start, end, now = Date.now()) {
  const today = manilaDate(now);
  let from = today;
  if (key === 'thisWeek') from = manilaDate(instant(today) - ((new Date(today).getUTCDay() + 6) % 7) * DAY);
  if (key === 'thisMonth') from = today.slice(0, 8) + '01';
  if (key === 'last3Months') {
    const date = new Date(today + 'T00:00:00Z');
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 2);
    from = date.toISOString().slice(0, 10);
  }
  if (key === 'custom') {
    if (![start, end].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(instant(d)) && manilaDate(instant(d)) === d) || start > end) throw new Error('Choose a valid start and end date.');
    return { start, end };
  }
  return { start: from, end: today };
}

// Period statistics describe shipments created in the range, using their current status.
// Completed charges are recorded shipment amounts, not cash receipts or net profit.
export function summarizeOverview(rows, range) {
  const shipments = rows.shipments.filter(s => { const d = s.created_at && manilaDate(s.created_at); return d && d >= range.start && d <= range.end; });
  const completed = shipments.filter(s => s.status === 'completed');
  const timed = completed.filter(s => s.actual_delivery_at && s.estimated_arrival && Number.isFinite(Date.parse(s.actual_delivery_at)) && Number.isFinite(Date.parse(s.estimated_arrival)));
  const onTime = s => Date.parse(s.actual_delivery_at) <= Date.parse(s.estimated_arrival);
  const amount = s => s.final_amount != null && Number.isFinite(Number(s.final_amount)) ? Number(s.final_amount) : null;
  const length = Math.round((instant(range.end) - instant(range.start)) / DAY) + 1;
  const step = Math.max(1, Math.ceil(length / 12));
  const buckets = Array.from({ length: Math.ceil(length / step) }, (_, i) => ({ date: manilaDate(instant(range.start) + i * step * DAY), completed: 0, delayed: 0, revenue: 0 }));
  for (const s of shipments) {
    const index = Math.floor((instant(manilaDate(s.created_at)) - instant(range.start)) / DAY / step);
    const bucket = buckets[index];
    if (s.status === 'completed') { bucket.completed++; bucket.revenue += amount(s) ?? 0; }
    if (s.status === 'delayed') bucket.delayed++;
  }
  const assignments = new Map();
  for (const d of [...rows.deliveries].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (!assignments.has(d.shipment_id) || d.status === 'delivered') assignments.set(d.shipment_id, d.driver_id);
  }
  const drivers = rows.drivers.map(driver => {
    const trips = timed.filter(s => assignments.get(s.id) === driver.id);
    return { ...driver, trips: trips.length, pct: trips.length ? Math.round(trips.filter(onTime).length / trips.length * 1000) / 10 : null };
  }).filter(d => d.trips).sort((a, b) => b.pct - a.pct || b.trips - a.trips || a.full_name.localeCompare(b.full_name)).slice(0, 5);
  const compliance = { verified: 0, expiring: 0, attention: 0, pending: 0 };
  for (const row of rows.compliance) {
    const states = row.docs.map(d => d.badge.state);
    if (states.every(s => s === 'valid')) compliance.verified++;
    else if (states.some(s => ['missing', 'expired', 'rejected'].includes(s))) compliance.attention++;
    else if (states.includes('pending_review')) compliance.pending++;
    else compliance.expiring++;
  }
  return { total: shipments.length, completed: completed.length, delayed: shipments.filter(s => s.status === 'delayed').length,
    onTime: timed.length ? Math.round(timed.filter(onTime).length / timed.length * 1000) / 10 : null, timed: timed.length,
    revenue: completed.reduce((sum, s) => sum + (amount(s) ?? 0), 0), missingAmounts: completed.filter(s => amount(s) == null).length,
    buckets, drivers, compliance, complianceTotal: rows.compliance.length };
}
