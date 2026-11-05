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
