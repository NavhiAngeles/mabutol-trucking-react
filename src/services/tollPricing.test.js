import test from 'node:test';
import assert from 'node:assert/strict';
import { tollQuote, sameTollQuote, withBookingPricing, automaticTollQuote, vehicleTollClass, VERIFIED_TOLL_PRESETS, rateHighway } from './tollPricing.js';
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

const flatRates = [
  {id:'harbor',highway:'NLEX_HARBOR_LINK',vehicle_class:'Class 2',gate_name:'Standalone Harbor Link',fee:199,pricing_scope:'flat'},
  {id:'connector',highway:'NLEX_CONNECTOR',vehicle_class:'Class 2',gate_name:'Connector fixed system',fee:299,pricing_scope:'flat'},
];
const sectionsGeometry = sections => ({features:[{properties:{expressway:{verified:true,sections}}}]});
const section = highway => ({highway,entry:[120.97,14.68],exit:[120.98,14.64]});
test('fixed Harbor Link and Connector tariffs resolve automatically without invented plaza points', () => {
  const geometry=sectionsGeometry([section('NLEX_HARBOR_LINK'),section('NLEX_CONNECTOR')]);
  const quote=automaticTollQuote(true,{toll_class:'Class 2'},geometry,flatRates);
  assert.equal(quote.total,498);
  assert.equal(quote.rates[0].pricing_scope,'flat');
  const repeated=sectionsGeometry([section('NLEX_CONNECTOR'),section('NLEX_CONNECTOR')]);
  assert.equal(automaticTollQuote(true,{toll_class:'Class 2'},repeated,flatRates).total,299);
  assert.throws(()=>automaticTollQuote(true,{toll_class:'Class 2'},geometry,[...flatRates,{...flatRates[0],id:'duplicate'}]),/Multiple rates/);
});
test('Harbor Link direct mainline transfers do not double-charge the included NLEX open system', () => {
  const nlex={...autoGeometry.features[0].properties.expressway.sections[0]};
  for(const sections of [[nlex,{...section('NLEX_HARBOR_LINK'),connectedToPrevious:true},section('NLEX_CONNECTOR')],
    [section('NLEX_CONNECTOR'),section('NLEX_HARBOR_LINK'),{...nlex,connectedToPrevious:true}]]) {
    assert.equal(automaticTollQuote(true,{toll_class:'Class 2'},sectionsGeometry(sections),[autoRates[0],...flatRates]).total,549);
  }
  // Leaving the motorway and reentering is not an included transfer.
  assert.equal(automaticTollQuote(true,{toll_class:'Class 2'},sectionsGeometry([nlex,section('NLEX_HARBOR_LINK')]),[autoRates[0],...flatRates]).total,449);
});
test('a flat flag cannot turn a distance-based NLEX/Skyway reference into an arbitrary route price', () => {
  assert.throws(()=>automaticTollQuote(true,{toll_class:'Class 2'},autoGeometry,autoRates.map(row=>({...row,pricing_scope:'flat',entry_lat:null}))),/entry and exit/);
});

test('Balagtas/Pulilan to Baguio totals the three exact north Luzon corridor fares', () => {
  const sections = [
    { highway: 'NLEX', entry: [120.858766,14.86245], exit: [120.597682,15.195258] },
    { highway: 'SCTEX', entry: [120.57594,15.200188], exit: [120.678335,15.481536], connectedToPrevious: true },
    { highway: 'TPLEX', entry: [120.678335,15.481536], exit: [120.498208,16.225156], connectedToPrevious: true },
  ];
  const rates = [
    {id:'north-nlex',highway:'NLEX',vehicle_class:'Class 2',gate_name:'Pulilan to Mabiga',fee:595,entry_lat:14.86245,entry_lng:120.858766,exit_lat:15.195258,exit_lng:120.597682,bidirectional:true},
    {id:'north-sctex',highway:'SCTEX',vehicle_class:'Class 2',gate_name:'Mabiga to La Paz',fee:460,entry_lat:15.200188,entry_lng:120.57594,exit_lat:15.481536,exit_lng:120.678335,bidirectional:true},
    {id:'north-tplex',highway:'TPLEX',vehicle_class:'Class 2',gate_name:'La Paz to Rosario',fee:778,entry_lat:15.481536,entry_lng:120.678335,exit_lat:16.225156,exit_lng:120.498208,bidirectional:true},
  ];
  const quote = automaticTollQuote(true,{toll_class:'Class 2'},sectionsGeometry(sections),rates);
  assert.equal(quote.total,1833);
  assert.deepEqual(quote.sections.map(section => section.highway),['NLEX','SCTEX','TPLEX']);
});

