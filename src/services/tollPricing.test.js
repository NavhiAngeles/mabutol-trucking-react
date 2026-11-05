import test from 'node:test';
import assert from 'node:assert/strict';
import { tollQuote, sameTollQuote, withBookingPricing, automaticTollQuote, vehicleTollClass } from './tollPricing.js';
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

const autoGeometry = { features: [{ properties: { expressway: { verified: true, sections: [
  { highway: 'NLEX', entry: [120.95, 14.8], exit: [121, 14.7] },
  { highway: 'SKYWAY', entry: [121, 14.7], exit: [121.01, 14.6] },
] } } }] };
const autoRates = [
  { id: 'n2', highway: 'NLEX', gate_name: 'Confirmed NLEX stretch', vehicle_class: 'Class 2', fee: 250, entry_lat: 14.8, entry_lng: 120.95, exit_lat: 14.7, exit_lng: 121 },
  { id: 's2', highway: 'SKYWAY', gate_name: 'Confirmed Skyway stretch', vehicle_class: 'Class 2', fee: 400, entry_lat: 14.7, entry_lng: 121, exit_lat: 14.6, exit_lng: 121.01 },
];
test('automatically takes class from selected vehicle and matches both ends of each expressway', () => {
  const quote = automaticTollQuote(true, { toll_class: 'Class 2' }, autoGeometry, autoRates);
  assert.equal(quote.total, 650); assert.equal(quote.vehicleClass, 'Class 2');
  assert.deepEqual(quote.rates.map(row => row.id), ['n2', 's2']);
  assert.equal(vehicleTollClass({ name: 'Heavy Truck', default_capacity_kg: 10000 }), null);
  assert.throws(() => automaticTollQuote(true, {}, autoGeometry, autoRates), /saved toll class/);
});
test('changing the truck class recomputes fees without carrying prior manual selections', () => {
  const third = autoRates.map(row => ({ ...row, id: row.id + '-3', vehicle_class: 'Class 3', fee: row.fee * 2 }));
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, autoGeometry, [...autoRates, ...third]).total, 1300);
  assert.equal(automaticTollQuote(false, null, null, []).total, 0);
});
test('highway-only and unmapped PDF presets cannot charge a full expressway fare for a shorter trip', () => {
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, autoGeometry, autoRates.map(row => ({ ...row, entry_lat: null }))), /entry and exit/);
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, autoGeometry, autoRates.map(row => ({ ...row, exit_lat: row.exit_lat - 0.1 }))), /entry and exit/);
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, autoGeometry, [autoRates[0]]), /SKYWAY/);
});
test('reverse travel requires explicit bidirectional tariff confirmation and duplicate matches fail closed', () => {
  const reverse = { features: [{ properties: { expressway: { verified: true, sections: [{ highway: 'NLEX', entry: [121,14.7], exit: [120.95,14.8] }] } } }] };
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, reverse, autoRates), /entry and exit/);
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, reverse, [{ ...autoRates[0], bidirectional: true }]).total, 250);
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, autoGeometry, [...autoRates, { ...autoRates[0], id: 'duplicate' }]), /Multiple rates/);
});
test('unidentified sections and outdated route metadata cannot produce a guessed quote', () => {
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, {}, autoRates), /Recalculate/);
  const unknown = structuredClone(autoGeometry); unknown.features[0].properties.expressway.sections[0].highway = 'UNKNOWN';
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, unknown, autoRates), /could not be identified/);
});
