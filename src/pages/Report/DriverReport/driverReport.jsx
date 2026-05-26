import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./driverReport.css";

export default function DriverReport() {
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
                className="submenu-item active"
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
                onClick={() => navigate("/settings/notifications")}
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
                onClick={() => navigate("/settings/complianceThresholds")}
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
            <button id="notifBtn">🔔</button>
            <div className="avatar"></div>
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
              <h4>Active Drivers</h4>
              <h2>118</h2>
              <p className="gray">+0%</p>
            </div>

            <div className="stat-card">
              <h4>Avg. On-Time Rate</h4>
              <h2>87%</h2>
              <p className="red">-3%</p>
            </div>

            <div className="stat-card">
              <h4>Total Trips</h4>
              <h2>284</h2>
              <p className="green">+12%</p>
            </div>
          </div>

          {/* Charts */}
          <div className="analytics-grid">
            {/* Driver Rates */}
            <div className="chart-card">
              <div className="card-header">
                <h3>On-Time Rate by Driver</h3>
              </div>

              <div className="driver-bars">
                <div className="driver-row">
                  <span>J. Doe</span>
                  <div className="bar-container">
                    <div className="driver-bar" style={{ width: "95%" }}></div>
                  </div>
                  <strong>95%</strong>
                </div>

                <div className="driver-row">
                  <span>M. Smith</span>
                  <div className="bar-container">
                    <div className="driver-bar" style={{ width: "88%" }}></div>
                  </div>
                  <strong>88%</strong>
                </div>

                <div className="driver-row">
                  <span>A. Lee</span>
                  <div className="bar-container">
                    <div className="driver-bar" style={{ width: "92%" }}></div>
                  </div>
                  <strong>92%</strong>
                </div>

                <div className="driver-row">
                  <span>R. Garcia</span>
                  <div className="bar-container">
                    <div className="driver-bar warning" style={{ width: "78%" }}></div>
                  </div>
                  <strong>78%</strong>
                </div>

                <div className="driver-row">
                  <span>C. Chen</span>
                  <div className="bar-container">
                    <div className="driver-bar" style={{ width: "98%" }}></div>
                  </div>
                  <strong>98%</strong>
                </div>
              </div>
            </div>

            {/* Delay Incidents */}
            <div className="chart-card">
              <div className="card-header">
                <h3>Delay Incidents</h3>
              </div>

              <div className="incident-bars">
                <div className="incident-row">
                  <span>Traffic</span>
                  <div className="incident-bar-container">
                    <div className="incident-bar" style={{ width: "240px" }}></div>
                  </div>
                  <strong>6</strong>
                </div>

                <div className="incident-row">
                  <span>Weather</span>
                  <div className="incident-bar-container">
                    <div className="incident-bar" style={{ width: "200px" }}></div>
                  </div>
                  <strong>5</strong>
                </div>

                <div className="incident-row">
                  <span>Mechanical</span>
                  <div className="incident-bar-container">
                    <div className="incident-bar" style={{ width: "120px" }}></div>
                  </div>
                  <strong>3</strong>
                </div>

                <div className="incident-row">
                  <span>Routing</span>
                  <div className="incident-bar-container">
                    <div className="incident-bar" style={{ width: "80px" }}></div>
                  </div>
                  <strong>2</strong>
                </div>

                <div className="incident-row">
                  <span>Other</span>
                  <div className="incident-bar-container">
                    <div className="incident-bar" style={{ width: "40px" }}></div>
                  </div>
                  <strong>1</strong>
                </div>
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
                <tr>
                  <td>John Doe</td>
                  <td>42</td>
                  <td>95%</td>
                  <td>4.9</td>
                  <td>1</td>
                  <td>3,420</td>
                  <td>
                    <span className="status active">
                      Active
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>Maria Smith</td>
                  <td>38</td>
                  <td>88%</td>
                  <td>4.6</td>
                  <td>3</td>
                  <td>2,980</td>
                  <td>
                    <span className="status active">
                      Active
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>Robert Garcia</td>
                  <td>31</td>
                  <td>78%</td>
                  <td>4.1</td>
                  <td>7</td>
                  <td>2,150</td>
                  <td>
                    <span className="status warning">
                      Review
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}