import { useState, useRef, useEffect, Fragment } from "react";
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
const BellIcon = (p) => (
  <Icon {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icon>
);
const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 21h14" />
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
const KebabIcon = (p) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </Icon>
);
const FilterIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M7 12h10" />
    <path d="M10 17h4" />
  </Icon>
);
const StarIcon = (p) => (
  <Icon {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
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
const ArrowRight = (p) => (
  <Icon size={10} sw={2.6} {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);
const ArrowDown = (p) => (
  <Icon size={10} sw={2.6} {...p}>
    <path d="M12 5v14" />
    <path d="m6 13 6 6 6-6" />
  </Icon>
);
const ArrowUp = (p) => (
  <Icon size={10} sw={2.6} {...p}>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </Icon>
);

const TREND_ARROW = { gray: ArrowRight, red: ArrowDown, green: ArrowUp };
const STAT_ICONS = [UsersIcon, TimerIcon, SwapIcon];

/* =========================
   MOCK DATA — swap with real API data later
========================= */
const TARGET_RATE = 90; // on-time target (%)
const LOW_RATE = 80; // below this, a driver is flagged red
const HIGH_DELAYS = 5; // at or above this, delay count is flagged red

const DRIVERS = {
  doe: {
    id: "DRV-014",
    name: "John Doe",
    initials: "JD",
    tone: "navy",
    delays: [{ title: "Traffic Incident - Route 5 South", date: "Oct 08" }],
  },
  garcia: {
    id: "DRV-089",
    name: "Roberto Garcia",
    initials: "RG",
    tone: "red",
    delays: [
      { title: "Traffic Incident - Route 9 North", date: "Oct 12" },
      { title: "Vehicle Maintenance - Flat Tire", date: "Oct 05" },
    ],
  },
  chen: { id: "DRV-042", name: "Chen, C.", initials: "CC", tone: "blue", delays: [] },
};

const RANGES = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "last3Months", label: "Last 3 Months" },
];

const stats = (a, b, c) => [
  { label: "Active Drivers", value: a[0], change: a[1], trend: a[2] },
  { label: "Avg. On-Time Rate", value: b[0], change: b[1], trend: b[2] },
  { label: "Total Trips", value: c[0], change: c[1], trend: c[2] },
];
const incidents = (t, w, m, r, o) =>
  [["Traffic", t], ["Weather", w], ["Mech.", m], ["Routing", r], ["Other", o]].map(
    ([label, count]) => ({ label, count })
  );
const rates = (a, b, c, d, e) =>
  [["J. Doe", a], ["M. Smith", b], ["A. Lee", c], ["R. Garcia", d], ["C. Chen", e]].map(
    ([name, rate]) => ({ name, rate })
  );

const reportByRange = {
  today: {
    dateLabel: "Oct 24, 2024",
    stats: stats(["104", "0%", "gray"], ["93%", "+2%", "green"], ["19", "+4%", "green"]),
    driverRates: rates(96, 91, 94, 85, 99),
    incidents: incidents(1, 0, 0, 1, 0),
    rows: [
      { driver: "doe", trips: 3, rate: 96, rating: 4.9, delays: 0, km: 240, status: "active" },
      { driver: "chen", trips: 2, rate: 99, rating: 4.9, delays: 0, km: 165, status: "active" },
    ],
  },
  thisWeek: {
    dateLabel: "Oct 21 - Oct 27, 2024",
    stats: stats(["112", "+1%", "green"], ["90%", "+1%", "green"], ["96", "+7%", "green"]),
    driverRates: rates(95, 89, 93, 80, 97),
    incidents: incidents(4, 2, 1, 1, 0),
    rows: [
      { driver: "doe", trips: 11, rate: 95, rating: 4.9, delays: 0, km: 920, status: "active" },
      { driver: "garcia", trips: 7, rate: 80, rating: 4.2, delays: 2, km: 510, status: "warning" },
      { driver: "chen", trips: 9, rate: 97, rating: 4.9, delays: 0, km: 740, status: "active" },
    ],
  },
  thisMonth: {
    dateLabel: "Oct 1 - Oct 24, 2024",
    stats: stats(["118", "0%", "gray"], ["87%", "-3%", "red"], ["284", "+12%", "green"]),
    driverRates: rates(95, 88, 92, 78, 98),
    incidents: incidents(8, 5, 3, 2, 1),
    rows: [
      { driver: "doe", trips: 42, rate: 95, rating: 4.8, delays: 1, km: 3420, status: "active" },
      { driver: "garcia", trips: 38, rate: 78, rating: 4.1, delays: 6, km: 2890, status: "active" },
      { driver: "chen", trips: 51, rate: 98, rating: 4.9, delays: 0, km: 4100, status: "active" },
    ],
  },
  last3Months: {
    dateLabel: "Jul 25 - Oct 24, 2024",
    stats: stats(["126", "+3%", "green"], ["89%", "+2%", "green"], ["812", "+19%", "green"]),
    driverRates: rates(94, 87, 91, 81, 97),
    incidents: incidents(18, 14, 9, 6, 3),
    rows: [
      { driver: "doe", trips: 118, rate: 94, rating: 4.9, delays: 4, km: 9840, status: "active" },
      { driver: "garcia", trips: 89, rate: 81, rating: 4.2, delays: 14, km: 6310, status: "warning" },
      { driver: "chen", trips: 104, rate: 97, rating: 4.9, delays: 2, km: 8120, status: "active" },
    ],
  },
  custom: {
    dateLabel: "",
    stats: stats(["—", "", "gray"], ["—", "", "gray"], ["—", "", "gray"]),
    driverRates: [],
    incidents: [],
    rows: [],
  },
};

/* =========================
   HELPERS
========================= */
const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtCustomRange = (start, end) => {
  const year = new Date(`${end}T00:00:00`).getFullYear();
  return `${fmtDay(start)} - ${fmtDay(end)}, ${year}`;
};

// Round the axis max up to a clean step so ticks land on whole numbers
const buildAxis = (max) => {
  const step = max > 10 ? 4 : 2;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
};

/* =========================
   PAGE
========================= */
export default function DriverReport() {
  const [activeRange, setActiveRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [appliedCustom, setAppliedCustom] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [expandedId, setExpandedId] = useState("DRV-089");
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
    setShowCustomPicker(false);
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setAppliedCustom({ start: customStart, end: customEnd });
    setActiveRange("custom");
    setShowCustomPicker(false);
  };

  const report = reportByRange[activeRange];
  const dateLabel =
    activeRange === "custom" && appliedCustom
      ? fmtCustomRange(appliedCustom.start, appliedCustom.end)
      : report.dateLabel;

  const incidentAxis = buildAxis(Math.max(1, ...report.incidents.map((i) => i.count)));
  const emptyText =
    activeRange === "custom"
      ? "No data available for this range yet."
      : "No data available.";

  return (
    <MainLayout>
      <div className="dr-page">
        {/* Topbar */}
        <header className="dr-topbar">
          <label className="dr-search">
            <SearchIcon size={18} />
            <input type="text" placeholder="Search..." />
          </label>

          <div className="dr-topbar-right">
            <button id="notifBtn" className="dr-icon-btn" aria-label="Notifications">
              <BellIcon size={20} />
            </button>
            <span className="dr-divider" />
            <div className="dr-avatar">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60"
                alt="User Profile"
              />
            </div>
          </div>
        </header>

        <section className="dr-content">
          {/* Header */}
          <div className="dr-header-row">
            <div>
              <h2>Reports — Drivers</h2>
              <p>Analyze individual driver performance, reliability, and delivery metrics.</p>
            </div>

            <div className="dr-actions">
              <button className="dr-btn dr-btn-secondary">Schedule Report</button>
              <button className="dr-btn dr-btn-primary">
                <DownloadIcon size={15} />
                Export
              </button>
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
                    <button
                      className="dr-popover-apply"
                      onClick={handleApplyCustomRange}
                      disabled={!customStart || !customEnd}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            {dateLabel && <div className="dr-date-pill">{dateLabel}</div>}
          </div>

          {/* Stats */}
          <div className="dr-stats">
            {report.stats.map((stat, i) => {
              const StatIcon = STAT_ICONS[i];
              const Arrow = TREND_ARROW[stat.trend];
              return (
                <div className={`dr-stat ${stat.trend}`} key={stat.label}>
                  <div className="dr-stat-top">
                    <span className="dr-stat-label">{stat.label}</span>
                    <span className="dr-stat-icon">
                      <StatIcon size={14} />
                    </span>
                  </div>
                  <div className="dr-stat-bottom">
                    <span className="dr-stat-value">{stat.value}</span>
                    {stat.change && (
                      <span className={`dr-badge ${stat.trend}`}>
                        <Arrow />
                        {stat.change}
                      </span>
                    )}
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
                <button className="dr-icon-btn" aria-label="More options">
                  <KebabIcon size={18} />
                </button>
              </div>

              {report.driverRates.length === 0 ? (
                <p className="dr-empty">{emptyText}</p>
              ) : (
                <>
                  <div className="dr-rate-head">
                    <div className="dr-target-label">
                      <span>
                        TARGET
                        <br />
                        {TARGET_RATE}%
                      </span>
                    </div>
                  </div>
                  <div className="dr-rate-rows">
                    {report.driverRates.map((d) => (
                      <div className="dr-rate-row" key={d.name}>
                        <span className="dr-rate-name">{d.name}</span>
                        <div className="dr-rate-track">
                          <div className="dr-rate-bg">
                            <div
                              className={`dr-rate-fill ${d.rate < LOW_RATE ? "low" : ""}`}
                              style={{ width: `${d.rate}%` }}
                            />
                          </div>
                        </div>
                        <strong className={`dr-rate-val ${d.rate < LOW_RATE ? "low" : ""}`}>
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
                <h3>Delay Incidents</h3>
                <button className="dr-icon-btn" aria-label="More options">
                  <KebabIcon size={18} />
                </button>
              </div>

              {report.incidents.length === 0 ? (
                <p className="dr-empty">{emptyText}</p>
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
              <div className="dr-table-tools">
                <button className="dr-icon-btn" aria-label="Filter">
                  <FilterIcon size={18} />
                </button>
                <button className="dr-icon-btn" aria-label="Search drivers">
                  <SearchIcon size={18} />
                </button>
              </div>
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
                      Avg.
                      <br />
                      Rating
                    </th>
                    <th>
                      Delay
                      <br />
                      Incidents
                    </th>
                    <th>
                      Total
                      <br />
                      KM
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
                    report.rows.map((row) => {
                      const d = DRIVERS[row.driver];
                      const open = expandedId === d.id;
                      const low = row.rate < LOW_RATE;
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
                                <strong className={low ? "low" : ""}>{row.rate}%</strong>
                                <span className="dr-mini-bar">
                                  <span
                                    className={low ? "low" : ""}
                                    style={{ width: `${row.rate}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="dr-rating">
                                <strong>{row.rating}</strong>
                                <StarIcon size={12} sw={2} />
                              </div>
                            </td>
                            <td className={`dr-delays ${row.delays >= HIGH_DELAYS ? "high" : ""}`}>
                              {row.delays}
                            </td>
                            <td>
                              <span className="dr-km">{row.km.toLocaleString()} km</span>
                            </td>
                            <td className="dr-cell-status">
                              <span className={`dr-status ${row.status}`}>
                                {row.status === "active" ? "Active" : "Review"}
                              </span>
                            </td>
                          </tr>

                          {open && (
                            <tr className="dr-detail-row">
                              <td colSpan={8}>
                                <div className="dr-detail">
                                  <div className="dr-detail-main">
                                    <h4>Recent Delay Analysis</h4>
                                    {d.delays.length === 0 ? (
                                      <p className="dr-detail-none">
                                        No delay incidents recorded for this period.
                                      </p>
                                    ) : (
                                      <ul>
                                        {d.delays.map((item) => (
                                          <li key={item.title}>
                                            <AlertIcon size={14} sw={2} />
                                            <strong>{item.title}</strong>
                                            <span>({item.date})</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div className="dr-detail-side">
                                    <h4>Suggested Action</h4>
                                    <button className="dr-detail-btn">
                                      {low ? "Schedule Route Review" : "View Driver Profile"}
                                    </button>
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
                  Showing 1-{report.rows.length} of {report.stats[0].value} Drivers
                </span>
                <div className="dr-pager">
                  <button
                    className="dr-page-arrow"
                    aria-label="Previous page"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} sw={2.2} />
                  </button>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      className={`dr-page-btn ${page === n ? "active" : ""}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="dr-page-gap">…</span>
                  <button
                    className="dr-page-arrow"
                    aria-label="Next page"
                    onClick={() => setPage((p) => p + 1)}
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