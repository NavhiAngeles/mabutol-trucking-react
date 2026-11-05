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
