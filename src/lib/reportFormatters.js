export const REPORT_PRESET_RANGES = [
  ['today', 'Today'],
  ['thisWeek', 'This Week'],
  ['thisMonth', 'This Month'],
  ['last3Months', 'Last 3 Months'],
];

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
});

const phpCompactFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const shortDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
});

const manilaDateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Format a numeric value as Philippine Peso (en-PH).
 */
export function formatPhp(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  return phpFormatter.format(Number(value));
}

/**
 * Format a numeric value as compact Philippine Peso for chart Y-axes.
 */
export function formatCompactPhp(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  if (Number(value) === 0) return '₱0';
  return phpCompactFormatter.format(Number(value));
}

/**
 * Format an ISO YYYY-MM-DD bucket date as a short horizontal axis label (e.g. "Oct 24").
 */
export function formatShortAxisDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const parsed = Date.parse(`${isoDate.slice(0, 10)}T00:00:00+08:00`);
  if (!Number.isFinite(parsed)) return isoDate.slice(5);
  return shortDateFormatter.format(new Date(parsed));
}

/**
 * Format a timestamp in Asia/Manila time with an N/A fallback.
 */
export function formatManilaDateTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'N/A';
  return manilaDateTimeFormatter.format(new Date(value));
}
