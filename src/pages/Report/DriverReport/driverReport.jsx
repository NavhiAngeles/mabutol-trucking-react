import { useState, useRef, useEffect } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./driverReport.css";

// Mock report data per date-range filter — swap with real API data later
const reportByRange = {
  today: {
    stats: [
      { label: "Active Drivers", value: "104", change: "+0%", trend: "gray" },
      { label: "Avg. On-Time Rate", value: "93%", change: "+2%", trend: "green" },
      { label: "Total Trips", value: "19", change: "+4%", trend: "green" },
    ],
    driverRates: [
      { name: "J. Doe", rate: 96 },
      { name: "M. Smith", rate: 91 },
      { name: "A. Lee", rate: 94 },
      { name: "R. Garcia", rate: 85 },
      { name: "C. Chen", rate: 99 },
    ],
    incidents: [
      { label: "Traffic", count: 1 },
      { label: "Weather", count: 0 },
      { label: "Mechanical", count: 0 },
      { label: "Routing", count: 1 },
      { label: "Other", count: 0 },
    ],
    rows: [
      { name: "John Doe", trips: 3, onTime: "96%", rating: 4.9, delays: 0, km: 240, status: "active" },
      { name: "Maria Smith", trips: 2, onTime: "91%", rating: 4.6, delays: 0, km: 165, status: "active" },
    ],
  },
  thisWeek: {
    stats: [
      { label: "Active Drivers", value: "112", change: "+1%", trend: "green" },
      { label: "Avg. On-Time Rate", value: "90%", change: "+1%", trend: "green" },
      { label: "Total Trips", value: "96", change: "+7%", trend: "green" },
    ],
    driverRates: [
      { name: "J. Doe", rate: 95 },
      { name: "M. Smith", rate: 89 },
      { name: "A. Lee", rate: 93 },
      { name: "R. Garcia", rate: 80 },
      { name: "C. Chen", rate: 97 },
    ],
    incidents: [
      { label: "Traffic", count: 4 },
      { label: "Weather", count: 2 },
      { label: "Mechanical", count: 1 },
      { label: "Routing", count: 1 },
      { label: "Other", count: 0 },
    ],
    rows: [
      { name: "John Doe", trips: 11, onTime: "95%", rating: 4.9, delays: 0, km: 920, status: "active" },
      { name: "Maria Smith", trips: 9, onTime: "89%", rating: 4.6, delays: 1, km: 740, status: "active" },
      { name: "Robert Garcia", trips: 7, onTime: "80%", rating: 4.2, delays: 2, km: 510, status: "warning" },
    ],
  },
  thisMonth: {
    stats: [
      { label: "Active Drivers", value: "118", change: "+0%", trend: "gray" },
      { label: "Avg. On-Time Rate", value: "87%", change: "-3%", trend: "red" },
      { label: "Total Trips", value: "284", change: "+12%", trend: "green" },
    ],
    driverRates: [
      { name: "J. Doe", rate: 95 },
      { name: "M. Smith", rate: 88 },
      { name: "A. Lee", rate: 92 },
      { name: "R. Garcia", rate: 78 },
      { name: "C. Chen", rate: 98 },
    ],
    incidents: [
      { label: "Traffic", count: 6 },
      { label: "Weather", count: 5 },
      { label: "Mechanical", count: 3 },
      { label: "Routing", count: 2 },
      { label: "Other", count: 1 },
    ],
    rows: [
      { name: "John Doe", trips: 42, onTime: "95%", rating: 4.9, delays: 1, km: 3420, status: "active" },
      { name: "Maria Smith", trips: 38, onTime: "88%", rating: 4.6, delays: 3, km: 2980, status: "active" },
      { name: "Robert Garcia", trips: 31, onTime: "78%", rating: 4.1, delays: 7, km: 2150, status: "warning" },
    ],
  },
  last3Months: {
    stats: [
      { label: "Active Drivers", value: "126", change: "+3%", trend: "green" },
      { label: "Avg. On-Time Rate", value: "89%", change: "+2%", trend: "green" },
      { label: "Total Trips", value: "812", change: "+19%", trend: "green" },
    ],
    driverRates: [
      { name: "J. Doe", rate: 94 },
      { name: "M. Smith", rate: 87 },
      { name: "A. Lee", rate: 91 },
      { name: "R. Garcia", rate: 81 },
      { name: "C. Chen", rate: 97 },
    ],
    incidents: [
      { label: "Traffic", count: 18 },
      { label: "Weather", count: 14 },
      { label: "Mechanical", count: 9 },
      { label: "Routing", count: 6 },
      { label: "Other", count: 3 },
    ],
    rows: [
      { name: "John Doe", trips: 118, onTime: "94%", rating: 4.9, delays: 4, km: 9840, status: "active" },
      { name: "Maria Smith", trips: 104, onTime: "87%", rating: 4.5, delays: 9, km: 8120, status: "active" },
      { name: "Robert Garcia", trips: 89, onTime: "81%", rating: 4.2, delays: 14, km: 6310, status: "warning" },
    ],
  },
  custom: {
    stats: [
      { label: "Active Drivers", value: "—", change: "", trend: "gray" },
      { label: "Avg. On-Time Rate", value: "—", change: "", trend: "gray" },
      { label: "Total Trips", value: "—", change: "", trend: "gray" },
    ],
    driverRates: [],
    incidents: [],
    rows: [],
  },
};

