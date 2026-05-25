import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./fleet.css";

export default function Fleet() {
  const navigate = useNavigate();
  const [reportsSubmenuHidden, setReportsSubmenuHidden] = useState(true);

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
            className="menu-item active"
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
          <div
            className="menu-item"
            onClick={() => navigate("/settings/account")}
          >
            Settings
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
          <h1>Fleet Management</h1>

          <input
            type="text"
            placeholder="Search drivers..."
            id="fleetSearch"
            onChange={(e) => console.log("Searching fleet:", e.target.value)}
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
            <span>LOGISTICS / ASSETS</span>
            <h2>Fleet Management Overview</h2>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>Total Assets</h4>
              <h2>145</h2>
              <p className="green">+2% vs last month</p>
            </div>
            
            <div className="stat-card">
              <h4>Ready to Dispatch</h4>
              <h2>98</h2>
              <p className="blue">67% of total fleet</p>
            </div>
            
            <div className="stat-card">
              <h4>Out of Service</h4>
              <h2>12</h2>
              <p className="red">Maintenance required</p>
            </div>
            
            <div className="stat-card">
              <h4>Off Duty</h4>
              <h2>35</h2>
              <p className="yellow">Drivers unavailable</p>
            </div>
          </div>

          {/* Driver Table */}
          <div className="fleet-table-card">
            <div className="table-header">
              <input
                type="text"
                className="table-search"
                placeholder="Search driver..."
              />
            </div>

            <table className="fleet-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>License</th>
                  <th>Vehicle</th>
                  <th>Shipment</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>Jose Dela Cruz</td>
                  <td>N01-22-34981</td>
                  <td>Isuzu Forward</td>
                  <td>SHP-8042</td>
                  <td>
                    <span className="status active">
                      ON ROUTE
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>Ricardo Bautista</td>
                  <td>N02-23-11234</td>
                  <td>Fuso Canter</td>
                  <td>No Active Trip</td>
                  <td>
                    <span className="status off">
                      OFF DUTY
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>Antonio Luna</td>
                  <td>N01-19-445566</td>
                  <td>Isuzu Giga</td>
                  <td>SHP-8045</td>
                  <td>
                    <span className="status active">
                      ON ROUTE
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