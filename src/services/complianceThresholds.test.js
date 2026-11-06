import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS, validateThresholds, daysUntil, thresholdState, normalizeManilaDate, MANILA_TIMEZONE } from './complianceThresholds.js';
import { complianceState, calculateDashboardAnalytics } from './dashboardAnalytics.js';
const now = Date.parse('2026-10-23T16:30:00Z'); // Oct 24 in Manila.
const config = { thresholds: DEFAULT_THRESHOLDS, legacyDays: 30 };

test('validates all rules, rejects partial, blank, fractional, reversed and out-of-range input', () => {
  assert.equal(Object.keys(validateThresholds(DEFAULT_THRESHOLDS)).length, 8);
  assert.throws(() => validateThresholds({}));
  for (const rule of [{ first: '', critical: 3 }, { first: 30.5, critical: 3 }, { first: 15, critical: 15 }, { first: 14, critical: 15 }, { first: 366, critical: 3 }, { first: 14, critical: -1 }]) {
    assert.throws(() => validateThresholds({ ...DEFAULT_THRESHOLDS, maintenance: rule }));
  }
});
test('Philippine date boundaries handle midnight, leap days and invalid dates', () => {
  assert.equal(daysUntil('2026-10-24', now), 0);
  assert.equal(daysUntil('2026-10-23', now), -1);
  assert.equal(daysUntil('2026-02-30', now), null);
  assert.equal(daysUntil('2028-02-29', Date.parse('2028-02-28T16:00Z')), 0);
});
test('document-type thresholds include first and critical boundaries with expired precedence', () => {
  assert.equal(thresholdState('2026-12-23', 'drivers_license', config, now), 'expiring_soon'); // 60
  assert.equal(thresholdState('2026-12-24', 'drivers_license', config, now), 'valid');
  assert.equal(thresholdState('2026-11-08', 'drivers_license', config, now), 'critical'); // 15
  assert.equal(thresholdState('2026-11-09', 'drivers_license', config, now), 'expiring_soon');
  assert.equal(thresholdState('2026-10-23', 'drivers_license', config, now), 'expired');
  assert.equal(thresholdState('2026-10-24', 'drivers_license', config, now), 'critical');
});
test('unconfigured behavior retains legacy window and no new critical state', () => {
  assert.equal(thresholdState('2026-10-24', 'drivers_license', null, now), 'expiring_soon');
  assert.equal(thresholdState('2026-11-24', 'drivers_license', null, now), 'valid');
  assert.equal(thresholdState('2026-11-24', 'other', { legacyDays: 45 }, now), 'expiring_soon');
});
test('rejection/expiry/review precedence stays intact; configured insurance also works', () => {
  assert.equal(complianceState({ doc_type: 'drivers_license', expiry_date: '2026-10-25', review_status: 'rejected' }, now, config), 'rejected');
  assert.equal(complianceState({ doc_type: 'insurance', expiry_date: '2026-12-01', review_status: 'approved' }, now, config), 'expiring_soon');
  assert.equal(complianceState({ doc_type: 'insurance', review_status: 'pending_review' }, now, config), 'pending_review');
});
test('Dashboard consumes critical document and maintenance windows without altering resources', () => {
  const docs = [{ id: 'doc', driver_id: 'driver', doc_type: 'drivers_license', review_status: 'approved', expiry_date: '2026-10-25', created_at: '2026-10-01' }];
  const maintenance = [{ status: 'scheduled', scheduled_date: '2026-10-27' }, { status: 'scheduled', scheduled_date: '2026-10-23' }, { status: 'completed', scheduled_date: '2026-10-25' }];
  const result = calculateDashboardAnalytics([], [], [], maintenance, docs, now, config);
  assert.equal(result.compliance.expiring, 1);
  assert.match(result.alerts.find(row => row.id === 'compliance').body, /1 critical/);
  assert.equal(result.alerts.find(row => row.id === 'compliance').color, 'red');
  assert.match(result.alerts.find(row => row.id === 'maintenance-due').body, /1 scheduled.*1 critical/);
  assert.ok(result.alerts.find(row => row.id === 'maintenance'));
  assert.equal(calculateDashboardAnalytics([], [], [], maintenance, docs, now).alerts.some(row => row.id === 'maintenance-due'), false);
});

