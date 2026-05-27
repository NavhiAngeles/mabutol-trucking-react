import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./revenueReport.css";

export default function RevenueReport() {
  const navigate = useNavigate();
  const [settingsSubmenuHidden, setSettingsSubmenuHidden] = useState(true);

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <h2>TANAW</h2>
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

          {/* Reports */}
          <div className="menu-group">
            <div className="menu-item active">
              Reports
            </div>

            <div className="submenu">
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
                className="submenu-item active"
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
          <input
            type="text"
            placeholder="Search..."
          />

          <div className="topbar-right">
            <button id="notifBtn" onClick={() => alert("No new notifications")}>
              🔔
            </button>
            <div className="avatar"></div>
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
            <button className="filter">
              Today
            </button>

            <button className="filter">
              This Week
            </button>

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
              <h4>Gross Revenue</h4>
              <h2>₱1.24M</h2>
              <p className="green">+8%</p>
            </div>

            <div className="stat-card">
              <h4>Net Revenue</h4>
              <h2>₱980,500</h2>
              <p className="green">+5%</p>
            </div>

            <div className="stat-card">
              <h4>Operating Costs</h4>
              <h2>₱260,000</h2>
              <p className="gray">-0%</p>
            </div>

            <div className="stat-card">
              <h4>Rev Per Shipment</h4>
              <h2>₱4,368</h2>
              <p className="green">+2%</p>
            </div>
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
                <div className="bar-group">
                  <div className="bar fuel"></div>
                  <div className="bar maintenance"></div>
                </div>

                <div className="bar-group">
                  <div className="bar fuel short"></div>
                  <div className="bar maintenance tall"></div>
                </div>

                <div className="bar-group">
                  <div className="bar fuel"></div>
                  <div className="bar maintenance taller"></div>
                </div>
              </div>
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
                <div className="customer-row">
                  <span>Alpha Industries</span>
                  <strong>₱450k</strong>
                </div>

                <div className="customer-row">
                  <span>Delta Logistics Group</span>
                  <strong>₱320k</strong>
                </div>

                <div className="customer-row">
                  <span>Metro Retail Corp</span>
                  <strong>₱210k</strong>
                </div>
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
                  <tr>
                    <td>RT-01</td>
                    <td>Cabanatuan → Gapan</td>
                    <td>42</td>
                    <td>₱180k</td>
                    <td>24%</td>
                  </tr>

                  <tr>
                    <td>RT-04</td>
                    <td>Talavera → Guimba</td>
                    <td>28</td>
                    <td>₱140k</td>
                    <td>19%</td>
                  </tr>

                  <tr>
                    <td>RT-09</td>
                    <td>San Jose → Science City</td>
                    <td>31</td>
                    <td>₱165k</td>
                    <td>22%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}