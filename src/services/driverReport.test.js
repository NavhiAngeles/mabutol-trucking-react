import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildDriverReport, DRIVER_STATUSES } from './driverReport.js';
import { reportRange } from './reportOverview.js';

const range = { start: '2026-10-24', end: '2026-10-24' };
const empty = () => ({ drivers: [], shipments: [], deliveries: [], incidents: [] });
test('empty and zero-trip roster distinguish missing rates/distance from measured zero', () => {
  assert.equal(buildDriverReport(empty(), range).rate, null);
  const records = empty(); records.drivers = [{ id: 'd', full_name: 'Driver', status: 'available' }];
  const report = buildDriverReport(records, range);
  assert.equal(report.rows.length, 1); assert.equal(report.rows[0].km, null);
  assert.equal(report.rows[0].rate, null); assert.equal(report.totalTrips, 0);
  assert.equal(report.driverRates.length, 0);
});
test('trip cohort uses Philippine creation dates; weighted rate counts only timed delivered assignments', () => {
  const records = empty();
  records.drivers = [{ id: 'a', full_name: 'Alpha', status: 'on_trip' }, { id: 'b', full_name: 'Beta', status: 'off_duty' }];
  records.shipments = [
    { id: 's', created_at: '2026-10-23T16:00:00Z', estimated_arrival: '2026-10-25T10:00Z' },
    { id: 'outside', created_at: '2026-10-23T15:59:59Z', estimated_arrival: '2026-10-25T10:00Z' },
  ];
  records.deliveries = [
    { id: '1', driver_id: 'a', shipment_id: 's', status: 'delivered', arrived_at: '2026-10-25T09:00Z', odometer_start: '10', odometer_end: '10' },
    { id: '2', driver_id: 'b', shipment_id: 's', status: 'delivered', arrived_at: '2026-10-25T11:00Z', odometer_start: null, odometer_end: 10 },
    { id: '3', driver_id: 'b', shipment_id: 's', status: 'delivered', arrived_at: '2026-10-25T12:00Z', odometer_start: 30, odometer_end: 20 },
    { id: '4', driver_id: 'a', shipment_id: 's', status: 'assigned' },
    { id: '5', driver_id: 'a', shipment_id: 's', status: 'cancelled' },
    { id: '6', driver_id: 'a', shipment_id: 'outside', status: 'delivered', arrived_at: '2026-10-25T09:00Z' },
  ];
  records.deliveries.push(records.deliveries[0]);
  const report = buildDriverReport(records, range);
  assert.equal(report.totalTrips, 4); assert.equal(report.timed, 3); assert.equal(report.rate, 33.3);
  assert.equal(report.rows.find(r => r.id === 'a').km, 0);
  assert.equal(report.rows.find(r => r.id === 'b').km, null);
  assert.equal(report.rows.find(r => r.id === 'a').measuredTrips, 1);
  assert.equal(report.driverRates[0].id, 'a');
  assert.equal(buildDriverReport(records, range, 'beta').totalTrips, 2);
  assert.equal(buildDriverReport(records, range, '', 'on_trip').rate, 100);
});
test('incident dates are independent of trip cohort and attribution requires matching delivery driver', () => {
  const records = empty(); records.drivers = [{ id: 'd', full_name: 'Driver', status: 'available' }];
  records.deliveries = [{ id: 'old', driver_id: 'd', shipment_id: 'old-shipment', status: 'delivered' }];
  records.incidents = [
    { id: '1', delivery_id: 'old', shipment_id: 'old-shipment', category: 'road_closure', created_at: '2026-10-23T16:00Z' },
    { id: '2', delivery_id: null, reported_by: 'd', category: 'traffic', created_at: '2026-10-24T02:00Z' },
    { id: '3', delivery_id: 'old', shipment_id: 'wrong', category: 'weather', created_at: '2026-10-24T02:00Z' },
    { id: '4', delivery_id: 'old', category: 'weather', created_at: '2026-10-23T15:59:59Z' },
  ];
  records.incidents.push(records.incidents[0]);
  const report = buildDriverReport(records, range);
  assert.equal(report.totalTrips, 0); assert.equal(report.rows[0].incidents.length, 1);
  assert.equal(report.incidents[0].label, 'road closure'); assert.equal(report.unattributedIncidents, 2);
  assert.equal(buildDriverReport(records, range, 'absent').incidents.length, 0);
});
test('loader fails visibly if any required table is inaccessible', async () => {
  const source = fs.readFileSync(new URL('./driverReportService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const scope = { fetchOperationalRows: async () => [] };
  vm.createContext(scope); vm.runInContext(source + '\nthis.load=getDriverReportRecords;', scope);
  assert.equal((await scope.load()).drivers.length, 0);
  scope.fetchOperationalRows = async table => { if (table === 'delivery_incidents') throw new Error('Denied'); return []; };
  await assert.rejects(scope.load(), /Denied/);
});
test('driver page renders pagination, search/status resets, real expanded incidents and error states', async () => {
  const { transformWithOxc } = await import('vite');
  const data = { loading: true, data: null, error: null, refresh() {} };
  const state = []; let index = 0;
  const scope = { ReportSchedule() {}, useLiveData: () => data, getDriverReportRecords() {}, DRIVER_REPORT_TABLES: [], DRIVER_STATUSES, reportRange, useReportRange: (key, custom) => key === "custom" ? custom : reportRange(key), downloadReport() {}, buildDriverReport,
    Link: 'Link', MainLayout: 'Layout', OfficeTools: 'Tools', Fragment: 'Fragment', useRef: () => ({ current: null }), useEffect() {},
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    React: { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children }) } };
  const path = new URL('../pages/Report/DriverReport/driverReport.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Page=DriverReport;', scope);
  const render = () => { index = 0; return scope.Page(); };
  const find = (node, type) => !node || typeof node !== 'object' ? [] : [...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type))];
  assert.match(JSON.stringify(render()), /Loading driver report/);
  data.loading = false; data.error = 'Denied'; assert.match(JSON.stringify(render()), /Report data is unavailable/);
  data.data = { ...empty(), drivers: Array.from({ length: 12 }, (_, i) => ({ id: String(i), full_name: 'Driver ' + i, status: i === 11 ? 'off_duty' : 'available' })) };
  let tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 10);
  find(tree, 'button').find(b => b.props['aria-label'] === 'Next page').props.onClick();
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 2);
  find(tree, 'input').find(input => input.props.type === 'search').props.onChange({ target: { value: 'Driver 11' } });
  data.data.deliveries = [{ id: 'del', driver_id: '11', shipment_id: 's', status: 'delivered' }];
  data.data.incidents = [{ id: 'inc', delivery_id: 'del', shipment_id: 's', category: 'traffic', created_at: new Date().toISOString(), delay_minutes: 15 }];
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 1);
  assert.match(JSON.stringify(tree), /Showing the last loaded snapshot/);
  find(tree, 'button').find(b => b.props['aria-label'] === 'Expand Driver 11').props.onClick({ stopPropagation() {} });
  tree = render(); assert.match(JSON.stringify(tree), /15 min reported delay/);
  assert.equal(find(tree, 'Link').find(l => l.children.includes('View shipment')).props.to, '/shipment?tab=all&record=s');
  find(tree, 'select')[0].props.onChange({ target: { value: 'available' } });
  assert.match(JSON.stringify(render()), /No matching driver data/);
});
