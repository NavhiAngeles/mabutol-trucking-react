import { useState, useRef, useEffect } from "react";
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

/* ---------- Mock data — swap with real API data later ---------- */
const st = (label, icon, accent, value, change, trend) => ({ label, icon, accent, value, change, trend });
const row = (id, customer, route, status, planned, actual, variance, driver) =>
  ({ id, customer, route, status, planned, actual, variance, driver });

const reportByRange = {
  today: {
    stats: [
      st("Total Shipments", "truck", "navy", "19", "+4%", "green"),
      st("On-Time Rate", "clock", "slate", "92%", "+2%", "green"),
      st("Cancelled Shipments", "cancel", "red", "0", "-0%", "gray"),
    ],
    statusBreakdown: { completed: 9, active: 8, delayed: 2, cancelled: 0 },
    rows: [
      row("#MC-8981", "Apex Manufacturing", "ORD → JFK", "completed", "Oct 24, 09:30", "Oct 24, 09:25", "-5m", "J. Mendoza"),
      row("#MC-8982", "Global Tech Supply", "SFO → LAX", "active", "Oct 24, 13:00", "Pending", "–", "S. Rodriguez"),
    ],
  },
  thisWeek: {
    stats: [
      st("Total Shipments", "truck", "navy", "96", "+7%", "green"),
      st("On-Time Rate", "clock", "slate", "89%", "+1%", "green"),
      st("Cancelled Shipments", "cancel", "red", "3", "-1%", "gray"),
    ],
    statusBreakdown: { completed: 61, active: 22, delayed: 10, cancelled: 3 },
    rows: [
      row("#MC-8920", "Apex Manufacturing", "ORD → JFK", "completed", "Oct 21, 11:00", "Oct 21, 10:48", "-12m", "J. Mendoza"),
      row("#MC-8931", "MediCorp Logistics", "DFW → MIA", "delayed", "Oct 22, 16:00", "Oct 22, 18:10", "+2h 10m", "A. Cruz"),
      row("#MC-8939", "Global Tech Supply", "SFO → LAX", "active", "Oct 24, 10:00", "Pending", "–", "S. Rodriguez"),
    ],
  },
  thisMonth: {
    stats: [
      st("Total Shipments", "truck", "navy", "284", "+12%", "green"),
      st("On-Time Rate", "clock", "slate", "87%", "-3%", "red"),
      st("Cancelled Shipments", "cancel", "red", "8", "-0%", "gray"),
    ],
    statusBreakdown: { completed: 180, active: 70, delayed: 26, cancelled: 8 },
    rows: [
      row("#MC-8942", "Apex Manufacturing", "ORD → JFK", "completed", "Oct 24, 14:00", "Oct 24, 13:45", "-15m", "J. Mendoza"),
      row("#MC-8943", "Global Tech Supply", "SFO → LAX", "active", "Oct 25, 09:30", "Pending", "–", "S. Rodriguez"),
      row("#MC-8944", "MediCorp Logistics", "DFW → MIA", "delayed", "Oct 24, 11:00", "Oct 24, 15:20", "+4h 20m", "A. Cruz"),
      row("#MC-8945", "Prime Retail", "SEA → DEN", "cancelled", "Oct 24, 16:00", "N/A", "–", "Unassigned"),
    ],
  },
  last3Months: {
    stats: [
      st("Total Shipments", "truck", "navy", "812", "+19%", "green"),
      st("On-Time Rate", "clock", "slate", "89%", "+2%", "green"),
      st("Cancelled Shipments", "cancel", "red", "21", "+1%", "red"),
    ],
    statusBreakdown: { completed: 540, active: 180, delayed: 71, cancelled: 21 },
    rows: [
      row("#MC-7920", "Apex Manufacturing", "ORD → JFK", "completed", "Sep 02, 09:00", "Sep 02, 08:50", "-10m", "J. Mendoza"),
      row("#MC-7884", "Prime Retail", "SEA → DEN", "completed", "Aug 21, 13:00", "Aug 21, 13:05", "+5m", "A. Cruz"),
      row("#MC-7801", "MediCorp Logistics", "DFW → MIA", "delayed", "Aug 10, 15:00", "Aug 10, 17:40", "+2h 40m", "S. Rodriguez"),
    ],
  },
  custom: {
    stats: [
      st("Total Shipments", "truck", "navy", "—", "", "gray"),
      st("On-Time Rate", "clock", "slate", "—", "", "gray"),
      st("Cancelled Shipments", "cancel", "red", "—", "", "gray"),
    ],
    statusBreakdown: { completed: 0, active: 0, delayed: 0, cancelled: 0 },
    rows: [],
  },
};

