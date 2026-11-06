export const THRESHOLD_FIELDS = [
  ['drivers_license', "Driver’s License", 60, 15],
  ['medical_certificate', 'Medical Certificate', 45, 10],
  ['nbi_clearance', 'NBI Clearance', 30, 7],
  ['lto_registration', 'OR/CR', 45, 15],
  ['insurance', 'Insurance', 60, 15],
  ['franchise_permit', 'LTFRB Permit', 60, 15],
  ['emission_test', 'Emission Test', 21, 7],
  ['maintenance', 'Maintenance Due', 14, 3],
];
export const DEFAULT_THRESHOLDS = Object.fromEntries(THRESHOLD_FIELDS.map(([key, , first, critical]) => [key, { first, critical }]));

export function validateThresholds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== THRESHOLD_FIELDS.length) throw new Error('All eight compliance thresholds are required.');
  return Object.fromEntries(THRESHOLD_FIELDS.map(([key, label]) => {
    const rule = value[key];
    if (!rule || !Number.isInteger(rule.first) || !Number.isInteger(rule.critical) || rule.critical < 0 || rule.first > 365 || rule.first <= rule.critical) {
      throw new Error(`${label}: use whole days from 0 to 365, with First Alert greater than Critical Alert.`);
    }
    return [key, { first: rule.first, critical: rule.critical }];
  }));
}

export const MANILA_TIMEZONE = 'Asia/Manila';

// Normalizes calendar date strings, ISO timestamps or Date objects to 'YYYY-MM-DD' in Asia/Manila.
export function normalizeManilaDate(value) {
  if (!value && value !== 0) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const time = Date.parse(trimmed + 'T00:00:00Z');
      if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== trimmed) return null;
      return trimmed;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Calendar dates are evaluated on Asia/Manila (UTC+08:00) calendar day boundaries.
// A document expiring on the current Philippine calendar date has daysUntil = 0 throughout that day
// (morning through evening), remaining valid/critical until midnight passes into the next day (-1).
export function daysUntil(date, now = Date.now()) {
  const targetDate = normalizeManilaDate(date);
  if (!targetDate) return null;
  const today = normalizeManilaDate(now);
  if (!today) return null;
  const targetTime = Date.parse(targetDate + 'T00:00:00Z');
  const todayTime = Date.parse(today + 'T00:00:00Z');
  return Math.round((targetTime - todayTime) / 86400000);
}

export function thresholdState(date, type, configuration = null, now = Date.now()) {
  const days = daysUntil(date, now);
  if (days === null) return 'valid';
  if (days < 0) return 'expired';
  const rule = configuration?.thresholds?.[type];
  if (rule && days <= rule.critical) return 'critical';
  return days <= (rule?.first ?? configuration?.legacyDays ?? 30) ? 'expiring_soon' : 'valid';
}
