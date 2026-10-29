import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import { complianceDirectory, complianceCounts, filterCompliance } from '../../services/complianceDirectory.js';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
test('Compliance connects stable loader/table subscriptions, both searches, empty and error/retry states', async () => {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./compliance.jsx', import.meta.url), 'utf8'), 'compliance.jsx', { jsx: { runtime: 'classic' } });
  const states = []; let index = 0, refreshes = 0;
  let live = { data: null, loading: true, error: null };
  const loader = () => {};
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(value) { const i = index++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; },
    MainLayout: 'SharedLayout', OfficeTools: () => null, ComplianceDialog: 'ComplianceDialog',
    getDriverComplianceRows: loader, complianceDirectory, complianceCounts, filterCompliance,
    useLiveData(load, tables) {
      assert.equal(load, loader); assert.deepEqual(Array.from(tables), ['drivers', 'compliance_documents', 'system_settings']);
      return { ...live, refresh: () => refreshes++ };
    },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = Compliance;', context);
  const render = () => { index = 0; return context.render(); };
  assert.equal(render().type, 'SharedLayout');
  assert.equal(find(render(), n => n.type === 'aside' || n.type === 'main').length, 0);
  assert.equal(find(render(), n => n.props.role === 'status').length, 1);
  live = { data: null, loading: false, error: Error('Offline') };
  const alert = find(render(), n => n.props.role === 'alert')[0];
  find(alert, n => n.type === 'button')[0].props.onClick(); assert.equal(refreshes, 1);
  assert.ok(JSON.stringify(render()).includes('Counts and records are unavailable.'));
  live = { data: [{ driver: { id: 'one', full_name: 'Driver One' }, docs: ['valid', 'valid', 'valid'].map((state, i) => ({ docType: String(i), badge: { state, label: 'Valid' }, doc: null })) }], loading: false, error: null };
  assert.ok(JSON.stringify(render()).includes('Driver One'));
  find(render(), n => n.props['aria-label'] === 'Open compliance for Driver One')[0].props.onClick();
  let dialog = find(render(), n => n.type === 'ComplianceDialog')[0];
  assert.equal(dialog.props.entity.id, 'one'); assert.equal(dialog.props.kind, 'driver');
  dialog.props.onSaved(); assert.equal(refreshes, 2);
  dialog.props.onClose(); assert.equal(find(render(), n => n.type === 'ComplianceDialog').length, 0);
  find(render(), n => n.props.id === 'complianceSearch')[0].props.onChange({ target: { value: 'absent' } });
  assert.ok(JSON.stringify(render()).includes('No drivers match your search.'));
  const tableSearch = find(render(), n => n.props.className === 'table-search')[0];
  assert.equal(tableSearch.props.value, 'absent'); tableSearch.props.onChange({ target: { value: 'one' } });
  assert.equal(find(render(), n => n.props.id === 'complianceSearch')[0].props.value, 'one');
  live = { ...live, error: Error('Offline') }; assert.ok(JSON.stringify(render()).includes('Showing previously loaded records.'));
  live = { data: [], loading: false, error: null }; assert.ok(JSON.stringify(render()).includes('No registered drivers.'));
});
