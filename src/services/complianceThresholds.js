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

// Calendar dates are evaluated in Philippine time; no browser-local midnight drift.
export function daysUntil(date, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
  return Math.round((time - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

export function thresholdState(date, type, configuration = null, now = Date.now()) {
  const days = daysUntil(date, now);
  if (days === null) return 'valid';
  if (days < 0) return 'expired';
  const rule = configuration?.thresholds?.[type];
  if (rule && days <= rule.critical) return 'critical';
  return days <= (rule?.first ?? configuration?.legacyDays ?? 30) ? 'expiring_soon' : 'valid';
}