test('VERIFIED_TOLL_PRESETS define valid expressway corridors with positive Class 2 and Class 3 tariffs', () => {
  assert.ok(VERIFIED_TOLL_PRESETS.length >= 10);
  for (const preset of VERIFIED_TOLL_PRESETS) {
    assert.ok(preset.gate_name && preset.gate_name.length > 5, `preset gate_name missing: ${JSON.stringify(preset)}`);
    assert.equal(rateHighway(preset.highway), preset.highway, `highway ${preset.highway} not recognized`);
    assert.ok(preset.class2_fee > 0, `class2_fee must be > 0 in ${preset.gate_name}`);
    assert.ok(preset.class3_fee >= preset.class2_fee, `class3_fee must be >= class2_fee in ${preset.gate_name}`);
    if (preset.pricing_scope !== 'flat') {
      assert.ok(preset.entry_lat >= 13 && preset.entry_lat <= 19, `entry_lat out of bounds: ${preset.entry_lat}`);
      assert.ok(preset.entry_lng >= 120 && preset.entry_lng <= 122, `entry_lng out of bounds: ${preset.entry_lng}`);
      assert.ok(preset.exit_lat >= 13 && preset.exit_lat <= 19, `exit_lat out of bounds: ${preset.exit_lat}`);
      assert.ok(preset.exit_lng >= 120 && preset.exit_lng <= 122, `exit_lng out of bounds: ${preset.exit_lng}`);
    }
  }
});

test('South Luzon corridors (SLEX + STAR, CALAX, CAVITEX, SKYWAY, MCX) calculate exact automatic toll quotes', () => {
  const presetRates = VERIFIED_TOLL_PRESETS.flatMap((p, i) => [
    {
      id: `p-${i}-c2`,
      highway: p.highway,
      gate_name: p.gate_name,
      vehicle_class: 'Class 2',
      fee: p.class2_fee,
      entry_lat: p.entry_lat,
      entry_lng: p.entry_lng,
      exit_lat: p.exit_lat,
      exit_lng: p.exit_lng,
      bidirectional: p.bidirectional,
      pricing_scope: p.pricing_scope,
    },
    {
      id: `p-${i}-c3`,
      highway: p.highway,
      gate_name: p.gate_name,
      vehicle_class: 'Class 3',
      fee: p.class3_fee,
      entry_lat: p.entry_lat,
      entry_lng: p.entry_lng,
      exit_lat: p.exit_lat,
      exit_lng: p.exit_lng,
      bidirectional: p.bidirectional,
      pricing_scope: p.pricing_scope,
    },
  ]);

  // SLEX + STAR (Alabang to Batangas City Port)
  const slexStarSections = [
    { highway: 'SLEX', entry: [121.0428, 14.4175], exit: [121.1635, 14.1130] },
    { highway: 'STAR', entry: [121.1635, 14.1130], exit: [121.0770, 13.7820], connectedToPrevious: true },
  ];
  const slexStarQ2 = automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(slexStarSections), presetRates);
  assert.equal(slexStarQ2.total, 590);
  const slexStarQ3 = automaticTollQuote(true, { toll_class: 'Class 3' }, sectionsGeometry(slexStarSections), presetRates);
  assert.equal(slexStarQ3.total, 885);

  // CALAX (Mamplasan to Silang)
  const calaxSections = [{ highway: 'CALAX', entry: [121.0872, 14.3056], exit: [120.9840, 14.2215] }];
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(calaxSections), presetRates).total, 234);
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, sectionsGeometry(calaxSections), presetRates).total, 351);

  // CAVITEX (Paranaque to Kawit)
  const cavitexSections = [{ highway: 'CAVITEX', entry: [120.9868, 14.5085], exit: [120.9080, 14.4385] }];
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(cavitexSections), presetRates).total, 253);
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, sectionsGeometry(cavitexSections), presetRates).total, 379);

  // SKYWAY Stage 1 & 2 (Alabang to Buendia)
  const skywaySections = [{ highway: 'SKYWAY', entry: [121.0430, 14.4170], exit: [121.0080, 14.5585] }];
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(skywaySections), presetRates).total, 329);
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, sectionsGeometry(skywaySections), presetRates).total, 493);

  // MCX (Susana Heights to Daang Hari)
  const mcxSections = [{ highway: 'MCX', entry: [121.0450, 14.3795], exit: [121.0110, 14.3820] }];
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(mcxSections), presetRates).total, 92);
  assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, sectionsGeometry(mcxSections), presetRates).total, 138);

  // Reverse travel on non-bidirectional preset fails closed
  const oneWayRates = presetRates.map(r => r.highway === 'CALAX' ? { ...r, bidirectional: false } : r);
  const reverseCalax = [{ highway: 'CALAX', entry: [120.9840, 14.2215], exit: [121.0872, 14.3056] }];
  assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, sectionsGeometry(reverseCalax), oneWayRates), /entry and exit/);
});