test('Asia/Manila calendar day boundaries keep documents expiring today valid/critical through end of day (morning vs evening)', () => {
  assert.equal(MANILA_TIMEZONE, 'Asia/Manila');

  // Test target: document expiring on Nov 7, 2026 in Philippine calendar
  const expiryDate = '2026-11-07';

  // 1. Same-day morning timestamps in Asia/Manila (UTC+08:00)
  const morningStart = Date.parse('2026-11-07T00:00:01+08:00'); // Just after midnight
  const morningWork = Date.parse('2026-11-07T08:30:00+08:00');  // 8:30 AM
  const midday = Date.parse('2026-11-07T12:00:00+08:00');        // 12:00 PM

  // 2. Same-day afternoon and late evening timestamps in Asia/Manila (UTC+08:00)
  const afternoon = Date.parse('2026-11-07T17:15:00+08:00');     // 5:15 PM
  const eveningLate = Date.parse('2026-11-07T23:59:59+08:00');   // 11:59:59 PM (1 second before midnight)

  // 3. Next-day timestamps in Asia/Manila
  const nextDayStart = Date.parse('2026-11-08T00:00:01+08:00');  // 1 second into Nov 8

  // Throughout Nov 7 calendar day (morning, midday, afternoon, late evening):
  for (const ts of [morningStart, morningWork, midday, afternoon, eveningLate]) {
    assert.equal(normalizeManilaDate(ts), '2026-11-07');
    assert.equal(daysUntil(expiryDate, ts), 0, `Expected 0 days until expiry at timestamp ${new Date(ts).toISOString()}`);
    // With critical threshold rule (e.g. 15 days for driver's license), 0 <= 15 -> 'critical', NOT 'expired'
    assert.equal(thresholdState(expiryDate, 'drivers_license', config, ts), 'critical');
    // complianceState remains critical, NOT expired
    assert.equal(complianceState({ doc_type: 'drivers_license', expiry_date: expiryDate, review_status: 'approved' }, ts, config), 'critical');
  }

  // Crosses to expired only on the next calendar day in Asia/Manila
  assert.equal(normalizeManilaDate(nextDayStart), '2026-11-08');
  assert.equal(daysUntil(expiryDate, nextDayStart), -1);
  assert.equal(thresholdState(expiryDate, 'drivers_license', config, nextDayStart), 'expired');
  assert.equal(complianceState({ doc_type: 'drivers_license', expiry_date: expiryDate, review_status: 'approved' }, nextDayStart, config), 'expired');
});

test('normalizeManilaDate handles various ISO string, Date object and timestamp formats on Manila boundaries', () => {
  // ISO string with UTC 'Z' (16:00 UTC on Nov 6 is 00:00 UTC+8 on Nov 7 in Manila)
  assert.equal(normalizeManilaDate('2026-11-06T16:00:00Z'), '2026-11-07');
  // ISO string with Manila offset
  assert.equal(normalizeManilaDate('2026-11-07T23:59:59+08:00'), '2026-11-07');
  // Date instance
  assert.equal(normalizeManilaDate(new Date('2026-11-07T08:00:00+08:00')), '2026-11-07');
  // Standard YYYY-MM-DD
  assert.equal(normalizeManilaDate('2026-11-07'), '2026-11-07');
  // Document expiry ISO string evaluated against same-day morning timestamp
  const morning = Date.parse('2026-11-07T08:00:00+08:00');
  assert.equal(daysUntil('2026-11-07T00:00:00Z', morning), 0);
  assert.equal(daysUntil(new Date('2026-11-07T12:00:00+08:00'), morning), 0);
});
