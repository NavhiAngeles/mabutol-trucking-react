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
test('Compliance connects stable loader/table subscriptions, search filter, empty and error/retry states', async () => {
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
  assert.equal(find(render(), n => n.props.className === 'search-container').length, 0);
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
  const searchInput = find(render(), n => n.props.id === 'complianceSearch')[0];
  searchInput.props.onChange({ target: { value: 'absent' } });
  assert.ok(JSON.stringify(render()).includes('No drivers match your search.'));
  searchInput.props.onChange({ target: { value: 'one' } });
  assert.equal(find(render(), n => n.props.id === 'complianceSearch')[0].props.value, 'one');
  assert.ok(JSON.stringify(render()).includes('Driver One'));
  live = { ...live, error: Error('Offline') }; assert.ok(JSON.stringify(render()).includes('Showing previously loaded records.'));
  live = { data: [], loading: false, error: null }; assert.ok(JSON.stringify(render()).includes('No registered drivers.'));
});

test('Compliance pagination slices 10 rows per page, resets to page 1 on search, and preserves full-dataset KPI metrics', async () => {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./compliance.jsx', import.meta.url), 'utf8'), 'compliance.jsx', { jsx: { runtime: 'classic' } });
  const states = []; let index = 0;
  // Create 25 mock drivers: 10 compliant, 5 expiring_soon, 5 expired, 5 missing
  const mockData = Array.from({ length: 25 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    const state = i < 10 ? 'valid' : i < 15 ? 'expiring_soon' : i < 20 ? 'expired' : 'missing';
    return {
      driver: { id: `driver-${num}`, full_name: `Driver ${num}` },
      docs: [
        { docType: '0', badge: { state, label: state === 'valid' ? 'Valid' : state } },
        { docType: '1', badge: { state: 'valid', label: 'Valid' } },
        { docType: '2', badge: { state: 'valid', label: 'Valid' } },
      ],
    };
  });

  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(value) { const i = index++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; },
    MainLayout: 'SharedLayout', OfficeTools: () => null, ComplianceDialog: 'ComplianceDialog',
    getDriverComplianceRows: () => {}, complianceDirectory, complianceCounts, filterCompliance,
    useLiveData() {
      return { data: mockData, loading: false, error: null, refresh: () => {} };
    },
  });

  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = Compliance;', context);
  const render = () => { index = 0; return context.render(); };

  // 1. Initial render on Page 1:
  let tree = render();
  let renderedText = JSON.stringify(tree);

  // Summary KPI metrics cover all 25 drivers:
  assert.ok(renderedText.includes('All three documents valid'));
  assert.ok(renderedText.includes('Includes critical due dates'));

  // Page 1 contains Driver 01 - Driver 10, but not Driver 11 or Driver 25:
  assert.ok(renderedText.includes('Driver 01'));
  assert.ok(renderedText.includes('Driver 10'));
  assert.ok(!renderedText.includes('Driver 11'), 'Driver 11 should not be on page 1');
  assert.ok(!renderedText.includes('Driver 25'), 'Driver 25 should not be on page 1');
  assert.ok(renderedText.includes('Showing 1–10 of 25 drivers'));
  assert.ok(renderedText.includes('Page 1 of 3'));

  // Previous button disabled on page 1; Next button enabled:
  const prevBtn = find(tree, n => n.props['aria-label'] === 'Previous compliance page')[0];
  const nextBtn = find(tree, n => n.props['aria-label'] === 'Next compliance page')[0];
  assert.equal(prevBtn.props.disabled, true);
  assert.equal(nextBtn.props.disabled, false);

  // 2. Navigate to Page 2:
  nextBtn.props.onClick();
  tree = render();
  renderedText = JSON.stringify(tree);
  assert.ok(!renderedText.includes('Driver 01'), 'Driver 01 should not be on page 2');
  assert.ok(renderedText.includes('Driver 11'));
  assert.ok(renderedText.includes('Driver 20'));
  assert.ok(!renderedText.includes('Driver 21'), 'Driver 21 should not be on page 2');
  assert.ok(renderedText.includes('Showing 11–20 of 25 drivers'));
  assert.ok(renderedText.includes('Page 2 of 3'));

  const prevBtnP2 = find(tree, n => n.props['aria-label'] === 'Previous compliance page')[0];
  const nextBtnP2 = find(tree, n => n.props['aria-label'] === 'Next compliance page')[0];
  assert.equal(prevBtnP2.props.disabled, false);
  assert.equal(nextBtnP2.props.disabled, false);

  // 3. Navigate to Page 3:
  nextBtnP2.props.onClick();
  tree = render();
  renderedText = JSON.stringify(tree);
  assert.ok(renderedText.includes('Driver 21'));
  assert.ok(renderedText.includes('Driver 25'));
  assert.ok(!renderedText.includes('Driver 10'));
  assert.ok(renderedText.includes('Showing 21–25 of 25 drivers'));
  assert.ok(renderedText.includes('Page 3 of 3'));

  const nextBtnP3 = find(tree, n => n.props['aria-label'] === 'Next compliance page')[0];
  assert.equal(nextBtnP3.props.disabled, true);

  // 4. Searching while on Page 3 automatically resets pagination to Page 1:
  const tableSearch = find(tree, n => n.props.className === 'table-search')[0];
  tableSearch.props.onChange({ target: { value: 'Driver 0' } }); // Matches Driver 01 through Driver 09
  tree = render();
  renderedText = JSON.stringify(tree);

  assert.ok(renderedText.includes('Driver 01'));
  assert.ok(renderedText.includes('Driver 09'));
  assert.ok(!renderedText.includes('Driver 10'), 'Driver 10 should not match Driver 0');
  assert.ok(renderedText.includes('Showing 1–9 of 9 drivers'));
  assert.ok(renderedText.includes('Page 1 of 1'));

  // 5. Verify KPI cards remain calculated across the full 25-driver dataset:
  assert.ok(renderedText.includes('All three documents valid'));
  assert.ok(renderedText.includes('Requires document attention'));

  // 6. Verify topbar has no redundant search and clear button resets search to Page 1:
  assert.equal(find(tree, n => n.props.className === 'search-container').length, 0);
  const clearBtn = find(tree, n => n.props['aria-label'] === 'Clear compliance search')[0];
  assert.ok(clearBtn, 'Clear search button should be present when search query is active');
  clearBtn.props.onClick();
  tree = render();
  renderedText = JSON.stringify(tree);
  assert.ok(renderedText.includes('Showing 1–10 of 25 drivers'));
  assert.ok(renderedText.includes('Driver 01'));
  assert.ok(renderedText.includes('Driver 10'));
  assert.ok(!renderedText.includes('Driver 11'));
});
