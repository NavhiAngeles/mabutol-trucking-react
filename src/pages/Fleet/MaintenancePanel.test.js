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
