import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const tick = () => new Promise(resolve => setImmediate(resolve));
const find = (node, predicate) => !node || typeof node !== 'object' ? []
  : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];

async function mount(options) {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./AssignmentManager.jsx', import.meta.url), 'utf8'), 'AssignmentManager.jsx', { jsx: { runtime: 'classic' } });
  const states = [], effects = []; let index = 0, effectIndex = 0, pending = [], saved, changes = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useMemo: fn => fn(),
    useEffect(effect, deps) { const i = effectIndex++; const old = effects[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; }); },
    fetchAssignmentOptions: async () => options,
    saveManualAssignment: async args => { saved = args; return { delivery_id: 'new' }; },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Panel=AssignmentManager;', context);
  const render = () => { index = effectIndex = 0; pending = []; const tree = context.Panel({ shipmentId: 's', onChanged: async () => { changes++; } }); pending.forEach(run => run()); return tree; };
  return { render, saved: () => saved, changes: () => changes };
}

test('office selects an eligible pair, records a reason and submits the expected assignment version', async () => {
  const options = { current: { id: 'old', driver_id: 'old-driver', truck_id: 'old-truck' }, blockedReason: null,
    drivers: [{ id: 'd', full_name: 'Driver', eligible: true }],
    trucks: [{ id: 't', plate_number: 'TEST-1', capacity_kg: 1000, assigned_driver_id: null, eligible: true }] };
  const ui = await mount(options); ui.render(); await tick(); let tree = ui.render();
  const selects = find(tree, node => node.type === 'select');
  selects[0].props.onChange({ target: { value: 'd' } }); selects[1].props.onChange({ target: { value: 't' } });
  find(tree, node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Vehicle inspection follow-up' } });
  tree = ui.render(); const form = find(tree, node => node.type === 'form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(ui.saved())), { shipmentId: 's', driverId: 'd', truckId: 't', reason: 'Vehicle inspection follow-up', expectedDelivery: 'old' });
  assert.equal(ui.changes(), 1);
});

test('active-trip block and zero eligible resources are shown without an enabled mutation', async () => {
  let ui = await mount({ current: { id: 'active' }, blockedReason: 'Active or started trips cannot be reassigned.', drivers: [], trucks: [] });
  ui.render(); await tick(); let tree = ui.render(); assert.match(JSON.stringify(tree), /cannot be reassigned/);
  assert.equal(find(tree, node => node.type === 'form').length, 0);
  ui = await mount({ current: null, blockedReason: null, drivers: [{ eligible: false }], trucks: [{ eligible: false }] });
  ui.render(); await tick(); tree = ui.render(); assert.match(JSON.stringify(tree), /No eligible pair/);
  assert.equal(find(tree, node => node.type === 'button' && node.props.type === 'submit')[0].props.disabled, true);
});

test('reassignment section always displays available drivers and available trucks, with notices when selected', async () => {
  const options = {
    current: { id: 'curr', driver_id: 'd-curr', truck_id: 't-curr' },
    blockedReason: null,
    drivers: [
      { id: 'd-curr', full_name: 'Current Driver', status: 'assigned', eligible: true },
      { id: 'd1', full_name: 'Available Driver 1', status: 'available', eligible: true },
      { id: 'd2', full_name: 'Available Driver 2 (Doc Pending)', status: 'available', eligible: false, reason: 'Compliance documents incomplete' },
      { id: 'd-off', full_name: 'Off Duty Driver', status: 'off_duty', eligible: false, reason: 'Driver is not available' },
    ],
    trucks: [
      { id: 't-curr', plate_number: 'CURR-01', capacity_kg: 2000, status: 'assigned', eligible: true, assigned_driver_id: 'd-curr' },
      { id: 't1', plate_number: 'TRUCK-01', capacity_kg: 3000, status: 'available', eligible: true, assigned_driver_id: null },
      { id: 't2', plate_number: 'TRUCK-02', capacity_kg: 4000, status: 'available', eligible: false, reason: 'Active maintenance', assigned_driver_id: 'd1' },
      { id: 't-maint', plate_number: 'MAINT-03', capacity_kg: 3000, status: 'maintenance', eligible: false, reason: 'Truck is not available' },
    ],
  };

  const ui = await mount(options);
  ui.render();
  await tick();
  let tree = ui.render();

  const selects = find(tree, node => node.type === 'select');
  assert.equal(selects.length, 2);

  // Driver select should display current driver and all available drivers (d-curr, d1, d2), but NOT off_duty driver
  const driverOptions = selects[0].children.flat();
  const driverOptionValues = driverOptions.map(opt => opt.props?.value).filter(Boolean);
  assert.deepEqual(driverOptionValues, ['d-curr', 'd1', 'd2']);

  // Truck select should display current truck and all available trucks (t-curr, t1, t2), but NOT maintenance truck
  const truckOptions = selects[1].children.flat();
  const truckOptionValues = truckOptions.map(opt => opt.props?.value).filter(Boolean);
  assert.deepEqual(truckOptionValues, ['t-curr', 't1', 't2']);

  // Selecting a truck (t2) does NOT eliminate other available drivers
  selects[1].props.onChange({ target: { value: 't2' } });
  tree = ui.render();
  const updatedDriverOptions = find(tree, node => node.type === 'select')[0].children.flat().map(opt => opt.props?.value).filter(Boolean);
  assert.deepEqual(updatedDriverOptions, ['d-curr', 'd1', 'd2']);

  // Truck note for t2 should now be visible
  assert.match(JSON.stringify(tree), /Active maintenance/);

  // Selecting d2 shows driver compliance notice
  find(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'd2' } });
  tree = ui.render();
  assert.match(JSON.stringify(tree), /Compliance documents incomplete/);
});

test('truck list automatically filters out mismatch trucks that cannot carry the customer shipment weight', async () => {
  const options = {
    current: { id: 'curr', driver_id: 'd1', truck_id: 't-small' },
    shipment: { id: 's1', weight_kg: 2500, requested_vehicle_type_id: null },
    blockedReason: null,
    drivers: [
      { id: 'd1', full_name: 'Driver 1', status: 'available', eligible: true },
    ],
    trucks: [
      { id: 't-small', plate_number: 'ELF-1500', capacity_kg: 1500, status: 'available', eligible: false, reason: 'Insufficient recorded capacity' },
      { id: 't-exact', plate_number: 'VAN-2500', capacity_kg: 2500, status: 'available', eligible: true },
      { id: 't-large', plate_number: 'FWD-5000', capacity_kg: 5000, status: 'available', eligible: true },
      { id: 't-under', plate_number: 'ELF-2000', capacity_kg: 2000, status: 'available', eligible: true },
    ],
  };

  const ui = await mount(options);
  ui.render();
  await tick();
  const tree = ui.render();

  const selects = find(tree, node => node.type === 'select');
  const truckOptions = selects[1].children.flat();
  const truckOptionValues = truckOptions.map(opt => opt.props?.value).filter(Boolean);

  // Only trucks with capacity >= 2500 kg (t-exact, t-large) should be displayed; t-small and t-under are weight mismatches and must be excluded
  assert.deepEqual(truckOptionValues, ['t-exact', 't-large']);
  assert.match(JSON.stringify(tree), /min\. 2,500 kg capacity/);
});
