import { useState, useRef, useEffect } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./overview.css";

// Mock stats per date-range filter — swap with real API data later
const statsByRange = {
  thisMonth: [
    { label: "Total Shipments", value: "284", change: "+12%", trend: "green" },
    { label: "On-Time Rate", value: "87%", change: "-3%", trend: "red" },
    { label: "Total Revenue", value: "₱1.24M", change: "+8%", trend: "green" },
    { label: "Fleet Utilization", value: "83%", change: "-0%", trend: "gray" },
  ],
  last3Months: [
    { label: "Total Shipments", value: "812", change: "+19%", trend: "green" },
    { label: "On-Time Rate", value: "89%", change: "+2%", trend: "green" },
    { label: "Total Revenue", value: "₱3.46M", change: "+15%", trend: "green" },
    { label: "Fleet Utilization", value: "81%", change: "-2%", trend: "red" },
  ],
  custom: [
    { label: "Total Shipments", value: "—", change: "", trend: "gray" },
    { label: "On-Time Rate", value: "—", change: "", trend: "gray" },
    { label: "Total Revenue", value: "—", change: "", trend: "gray" },
    { label: "Fleet Utilization", value: "—", change: "", trend: "gray" },
  ],
};

export default function Overview() {
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

  const currentStats = statsByRange[activeRange];
  const customRangeLabel =
    activeRange === "custom" && customStart && customEnd
      ? `${customStart} → ${customEnd}`
      : null;

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <h1>Reports — Overview</h1>

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
            <h2>Reports Overview</h2>
            <p>
              Track operational performance
              and logistics metrics.
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
          {currentStats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <h4>{stat.label}</h4>
              <h2>{stat.value}</h2>
              {stat.change && <p className={stat.trend}>{stat.change}</p>}
            </div>
          ))}
        </div>

        {/* Analytics Grid */}
        <div className="analytics-grid">
          <div className="chart-card">
            <div className="card-header">
              <h3>Shipment Volume</h3>
            </div>

            <div className="chart-placeholder">
              Chart Area
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <h3>Revenue vs Target</h3>
            </div>

            <div className="chart-placeholder">
              Chart Area
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="bottom-grid">
          <div className="info-card">
            <h3>Top Performing Drivers</h3>
          </div>

          <div className="info-card">
            <h3>Compliance Snapshot</h3>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}