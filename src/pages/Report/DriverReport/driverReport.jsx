import { useState, useRef, useEffect, Fragment } from "react";
import { Link } from 'react-router-dom';
import OfficeTools from '../../../components/OfficeTools';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import { buildDriverReport, DRIVER_STATUSES } from '../../../services/driverReport.js';
import { getDriverReportRecords, DRIVER_REPORT_TABLES } from '../../../services/driverReportService';
import MainLayout from "../../../layouts/mainLayout";
import "./driverReport.css";

/* =========================
   ICONS (inline SVG, no extra dependency)
========================= */
const Icon = ({ children, size = 18, sw = 2, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
const ChevronRight = (p) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
const ChevronLeft = (p) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);
const CaretDown = (p) => (
  <Icon {...p}>
    <path d="m7 10 5 5 5-5" />
  </Icon>
);
const AlertIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <path d="M12 16.5v.01" />
  </Icon>
);
const UsersIcon = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.2" />
    <path d="M17 14c2.5 0 4 1.8 4 4" />
  </Icon>
);
const TimerIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M9 2h6" />
  </Icon>
);
const SwapIcon = (p) => (
  <Icon {...p}>
    <path d="M7 4v14" />
    <path d="m3 14 4 4 4-4" />
    <path d="M17 20V6" />
    <path d="m13 10 4-4 4 4" />
  </Icon>
);

const STAT_ICONS = [UsersIcon, TimerIcon, SwapIcon];

const RANGES = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "last3Months", label: "Last 3 Months" },
];

// Round the axis max up to a clean step so ticks land on whole numbers
const buildAxis = (max) => {
  const step = Math.max(1, Math.ceil(max / 4));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
};

