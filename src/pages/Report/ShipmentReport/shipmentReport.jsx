import { useState, useRef, useEffect } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./shipmentReport.css";

// Mock report data per date-range filter — swap with real API data later
const reportByRange = {
  today: {
    stats: [
      { label: "Total Shipments", value: "19", change: "+4%", trend: "green" },
      { label: "On-Time Rate", value: "92%", change: "+2%", trend: "green" },
      { label: "Cancelled Shipments", value: "0", change: "-0%", trend: "gray" },
    ],
    statusBreakdown: { completed: 9, active: 8, delayed: 2, cancelled: 0 },
    rows: [
      { id: "SHP-8081", customer: "Reyna Pascual", route: "Cabanatuan → Gapan", status: "completed", planned: "Today, 9:30 AM", actual: "Today, 9:25 AM" },
      { id: "SHP-8082", customer: "Noel Castillo", route: "San Jose → Science City", status: "active", planned: "Today, 1:00 PM", actual: "In Transit" },
    ],
  },
  thisWeek: {
    stats: [
      { label: "Total Shipments", value: "96", change: "+7%", trend: "green" },
      { label: "On-Time Rate", value: "89%", change: "+1%", trend: "green" },
      { label: "Cancelled Shipments", value: "3", change: "-1%", trend: "gray" },
    ],
    statusBreakdown: { completed: 61, active: 22, delayed: 10, cancelled: 3 },
    rows: [
      { id: "SHP-8060", customer: "Joanna Dela Rosa", route: "Palayan → Cabanatuan", status: "completed", planned: "Oct 19, 11:00 AM", actual: "Oct 19, 10:48 AM" },
      { id: "SHP-8050", customer: "Benito Aquino", route: "Talavera → Guimba", status: "delayed", planned: "Oct 15, 4:00 PM", actual: "Pending" },
      { id: "SHP-8039", customer: "Noel Castillo", route: "San Jose → Science City", status: "active", planned: "Oct 18, 10:00 AM", actual: "In Transit" },
    ],
  },
  thisMonth: {
    stats: [
      { label: "Total Shipments", value: "284", change: "+12%", trend: "green" },
      { label: "On-Time Rate", value: "87%", change: "-3%", trend: "red" },
      { label: "Cancelled Shipments", value: "8", change: "-0%", trend: "gray" },
    ],
    statusBreakdown: { completed: 180, active: 70, delayed: 26, cancelled: 8 },
    rows: [
      { id: "SHP-8042", customer: "Reyna Pascual", route: "Cabanatuan → Gapan", status: "completed", planned: "Oct 12, 2:30 PM", actual: "Oct 12, 2:18 PM" },
      { id: "SHP-8050", customer: "Benito Aquino", route: "Talavera → Guimba", status: "delayed", planned: "Oct 15, 4:00 PM", actual: "Pending" },
      { id: "SHP-8039", customer: "Noel Castillo", route: "San Jose → Science City", status: "active", planned: "Oct 18, 10:00 AM", actual: "In Transit" },
    ],
  },
  last3Months: {
    stats: [
      { label: "Total Shipments", value: "812", change: "+19%", trend: "green" },
      { label: "On-Time Rate", value: "89%", change: "+2%", trend: "green" },
      { label: "Cancelled Shipments", value: "21", change: "+1%", trend: "red" },
    ],
    statusBreakdown: { completed: 540, active: 180, delayed: 71, cancelled: 21 },
    rows: [
      { id: "SHP-7920", customer: "Joanna Dela Rosa", route: "Palayan → Cabanatuan", status: "completed", planned: "Sep 02, 9:00 AM", actual: "Sep 02, 8:50 AM" },
      { id: "SHP-7884", customer: "Ernesto Villanueva", route: "Gapan → Talavera", status: "completed", planned: "Aug 21, 1:00 PM", actual: "Aug 21, 1:05 PM" },
      { id: "SHP-7801", customer: "Maricel Soriano", route: "Cabanatuan → Rizal", status: "delayed", planned: "Aug 10, 3:00 PM", actual: "Aug 10, 5:40 PM" },
    ],
  },
  custom: {
    stats: [
      { label: "Total Shipments", value: "—", change: "", trend: "gray" },
      { label: "On-Time Rate", value: "—", change: "", trend: "gray" },
      { label: "Cancelled Shipments", value: "—", change: "", trend: "gray" },
    ],
    statusBreakdown: { completed: 0, active: 0, delayed: 0, cancelled: 0 },
    rows: [],
  },
};

export default function ShipmentReport() {
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
  const totalForBreakdown =
    report.statusBreakdown.completed +
    report.statusBreakdown.active +
    report.statusBreakdown.delayed +
    report.statusBreakdown.cancelled;

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
            <h2>Reports — Shipments</h2>
            <p>
              Comprehensive analysis of delivery
              performance and volume.
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

        {/* Analytics */}
        <div className="analytics-grid">
          {/* Shipment Status */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Shipment Status</h3>
            </div>

            <div className="diamond-chart">
              <div className="diamond-inner">
                <h2>{totalForBreakdown}</h2>
                <span>TOTAL</span>
              </div>
            </div>

            <div className="legend">
              <div>
                <span className="dot blue"></span>
                Completed ({report.statusBreakdown.completed})
              </div>

              <div>
                <span className="dot gray"></span>
                Active ({report.statusBreakdown.active})
              </div>

              <div>
                <span className="dot yellow"></span>
                Delayed ({report.statusBreakdown.delayed})
              </div>

              <div>
                <span className="dot red"></span>
                Cancelled ({report.statusBreakdown.cancelled})
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Delivery Performance Trend</h3>
            </div>

            <div className="trend-chart">
              <div className="trend-line"></div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-header">
            <h3>Shipment Ledger</h3>
            <div className="table-actions">
              ⋮
            </div>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Status</th>
                <th>Planned ETA</th>
                <th>Actual Delivery</th>
              </tr>
            </thead>

            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-row">
                    Pick a start and end date to load shipments for that range.
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.customer}</td>
                    <td>{row.route}</td>
                    <td>
                      <span className={`status ${row.status}`}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </span>
                    </td>
                    <td>{row.planned}</td>
                    <td>{row.actual}</td>
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