const rangeTabs = [
  ["today", "Today"],
  ["thisWeek", "This Week"],
  ["thisMonth", "This Month"],
  ["last3Months", "Last 3 Months"],
];

const rangeText = {
  today: "Oct 24, 2024",
  thisWeek: "Oct 21 - Oct 24, 2024",
  thisMonth: "Oct 1 - Oct 24, 2024",
  last3Months: "Aug 1 - Oct 24, 2024",
};

const statusColors = { completed: "#0A2A4D", active: "#DBE4F7", delayed: "#475569", cancelled: "#B91C1C" };

/* ---------- Charts ---------- */
function StatusDiamond({ total }) {
  return (
    <svg className="sr-diamond" viewBox="0 0 270 270" role="img"
      aria-label={`Shipment status breakdown, ${total} total`}>
      <rect x="47.5" y="47.5" width="175" height="175" rx="14" fill="none"
        stroke="#0A2A4D" strokeWidth="12" transform="rotate(45 135 135)" />
      <path d="M 92 54 A 92 92 0 0 0 56 182" fill="none" stroke="#B91C1C" strokeWidth="13" />
      <text x="135" y="143" textAnchor="middle" className="sr-diamond-num">{total}</text>
      <text x="135" y="163" textAnchor="middle" className="sr-diamond-lbl">TOTAL</text>
    </svg>
  );
}

function TrendChart() {
  const curve =
    "M41,173 C75,148 110,126 140,130 C160,133 168,141 176,141 C195,151 210,152 230,145 " +
    "C265,130 290,92 311,78 C330,64 350,45 372,45 C410,45 430,100 447,157 " +
    "C460,200 475,227 497,227 C530,227 560,130 581,63";
  return (
    <svg className="sr-trend" viewBox="0 0 584 358" role="img"
      aria-label="Delivery performance trend versus 90% target across four weeks">
      <defs><clipPath id="sr-plot"><rect x="41" y="0" width="540" height="331" /></clipPath></defs>
      <line x1="41" x2="41" y1="15" y2="331" stroke="#E5E7EB" />
      <line x1="41" x2="581" y1="331" y2="331" stroke="#E5E7EB" strokeWidth="2" />
      {[["95%", 35], ["85%", 177], ["75%", 319]].map(([t, y]) => (
        <text key={t} x="26" y={y} textAnchor="end" className="sr-axis">{t}</text>
      ))}
      {[["W1", 71], ["W2", 231], ["W3", 390], ["W4", 550]].map(([t, x]) => (
        <text key={t} x={x} y="350" textAnchor="middle" className="sr-axis">{t}</text>
      ))}
      <line x1="41" x2="581" y1="79" y2="79" stroke="#F08A8A" strokeWidth="1.5" strokeDasharray="6 5" />
      <g clipPath="url(#sr-plot)">
        <path d={curve} fill="none" stroke="#35597F" strokeWidth="7" strokeLinecap="round" />
        {[[41, 173], [176, 141], [311, 78], [447, 157], [581, 63]].map(([x, y]) => (
          <ellipse key={x} cx={x} cy={y} rx="11" ry="7" fill="#0A2A4D" />
        ))}
      </g>
    </svg>
  );
}

