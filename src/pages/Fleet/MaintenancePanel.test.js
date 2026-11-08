import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import { manilaDate } from '../../services/dashboardAnalytics.js';

const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const button = (tree, label) => find(tree, n => n.type === 'button' && n.children.flat(Infinity).includes(label))[0];
async function screen() {
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./MaintenancePanel.jsx', import.meta.url), 'utf8'), 'MaintenancePanel.jsx', { jsx: { runtime: 'classic' } });
  const states = []; let index = 0, refreshes = 0;
  const record = { id: 'service', kind: 'preventive', scheduled_date: manilaDate(Date.now()), status: 'scheduled', trucks: { plate_number: 'TEST-01' } };
  const fleet = { maintenanceRecords: [record], loading: false, error: null, refresh: () => refreshes++ };
  const scope = vm.createContext({ React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    manilaDate, FleetEditor: 'FleetEditor',
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = MaintenancePanel;', scope);
  return { record, fleet, refreshes: () => refreshes, render() { index = 0; return scope.render({ fleet }); } };
}

test('view selector changes the rendered panel and selected state; schedule action is separate', async () => {
  const ui = await screen(); let tree = ui.render();
  assert.equal(button(tree, 'List view').props['aria-pressed'], true);
  assert.equal(find(tree, n => n.type === 'table').length, 1);
  const group = find(tree, n => n.props.role === 'group')[0];
  assert.equal(find(group, n => n.type === 'button').length, 2);
  button(tree, 'Calendar view').props.onClick(); tree = ui.render();
  assert.equal(button(tree, 'Calendar view').props['aria-pressed'], true);
  assert.equal(button(tree, 'List view').props['aria-pressed'], false);
  assert.equal(find(tree, n => n.type === 'table').length, 0);
  assert.equal(find(tree, n => n.props.className === 'fleet-calendar-grid').length, 1);
  assert.equal(find(tree, n => n.props.role === 'region')[0].props['aria-label'], 'Maintenance calendar view');
  button(tree, 'List view').props.onClick(); assert.equal(find(ui.render(), n => n.type === 'table').length, 1);
});
 
test('calendar month controls filter scheduled records and Today restores them; clicking service opens editor', async () => {
  const ui = await screen(); button(ui.render(), 'Calendar view').props.onClick(); let tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('TEST-01'));
  find(tree, n => n.props['aria-label'] === 'Next month')[0].props.onClick(); tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('No service scheduled this month.')); assert.ok(!JSON.stringify(tree).includes('TEST-01'));
  button(tree, 'Today').props.onClick(); tree = ui.render();
  const service = find(tree, n => n.type === 'button' && n.children.flat(Infinity).includes('TEST-01'))[0]; service.props.onClick();
  let editor = find(ui.render(), n => n.type === 'FleetEditor')[0]; assert.equal(editor.props.record.id, ui.record.id);
  editor.props.onClose(); button(ui.render(), 'Schedule service').props.onClick();
  editor = find(ui.render(), n => n.type === 'FleetEditor')[0]; assert.equal(editor.props.record, null);
  editor.props.onSaved(); assert.equal(ui.refreshes(), 1);
});

test('calendar does not report empty success while loading or failed, and retry refreshes', async () => {
  const ui = await screen(); ui.fleet.maintenanceRecords = []; ui.fleet.loading = true;
  button(ui.render(), 'Calendar view').props.onClick(); assert.ok(!JSON.stringify(ui.render()).includes('No service scheduled this month.'));
  ui.fleet.loading = false; ui.fleet.error = Error('Offline'); let tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('Maintenance records are unavailable.')); assert.ok(!JSON.stringify(tree).includes('No service scheduled this month.'));
  button(tree, 'Retry maintenance').props.onClick(); assert.equal(ui.refreshes(), 1);
  ui.fleet.maintenanceRecords = [ui.record]; tree = ui.render(); assert.ok(JSON.stringify(tree).includes('Showing previously loaded records.'));
});

