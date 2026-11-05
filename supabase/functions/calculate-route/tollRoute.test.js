import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseExpresswayRoute, expresswayCoverage, tollSections } from './tollRoute.js';

// Controlled polylines: lengths/category boundaries matter, not road-name text.
const points = {
  ordinary: [[120.9, 14.8], [120.9001, 14.7999], [120.99, 14.55]],
  expressway: [[120.9, 14.8], [120.91, 14.79], [121, 14.59], [120.99, 14.55]],
  shorter: [[120.9, 14.8], [120.91, 14.79], [121, 14.7], [120.99, 14.55]],
};
const decode = key => points[key];
const surface = { geometry: 'ordinary', summary: { distance: 35900, duration: 46 * 60 }, extras: { waycategory: { values: [[0, 1, 3], [1, 2, 0]] } } };
const motorway = { geometry: 'expressway', summary: { distance: 45000, duration: 60 * 60 },
  extras: { waycategory: { values: [[0, 1, 0], [1, 2, 3], [2, 3, 0]] } },
  segments: [{ steps: [{ name: 'Local access', way_points: [0, 1] }, { name: 'NLEX', way_points: [1, 2] }, { name: 'Local exit', way_points: [2, 3] }] }] };

test('regression: 35.9km/46min ordinary route with tiny toll link loses to actual expressway coverage', () => {
  assert.equal(expresswayCoverage(surface, decode).verified, false);
  const chosen = chooseExpresswayRoute([surface, motorway], decode);
  assert.equal(chosen.route, motorway);
  assert.ok(chosen.coverage.highwayMeters > 30000);
  assert.deepEqual(chosen.coverage.roadNames, ['NLEX']);
});
test('prioritizes expressway share across alternatives, then uses duration only for equal coverage', () => {
  const less = { ...motorway, geometry: 'shorter', summary: { distance: 40000, duration: 2000 } };
  const equallyCovered = { ...motorway, summary: { distance: 45000, duration: 3400 } };
  assert.equal(chooseExpresswayRoute([less, motorway, equallyCovered], decode).route, equallyCovered);
});
test('no substantive alternative rejects tiny links instead of returning successful ordinary-road routing', () => {
  assert.equal(chooseExpresswayRoute([surface], decode), null);
  for (const values of [[[0, 3, 11]], [[0, 1, 0]], [[0, 2, 3], [1, 3, 3]], [[0, 4, 3]], [[0, 3, '3']]]) {
    assert.equal(chooseExpresswayRoute([{ ...motorway, extras: { waycategory: { values } } }], decode), null);
  }
});
test('short legitimate expressway trips retain proportional coverage without a fixed five-kilometer minimum', () => {
  const short = { ...motorway, summary: { distance: 1000, duration: 180 } };
  assert.equal(chooseExpresswayRoute([short], decode).route, short);
});

test('identifies actual named toll corridors and entry/exit coordinates from provider instructions', () => {
  assert.deepEqual(tollSections(motorway, decode), [{ highway: 'NLEX', entry: points.expressway[1], exit: points.expressway[2] }]);
  const route = { ...motorway, extras: { waycategory: { values: [[0,3,3]] } }, segments: [{ steps: [
    { name: 'North Luzon Expressway', way_points: [0,1] }, { name: 'Skyway Stage 3', way_points: [1,3] },
  ] }] };
  const sections = tollSections(route, decode);
  assert.deepEqual(sections.map(row => row.highway), ['NLEX','SKYWAY']);
  assert.deepEqual(sections[1].entry, points.expressway[1]);
  assert.deepEqual(sections[1].exit, points.expressway[3]);
});
test('does not invent highway identity for unnamed toll roads or carry it across toll-free roads', () => {
  const route = { ...motorway, extras: { waycategory: { values: [[0,1,3],[1,2,0],[2,3,3]] } }, segments: [{ steps: [
    { name: 'NLEX Connector', way_points: [0,1] },
  ] }] };
  assert.deepEqual(tollSections(route,decode).map(row => row.highway), ['NLEX_CONNECTOR','UNKNOWN']);
});
