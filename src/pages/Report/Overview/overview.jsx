import { useState, useRef, useEffect } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./overview.css";

/* ---------- Icons (inline, no extra dependency) ---------- */
const paths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 21h16" /></>,
  up: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  down: <><path d="m22 17-8.5-8.5-5 5L2 7" /><path d="M16 17h6v-6" /></>,
  truck: <><path d="M1 6h13v10H1zM14 10h4l4 3v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  building: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6M8 11h8" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  hourglass: <path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4" />,
};

const Icon = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>
);

const Kebab = () => (
  <button className="ov-kebab" aria-label="More options">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  </button>
);

/* ---------- Mock data — swap with real API data later ---------- */
const stat = (label, icon, accent, value, change, trend, sub) =>
  ({ label, icon, accent, value, change, trend, sub });

const statsByRange = {
  today: [
    stat("Total Shipments", "truck", "navy", "18", "+5%", "green", "15 Completed • 2 Active • 1 Delayed"),
    stat("On-Time Rate", "clock", "red", "83%", "-2%", "red", "15 on time out of 18 total deliveries"),
    stat("Total Revenue", "cash", "green", "₱82K", "+4%", "green", "Net after tolls, allowances & maintenance ₱64,300"),
    stat("Compliance Rate", "building", "navy", "91%", "+1%", "green", "131 of 142 vehicles/drivers fully document-compliant"),
  ],
  thisWeek: [
    stat("Total Shipments", "truck", "navy", "96", "+7%", "green", "84 Completed • 8 Active • 4 Delayed"),
    stat("On-Time Rate", "clock", "red", "88%", "-1%", "red", "84 on time out of 96 total deliveries"),
    stat("Total Revenue", "cash", "green", "₱412K", "+6%", "green", "Net after tolls, allowances & maintenance ₱326,100"),
    stat("Compliance Rate", "building", "navy", "91%", "+2%", "green", "131 of 142 vehicles/drivers fully document-compliant"),
  ],
  thisMonth: [
    stat("Total Shipments", "truck", "navy", "284", "+12%", "green", "248 Completed • 24 Active • 12 Delayed"),
    stat("On-Time Rate", "clock", "red", "87%", "-3%", "red", "247 on time out of 284 total deliveries"),
    stat("Total Revenue", "cash", "green", "₱1.24M", "+8%", "green", "Net after tolls, allowances & maintenance ₱980,500"),
    stat("Compliance Rate", "building", "navy", "91%", "+12%", "green", "131 of 142 vehicles/drivers fully document-compliant"),
  ],
  last3Months: [
    stat("Total Shipments", "truck", "navy", "812", "+19%", "green", "744 Completed • 41 Active • 27 Delayed"),
    stat("On-Time Rate", "clock", "red", "89%", "+2%", "green", "723 on time out of 812 total deliveries"),
    stat("Total Revenue", "cash", "green", "₱3.46M", "+15%", "green", "Net after tolls, allowances & maintenance ₱2.74M"),
    stat("Compliance Rate", "building", "navy", "90%", "+4%", "green", "128 of 142 vehicles/drivers fully document-compliant"),
  ],
  custom: ["Total Shipments", "On-Time Rate", "Total Revenue", "Compliance Rate"].map((l, i) =>
    stat(l, ["truck", "clock", "cash", "building"][i], "navy", "—", "", "gray", "Select a range to view data")),
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

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const completed = [30, 40, 17, 52, 46, 55, 49];
const delayed = [14, 17, 12, 20, 14, 17, 22];
const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
const revenue = [130, 270, 200, 380]; // in ₱K
const revenueTarget = 275;

const drivers = [
  { initials: "MD", name: "Mateo Dela Cruz", vehicle: "ISUZU FORWARD · ABC-1234", pct: 98, tone: "dark" },
  { initials: "JS", name: "Jose Santos", vehicle: "FUSO CANTER · XJ-772-L", pct: 96, tone: "blue" },
  { initials: "AR", name: "Andres Reyes", vehicle: "10-WHEELER WING VAN · KL-990-P", pct: 94, tone: "grey" },
  { initials: "LM", name: "Luis Mendoza", vehicle: "ISUZU GIGA · AA-554-Q", pct: 91, tone: "grey" },
  { initials: "EB", name: "Eduardo Bautista", vehicle: "6-WHEELER DROPSIDE · NE-441-R", pct: 88, tone: "grey" },
];

const activity = [
  { text: "SHP-NE-4829 marked as completed by Mateo Dela Cruz", time: "10 mins ago" },
  { text: "Vehicle ABC-1234 flagged for upcoming maintenance.", time: "45 mins ago" },
  { text: "SHP-NE-4811 reported delayed (Traffic/Weather).", time: "2 hours ago" },
  { text: "New driver Luis Mendoza registered to fleet.", time: "3 hours ago" },
  { text: "Compliance Report generated automatically.", time: "Yesterday, 5:00 PM" },
];

/* ---------- Charts ---------- */
function ShipmentLineChart() {
  const x = (i) => 60 + i * 60;
  const y = (v) => 190 - (v - 10) * 4;
  const pts = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg className="ov-chart-svg" viewBox="0 0 440 225" role="img"
      aria-label="Completed versus delayed shipments by day of week">
      {[10, 20, 30, 40, 50].map((t) => (
        <text key={t} x="38" y={y(t) + 4} textAnchor="end" className="ov-axis">{t}</text>
      ))}
      <line x1="52" x2="430" y1={y(10)} y2={y(10)} stroke="#E5E7EB" />
      <polyline points={pts(completed)} fill="none" stroke="#0F172A" strokeWidth="3" strokeLinejoin="round" />
      <polyline points={pts(delayed)} fill="none" stroke="#F97316" strokeWidth="3" strokeDasharray="7 5" strokeLinejoin="round" />
      {completed.map((v, i) => <circle key={`c${i}`} cx={x(i)} cy={y(v)} r="4" fill="#0F172A" />)}
      {delayed.map((v, i) => <circle key={`d${i}`} cx={x(i)} cy={y(v)} r="4" fill="#F97316" />)}
      {days.map((d, i) => (
        <text key={d} x={x(i)} y="212" textAnchor="middle" className="ov-axis">{d}</text>
      ))}
    </svg>
  );
}

