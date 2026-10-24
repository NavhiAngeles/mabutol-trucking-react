import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vehicleCategories, vehicleCategoryId } from './vehicleCategories.js';

test('vehicle categories group by real type identity, with accurate All/counts and numeric label order', () => {
  const trucks = [
    { id: 'a', vehicle_types: { id: 'six', name: '6-Wheeler' } },
    { id: 'b', vehicle_types: { id: 'ten', name: '10-Wheeler' } },
    { id: 'c', vehicle_types: { id: 'six', name: '6-Wheeler' } },
    { id: 'd', vehicle_type_id: 'van' }, { id: 'e' },
  ];
  const groups = vehicleCategories(trucks, [{ id: 'van', name: 'Closed Van' }]);
  assert.deepEqual(groups.map(group => [group.label, group.count]), [['All', 5], ['6-Wheeler', 2], ['10-Wheeler', 1], ['Closed Van', 1], ['Uncategorized', 1]]);
  assert.equal(trucks.filter(truck => vehicleCategoryId(truck) === 'six').length, 2);
  assert.equal(trucks.filter(truck => vehicleCategoryId(truck) === 'uncategorized').length, 1);
});

test('category counts stay scoped to accessible fleet/readiness and tolerate missing joins or an empty fleet', () => {
  assert.deepEqual(vehicleCategories([]), [{ id: 'all', label: 'All', count: 0 }]);
  const truck = { id: 'a', vehicle_types: { name: 'Dropside' } };
  assert.equal(vehicleCategoryId(truck), 'name:Dropside');
  assert.equal(vehicleCategories([truck])[1].label, 'Dropside');
  assert.equal(vehicleCategories([truck])[0].count, 1);
});

test('actual Fleet selector combines category/search/readiness, keeps counts stable and falls back after a category disappears', () => {
  const source = fs.readFileSync(new URL('./fleet.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const categoryTrucks ='), source.indexOf('const filteredTruckCompliance ='));
  const run = new Function('trucks', 'vehicleCategory', 'vehicleSearch', 'readyOnly', 'readyIds', 'trucksLoading', 'fleet', 'vehicleTypes', 'vehicleCategories', 'vehicleCategoryId', body + '\nreturn {filteredTrucks,categories,activeCategory,categoryCountsUnavailable};');
  const trucks = [
    { id: 'a', plate_number: 'VAN-1', vehicle_types: { id: 'van', name: 'Closed Van' } },
    { id: 'b', plate_number: 'VAN-2', vehicle_types: { id: 'van', name: 'Closed Van' } },
    { id: 'c', plate_number: 'DROP-1', vehicle_types: { id: 'drop', name: 'Dropside' } },
  ];
  const select = (category, search = '', readyOnly = false, readyIds = null, loading = false, rows = trucks) => run(rows, category, search, readyOnly, readyIds, loading, { hasData: true }, [], vehicleCategories, vehicleCategoryId);
  assert.deepEqual(select('van').filteredTrucks.map(t => t.id), ['a', 'b']);
  const filtered = select('van', ' VAN-2 '); assert.deepEqual(filtered.filteredTrucks.map(t => t.id), ['b']); assert.equal(filtered.categories.find(c => c.id === 'van').count, 2);
  assert.deepEqual(select('van', '', true, new Set(['b', 'c'])).filteredTrucks.map(t => t.id), ['b']);
  assert.equal(select('all', '', true).categoryCountsUnavailable, true);
  assert.equal(select('all', '', false, null, true).categoryCountsUnavailable, true);
  assert.equal(select('drop', '', false, null, false, trucks.slice(0, 2)).activeCategory, 'all');
});
