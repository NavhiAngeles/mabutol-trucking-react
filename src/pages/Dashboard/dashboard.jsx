import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [reportsSubmenuHidden, setReportsSubmenuHidden] = useState(true);
  const [settingsSubmenuHidden, setSettingsSubmenuHidden] = useState(true);

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <h2>Mabutol Tracking</h2>
          <p>NUEVA ECIJA GISTICS</p>
        </div>

        <nav className="menu">
          <div
            className="menu-item active"
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
              className="menu-item"
              id="reportsToggle"
              onClick={() => setReportsSubmenuHidden(!reportsSubmenuHidden)}
            >
              Reports
            </div>

            <div
              className={`submenu ${reportsSubmenuHidden ? "hidden" : ""}`}
              id="reportsSubmenu"
            >
              <div
                className="submenu-item active"
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
          <h1>Dashboard</h1>

          <input
            type="text"
            id="search"
            placeholder="Search fleet..."
            onChange={(e) => console.log("Searching:", e.target.value)}
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
          <div className="header">
            <span>SERVICING NUEVA ECIJA</span>
            <h2>Fleet Operations Overview</h2>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>Active Shipments</h4>
              <h2>1,482</h2>
              <p className="green">↑ +5% vs last week</p>
            </div>
            <div className="stat-card">
              <h4>Delayed Shipments</h4>
              <h2>12</h2>
              <p className="red">↑ 2 from yesterday</p>
            </div>
            <div className="stat-card">
              <h4>Available Trucks</h4>
              <h2>45</h2>
              <p className="yellow">Low availability warning</p>
            </div>
            <div className="stat-card">
              <h4>Pending Dispatch</h4>
              <h2>86</h2>
              <p className="gray">Ready for assignment</p>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid">
            {/* Map */}
            <div className="map-card">
              <img src="/assets/images/map.png" alt="Map View" />
            </div>

            {/* Right Panel */}
            <div className="right-panel">
              <h3>Priority Alerts</h3>
              <div className="alert red">Route delay detected</div>
              <div className="alert orange">Compliance issue</div>

              <h3>Unassigned Shipments</h3>
              <div className="alert blue">12 shipments pending</div>

              <h3>Operations Feed</h3>
              <div className="feed">
                <p>Truck #21 dispatched</p>
                <p>Shipment #889 delivered</p>
                <p>Driver shift completed</p>
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="bottom">
            <div className="analytics card">
              <h3>Performance & Analytics</h3>
              <p>On-time delivery: 96.8%</p>
              <p>Completed today: 342</p>
              <div className="chart">Shipment Trends</div>
            </div>

            <div className="resources card">
              <h3>Resource Snapshot</h3>

              <div>
                <span>Available</span>
                <div className="bar green"></div>
              </div>
              <div>
                <span>In Use</span>
                <div className="bar blue"></div>
              </div>
              <div>
                <span>Maintenance</span>
                <div className="bar orange"></div>
              </div>

              <p>Driver Hours: 8.4h avg</p>
              <p>Pallet Wraps: Low</p>
              <p>Coolant Fluid: Critical</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}