export default function DriverReport() {
  const [activeRange, setActiveRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const customPickerRef = useRef(null);

  // Close the custom range popover on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRangeClick = (range) => {
    if (range === "custom") {
      setShowCustomPicker((open) => !open);
      return;
    }
    setActiveRange(range);
    setShowCustomPicker(false);
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setActiveRange("custom");
    setShowCustomPicker(false);
  };

  const report = reportByRange[activeRange];
  const customRangeLabel =
    activeRange === "custom" && customStart && customEnd
      ? `${customStart} → ${customEnd}`
      : null;
  const maxIncidentCount = Math.max(1, ...report.incidents.map((i) => i.count));

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input
          type="text"
          placeholder="Search..."
        />

        <div className="topbar-right">
          <button id="notifBtn">🔔</button>
          <div className="avatar">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60" 
              alt="User Profile" 
              className="avatar-img" />
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        {/* Header */}
        <div className="header-row">
          <div>
            <h2>Reports — Drivers</h2>
            <p>
              Analyze individual driver
              performance, reliability,
              and delivery metrics.
            </p>
          </div>

          <div className="report-actions">
            <button className="secondary-btn">
              Schedule Report
            </button>

            <button className="primary-btn">
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <button
            className={`filter ${activeRange === "today" ? "active" : ""}`}
            onClick={() => handleRangeClick("today")}
          >
            Today
          </button>

          <button
            className={`filter ${activeRange === "thisWeek" ? "active" : ""}`}
            onClick={() => handleRangeClick("thisWeek")}
          >
            This Week
          </button>

          <button
            className={`filter ${activeRange === "thisMonth" ? "active" : ""}`}
            onClick={() => handleRangeClick("thisMonth")}
          >
            This Month
          </button>

          <button
            className={`filter ${activeRange === "last3Months" ? "active" : ""}`}
            onClick={() => handleRangeClick("last3Months")}
          >
            Last 3 Months
          </button>

          <div className="custom-range-wrapper" ref={customPickerRef}>
            <button
              className={`filter ${activeRange === "custom" ? "active" : ""}`}
              onClick={() => handleRangeClick("custom")}
            >
              {customRangeLabel || "Custom Range"}
            </button>

            {showCustomPicker && (
              <div className="custom-range-popover">
                <div className="custom-range-field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="custom-range-field">
                  <label>End date</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
                <button
                  className="custom-range-apply-btn"
                  onClick={handleApplyCustomRange}
                  disabled={!customStart || !customEnd}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="stats">
          {report.stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <h4>{stat.label}</h4>
              <h2>{stat.value}</h2>
              {stat.change && <p className={stat.trend}>{stat.change}</p>}
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="analytics-grid">
          {/* Driver Rates */}
          <div className="chart-card">
            <div className="card-header">
              <h3>On-Time Rate by Driver</h3>
            </div>

            <div className="driver-bars">
              {report.driverRates.length === 0 ? (
                <p className="empty-state-text">Pick a start and end date to load driver data for that range.</p>
              ) : (
                report.driverRates.map((driver) => (
                  <div className="driver-row" key={driver.name}>
                    <span>{driver.name}</span>
                    <div className="bar-container">
                      <div
                        className={`driver-bar ${driver.rate < 80 ? "warning" : ""}`}
                        style={{ width: `${driver.rate}%` }}
                      ></div>
                    </div>
                    <strong>{driver.rate}%</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Delay Incidents */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Delay Incidents</h3>
            </div>

            <div className="incident-bars">
              {report.incidents.length === 0 ? (
                <p className="empty-state-text">Pick a start and end date to load incident data for that range.</p>
              ) : (
                report.incidents.map((incident) => (
                  <div className="incident-row" key={incident.label}>
                    <span>{incident.label}</span>
                    <div className="incident-bar-container">
                      <div
                        className="incident-bar"
                        style={{ width: `${(incident.count / maxIncidentCount) * 100}%` }}
                      ></div>
                    </div>
                    <strong>{incident.count}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-header">
            <h3>Driver Performance</h3>
            <div className="table-actions">
              🔍
            </div>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Total Trips</th>
                <th>On-Time Rate</th>
                <th>Avg Rating</th>
                <th>Delay Incidents</th>
                <th>Total KM</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-row">
                    Pick a start and end date to load driver performance for that range.
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.trips}</td>
                    <td>{row.onTime}</td>
                    <td>{row.rating}</td>
                    <td>{row.delays}</td>
                    <td>{row.km.toLocaleString()}</td>
                    <td>
                      <span className={`status ${row.status}`}>
                        {row.status === "active" ? "Active" : "Review"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}