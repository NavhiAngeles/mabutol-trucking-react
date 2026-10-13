import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { absoluteEventTime, relativeEventTime } from '../../services/operationsFeed.js';

test('feed renders loading, empty, stale errors and working refresh/history/record buttons', async () => {
  const { transformWithOxc } = await import('vite');
  let refreshed = 0, opened = 0;
  const navigated = [];
  const data = { feed: { events: [], loading: true, error: '' }, history: { open: false }, now: Date.now(),
    refresh: () => refreshed++, openHistory: () => opened++, closeHistory() {}, previousPage() {}, nextPage() {}, refreshHistory() {} };
  const scope = { useOperationsFeed: () => data, useNavigate: () => path => navigated.push(path),
    useRef: () => ({ current: null }), useEffect() {}, absoluteEventTime, relativeEventTime,
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
  };
  vm.createContext(scope);
  const path = new URL('./OperationsFeed.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.Page=OperationsFeed;this.List=EventList;', scope);
  const find = (node, type) => !node || typeof node !== 'object' ? [] : [ ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)) ];
  assert.ok(JSON.stringify(scope.Page()).includes('Refreshing activity'));
  assert.equal(find(scope.Page(), 'button')[0].props.disabled, true);
  data.feed.loading = false;
  assert.ok(JSON.stringify(scope.Page()).includes('No operational activity yet.'));
  find(scope.Page(), 'button')[0].props.onClick(); assert.equal(refreshed, 1);
  find(scope.Page(), 'button').find(button => button.children.includes('View All Activity →')).props.onClick(); assert.equal(opened, 1);
  const event = { key: 'real', title: 'Actual booking', href: '/shipment?tab=all&record=real-id', created_at: '2026-10-13T16:00:00Z', customer: 'Actual customer', description: 'Actual route', color: 'navy' };
  find(scope.List({ events: [event], now: data.now }), 'button')[0].props.onClick(); assert.equal(navigated[0], event.href);
  data.feed.events = [event]; data.feed.error = 'Permission denied';
  assert.ok(JSON.stringify(scope.Page()).includes('Showing previously loaded activity.'));
  data.history = { open: true, events: [event], page: 1, hasNext: false, loading: false, error: '' };
  assert.equal(find(scope.Page(), 'section')[0].props.role, 'dialog');
  assert.equal(find(scope.Page(), 'button').find(button => button.children.includes('Next')).props.disabled, true);
});

test('Shipment exact-ID filter includes cancelled records and clears when changing tabs', () => {
  let params = new URLSearchParams('tab=all&record=cancelled-id');
  const state = [[{ dbId: 'cancelled-id', id: 'TRACK-1', status: 'cancelled', rawStatus: 'cancelled' },
    { dbId: 'active-id', id: 'TRACK-2', status: 'assigned', rawStatus: 'assigned' }]];
  let index = 0;
  const scope = {
    ACTIVE_STATUSES: ['assigned', 'loading', 'in_transit'],
    useSearchParams: () => [params, updater => { params = updater(params); }],
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], () => {}]; },
    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }),
    formatDuration: String, isToday: () => false,
  };
  vm.createContext(scope);
  const source = fs.readFileSync(new URL('../../viewmodels/ShipmentViewModel.js', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.hook=useShipmentViewModel;', scope);
  const render = () => { index = 0; return scope.hook(); };
  assert.equal(render().visibleShipments.length, 1); assert.equal(render().visibleShipments[0].dbId, 'cancelled-id');
  render().setCurrentTab('active'); assert.equal(params.has('record'), false);
  assert.equal(render().visibleShipments[0].dbId, 'active-id');
});
