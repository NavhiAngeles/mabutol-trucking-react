import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import {
  classifyReportSection,
  filterReportSections,
  getExcelWorkbookSheets,
  getReportKpiCards,
  philippineTimestamp,
  reportStructuredSections,
} from '../services/reportCsvTables.js';

const find = (node, pred) =>
  !node || typeof node !== 'object'
    ? []
    : [...(pred(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(c => find(c, pred))];

const textOf = node => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
};

async function mountModal(overrides = {}) {
  const modalPath = new URL('./ReportExportModal.jsx', import.meta.url);
  const printPath = new URL('./ReportPrintDocument.jsx', import.meta.url);
  const { code: modalCode } = await transformWithOxc(fs.readFileSync(modalPath, 'utf8'), modalPath.pathname, { jsx: { runtime: 'classic' } });
  const { code: printCode } = await transformWithOxc(fs.readFileSync(printPath, 'utf8'), printPath.pathname, { jsx: { runtime: 'classic' } });

  const states = [];
  let stateIdx = 0;
  let downloadedArgs = null;
  let closed = false;

  const range = { start: '2026-10-01', end: '2026-10-24' };
  const reportData = {
    total: 5,
    completed: 4,
    delayed: 1,
    onTime: 80,
    timed: 5,
    revenue: 12000,
    missingAmounts: 0,
    buckets: [{ date: '2026-10-01', completed: 4, delayed: 1, revenue: 12000 }],
    drivers: [{ id: 'd1', full_name: 'Juan Dela Cruz', trips: 5, pct: 80 }],
    compliance: { verified: 10, expiring: 1, attention: 0, pending: 0 },
    complianceTotal: 11,
    fleet: { total: 10, available: 8, inUse: 2, maintenance: 0, other: 0 },
    overdueServiceRecords: 0,
  };

  const scope = {
    React: {
      Fragment: 'Fragment',
      forwardRef: fn => (props => fn(props, null)),
      createElement: (type, props, ...children) =>
        typeof type === 'function'
          ? type({ ...(props || {}), children })
          : { type, props: props || {}, children },
    },
    useState(initial) {
      const idx = stateIdx++;
      if (!(idx in states)) states[idx] = typeof initial === 'function' ? initial() : initial;
      return [states[idx], v => { states[idx] = typeof v === 'function' ? v(states[idx]) : v; }];
    },
    useRef: initial => ({ current: initial }),
    useEffect() {},
    useMemo: fn => fn(),
    forwardRef: fn => (props => fn(props, null)),
    classifyReportSection,
    filterReportSections,
    getExcelWorkbookSheets,
    getReportKpiCards,
    philippineTimestamp,
    reportStructuredSections,
    downloadReport: (...args) => { downloadedArgs = args; },
    document: { addEventListener() {}, removeEventListener() {} },
  };

  const stripImports = src =>
    src.replace(/^import [\s\S]*?from\s+['"][^'"]+['"];\r?\n?/gm, '')
      .replace(/^import\s+['"][^'"]+['"];\r?\n?/gm, '');

  vm.createContext(scope);
  vm.runInContext(
    stripImports(printCode).replace('export default ReportPrintDocument;', '') +
      '\n' +
      stripImports(modalCode).replace('export default function ReportExportModal', 'function ReportExportModal') +
      '\nthis.Component = ReportExportModal;',
    scope
  );

  const props = {
    open: true,
    onClose: () => { closed = true; },
    reportType: 'Overview',
    range,
    activeRangeLabel: 'This Month',
    reportData,
    filters: {},
    initialFormat: 'pdf',
    ...overrides,
  };

  const render = () => {
    stateIdx = 0;
    return scope.Component(props);
  };

  return {
    render,
    downloaded: () => downloadedArgs,
    wasClosed: () => closed,
  };
}

test('ReportExportModal renders Tanaw-branded ReportPrintDocument with 4-column KPI grid, Cyan SVG chart, and dynamic paper setup', async () => {
  const ui = await mountModal();
  let tree = ui.render();

  assert.ok(find(tree, n => n.props?.role === 'dialog').length === 1);
  assert.equal(find(tree, n => String(n.props?.className || '').includes('rpd-brand-banner')).length, 1);
  let page = find(tree, n => String(n.props?.className || '').includes('rpd-page'))[0];
  assert.ok(page, 'Unified ReportPrintDocument page is rendered');
  assert.equal(page.props.style.width, '660px');
  assert.equal(page.props.style.padding, '38px');

  assert.equal(find(tree, n => String(n.props?.className || '').includes('rpd-kpi-card')).length, 4);
  assert.equal(find(tree, n => String(n.props?.className || '').includes('rpd-svg-chart')).length, 1);

  find(tree, n => n.props?.id === 'rem-paper-size')[0].props.onChange({ target: { value: 'legal' } });
  find(tree, n => n.type === 'button' && textOf(n).trim() === 'Landscape')[0].props.onClick();
  find(tree, n => n.type === 'button' && textOf(n).trim() === 'Wide')[0].props.onClick();

  tree = ui.render();
  page = find(tree, n => String(n.props?.className || '').includes('rpd-page'))[0];
  assert.equal(page.props.style.width, '940px');
  assert.equal(page.props.style.padding, '54px');

  await find(tree, n => n.type === 'button' && textOf(n).trim() === 'Download PDF')[0].props.onClick();
  const args = ui.downloaded();
  assert.equal(args[0], 'Overview');
  assert.equal(args[4], 'pdf');
  assert.equal(args[5].paperSize, 'legal');
  assert.equal(args[5].orientation, 'landscape');
  assert.equal(args[5].margins, 'wide');
  assert.equal(ui.wasClosed(), true);
});

test('ReportExportModal switches to Excel (.xlsx) workbook preview with clickable sheet tabs', async () => {
  const ui = await mountModal();
  let tree = ui.render();

  find(tree, n => n.type === 'button' && textOf(n).trim() === 'Excel (.xlsx)')[0].props.onClick();

  tree = ui.render();
  assert.equal(find(tree, n => String(n.props?.className || '').includes('rpd-page')).length, 0);
  assert.equal(find(tree, n => n.props?.id === 'rem-paper-size').length, 0);

  const tabs = find(tree, n => n.props?.role === 'tab');
  const tabLabels = tabs.map(t => textOf(t).trim());
  assert.deepEqual(tabLabels, [
    'Executive Summary',
    'Shipment Volume',
    'Driver Performance',
    'Fleet & Compliance',
  ]);

  // Switch to Shipment Volume tab and verify headers
  tabs[1].props.onClick();
  tree = ui.render();
  const headers = find(tree, n => n.type === 'th').map(th => textOf(th).trim());
  assert.ok(headers.includes('Completed charges (PHP)'));

  await find(tree, n => n.type === 'button' && textOf(n).trim() === 'Download Excel')[0].props.onClick();
  const args = ui.downloaded();
  assert.equal(args[4], 'xlsx');
  assert.equal(args[5].includedSections.kpi, true);
});

test('ReportExportModal disables download when all sections are unchecked', async () => {
  const ui = await mountModal();
  let tree = ui.render();

  for (const id of ['rem-sec-kpi', 'rem-sec-charts', 'rem-sec-table']) {
    find(tree, n => n.props?.id === id)[0].props.onChange();
    tree = ui.render();
  }

  const downloadBtn = find(tree, n => n.type === 'button' && textOf(n).trim() === 'Download PDF')[0];
  assert.equal(downloadBtn.props.disabled, true);
  assert.ok(find(tree, n => n.props?.role === 'alert').length === 1);
});
