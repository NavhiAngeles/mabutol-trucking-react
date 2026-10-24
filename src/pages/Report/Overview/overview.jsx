import ReportSchedule from '../../../components/ReportSchedule';
import { useReportRange } from '../../../hooks/useReportRange';
import { downloadReport } from '../../../services/reportExport.js';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../../layouts/mainLayout';
import ReportTopbar from '../../../components/ReportTopbar';
import OperationsFeed from '../../Dashboard/OperationsFeed';
import { useLiveData } from '../../../hooks/useLiveData';
import { getReportOverview, REPORT_TABLES } from '../../../services/reportOverviewService';
import { reportRange, summarizeOverview } from '../../../services/reportOverview.js';
import './overview.css';
import '../../../components/reportControls.css';

const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
const ranges = [['today', 'Today'], ['thisWeek', 'This Week'], ['thisMonth', 'This Month'], ['last3Months', 'Last 3 Months']];

function Chart({ buckets, revenue = false }) {
  const max = Math.max(1, ...buckets.map(b => revenue ? b.revenue : Math.max(b.completed, b.delayed)));
  const x = i => 60 + i * 350 / Math.max(1, buckets.length - 1);
  const y = v => 165 - v / max * 130;
  return <svg className="ov-chart-svg" viewBox="0 0 460 215" role="img" aria-label={revenue ? 'Completed shipment charges by creation date' : 'Completed and currently delayed shipments by creation date'}>
    {[0, 0.5, 1].map(r => <g key={r}><line x1="55" x2="435" y1={y(max * r)} y2={y(max * r)} stroke="#E5E7EB" /><text x="50" y={y(max * r) - 5} textAnchor="end" className="ov-axis ov-axis-sm">{revenue ? money(max * r) : Math.ceil(max * r)}</text></g>)}
    {revenue ? buckets.map((b, i) => <rect key={b.date} x={x(i) - 8} y={y(b.revenue)} width="16" height={165 - y(b.revenue)} fill="#0F172A"><title>{b.date}: {money(b.revenue)}</title></rect>) : ['completed', 'delayed'].map((key, k) => <g key={key}><polyline points={buckets.map((b, i) => `${x(i)},${y(b[key])}`).join(' ')} fill="none" stroke={k ? '#F97316' : '#0F172A'} strokeWidth="3" strokeDasharray={k ? '5 4' : undefined} />{buckets.map((b, i) => <circle key={b.date} cx={x(i)} cy={y(b[key])} r="3" fill={k ? '#F97316' : '#0F172A'}><title>{b.date}: {b[key]} {key}</title></circle>)}</g>)}
    {buckets.map((b, i) => <text key={b.date} x={x(i)} y="188" textAnchor="end" transform={`rotate(-25 ${x(i)} 188)`} className="ov-axis ov-axis-sm">{b.date.slice(5)}</text>)}
  </svg>;
}

