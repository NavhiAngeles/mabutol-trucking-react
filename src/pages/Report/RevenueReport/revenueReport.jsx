import { useState, useRef, useEffect } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./revenueReport.css";

// Mock report data per date-range filter — swap with real API data later
const reportByRange = {
  today: {
    stats: [
      { label: "Gross Revenue", value: "₱48,200", change: "+3%", trend: "green" },
      { label: "Net Revenue", value: "₱38,100", change: "+2%", trend: "green" },
      { label: "Operating Costs", value: "₱10,100", change: "+0%", trend: "gray" },
      { label: "Rev Per Shipment", value: "₱2,537", change: "+1%", trend: "green" },
    ],
    costBreakdown: [
      { fuel: 12, maintenance: 8 },
      { fuel: 9, maintenance: 14 },
      { fuel: 11, maintenance: 16 },
    ],
    topCustomers: [
      { name: "Alpha Industries", revenue: "₱14k" },
      { name: "Delta Logistics Group", revenue: "₱9k" },
      { name: "Metro Retail Corp", revenue: "₱6k" },
    ],
    routes: [
      { id: "RT-01", route: "Cabanatuan → Gapan", shipments: 3, revenue: "₱12k", margin: "23%" },
      { id: "RT-09", route: "San Jose → Science City", shipments: 2, revenue: "₱9k", margin: "21%" },
    ],
  },
  thisWeek: {
    stats: [
      { label: "Gross Revenue", value: "₱312,000", change: "+6%", trend: "green" },
      { label: "Net Revenue", value: "₱248,500", change: "+4%", trend: "green" },
      { label: "Operating Costs", value: "₱63,500", change: "+1%", trend: "gray" },
      { label: "Rev Per Shipment", value: "₱4,210", change: "+2%", trend: "green" },
    ],
    costBreakdown: [
      { fuel: 38, maintenance: 26 },
      { fuel: 30, maintenance: 44 },
      { fuel: 34, maintenance: 50 },
    ],
    topCustomers: [
      { name: "Alpha Industries", revenue: "₱98k" },
      { name: "Delta Logistics Group", revenue: "₱74k" },
      { name: "Metro Retail Corp", revenue: "₱51k" },
    ],
    routes: [
      { id: "RT-01", route: "Cabanatuan → Gapan", shipments: 11, revenue: "₱46k", margin: "24%" },
      { id: "RT-04", route: "Talavera → Guimba", shipments: 7, revenue: "₱34k", margin: "18%" },
      { id: "RT-09", route: "San Jose → Science City", shipments: 8, revenue: "₱41k", margin: "22%" },
    ],
  },
  thisMonth: {
    stats: [
      { label: "Gross Revenue", value: "₱1.24M", change: "+8%", trend: "green" },
      { label: "Net Revenue", value: "₱980,500", change: "+5%", trend: "green" },
      { label: "Operating Costs", value: "₱260,000", change: "-0%", trend: "gray" },
      { label: "Rev Per Shipment", value: "₱4,368", change: "+2%", trend: "green" },
    ],
    costBreakdown: [
      { fuel: 160, maintenance: 220 },
      { fuel: 120, maintenance: 260 },
      { fuel: 150, maintenance: 280 },
    ],
    topCustomers: [
      { name: "Alpha Industries", revenue: "₱450k" },
      { name: "Delta Logistics Group", revenue: "₱320k" },
      { name: "Metro Retail Corp", revenue: "₱210k" },
    ],
    routes: [
      { id: "RT-01", route: "Cabanatuan → Gapan", shipments: 42, revenue: "₱180k", margin: "24%" },
      { id: "RT-04", route: "Talavera → Guimba", shipments: 28, revenue: "₱140k", margin: "19%" },
      { id: "RT-09", route: "San Jose → Science City", shipments: 31, revenue: "₱165k", margin: "22%" },
    ],
  },
  last3Months: {
    stats: [
      { label: "Gross Revenue", value: "₱3.68M", change: "+15%", trend: "green" },
      { label: "Net Revenue", value: "₱2.91M", change: "+11%", trend: "green" },
      { label: "Operating Costs", value: "₱770,000", change: "+3%", trend: "red" },
      { label: "Rev Per Shipment", value: "₱4,530", change: "+4%", trend: "green" },
    ],
    costBreakdown: [
      { fuel: 410, maintenance: 540 },
      { fuel: 380, maintenance: 610 },
      { fuel: 430, maintenance: 690 },
    ],
    topCustomers: [
      { name: "Alpha Industries", revenue: "₱1.2M" },
      { name: "Delta Logistics Group", revenue: "₱890k" },
      { name: "Metro Retail Corp", revenue: "₱610k" },
    ],
    routes: [
      { id: "RT-01", route: "Cabanatuan → Gapan", shipments: 118, revenue: "₱510k", margin: "25%" },
      { id: "RT-04", route: "Talavera → Guimba", shipments: 84, revenue: "₱398k", margin: "20%" },
      { id: "RT-09", route: "San Jose → Science City", shipments: 92, revenue: "₱472k", margin: "23%" },
    ],
  },
  custom: {
    stats: [
      { label: "Gross Revenue", value: "—", change: "", trend: "gray" },
      { label: "Net Revenue", value: "—", change: "", trend: "gray" },
      { label: "Operating Costs", value: "—", change: "", trend: "gray" },
      { label: "Rev Per Shipment", value: "—", change: "", trend: "gray" },
    ],
    costBreakdown: [],
    topCustomers: [],
    routes: [],
  },
};