function RevenueBarChart() {
  const y = (k) => 150 - k * 0.325;
  return (
    <svg className="ov-chart-svg" viewBox="0 0 420 185" role="img"
      aria-label="Actual weekly revenue versus target">
      {[0, 100, 200, 300, 400].map((t) => (
        <text key={t} x="46" y={y(t) + 3} textAnchor="end" className="ov-axis ov-axis-sm">
          {t === 0 ? "₱0" : `₱${t}K`}
        </text>
      ))}
      <line x1="54" x2="410" y1={y(0)} y2={y(0)} stroke="#E5E7EB" />
      {revenue.map((v, i) => (
        <rect key={i} x={86 + i * 85} y={y(v)} width="34" height={150 - y(v)} fill="#0F172A" />
      ))}
      <line x1="54" x2="410" y1={y(revenueTarget)} y2={y(revenueTarget)}
        stroke="#F97316" strokeWidth="2" strokeDasharray="2 3" />
      {weeks.map((w, i) => (
        <text key={w} x={103 + i * 85} y="170" textAnchor="middle" className="ov-axis ov-axis-sm">{w}</text>
      ))}
    </svg>
  );
}

/* ---------- Page ---------- */
export default function Overview() {
  const [activeRange, setActiveRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
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
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setActiveRange("custom");
    setShowCustomPicker(false);
  };

  const currentStats = statsByRange[activeRange];
  const dateLabel =
    activeRange === "custom"
      ? customStart && customEnd ? `${customStart} - ${customEnd}` : "Select dates"
      : rangeText[activeRange];

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="ov-topbar">
        <label className="ov-search">
          <Icon name="search" size={18} />
          <input type="text" placeholder="Search..." aria-label="Search" />
        </label>

        <div className="ov-topbar-right">
          <button className="ov-bell" aria-label="Notifications"><Icon name="bell" size={22} /></button>
          <span className="ov-divider" />
          <img
            className="ov-avatar"
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60"
            alt="User profile"
          />
        </div>
      </header>

      <section className="ov-content">
        {/* Header */}
        <div className="ov-header">
          <div>
            <h1>Reports — Overview</h1>
            <p>Track operational performance and key logistics metrics.</p>
          </div>
          <div className="ov-actions">
            <button className="ov-btn ov-btn-secondary">Schedule Report</button>
            <button className="ov-btn ov-btn-primary">
              <Icon name="download" size={14} /> Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="ov-filters">
          <div className="ov-tabs">
            {rangeTabs.map(([key, label]) => (
              <button
                key={key}
                className={`ov-tab ${activeRange === key ? "active" : ""}`}
                aria-pressed={activeRange === key}
                onClick={() => handleRangeClick(key)}
              >
                {label}
              </button>
            ))}

            <div className="ov-custom-wrap" ref={customPickerRef}>
              <button
                className={`ov-tab ${activeRange === "custom" ? "active" : ""}`}
                aria-pressed={activeRange === "custom"}
                aria-expanded={showCustomPicker}
                onClick={() => setShowCustomPicker((o) => !o)}
              >
                Custom Range <span className="ov-caret" />
              </button>

              {showCustomPicker && (
                <div className="ov-popover">
                  <div className="ov-field">
                    <label htmlFor="ov-start">Start date</label>
                    <input id="ov-start" type="date" value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)} />
                  </div>
                  <div className="ov-field">
                    <label htmlFor="ov-end">End date</label>
                    <input id="ov-end" type="date" value={customEnd} min={customStart || undefined}
                      onChange={(e) => setCustomEnd(e.target.value)} />
                  </div>
                  <button className="ov-apply" onClick={handleApplyCustomRange}
                    disabled={!customStart || !customEnd}>
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>

          <span className="ov-date-pill">{dateLabel}</span>
        </div>

        {/* Stats */}
        <div className="ov-stats">
          {currentStats.map((s) => (
            <div className={`ov-stat ov-accent-${s.accent}`} key={s.label}>
              <div className="ov-stat-top">
                <span className="ov-stat-label">{s.label}</span>
                <span className="ov-stat-icon"><Icon name={s.icon} size={16} /></span>
              </div>
              <div className="ov-stat-value">
                <strong>{s.value}</strong>
                {s.change && (
                  <span className={`ov-badge ov-badge-${s.trend}`}>
                    <Icon name={s.trend === "red" ? "down" : "up"} size={11} />
                    {s.change}
                  </span>
                )}
              </div>
              <p className="ov-stat-sub">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="ov-charts">
          <div className="ov-card ov-chart-card">
            <div className="ov-chart-head">
              <div className="ov-chart-title">
                <h3>Shipment Volume</h3>
                <p>Completed vs Delayed over time</p>
              </div>
              <span className="ov-chip ov-chip-blue">Peak day: Wednesday (42 shipments)</span>
              <Kebab />
            </div>
            <ShipmentLineChart />
            <div className="ov-legend">
              <span><i className="sq" /> Completed</span>
              <span><i className="dash" /> Delayed</span>
            </div>
          </div>

          <div className="ov-card ov-chart-card">
            <div className="ov-chart-head">
              <div className="ov-chart-title">
                <h3>Revenue vs Target</h3>
                <p>Monthly performance tracking</p>
              </div>
              <span className="ov-chip ov-chip-green">Above target for 3 of 4 weeks this month</span>
              <Kebab />
            </div>
            <div className="ov-bar-panel"><RevenueBarChart /></div>
            <div className="ov-legend">
              <span><i className="sq" /> Actual Revenue</span>
              <span><i className="dots" /> Target</span>
            </div>
          </div>
        </div>

        {/* Bottom grid */}
        <div className="ov-bottom">
          <div className="ov-card ov-drivers">
            <div className="ov-card-head">
              <h3>Top Performing Drivers</h3>
              <a href="#" className="ov-link">View All <Icon name="arrow" size={16} /></a>
            </div>
            <ul className="ov-driver-list">
              {drivers.map((d, i) => (
                <li key={d.name}>
                  <span className={`ov-initials ov-initials-${d.tone}`}>{d.initials}</span>
                  <div className="ov-driver-info">
                    <strong>{d.name}</strong>
                    <span>{d.vehicle}</span>
                  </div>
                  <div className="ov-track">
                    {i === 0 && <div className="ov-fill" style={{ width: `${d.pct}%` }} />}
                  </div>
                  <div className="ov-driver-pct">
                    <strong>{d.pct}%</strong>
                    <span>ON-TIME</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="ov-card ov-compliance">
            <div className="ov-comp-head">
              <h3>Compliance Snapshot</h3>
              <a href="#" className="ov-link">View Compliance <Icon name="arrow" size={16} /></a>
            </div>
            <div className="ov-comp-body">
              <div className="ov-gauge"><div><strong>92%</strong><span>COMPLIANT</span></div></div>
            </div>
            <ul className="ov-comp-list">
              <li><i className="dot green" /> <span>Compliant <em>(42 drivers + 36 vehicles)</em></span></li>
              <li><i className="dot yellow" /> <span>Expiring Soon</span><b>14</b></li>
              <li><i className="dot red" /> <span>Non-Compliant</span><b>6</b></li>
              <li><span className="ov-hour"><Icon name="hourglass" size={12} /></span> <span>Pending</span><b>9</b></li>
            </ul>
          </div>

          <div className="ov-lower">
            <div className="ov-card ov-fleet">
              <div className="ov-card-head ov-card-head-sm">
                <h3>Fleet Summary</h3>
                <a href="#" className="ov-link ov-link-sm">Manage Fleet</a>
              </div>
              <div className="ov-fleet-grid">
                <div className="ov-tile"><span>TOTAL FLEET</span><strong>142</strong></div>
                <div className="ov-tile ov-tile-blue"><span>ACTIVE</span><strong>118</strong></div>
                <div className="ov-tile"><span>MAINTENANCE</span><strong>12</strong></div>
                <div className="ov-tile ov-tile-orange"><span>OVERDUE MAINTENANCE</span><strong>2</strong></div>
              </div>
              <div className="ov-fleet-meta"><span>83% Active</span><span>17% Inactive</span></div>
              <div className="ov-fleet-bar">
                <i style={{ width: "83%", background: "#0F172A" }} />
                <i style={{ width: "9%", background: "#BFDBFE" }} />
                <i style={{ width: "8%", background: "#F97316" }} />
              </div>
            </div>

            <div className="ov-card ov-activity">
              <div className="ov-card-head ov-card-head-sm">
                <h3>Recent Activity</h3>
                <a href="#" className="ov-link ov-link-sm">View All Activity <Icon name="arrow" size={16} /></a>
              </div>
              <ul>
                {activity.map((a) => (
                  <li key={a.text}>
                    <p>{a.text}</p>
                    <span>{a.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}