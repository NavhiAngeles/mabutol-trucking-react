import { useState, useRef, useEffect } from "react";
import { Link } from 'react-router-dom';
import OfficeTools from '../../../components/OfficeTools';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import { buildShipmentReport } from '../../../services/shipmentReport.js';
import { getShipmentReportRecords, SHIPMENT_REPORT_TABLES } from '../../../services/shipmentReportService';
import MainLayout from "../../../layouts/mainLayout";
import "./shipmentReport.css";

/* ---------- Icons (inline, no extra dependency) ---------- */
const paths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 21h16" /></>,
  up: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  down: <><path d="m22 17-8.5-8.5-5 5L2 7" /><path d="M16 17h6v-6" /></>,
  truck: <><path d="M1 6h13v10H1zM14 10h4l4 3v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cancel: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
  filter: <path d="M3 6h18M6 12h12M10 18h4" />,
};

const Icon = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>
);

const rangeTabs = [
  ["today", "Today"],
  ["thisWeek", "This Week"],
  ["thisMonth", "This Month"],
  ["last3Months", "Last 3 Months"],
];

const statusColors = { completed: '#0A2A4D', active: '#DBE4F7', delayed: '#475569', cancelled: '#B91C1C', pending: '#EAB308', booked: '#8B5CF6', other: '#9CA3AF' };
function StatusDiamond({ report }) {
  let offset = 0;
  return <svg className="sr-diamond" viewBox="0 0 270 270" role="img" aria-label={'Shipment status breakdown: ' + report.total + ' total'}>
    <circle cx="135" cy="135" r="96" fill="none" stroke="#E5E7EB" strokeWidth="18" />
    {Object.entries(report.breakdown).map(([key, count]) => {
      const length = report.total ? count / report.total * 100 : 0;
      const start = offset; offset += length;
      return <circle key={key} cx="135" cy="135" r="96" fill="none" stroke={statusColors[key]} strokeWidth="18" pathLength="100" strokeDasharray={length + ' ' + (100-length)} strokeDashoffset={-start} transform="rotate(-90 135 135)"><title>{key}: {count}</title></circle>;
    })}
    <text x="135" y="143" textAnchor="middle" className="sr-diamond-num">{report.total}</text><text x="135" y="163" textAnchor="middle" className="sr-diamond-lbl">TOTAL</text>
  </svg>;
}
function TrendChart({ trend }) {
  const x = i => 55 + i * 490 / Math.max(1, trend.length - 1);
  const y = rate => 290 - rate * 2.5;
  return <svg className="sr-trend" viewBox="0 0 584 358" role="img" aria-label="On-time rate of timed completed shipments by creation date">
    {[0,25,50,75,100].map(t => <g key={t}><line x1="45" x2="560" y1={y(t)} y2={y(t)} stroke="#E5E7EB" /><text x="40" y={y(t)} textAnchor="end" className="sr-axis">{t}%</text></g>)}
    {trend.map((b,i) => <g key={b.date}>{b.rate != null && <><circle cx={x(i)} cy={y(b.rate)} r="5" fill="#0A2A4D"><title>{b.date}: {b.rate}% ({b.count} shipments)</title></circle>{i > 0 && trend[i-1].rate != null && <line x1={x(i-1)} y1={y(trend[i-1].rate)} x2={x(i)} y2={y(b.rate)} stroke="#35597F" strokeWidth="3" />}</>}<text x={x(i)} y="325" textAnchor="middle" className="sr-axis">{b.date.slice(5)}</text></g>)}
  </svg>;
}
const formatTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