export default function RevenueReport() {
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
  const maxCostValue = Math.max(
    1,
    ...report.costBreakdown.flatMap((bar) => [bar.fuel, bar.maintenance])
  );

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input
          type="text"
          placeholder="Search..."
        />

        <div className="topbar-right">
          <button id="notifBtn" onClick={() => alert("No new notifications")}>
            🔔
          </button>
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
            <h2>Reports — Revenue</h2>
            <p>
              Monitor financial performance
              across shipments, customers,
              and routes.
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
          {/* Revenue Trend */}
          <div className="chart-card wide">
            <div className="card-header">
              <h3>Revenue Over Time</h3>
              <button className="filter small">
                Last 30 Days
              </button>
            </div>

            <div className="chart-placeholder">
              Revenue Trend Chart
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Operating Cost Breakdown</h3>
            </div>

            <div className="bar-chart">
              {report.costBreakdown.length === 0 ? (
                <p className="empty-state-text">Pick a start and end date to load cost data for that range.</p>
              ) : (
                report.costBreakdown.map((bar, idx) => (
                  <div className="bar-group" key={idx}>
                    <div
                      className="bar fuel"
                      style={{ height: `${(bar.fuel / maxCostValue) * 280}px` }}
                      title={`Fuel: ₱${bar.fuel}k`}
                    ></div>
                    <div
                      className="bar maintenance"
                      style={{ height: `${(bar.maintenance / maxCostValue) * 280}px` }}
                      title={`Maintenance: ₱${bar.maintenance}k`}
                    ></div>
                  </div>
                ))
              )}
            </div>
            {report.costBreakdown.length > 0 && (
              <div className="bar-chart-legend">
                <span><span className="dot-swatch fuel-swatch"></span>Fuel</span>
                <span><span className="dot-swatch maintenance-swatch"></span>Maintenance</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="bottom-grid">
          {/* Top Customers */}
          <div className="info-card">
            <div className="card-header">
              <h3>Top Customers</h3>
              <button className="more-btn">
                ⋯
              </button>
            </div>

            <div className="customer-list">
              {report.topCustomers.length === 0 ? (
                <p className="empty-state-text">Pick a start and end date to load top customers for that range.</p>
              ) : (
                report.topCustomers.map((cust) => (
                  <div className="customer-row" key={cust.name}>
                    <span>{cust.name}</span>
                    <strong>{cust.revenue}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="info-card">
            <div className="card-header">
              <h3>Revenue Breakdown by Route</h3>
              <button className="view-btn">
                View All →
              </button>
            </div>

            <table className="report-table">
              <thead>
                <tr>
                  <th>Route ID</th>
                  <th>Origin → Destination</th>
                  <th>Shipments</th>
                  <th>Revenue</th>
                  <th>Margin</th>
                </tr>
              </thead>

              <tbody>
                {report.routes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      Pick a start and end date to load route revenue for that range.
                    </td>
                  </tr>
                ) : (
                  report.routes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.route}</td>
                      <td>{r.shipments}</td>
                      <td>{r.revenue}</td>
                      <td>{r.margin}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}