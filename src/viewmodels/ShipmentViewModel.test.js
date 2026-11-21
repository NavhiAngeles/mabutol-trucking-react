import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./ShipmentViewModel.js', import.meta.url), 'utf8');
const reviewAgeSource = source.split('export function reviewAgeLabel')[1].split('const matchesSearch')[0];
const scope = vm.createContext({});
vm.runInContext(`function reviewAgeLabel${reviewAgeSource}\nthis.reviewAgeLabel = reviewAgeLabel;`, scope);
const { reviewAgeLabel } = scope;

test('review age uses the controlled clock, ignores missing timestamps and advances predictably', () => {
  const start = Date.parse('2026-11-05T12:00:00Z');
  const rows = [
    { flaggedAt: new Date(start - 86400000) },
    { flaggedAt: new Date(start - 2 * 86400000) },
    { flaggedAt: null },
    {},
  ];
  assert.equal(reviewAgeLabel(rows, start), '1.5 days');
  assert.equal(reviewAgeLabel(rows, start + 86400000), '2.5 days');
  assert.equal(reviewAgeLabel([{ flaggedAt: new Date(start + 60000) }], start), '0.0 days');
});

test('review age is unavailable when no valid stored timestamp exists', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(reviewAgeLabel([], now), 'Unavailable');
  assert.equal(reviewAgeLabel([{ flaggedAt: null }, {}, { flaggedAt: new Date('invalid') }], now), 'Unavailable');
});

test('shipment clock is state-driven and refreshed by a managed timer and focus listener', () => {
  assert.match(source, /useState\(\(\) => Date\.now\(\)\)/);
  assert.match(source, /setInterval\(updateClock, REVIEW_CLOCK_INTERVAL_MS\)/);
  assert.match(source, /window\.addEventListener\('focus', updateClock\)/);
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /window\.removeEventListener\('focus', updateClock\)/);
  const statsBody = source.split('const stats = useMemo(() => {')[1].split('}, [shipments, weeklyTrips, clock]);')[0];
  assert.doesNotMatch(statsBody, /Date\.now/);
  assert.match(statsBody, /reviewAgeLabel\(review, clock\)/);
});

test('driver payment reviews are routed to review tab instead of active tab and reflected in stats', () => {
  const tabBlock = source.split('export const TAB_CONFIG = ')[1].split('const SHIPMENT_PAGE_SIZE')[0];
  const tabScope = vm.createContext({ ACTIVE_STATUSES: ['assigned', 'loading', 'in_transit'] });
  const TAB_CONFIG = vm.runInContext(`(${tabBlock.trim().replace(/;$/, '')})`, tabScope);

  const activeLoading = { dbId: 's1', status: 'loading', rawStatus: 'loading', pendingPaymentReview: false };
  const driverPaymentPending = { dbId: 's2', status: 'loading', rawStatus: 'loading', pendingPaymentReview: true, flaggedAt: new Date('2026-11-04T12:00:00Z') };
  const bookingPending = { dbId: 's3', status: 'pending', rawStatus: 'pending', pendingPaymentReview: false };
  const podReview = { dbId: 's4', status: 'review', rawStatus: 'review', pendingPaymentReview: false };

  const allRows = [activeLoading, driverPaymentPending, bookingPending, podReview];
  assert.deepEqual(allRows.filter(TAB_CONFIG.active.filter).map(r => r.dbId), ['s1']);
  assert.deepEqual(allRows.filter(TAB_CONFIG.review.filter).map(r => r.dbId), ['s2', 's3', 's4']);

  const statsBody = source.split('const stats = useMemo(() => {')[1].split('}, [shipments, weeklyTrips, clock]);')[0];
  const statsScope = vm.createContext({
    shipments: allRows,
    isToday: () => false,
    formatDuration: () => '0m',
    reviewAgeLabel: (rows) => `${rows.length} in review`,
    weeklyTrips: 4,
    clock: Date.parse('2026-11-05T12:00:00Z'),
  });
  const computed = vm.runInContext(`(function(){${statsBody}})()`, statsScope);
  assert.equal(computed.loadingCount, 1);
  assert.equal(computed.transitCount, 0);
  assert.equal(computed.avgReviewAgeLabel, '3 in review');
});