/* ---------- Page ---------- */
export default function ShipmentReport() {
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
    if (!customStart || !customEnd) return;
    setActiveRange("custom");
    setShowCustomPicker(false);
    setPage(1);
  };

  const report = reportByRange[activeRange];
  const b = report.statusBreakdown;
  const total = b.completed + b.active + b.delayed + b.cancelled;
  const dateLabel =
    activeRange === "custom"
      ? customStart && customEnd ? `${customStart} - ${customEnd}` : "Select dates"
      : rangeText[activeRange];

  const variantClass = (v) => (v.startsWith("-") ? "good" : v.startsWith("+") ? "bad" : "muted");
  const badgeText = (s) => (s.trend === "gray" ? s.change.replace("-", "−") : s.change.replace(/^[+-]/, ""));

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="sr-topbar">
        <label className="sr-search">
          <Icon name="search" size={18} />
          <input type="text" placeholder="Search..." aria-label="Search" />
        </label>
        <div className="sr-topbar-right">
          <button className="sr-bell" aria-label="Notifications"><Icon name="bell" size={22} /></button>
          <span className="sr-divider" />
          <img className="sr-avatar" alt="User profile"
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60" />
        </div>
      </header>

      <section className="sr-content">
        {/* Header */}
        <div className="sr-header">
          <div>
            <h1>Reports — Shipments</h1>
            <p>Comprehensive analysis of delivery performance and volume.</p>
          </div>
          <div className="sr-actions">
            <button className="sr-btn sr-btn-secondary">Schedule Report</button>
            <button className="sr-btn sr-btn-primary"><Icon name="download" size={14} /> Export</button>
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
                  <button className="sr-apply" onClick={handleApplyCustomRange}
                    disabled={!customStart || !customEnd}>Apply</button>
                </div>
              )}
            </div>
          </div>
          <span className="sr-date-pill">{dateLabel}</span>
        </div>

        {/* Stats */}
        <div className="sr-stats">
          {report.stats.map((s) => (
            <div className={`sr-stat sr-accent-${s.accent}`} key={s.label}>
              <div className="sr-stat-top">
                <span className="sr-stat-label">{s.label}</span>
                <span className="sr-stat-icon"><Icon name={s.icon} size={13} /></span>
              </div>
              <div className="sr-stat-value">
                <strong>{s.value}</strong>
                {s.change && (
                  <span className={`sr-badge sr-badge-${s.trend}`}>
                    {s.trend !== "gray" && <Icon name={s.trend === "red" ? "down" : "up"} size={10} />}
                    {badgeText(s)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Analytics */}
        <div className="sr-analytics">
          <div className="sr-card sr-chart-card">
            <h3>Shipment Status</h3>
            <StatusDiamond total={total} />
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
                <span><i className="dashed" /> Target (90%)</span>
              </div>
            </div>
            <TrendChart />
          </div>
        </div>

        {/* Ledger */}
        <div className="sr-card sr-ledger">
          <div className="sr-ledger-head">
            <h3>Shipment Ledger</h3>
            <div className="sr-ledger-tools">
              <button aria-label="Filter shipments"><Icon name="filter" size={16} /></button>
              <button aria-label="More options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
            </div>
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
                      Pick a start and end date to load shipments for that range.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="id">{r.id}</td>
                      <td>{r.customer}</td>
                      <td className="route">{r.route}</td>
                      <td><span className={`sr-status ${r.status}`}><i />{r.status}</span></td>
                      <td>{r.planned}</td>
                      <td className={r.status === "delayed" ? "late" : ""}>{r.actual}</td>
                      <td className={`r var ${variantClass(r.variance)}`}>{r.variance}</td>
                      <td>{r.driver}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sr-ledger-foot">
            <span>
              Showing {report.rows.length ? 1 : 0} to {report.rows.length} of {total} entries
            </span>
            <div className="sr-pager">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              {[1, 2, 3].map((n) => (
                <button key={n} className={page === n ? "active" : ""} aria-current={page === n}
                  onClick={() => setPage(n)}>{n}</button>
              ))}
              <button disabled={page === 3} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}