import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../../layouts/mainLayout';
import OfficeTools from '../../../components/OfficeTools';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import { buildRevenueReport } from '../../../services/revenueReport.js';
import { getRevenueReportRecords, REVENUE_REPORT_TABLES } from '../../../services/revenueReportService';
import './revenueReport.css';

const money = amount => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(amount);
const RANGES = [['today', 'Today'], ['thisWeek', 'This Week'], ['thisMonth', 'This Month'], ['last3Months', 'Last 3 Months']];
const EMPTY = { shipments: [], customers: [], payments: [], deliveries: [], expenses: [], fuel: [], maintenance: [] };

function ChargeChart({ trend }) {
  const max = Math.max(1, ...trend.map(b => b.amount));
  const x = i => 80 + i * 420 / Math.max(1, trend.length - 1);
  const y = amount => 210 - amount / max * 160;
  return <svg className="rv-trend" viewBox="0 0 560 270" role="img" aria-label="Completed shipment charges by creation date">
    {[0, 0.5, 1].map(r => <g key={r}>
      <line x1="75" x2="530" y1={y(r * max)} y2={y(r * max)} stroke="#E5E7EB" />
      <text x="70" y={y(r * max) - 4} textAnchor="end">{money(r * max)}</text>
    </g>)}
    <polyline points={trend.map((b, i) => `${x(i)},${y(b.amount)}`).join(' ')} fill="none" stroke="#0F172A" strokeWidth="3" />
    {trend.map((b, i) => <g key={b.date}>
      <circle cx={x(i)} cy={y(b.amount)} r="4" fill="#0F172A"><title>{b.date}: {money(b.amount)} ({b.count} priced completed shipments)</title></circle>
      <text x={x(i)} y="235" textAnchor="end" transform={`rotate(-30 ${x(i)} 235)`}>{b.date.slice(5)}</text>
    </g>)}
  </svg>;
}

