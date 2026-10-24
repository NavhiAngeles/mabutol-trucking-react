import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildShipmentReport, deliveryVariance } from './shipmentReport.js';
import { reportRange } from './reportOverview.js';

const range = { start: '2026-10-24', end: '2026-10-24' };
test('shipment cohort includes local midnight and every status without inventing arrival rates', () => {
  const statuses = ['pending', 'booked', 'assigned', 'loading', 'in_transit', 'delayed', 'cancelled', 'completed', 'unknown'];
  const rows = statuses.map((status, i) => ({ id: String(i), status, created_at: '2026-10-23T16:00:00Z' }));
  rows.push({ id: 'outside', status: 'completed', created_at: '2026-10-23T15:59:59Z' });
  const report = buildShipmentReport(rows, [], range);
  assert.equal(report.total, 9); assert.equal(report.breakdown.active, 3);
  assert.equal(Object.values(report.breakdown).reduce((a, b) => a + b, 0), 9);
  assert.equal(report.rate, null); assert.equal(report.trend[0].rate, null);
});
test('search, status filters, driver lookup and timing calculations use the same cohort', () => {
  const shipments = [{ id: 'a', status: 'completed', tracking_number: 'REAL-1', customer: { name: 'Customer' }, pickup_address: 'Manila', created_at: '2026-10-24T03:00Z', estimated_arrival: '2026-10-25T04:00Z', actual_delivery_at: '2026-10-25T03:45Z' },
    { id: 'b', status: 'completed', created_at: '2026-10-24T04:00Z', estimated_arrival: '2026-10-25T04:00Z', actual_delivery_at: '2026-10-25T05:10Z' },
    { id: 'c', status: 'delayed', created_at: '2026-10-24T05:00Z', estimated_arrival: 'invalid', actual_delivery_at: null }];
  const deliveries = [{ id: '1', shipment_id: 'a', status: 'delivered', driver: { full_name: 'Driver Name' } }, { id: '2', shipment_id: 'a', status: 'cancelled', driver: { full_name: 'Wrong' } }];
  const report = buildShipmentReport(shipments, deliveries, range);
  assert.equal(report.rate, 50); assert.equal(report.timed, 2); assert.equal(report.trend[0].rate, 50);
  assert.equal(buildShipmentReport(shipments, deliveries, range, 'driver name').total, 1);
  assert.equal(buildShipmentReport(shipments, deliveries, range, 'REAL-1').rows[0].variance, '-15m');
  assert.equal(buildShipmentReport(shipments, deliveries, range, 'manila', 'delayed').total, 0);
  assert.equal(buildShipmentReport(shipments, deliveries, range, '', 'delayed').rows[0].variance, '—');
  assert.equal(deliveryVariance('2026-01-01T00:00Z', '2026-01-01T01:10Z'), '+1h 10m');
});
test('loader propagates query failures instead of showing invented zero totals', async () => {
  const source = fs.readFileSync(new URL('./shipmentReportService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const scope = { fetchOperationalRows: async () => [], fetchShipmentAssignments: async () => [] };
  vm.createContext(scope); vm.runInContext(source + '\nthis.load=getShipmentReportRecords;', scope);
  assert.equal((await scope.load()).shipments.length, 0);
  scope.fetchShipmentAssignments = async () => { throw new Error('Denied'); };
  await assert.rejects(scope.load(), /Denied/);
});
test('ledger renders ten rows per page, filters/reset page, clamps after refresh, and exposes loading/error states', async () => {
  const { transformWithOxc } = await import('vite');
  const date = new Date().toISOString();
  const data = { loading: true, data: null, error: null, refresh() {} };
  const state = []; let index = 0;
  const scope = { useLiveData: () => data, getShipmentReportRecords() {}, SHIPMENT_REPORT_TABLES: [], reportRange, buildShipmentReport,
    Link: 'Link', MainLayout: 'Layout', OfficeTools: 'Tools', useRef: () => ({ current: null }), useEffect() {},
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) } };
  const path = new URL('../pages/Report/ShipmentReport/shipmentReport.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Page=ShipmentReport;', scope);
  const render = () => { index = 0; return scope.Page(); };
  const find = (node, type) => !node || typeof node !== 'object' ? [] : [...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type))];
  assert.match(JSON.stringify(render()), /Loading shipment report/);
  data.loading = false; data.error = 'Denied';
  assert.match(JSON.stringify(render()), /Report data is unavailable/);
  data.data = { shipments: Array.from({ length: 12 }, (_, i) => ({ id: String(i), status: 'completed', created_at: date, tracking_number: 'TRACK-' + i })), deliveries: [] };
  let tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 10);
  find(tree, 'button').find(b => b.children.includes('Next')).props.onClick();
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 2);
  find(tree, 'input').find(input => input.props.type === 'search').props.onChange({ target: { value: 'TRACK-11' } });
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 1);
  assert.match(JSON.stringify(tree), /Showing the last loaded snapshot/);
  data.data.shipments = []; assert.match(JSON.stringify(render()), /No shipments match/);
});