test('maintenance list table matches system design headers, section titles, and action button semantics', async () => {
  const ui = await screen();
  const tree = ui.render();

  // Section titles & subtitle
  const sectionTitles = find(tree, n => n.props?.className === 'section-titles')[0];
  assert.ok(sectionTitles, 'section-titles container must exist');
  const h3 = find(sectionTitles, n => n.type === 'h3')[0];
  assert.equal(h3.children[0], 'Maintenance Schedule');
  const subtitle = find(sectionTitles, n => n.props?.className === 'section-subtitle')[0];
  assert.equal(subtitle.children[0], 'SCHEDULE AND UPDATE VEHICLE SERVICE RECORDS.');

  // Uppercase table headers
  const ths = find(tree, n => n.type === 'th').map(th => th.children[0]);
  assert.deepEqual(ths, ['VEHICLE', 'SERVICE', 'SCHEDULED', 'COMPLETED', 'WORKSHOP / COST', 'STATUS', 'ACTIONS']);

  // Edit action button
  const editBtn = find(tree, n => n.type === 'button' && n.props?.className?.includes('fleet-btn-edit'))[0];
  assert.ok(editBtn, 'fleet-btn-edit button must be rendered for records');
  assert.equal(editBtn.props.title, 'Edit maintenance record for TEST-01');

  // Status badge pill
  const statusPill = find(tree, n => n.props?.className?.includes('status-pill'))[0];
  assert.ok(statusPill, 'status badge pill must be present');
});

test('empty maintenance list renders centered and padded message matching fleet design', async () => {
  const ui = await screen();
  ui.fleet.maintenanceRecords = [];
  const tree = ui.render();
  const emptyCell = find(tree, n => n.type === 'td' && n.props?.colSpan === '7')[0];
  assert.ok(emptyCell, 'empty state cell spanning 7 columns must exist');
  assert.equal(emptyCell.props.style.textAlign, 'center');
  assert.equal(emptyCell.children[0], 'No maintenance records.');
});

test('maintenance search filters records and renders query empty notice when none match', async () => {
  const ui = await screen();
  ui.fleet.maintenanceRecords = [
    { id: 's1', kind: 'oil change', scheduled_date: '2026-11-10', status: 'scheduled', trucks: { plate_number: 'TRUCK-101' }, vendor: 'Quick Lube' },
    { id: 's2', kind: 'tire rotation', scheduled_date: '2026-11-12', status: 'scheduled', trucks: { plate_number: 'TRUCK-202' }, vendor: 'Goodyear' },
  ];
  let tree = ui.render();
  const searchInput = find(tree, n => n.type === 'input' && n.props?.className?.includes('inner-search'))[0];
  assert.ok(searchInput, 'search input must exist in list view');

  // Filter for TRUCK-101
  searchInput.props.onChange({ target: { value: 'TRUCK-101' } });
  tree = ui.render();
  assert.ok(JSON.stringify(tree).includes('TRUCK-101'));
  assert.ok(!JSON.stringify(tree).includes('TRUCK-202'));

  // Filter for nonexistent query
  searchInput.props.onChange({ target: { value: 'NONEXISTENT' } });
  tree = ui.render();
  const emptyCell = find(tree, n => n.type === 'td' && n.props?.colSpan === '7')[0];
  assert.equal(emptyCell.children[0], 'No maintenance records match your search.');
});

test('maintenance pagination breaks records into pages of 10 and updates pagination controls', async () => {
  const ui = await screen();
  ui.fleet.maintenanceRecords = Array.from({ length: 15 }, (_, i) => ({
    id: `srv-${i + 1}`,
    kind: 'maintenance',
    scheduled_date: '2026-11-15',
    status: 'scheduled',
    trucks: { plate_number: `PLT-${String(i + 1).padStart(3, '0')}` },
  }));
  let tree = ui.render();

  // Initial page 1
  const summary = find(tree, n => n.props?.className === 'pagination-summary')[0];
  assert.equal(summary.children[0], 'Showing 1–10 of 15 records');
  const indicator = find(tree, n => n.props?.className === 'pagination-page-indicator')[0];
  assert.equal(indicator.children[0], 'Page 1 of 2');

  const nextBtn = find(tree, n => n.type === 'button' && n.props?.className?.includes('page-nav-next'))[0];
  assert.equal(nextBtn.props.disabled, false);
  const prevBtn = find(tree, n => n.type === 'button' && n.props?.className?.includes('page-nav-prev'))[0];
  assert.equal(prevBtn.props.disabled, true);

  // Navigate to page 2
  nextBtn.props.onClick();
  tree = ui.render();
  const page2Summary = find(tree, n => n.props?.className === 'pagination-summary')[0];
  assert.equal(page2Summary.children[0], 'Showing 11–15 of 15 records');
  const page2Indicator = find(tree, n => n.props?.className === 'pagination-page-indicator')[0];
  assert.equal(page2Indicator.children[0], 'Page 2 of 2');
});