export default function RevenueReport() {
  const live = useLiveData(getRevenueReportRecords, REVENUE_REPORT_TABLES);
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const customPickerRef = useRef(null);

  useEffect(() => {
    const outside = event => { if (!customPickerRef.current?.contains(event.target)) setShowCustomPicker(false); };
    const escape = event => { if (event.key === 'Escape') setShowCustomPicker(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  function applyCustom() {
    try {
      setAppliedCustom(reportRange('custom', customStart, customEnd));
      setActiveRange('custom'); setShowCustomPicker(false); setRangeError(''); setPage(1);
    } catch (error) { setRangeError(error.message); }
  }
  const range = activeRange === 'custom' ? appliedCustom : reportRange(activeRange);
  const report = buildRevenueReport(live.data || EMPTY, range);
  const hasData = !!live.data;
  const routes = report.routes.filter(r => r.route.toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(routes.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRoutes = routes.slice((currentPage - 1) * 10, currentPage * 10);
  const maxCost = Math.max(1, ...report.costBreakdown.map(c => c.amount));
  const stats = [
    ['Completed Charges', report.charges, 'Current completed shipments created in this period'],
    ['Verified Payments', report.payments, 'Currently verified payments dated in this period'],
    ['Approved Trip Expenses', report.expenses, 'Currently approved expenses created in this period'],
    ['Completed Maintenance Costs', report.maintenance, 'Completed service records dated in this period'],
  ];
  const missing = stats.reduce((sum, [, summary]) => sum + summary.missing, 0) + report.fuel.missing;

  return <MainLayout>
    <header className="topbar"><span>Reports</span><OfficeTools /></header>
    <section className="content revenue-report-live">
      <div className="header-row">
        <div><h2>Reports — Revenue</h2><p>Review recorded charges, payments, costs, customers, and routes.</p></div>
        <div className="report-actions"><button className="secondary-btn" onClick={live.refresh}>Refresh</button></div>
      </div>
      <div className="filters">
        {RANGES.map(([key, label]) => <button key={key} className={`filter ${activeRange === key ? 'active' : ''}`} aria-pressed={activeRange === key} onClick={() => { setActiveRange(key); setShowCustomPicker(false); setPage(1); }}>{label}</button>)}
        <div className="custom-range-wrapper" ref={customPickerRef}>
          <button className={`filter ${activeRange === 'custom' ? 'active' : ''}`} aria-expanded={showCustomPicker} aria-pressed={activeRange === 'custom'} onClick={() => setShowCustomPicker(!showCustomPicker)}>Custom Range</button>
          {showCustomPicker && <div className="custom-range-popover">
            <div className="custom-range-field"><label htmlFor="rv-start">Start date</label><input id="rv-start" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
            <div className="custom-range-field"><label htmlFor="rv-end">End date</label><input id="rv-end" type="date" min={customStart || undefined} value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
            {rangeError && <p role="alert">{rangeError}</p>}
            <button className="custom-range-apply-btn" onClick={applyCustom} disabled={!customStart || !customEnd || customStart > customEnd}>Apply</button>
          </div>}
        </div>
        <span className="rv-date">{range.start} – {range.end} · Philippine time</span>
      </div>
      <div className="rv-notes">
        <p>Charges, customer rankings, and routes use shipments created in the selected dates with current completed status. Payments use their payment dates; approved expenses use creation dates; maintenance uses completion dates. These are separate record totals.</p>
        <p>Fuel logs and repair expenses may overlap other cost records. Net profit and route margins are unavailable without reconciled costs. Verified payments exclude currently pending, rejected, and refunded records.</p>
      </div>
      {live.loading && <p role="status">Loading revenue report…</p>}
      {live.error && <p role="alert">Unable to refresh the report. {hasData ? 'Showing the last loaded snapshot.' : 'Report data is unavailable.'} <button onClick={live.refresh}>Retry</button></p>}
      {hasData && missing > 0 && <p role="status">{missing} record(s) have missing or invalid amounts and are excluded from monetary totals; {report.charges.missing} are completed shipment charges.</p>}
      {hasData && report.undatedPayments > 0 && <p>{report.undatedPayments} verified payment(s) lack a valid payment date and cannot be included in a date range.</p>}
      <div className="stats">
        {stats.map(([label, summary, explanation]) => <div className="stat-card" key={label}><h4>{label}</h4><h2>{hasData ? money(summary.amount) : '—'}</h2><p>{explanation}</p><small>{hasData ? summary.count : '—'} records{summary.missing ? ` · ${summary.missing} without valid amounts` : ''}</small></div>)}
      </div>
      {hasData && <>
        <div className="analytics-grid">
          <div className="chart-card wide">
            <div className="card-header"><h3>Completed Charges Over Time</h3></div>
            {!report.charges.count && <p className="empty-state-text">No completed shipments were created in this period.</p>}
            <ChargeChart trend={report.trend} />
            <p className="rv-notes">Average per priced completed shipment: {report.averageCharge == null ? '—' : money(report.averageCharge)}. Missing charge amounts are excluded.</p>
          </div>
          <div className="chart-card">
            <div className="card-header"><h3>Approved Expense Breakdown</h3></div>
            {!report.costBreakdown.length ? <p className="empty-state-text">No approved expenses with valid amounts in this period.</p> : <ul className="rv-cost-list">{report.costBreakdown.map(cost => <li key={cost.category}><div><span>{cost.category}</span><strong>{money(cost.amount)}</strong></div><div className="rv-cost-track"><i style={{ width: `${cost.amount / maxCost * 100}%` }} /></div></li>)}</ul>}
            <p className="rv-notes">Fuel log total: {money(report.fuel.amount)} across {report.fuel.count} logs dated in this period. Shown separately because fuel may also appear in approved expenses.</p>
          </div>
        </div>
        <div className="bottom-grid">
          <div className="info-card">
            <div className="card-header"><h3>Top Customers by Charges</h3><Link className="view-btn" to="/customer">Customers</Link></div>
            <p className="rv-notes">Billing customer where specified; otherwise the booking customer. Top five by recorded completed charges.</p>
            <div className="customer-list">{!report.topCustomers.length ? <p className="empty-state-text">No customer charges for this period.</p> : report.topCustomers.map(customer => <div className="customer-row" key={customer.id}><span>{customer.name}<small>{customer.priced} priced of {customer.shipments} completed shipments</small></span><strong>{money(customer.revenue)}</strong></div>)}</div>
          </div>
          <div className="info-card">
            <div className="card-header"><h3>Charges by Route</h3><Link className="view-btn" to="/shipment">Shipments</Link></div>
            <label className="rv-route-search">Search routes <input type="search" aria-label="Search routes" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
            <p className="rv-notes">Routes group exact recorded addresses. Expense column includes only approved expenses created in the selected dates, linked to these completed shipments; it excludes shared costs and is not a margin.</p>
            <div className="rv-table-scroll"><table className="report-table"><thead><tr><th>Origin → Destination</th><th>Completed Shipments</th><th>Charges</th><th>Approved Expenses</th></tr></thead><tbody>
              {!visibleRoutes.length ? <tr><td colSpan={4} className="empty-row">No routes match this period and search.</td></tr> : visibleRoutes.map(route => <tr key={route.id}><td>{route.route}</td><td>{route.shipments}<small>{route.priced} priced</small></td><td>{money(route.revenue)}</td><td>{money(route.expenses)}</td></tr>)}
            </tbody></table></div>
            <div className="rv-pager"><span>Showing {routes.length ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, routes.length)} of {routes.length} routes</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Prev</button><span>Page {currentPage} of {pageCount}</span><button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
          </div>
        </div>
      </>}
    </section>
  </MainLayout>;
}
