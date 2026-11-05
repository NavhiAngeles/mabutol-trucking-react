import test from 'node:test';
import assert from 'node:assert/strict';
import { tollQuote, sameTollQuote, withBookingPricing } from './tollPricing.js';
const rates = [
  { id: 'a', highway: 'NLEX', gate_name: 'Entry → Exit', vehicle_class: 'Class 2', fee: '123.45' },
  { id: 'b', highway: 'SKYWAY', gate_name: 'Entry → Exit', vehicle_class: 'Class 2', fee: '200.10' },
  { id: 'c', highway: 'NLEX', gate_name: 'Entry → Exit', vehicle_class: 'Class 3', fee: '400' },
];
test('toll-free routing clears charges; toll routes require actual class and applicable configured rates', () => {
  assert.deepEqual(tollQuote(false, '', ['a'], rates), { total: 0, rates: [] });
  assert.throws(() => tollQuote(true, '', ['a'], rates), /actual truck toll class/);
  assert.throws(() => tollQuote(true, 'Class 2', [], rates), /entry–exit/);
  for (const ids of [['missing'], ['c'], ['a', 'a']]) assert.throws(() => tollQuote(true, 'Class 2', ids, rates));
  for (const fee of [null, '', -1, 'bad', Infinity]) assert.throws(() => tollQuote(true, 'Class 2', ['a'], [{ ...rates[0], fee }]));
});
test('multiple highway charges add once in centavos; changed, removed or reclassified rates require review', () => {
  const quote = tollQuote(true, 'Class 2', ['a', 'b'], rates);
  assert.equal(quote.total, 323.55);
  assert.equal(sameTollQuote(quote, tollQuote(true, 'Class 2', ['a', 'b'], rates)), true);
  assert.equal(sameTollQuote(quote, tollQuote(true, 'Class 2', ['a', 'b'], [{ ...rates[0], fee: 124 }, rates[1]])), false);
  assert.throws(() => tollQuote(true, 'Class 2', ['a', 'b'], [rates[0]]));
});
test('persisted route keeps named/classed fee snapshot even after Pricing changes', () => {
  const geometry = { type: 'FeatureCollection', features: [] };
  const quote = tollQuote(true, 'Class 2', ['a'], rates);
  const saved = withBookingPricing(geometry, true, quote);
  assert.equal(saved.booking_pricing.toll_amount, 123.45);
  assert.equal(saved.booking_pricing.toll_rates[0].gate_name, 'Entry → Exit');
  assert.equal(saved.booking_pricing.toll_preference, 'expressway');
  assert.equal(geometry.booking_pricing, undefined);
});
