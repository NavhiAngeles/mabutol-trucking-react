import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildRevenueReport } from './revenueReport.js';
import { reportRange } from './reportOverview.js';

const range = { start: '2026-10-24', end: '2026-10-24' };
const stamp = '2026-10-23T16:00:00Z';
const empty = () => ({ shipments: [], customers: [], payments: [], deliveries: [], expenses: [], fuel: [], maintenance: [] });
test('empty report leaves average unavailable without inventing profit', () => {
  const result = buildRevenueReport(empty(), range);
  assert.equal(result.charges.amount, 0); assert.equal(result.averageCharge, null);
  assert.equal(result.topCustomers.length, 0); assert.equal(result.routes.length, 0);
  assert.equal('netRevenue' in result, false);
});
test('completed creation cohort uses cents, valid zero, billing identity and exact route grouping', () => {
  const records = empty();
  records.customers = [{ id: 'a', name: 'Same Name' }, { id: 'b', name: 'Same Name' }];
  records.shipments = [
    { id: '1', status: 'completed', created_at: stamp, final_amount: '0.10', customer_id: 'a', billing_customer_id: 'b', pickup_address: 'Origin', dropoff_address: 'Destination' },
    { id: '2', status: 'completed', created_at: stamp, final_amount: '0.20', customer_id: 'a', pickup_address: 'Origin', dropoff_address: 'Destination' },
    { id: '3', status: 'completed', created_at: stamp, final_amount: null, customer_id: 'a' },
    { id: '4', status: 'completed', created_at: stamp, final_amount: 0, customer_id: 'a' },
    { id: '5', status: 'cancelled', created_at: stamp, final_amount: 900 },
    { id: '6', status: 'completed', created_at: '2026-10-23T15:59:59Z', final_amount: 900 },
  ];
  records.shipments.push(records.shipments[0]);
  const result = buildRevenueReport(records, range);
  assert.equal(result.charges.amount, 0.3); assert.equal(result.charges.count, 4);
  assert.equal(result.charges.missing, 1); assert.equal(result.topCustomers.length, 2);
  assert.equal(result.topCustomers.find(c => c.id === 'b').revenue, 0.1);
  assert.equal(result.routes.find(r => r.route === 'Origin → Destination').shipments, 2);
  assert.equal(result.trend[0].amount, 0.3); assert.equal(result.trend[0].count, 3);
});
test('payment/cost periods are independent and pending/rejected/refunded records never become receipts', () => {
  const records = empty();
  records.payments = [
    { id: '1', status: 'verified', paid_at: stamp, amount: '100' },
    ...['pending', 'rejected', 'refunded'].map((status, i) => ({ id: String(i + 2), status, paid_at: stamp, amount: 999 })),
    { id: '5', status: 'verified', paid_at: null, amount: 999 },
    { id: '6', status: 'verified', paid_at: '2026-10-24T16:00:00Z', amount: 999 },
  ];
  records.expenses = [{ id: 'e', category: 'fuel', status: 'approved', created_at: stamp, amount: '25' }, { id: 'rejected', status: 'rejected', created_at: stamp, amount: 999 }];
  records.fuel = [{ id: 'f', logged_at: stamp, total_cost: '25' }];
  records.maintenance = [{ id: 'm', status: 'completed', completed_date: '2026-10-24', cost: '50' }, { id: 'pending', status: 'scheduled', completed_date: '2026-10-24', cost: 999 }];
  const result = buildRevenueReport(records, range);
  assert.equal(result.payments.amount, 100); assert.equal(result.undatedPayments, 1);
  assert.equal(result.expenses.amount, 25); assert.equal(result.fuel.amount, 25);
  assert.equal(result.maintenance.amount, 50); assert.equal(result.costBreakdown[0].amount, 25);
});
test('route expense joins never multiply shipment charges or include unrelated costs', () => {
  const records = empty();
  records.shipments = [{ id: 's', status: 'completed', created_at: stamp, final_amount: 1000 }];
  records.deliveries = [{ id: 'd', shipment_id: 's' }, { id: 'd2', shipment_id: 's' }];
  records.expenses = [
    { id: 'a', delivery_id: 'd', category: 'toll', status: 'approved', amount: 100, created_at: stamp },
    { id: 'b', delivery_id: 'd2', category: 'fuel', status: 'approved', amount: 200, created_at: stamp },
    { id: 'orphan', delivery_id: 'absent', category: 'other', status: 'approved', amount: 50, created_at: stamp },
    { id: 'invalid', delivery_id: 'd', status: 'approved', amount: -99, created_at: stamp },
  ];
  records.expenses.push(records.expenses[0]);
  const result = buildRevenueReport(records, range);
  assert.equal(result.charges.amount, 1000); assert.equal(result.routes[0].revenue, 1000);
  assert.equal(result.routes[0].expenses, 300); assert.equal(result.expenses.amount, 350);
  assert.equal(result.expenses.missing, 1);
});
test('loader propagates an unavailable financial table', async () => {
  const source = fs.readFileSync(new URL('./revenueReportService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const scope = { fetchOperationalRows: async () => [] };
  vm.createContext(scope); vm.runInContext(source + '\nthis.load=getRevenueReportRecords;', scope);
  assert.equal((await scope.load()).payments.length, 0);
  scope.fetchOperationalRows = async table => { if (table === 'payments') throw new Error('Denied'); return []; };
  await assert.rejects(scope.load(), /Denied/);
});
test('page renders loading/stale errors, route pagination/search and applied custom dates', async () => {
  const { transformWithOxc } = await import('vite');
  const data = { loading: true, data: null, error: null, refresh() {} };
  const state = []; let index = 0;
  const scope = { ReportSchedule() {}, useLiveData: () => data, getRevenueReportRecords() {}, REVENUE_REPORT_TABLES: [], reportRange, useReportRange: (key, custom) => key === "custom" ? custom : reportRange(key), downloadReport() {}, buildRevenueReport,
    Link: 'Link', MainLayout: 'Layout', OfficeTools: 'Tools', useRef: () => ({ current: null }), useEffect() {},
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) } };
  const path = new URL('../pages/Report/RevenueReport/revenueReport.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Page=RevenueReport;', scope);
  const render = () => { index = 0; return scope.Page(); };
  const find = (node, type) => !node || typeof node !== 'object' ? [] : [...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type))];
  assert.match(JSON.stringify(render()), /Loading revenue report/);
  data.loading = false; data.error = 'Denied'; assert.match(JSON.stringify(render()), /Report data is unavailable/);
  data.data = { ...empty(), shipments: Array.from({ length: 12 }, (_, i) => ({ id: String(i), status: 'completed', created_at: new Date().toISOString(), final_amount: 100, pickup_address: 'Route ' + i, dropoff_address: 'Depot' })) };
  let tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 10);
  find(tree, 'button').find(b => b.children.includes('Next')).props.onClick();
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 2);
  find(tree, 'input').find(input => input.props.type === 'search').props.onChange({ target: { value: 'Route 11' } });
  tree = render(); assert.equal(find(tree, 'tbody')[0].children.flat(Infinity).length, 1);
  assert.match(JSON.stringify(tree), /Showing the last loaded snapshot/);
  find(tree, 'button').find(b => b.children.includes('Custom Range')).props.onClick();
  tree = render();
  find(tree, 'input').find(input => input.props.id === 'rv-start').props.onChange({ target: { value: '2020-01-01' } });
  find(tree, 'input').find(input => input.props.id === 'rv-end').props.onChange({ target: { value: '2020-01-02' } });
  tree = render(); find(tree, 'button').find(b => b.children.includes('Apply')).props.onClick();
  tree = render(); assert.match(JSON.stringify(tree), /2020-01-01/); assert.match(JSON.stringify(tree), /No routes match/);
  find(tree, 'button').find(b => b.children.includes('Custom Range')).props.onClick();
  tree = render(); find(tree, 'input').find(input => input.props.id === 'rv-start').props.onChange({ target: { value: '2021-01-01' } });
  tree = render(); find(tree, 'button').find(b => b.children.includes('Apply')).props.onClick();
  assert.match(JSON.stringify(render()), /Choose a valid start and end date/);
  assert.equal(state[3].start, '2020-01-01');
});