export default function Overview() {
  const live = useLiveData(getReportOverview, REPORT_TABLES);
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [custom, setCustom] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const customRef = useRef(null);
  useEffect(() => {
    const outside = event => { if (!customRef.current?.contains(event.target)) setShowCustom(false); };
    const escape = event => { if (event.key === 'Escape') setShowCustom(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const range = useReportRange(activeRange, custom);
  const report = live.data && summarizeOverview(live.data, range);
  const percent = report?.complianceTotal ? Math.round(report.compliance.verified / report.complianceTotal * 100) : null;
  const stats = report ? [
    ['Total Shipments', report.total, `${report.completed} completed · ${report.delayed} currently delayed`],
    ['On-Time Rate', report.onTime == null ? '—' : report.onTime + '%', `${report.timed} completed shipments with both arrival timestamps`],
    ['Completed Charges', money(report.revenue), `Recorded final amounts; not payments or net profit${report.missingAmounts ? ` · ${report.missingAmounts} missing amounts excluded` : ''}`],
    ['Current Compliance', percent == null ? '—' : percent + '%', `${report.compliance.verified} of ${report.complianceTotal} drivers and vehicles fully verified`],
  ] : [];
  function applyRange() {
    try { setCustom(reportRange('custom', customStart, customEnd)); setActiveRange('custom'); setShowCustom(false); setRangeError(''); }
    catch (error) { setRangeError(error.message); }
  }
  return <MainLayout><div className="reports-page">
    <ReportTopbar />
    <section className="ov-content">
      <div className="report-controls"><div className="ov-header"><div><h1>Reports — Overview</h1><p>Track operational performance and key logistics metrics.</p></div><div className="ov-actions"><button className="ov-btn ov-btn-secondary" onClick={live.refresh}>Refresh</button><button className="ov-btn ov-btn-primary" disabled={!live.data || !!live.error} onClick={() => downloadReport('Overview', range, { ...report, fleet: live.data.resources, overdueServiceRecords: live.data.overdue }, {})}>Export CSV</button><ReportSchedule type="Overview" /></div></div>
      <div className="ov-filters"><div className="ov-tabs">{ranges.map(([key, label]) => <button key={key} className={`ov-tab ${activeRange === key ? 'active' : ''}`} aria-pressed={activeRange === key} onClick={() => { setActiveRange(key); setShowCustom(false); }}>{label}</button>)}<div className="ov-custom-wrap" ref={customRef}><button className={`ov-tab ${activeRange === 'custom' ? 'active' : ''}`} aria-expanded={showCustom} onClick={() => setShowCustom(!showCustom)}>Custom Range</button>{showCustom && <form className="ov-popover" onSubmit={event => { event.preventDefault(); applyRange(); }}><div className="ov-field"><label htmlFor="ov-start">Start date</label><input id="ov-start" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div><div className="ov-field"><label htmlFor="ov-end">End date</label><input id="ov-end" type="date" min={customStart} value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>{rangeError && <p role="alert">{rangeError}</p>}<button className="ov-apply" type="submit">Apply</button></form>}</div></div><span className="ov-date-pill">{range.start} – {range.end} · Philippine time</span></div>
</div>
      <p className="report-scope-note">Period metrics use shipments created in the selected dates (Philippine time) and their current status. Fleet and compliance show the current snapshot.</p>
      {live.loading && <p role="status">Loading report…</p>}
      {live.error && <p role="alert">Unable to refresh the report. {live.data ? 'Showing the last loaded snapshot.' : 'Report data is unavailable.'} <button onClick={live.refresh}>Retry</button></p>}
      {report && <>
        {!report.total && <p role="status">No shipments were created in this period.</p>}
        <div className="ov-stats">{stats.map(([label, value, sub]) => <div className="ov-stat ov-accent-navy" key={label}><div className="ov-stat-top"><span className="ov-stat-label">{label}</span></div><div className="ov-stat-value"><strong>{value}</strong></div><p className="ov-stat-sub">{sub}</p></div>)}</div>
        <div className="ov-charts"><div className="ov-card ov-chart-card"><div className="ov-chart-head"><div className="ov-chart-title"><h3>Shipment Volume</h3><p>Current completed and delayed status by creation date</p></div></div><Chart buckets={report.buckets} /><div className="ov-legend"><span><i className="sq" /> Completed</span><span><i className="dash" /> Delayed</span></div></div><div className="ov-card ov-chart-card"><div className="ov-chart-head"><div className="ov-chart-title"><h3>Completed Shipment Charges</h3><p>Recorded final amounts by shipment creation date</p></div></div><Chart buckets={report.buckets} revenue /><p>No revenue target is configured.</p></div></div>
        <div className="ov-bottom"><div className="ov-card ov-drivers"><div className="ov-card-head"><h3>Top Performing Drivers</h3><Link className="ov-link" to="/fleet?view=drivers">View Fleet</Link></div><p>On-time share of completed shipments with recorded arrival times in this cohort.</p>{!report.drivers.length && <p>No eligible driver performance records for this period.</p>}<ul className="ov-driver-list">{report.drivers.map(d => <li key={d.id}><span className="ov-initials ov-initials-dark">{d.full_name.slice(0, 2).toUpperCase()}</span><div className="ov-driver-info"><strong>{d.full_name}</strong><span>{d.trips} timed completed shipments</span></div><div className="ov-driver-pct"><strong>{d.pct}%</strong><span>ON-TIME</span></div></li>)}</ul></div>
        <div className="ov-card ov-compliance"><div className="ov-comp-head"><h3>Current Compliance</h3><Link className="ov-link" to="/fleet?view=compliance">View Compliance</Link></div><div className="ov-comp-body"><div className="ov-gauge" style={{ background: `conic-gradient(#0F172A ${(percent || 0) * 3.6}deg, #E5E7EB 0)` }}><div><strong>{percent == null ? '—' : percent + '%'}</strong><span>COMPLIANT</span></div></div></div><ul className="ov-comp-list">{[['Verified', 'verified'], ['Expiring Soon', 'expiring'], ['Missing / Expired / Rejected', 'attention'], ['Pending Review', 'pending']].map(([label, key]) => <li key={key}><span>{label}</span><b>{report.compliance[key]}</b></li>)}</ul><p>Counts drivers and vehicles, including missing required documents.</p></div>
        <div className="ov-lower"><div className="ov-card ov-fleet"><div className="ov-card-head"><h3>Current Fleet Summary</h3><Link className="ov-link" to="/fleet">Manage Fleet</Link></div><div className="ov-fleet-grid">{[['TOTAL FLEET', live.data.resources.total], ['DISPATCH READY', live.data.resources.available], ['ON TRIP / RESERVED', live.data.resources.inUse], ['MAINTENANCE', live.data.resources.maintenance], ['OTHER', live.data.resources.other], ['OVERDUE SERVICE RECORDS', live.data.overdue]].map(([label, value]) => <div className="ov-tile" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div><div className="ov-card ov-activity"><OperationsFeed /></div></div></div>
      </>}
    </section>
  </div></MainLayout>;
}
