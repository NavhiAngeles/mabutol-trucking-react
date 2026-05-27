import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./overview.css";

export default function Overview() {
  const navigate = useNavigate();
  const [settingsSubmenuHidden, setSettingsSubmenuHidden] = useState(true);

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <h2>Mabutol Tracking</h2>
          <p>NUEVA ECIJA LOGISTICS</p>
        </div>

        <nav className="menu">
          <div 
            className="menu-item" 
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </div>
          <div 
            className="menu-item" 
            onClick={() => navigate("/shipment")}
          >
            Shipments
          </div>
          <div 
            className="menu-item" 
            onClick={() => navigate("/fleet")}
          >
            Fleet Management
          </div>
          <div 
            className="menu-item" 
            onClick={() => navigate("/customer")}
          >
            Customers
          </div>
          <div 
            className="menu-item" 
            onClick={() => navigate("/compliance")}
          >
            Compliance
          </div>

          {/* Reports Dropdown */}
          <div className="menu-group">
            <div
              className="menu-item active"
              id="reportsToggle"
            >
              Reports
            </div>

            <div
              className="submenu"
              id="reportsSubmenu"
            >
              <div
                className="submenu-item"
                onClick={() => navigate("/report/overview")}
              >
                Overview
              </div>

              <div
                className="submenu-item"
                onClick={() => navigate("/report/shipmentReport")}
              >
                Shipments
              </div>

              <div
                className="submenu-item"
                onClick={() => navigate("/report/driverReport")}
              >
                Drivers
              </div>

              <div
                className="submenu-item"
                onClick={() => navigate("/report/revenueReport")}
              >
                Revenue
              </div>
            </div>
          </div>

          {/* Settings Dropdown */}
          <div className="menu-group">
            <div
              className="menu-item"
              id="settingsToggle"
              onClick={() => setSettingsSubmenuHidden(!settingsSubmenuHidden)}
            >
              Settings
            </div>

            <div
              className={`submenu ${settingsSubmenuHidden ? "hidden" : ""}`}
              id="settingsSubmenu"
            >
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/account")}
              >
                Account
              </div>
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/notification")}
              >
                Notifications
              </div>
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/pricing")}
              >
                Pricing
              </div>
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/complianceThreshold")}
              >
                Compliance Thresholds
              </div>
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/userManagement")}
              >
                User Management
              </div>
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/security")}
              >
                Security
              </div>
            </div>
          </div>
        </nav>

        <div className="sidebar-bottom">
          <span>Help Center</span>
          <span>Log Out</span>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <h1>Reports — Overview</h1>

          <input
            type="text"
            placeholder="Search..."
          />

          <div className="topbar-right">
            <button id="notifBtn">🔔</button>
            <div className="avatar"></div>
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
            <button className="filter active">
              This Month
            </button>

            <button className="filter">
              Last 3 Months
            </button>

            <button className="filter">
              Custom Range
            </button>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>Total Shipments</h4>
              <h2>284</h2>
              <p className="green">+12%</p>
            </div>

            <div className="stat-card">
              <h4>On-Time Rate</h4>
              <h2>87%</h2>
              <p className="red">-3%</p>
            </div>

            <div className="stat-card">
              <h4>Total Revenue</h4>
              <h2>₱1.24M</h2>
              <p className="green">+8%</p>
            </div>

            <div className="stat-card">
              <h4>Fleet Utilization</h4>
              <h2>83%</h2>
              <p className="gray">-0%</p>
            </div>
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
      </main>
    </div>
  );
}