/* =========================
   PAGE
========================= */
export default function DriverReport() {
  const live = useLiveData(getDriverReportRecords, DRIVER_REPORT_TABLES);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [rangeError, setRangeError] = useState('');
  const [activeRange, setActiveRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [appliedCustom, setAppliedCustom] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const customPickerRef = useRef(null);

  // Close the custom range popover on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target)) {
        setShowCustomPicker(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setShowCustomPicker(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const handleRangeClick = (range) => {
    setActiveRange(range);
    setPage(1); setExpandedId(null);
    setShowCustomPicker(false);
  };

  const handleApplyCustomRange = () => {
    try { setAppliedCustom(reportRange('custom', customStart, customEnd)); setRangeError(''); }
    catch (error) { setRangeError(error.message); return; }
    setPage(1); setExpandedId(null);
    setActiveRange("custom");
    setShowCustomPicker(false);
  };

  const range = activeRange === 'custom' ? appliedCustom : reportRange(activeRange);
  const report = buildDriverReport(live.data || { drivers: [], shipments: [], deliveries: [], incidents: [] }, range, search, status);
  const hasData = !!live.data;
  const dateLabel = range.start + ' – ' + range.end;
  const incidentAxis = buildAxis(Math.max(1, ...report.incidents.map(i => i.count)));
  const emptyText = !hasData ? 'Report data is not loaded.' : 'No matching driver data for this selection.';
  const pageCount = Math.max(1, Math.ceil(report.rows.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = report.rows.slice((currentPage - 1) * 10, currentPage * 10);
  const stats = [
    { label: 'Drivers with Trips', value: hasData ? report.driversWithTrips : '—' },
    { label: 'On-Time Rate', value: hasData && report.rate != null ? report.rate + '%' : '—' },
    { label: 'Assigned Trips', value: hasData ? report.totalTrips : '—' },
  ];

  return (
    <MainLayout>
      <div className="dr-page dr-report-live">
        {/* Topbar */}
        <header className="dr-topbar">
          <label className="dr-search">
            <SearchIcon size={18} />
            <input type="search" placeholder="Search driver name or ID" aria-label="Search drivers" value={search} onChange={e => { setSearch(e.target.value); setPage(1); setExpandedId(null); }} />
          </label>

          <OfficeTools />
        </header>

        <section className="dr-content">
          {/* Header */}
          <div className="dr-header-row">
            <div>
              <h2>Reports — Drivers</h2>
              <p>Analyze individual driver performance, reliability, and delivery metrics.</p>
            </div>

            <div className="dr-actions">
<button className="dr-btn dr-btn-secondary" onClick={live.refresh}>Refresh</button>
            </div>
          </div>

          {/* Filters */}
          <div className="dr-filters">
            <div className="dr-tabs">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`dr-tab ${activeRange === r.key ? "active" : ""}`}
                  aria-pressed={activeRange === r.key}
                  onClick={() => handleRangeClick(r.key)}
                >
                  {r.label}
                </button>
              ))}

              <div className="dr-custom-wrapper" ref={customPickerRef}>
                <button
                  className={`dr-tab ${activeRange === "custom" ? "active" : ""}`}
                  aria-pressed={activeRange === "custom"}
                  aria-expanded={showCustomPicker}
                  onClick={() => setShowCustomPicker((open) => !open)}
                >
                  Custom Range
                  <CaretDown size={12} sw={2.4} />
                </button>

                {showCustomPicker && (
                  <div className="dr-popover">
                    <div className="dr-popover-field">
                      <label htmlFor="dr-start">Start date</label>
                      <input
                        id="dr-start"
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                      />
                    </div>
                    <div className="dr-popover-field">
                      <label htmlFor="dr-end">End date</label>
                      <input
                        id="dr-end"
                        type="date"
                        value={customEnd}
                        min={customStart || undefined}
                        onChange={(e) => setCustomEnd(e.target.value)}
                      />
                    </div>
                    {rangeError && <p role="alert">{rangeError}</p>}
                    <button
                      className="dr-popover-apply"
                      onClick={handleApplyCustomRange}
                      disabled={!customStart || !customEnd || customStart > customEnd}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            {dateLabel && <div className="dr-date-pill">{dateLabel}</div>}
          </div>

<div className="dr-report-note"><p>Trips are non-cancelled delivery assignments for shipments created in the selected dates (Philippine time). On-time rate compares delivered trip arrival with shipment ETA; {hasData ? report.timed : '—'} trips have both timestamps. Kilometres use valid odometer differences on delivered trips.</p><p>Incidents use their reported dates and the driver linked to the delivery, independently of the shipment creation date. Driver status is current; drivers without trips remain in the roster. Ratings are unavailable.</p></div>
          {live.loading && <p role="status">Loading driver report…</p>}
          {live.error && <p role="alert">Unable to refresh the report. {hasData ? 'Showing the last loaded snapshot.' : 'Report data is unavailable.'} <button onClick={live.refresh}>Retry</button></p>}
          {/* Stats */}
          <div className="dr-stats">
            {stats.map((stat, i) => {
              const StatIcon = STAT_ICONS[i];
              return (
                <div className={"dr-stat gray"} key={stat.label}>
                  <div className="dr-stat-top">
                    <span className="dr-stat-label">{stat.label}</span>
                    <span className="dr-stat-icon">
                      <StatIcon size={14} />
                    </span>
                  </div>
                  <div className="dr-stat-bottom">
                    <span className="dr-stat-value">{stat.value}</span>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts */}
          <div className="dr-charts">
            {/* On-time rate by driver */}
            <div className="dr-card dr-chart-card">
              <div className="dr-card-header">
                <h3>On-Time Rate by Driver</h3>

              </div>

              {report.driverRates.length === 0 ? (
                <p className="dr-empty">{hasData ? 'No drivers have timed completed trips for this selection.' : emptyText}</p>
              ) : (
                <>
                  <p>Top five drivers with timed completed trips.</p>
                  <div className="dr-rate-rows">
                    {report.driverRates.map((d) => (
                      <div className="dr-rate-row" key={d.id}>
                        <span className="dr-rate-name">{d.name}</span>
                        <div className="dr-rate-track">
                          <div className="dr-rate-bg">
                            <div
                              className={"dr-rate-fill"}
                              style={{ width: `${d.rate}%` }}
                            />
                          </div>
                        </div>
                        <strong className={"dr-rate-val"}>
                          {d.rate}%
                        </strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Delay incidents */}
            <div className="dr-card dr-chart-card dr-chart-card-inc">
              <div className="dr-card-header">
                <h3>Reported Incidents</h3>

              </div>

              {hasData && report.unattributedIncidents > 0 && <p>{report.unattributedIncidents} incident(s) lack a matching delivery driver and are excluded from driver counts.</p>}
              {report.incidents.length === 0 ? (
                <p className="dr-empty">{hasData ? 'No attributed incidents for this selection.' : emptyText}</p>
              ) : (
                <>
                  <div className="dr-inc-plot">
                    {report.incidents.map((inc) => {
                      const pct = (inc.count / incidentAxis.top) * 100;
                      return (
                        <div className="dr-inc-row" key={inc.label}>
                          <span className="dr-inc-name">{inc.label}</span>
                          <div className="dr-inc-track">
                            <div className="dr-inc-bar" style={{ width: `${pct}%` }} />
                            <span className="dr-inc-count" style={{ left: `calc(${pct}% + 8px)` }}>
                              {inc.count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="dr-axis">
                    <div className="dr-axis-ticks">
                      {incidentAxis.ticks.map((t) => (
                        <span key={t} style={{ left: `${(t / incidentAxis.top) * 100}%` }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="dr-card dr-table-card">
            <div className="dr-table-header">
              <h3>Driver Performance</h3>
<div className="dr-table-tools"><label htmlFor="dr-status">Current status </label><select id="dr-status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); setExpandedId(null); }}><option value="all">All statuses</option>{DRIVER_STATUSES.map(key => <option key={key} value={key}>{key.replaceAll('_', ' ')}</option>)}</select></div>
            </div>

            <div className="dr-table-scroll">
              <table className="dr-table">
                <colgroup>
                  <col style={{ width: 91 }} />
                  <col style={{ width: 193 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 192 }} />
                  <col style={{ width: 99 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 79 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-label="Expand" />
                    <th>Driver</th>
                    <th>
                      Total
                      <br />
                      Trips
                    </th>
                    <th>On-Time Rate</th>
                    <th>
                      Timed<br />Trips
                    </th>
                    <th>
                      Reported<br />Incidents
                    </th>
                    <th>
                      Recorded<br />KM
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="dr-empty-row">
                        {emptyText}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const d = { ...row, initials: row.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase(), tone: 'navy', delays: row.incidents };
                      const open = expandedId === d.id;
                      const toggle = () => setExpandedId(open ? null : d.id);
                      return (
                        <Fragment key={d.id}>
                          <tr className={`dr-row ${open ? "open" : ""}`} onClick={toggle}>
                            <td className="dr-cell-chev">
                              <button
                                className={`dr-chev ${open ? "open" : ""}`}
                                aria-expanded={open}
                                aria-label={`${open ? "Collapse" : "Expand"} ${d.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle();
                                }}
                              >
                                <ChevronRight size={14} sw={2.2} />
                              </button>
                            </td>
                            <td>
                              <div className="dr-driver">
                                <span className={`dr-initials ${d.tone}`}>{d.initials}</span>
                                <div>
                                  <div className="dr-driver-name">{d.name}</div>
                                  <div className="dr-driver-id">ID: {d.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="dr-num">{row.trips}</td>
                            <td>
                              <div className="dr-ontime">
                                <strong>{row.rate == null ? '—' : row.rate + '%'}</strong>
                                <span className="dr-mini-bar">
                                  <span
                                    style={{ width: `${row.rate ?? 0}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td>
<span title="Delivered trips with both arrival and ETA timestamps">{row.timed}</span>
                            </td>
                            <td className="dr-delays">
                              {row.incidents.length}
                            </td>
                            <td>
                              <span className="dr-km" title={`${row.measuredTrips} of ${row.completed} delivered trips have valid odometer readings`}>{row.km == null ? '—' : row.km.toLocaleString() + ' km'}</span>
                            </td>
                            <td className="dr-cell-status">
                              <span className={`dr-status ${row.status}`}>
                                {row.status.replaceAll('_', ' ')}
                              </span>
                            </td>
                          </tr>

                          {open && (
                            <tr className="dr-detail-row">
                              <td colSpan={8}>
                                <div className="dr-detail">
                                  <div className="dr-detail-main">
                                    <h4>Recorded Incidents in Period</h4>
                                    {d.delays.length === 0 ? (
                                      <p className="dr-detail-none">
                                        No incidents recorded for this period.
                                      </p>
                                    ) : (
                                      <ul>
                                        {d.delays.map((item) => (
                                          <li key={item.id}>
                                            <AlertIcon size={14} sw={2} />
                                            <strong>{String(item.category || 'other').replaceAll('_', ' ')}</strong>
                                            <span>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}{item.delay_minutes != null ? ' · ' + item.delay_minutes + ' min reported delay' : ''} · <Link to={'/shipment?tab=all&record=' + encodeURIComponent(item.shipmentId)}>View shipment</Link></span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div className="dr-detail-side">
<h4>Fleet</h4><Link className="dr-detail-btn" to="/fleet?view=drivers">View Drivers</Link>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {report.rows.length > 0 && (
              <div className="dr-table-foot">
                <span>
                  Showing {(currentPage - 1) * 10 + 1}-{Math.min(currentPage * 10, report.rows.length)} of {report.rows.length} Drivers
                </span>
                <div className="dr-pager">
                  <button
                    className="dr-page-arrow"
                    aria-label="Previous page"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={14} sw={2.2} />
                  </button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <button
                    className="dr-page-arrow"
                    aria-label="Next page"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={14} sw={2.2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