/* ---------- Page ---------- */
export default function ShipmentReport() {
  const live = useLiveData(getShipmentReportRecords, SHIPMENT_REPORT_TABLES);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [customRange, setCustomRange] = useState(null);
  const [rangeError, setRangeError] = useState('');
  const [activeRange, setActiveRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [page, setPage] = useState(1);
  const customPickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target)) {
        setShowCustomPicker(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setShowCustomPicker(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleRangeClick = (range) => {
    setActiveRange(range);
    setShowCustomPicker(false);
    setPage(1);
  };

  const handleApplyCustomRange = () => {
    try { setCustomRange(reportRange('custom', customStart, customEnd)); setRangeError(''); }
    catch (error) { setRangeError(error.message); return; }
    setActiveRange("custom");
    setShowCustomPicker(false);
    setPage(1);
  };

  const range = activeRange === 'custom' ? customRange : reportRange(activeRange);
  const report = buildShipmentReport(live.data?.shipments || [], live.data?.deliveries || [], range, search, status);
  const hasData = !!live.data;
  const b = report.breakdown;
  const total = report.total;
  const dateLabel = range.start + ' – ' + range.end;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = report.rows.slice((currentPage - 1) * 10, currentPage * 10);
  const stats = [
    { label: 'Total Shipments', icon: 'truck', accent: 'navy', value: hasData ? total : '—' },
    { label: 'On-Time Rate', icon: 'clock', accent: 'slate', value: hasData && report.rate != null ? report.rate + '%' : '—' },
    { label: 'Cancelled Shipments', icon: 'cancel', accent: 'red', value: hasData ? b.cancelled : '—' },
  ];
  const variantClass = v => v.startsWith('-') ? 'good' : v.startsWith('+') ? 'bad' : 'muted';

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="sr-topbar">
        <label className="sr-search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search shipments, customers, routes, drivers" aria-label="Search shipments" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <OfficeTools />
      </header>

      <section className="sr-content">
        {/* Header */}
        <div className="sr-header">
          <div>
            <h1>Reports — Shipments</h1>
            <p>Comprehensive analysis of delivery performance and volume.</p>
          </div>
          <div className="sr-actions">
            <button className="sr-btn sr-btn-secondary" onClick={live.refresh}>Refresh</button>
          </div>
        </div>

        {/* Filters */}
        <div className="sr-filters">
          <div className="sr-tabs">
            {rangeTabs.map(([key, label]) => (
              <button key={key} className={`sr-tab ${activeRange === key ? "active" : ""}`}
                aria-pressed={activeRange === key} onClick={() => handleRangeClick(key)}>
                {label}
              </button>
            ))}
            <div className="sr-custom-wrap" ref={customPickerRef}>
              <button className={`sr-tab ${activeRange === "custom" ? "active" : ""}`}
                aria-pressed={activeRange === "custom"} aria-expanded={showCustomPicker}
                onClick={() => setShowCustomPicker((o) => !o)}>
                Custom Range <span className="sr-caret" />
              </button>
              {showCustomPicker && (
                <div className="sr-popover">
                  <div className="sr-field">
                    <label htmlFor="sr-start">Start date</label>
                    <input id="sr-start" type="date" value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)} />
                  </div>
                  <div className="sr-field">
                    <label htmlFor="sr-end">End date</label>
                    <input id="sr-end" type="date" value={customEnd} min={customStart || undefined}
                      onChange={(e) => setCustomEnd(e.target.value)} />
                  </div>
                  {rangeError && <p role="alert">{rangeError}</p>}
                  <button className="sr-apply" onClick={handleApplyCustomRange}
                    disabled={!customStart || !customEnd || customStart > customEnd}>Apply</button>
                </div>
              )}
            </div>
          </div>
          <span className="sr-date-pill">{dateLabel}</span>
        </div>

<p>Shipments created in the selected dates (Philippine time), using current status. Search and status filters apply to totals, charts and ledger. On-time rates use {hasData ? report.timed : '—'} completed shipments with both arrival timestamps.</p>
        {live.loading && <p role="status">Loading shipment report…</p>}
        {live.error && <p role="alert">Unable to refresh the report. {hasData ? 'Showing the last loaded snapshot.' : 'Report data is unavailable.'} <button onClick={live.refresh}>Retry</button></p>}
        {/* Stats */}
        <div className="sr-stats">
          {stats.map((s) => (
            <div className={`sr-stat sr-accent-${s.accent}`} key={s.label}>
              <div className="sr-stat-top">
                <span className="sr-stat-label">{s.label}</span>
                <span className="sr-stat-icon"><Icon name={s.icon} size={13} /></span>
              </div>
              <div className="sr-stat-value">
                <strong>{s.value}</strong>

              </div>
            </div>
          ))}
        </div>

        {/* Analytics */}
        {hasData && <div className="sr-analytics">
          <div className="sr-card sr-chart-card">
            <h3>Shipment Status</h3>
            <StatusDiamond report={report} />
            <ul className="sr-legend">
              {Object.keys(statusColors).map((k) => (
                <li key={k}>
                  <i style={{ background: statusColors[k] }} />
                  {k.charAt(0).toUpperCase() + k.slice(1)} ({b[k]})
                </li>
              ))}
            </ul>
          </div>

          <div className="sr-card sr-chart-card">
            <div className="sr-trend-head">
              <h3>Delivery Performance Trend</h3>
              <div className="sr-trend-legend">
                <span><i className="solid" /> Actual</span>

              </div>
            </div>
            <TrendChart trend={report.trend} />{!report.timed && <p>No timed completed shipments for this selection.</p>}
          </div>
        </div>

        }
        {/* Ledger */}
        <div className="sr-card sr-ledger">
          <div className="sr-ledger-head">
            <h3>Shipment Ledger</h3>
<div className="sr-ledger-tools"><label htmlFor="sr-status">Status </label><select id="sr-status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">All statuses</option>{Object.keys(statusColors).map(key => <option key={key} value={key}>{key}</option>)}</select></div>
          </div>

          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Shipment ID</th><th>Customer</th><th>Route</th><th>Status</th>
                  <th>Planned ETA</th><th>Actual Delivery</th><th className="r">Variance</th><th>Driver</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="sr-empty">
                      {!hasData ? 'Report data is not loaded.' : 'No shipments match this date range and filters.'}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => (
                    <tr key={r.id}>
                      <td className="id"><Link to={'/shipment?tab=all&record=' + encodeURIComponent(r.id)}>{r.tracking_number || r.id}</Link></td>
                      <td>{r.customerName}</td>
                      <td className="route">{r.route}</td>
                      <td><span className={`sr-status ${r.group}`}><i />{r.status}</span></td>
                      <td>{formatTime(r.estimated_arrival)}</td>
                      <td className={r.status === "delayed" ? "late" : ""}>{formatTime(r.actual_delivery_at)}</td>
                      <td className={`r var ${variantClass(r.variance)}`}>{r.variance}</td>
                      <td>{r.driverName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sr-ledger-foot">
            <span>
              Showing {hasData && total ? (currentPage - 1) * 10 + 1 : 0} to {hasData ? Math.min(currentPage * 10, total) : 0} of {hasData ? total : '—'} entries
            </span>
            <div className="sr-pager">
<button disabled={!hasData || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Prev</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button disabled={!hasData || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}