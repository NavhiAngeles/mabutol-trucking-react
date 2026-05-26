import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./shipment.css";

export default function Shipment() {
  const navigate = useNavigate();
  const [reportsSubmenuHidden, setReportsSubmenuHidden] = useState(true);
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
            className="menu-item active" 
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
          <h1>Shipments</h1>

          <input
            type="text"
            id="shipmentSearch"
            placeholder="Search shipment..."
            onChange={(e) => console.log("Searching shipment:", e.target.value)}
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
            <span>ACTIVE OPERATIONS</span>
            <h2>Shipment Monitoring</h2>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>In Transit</h4>
              <h2>18</h2>
              <p className="green">Currently on the road</p>
            </div>
            
            <div className="stat-card">
              <h4>Loading</h4>
              <h2>4</h2>
              <p className="blue">Preparing departure</p>
            </div>
            
            <div className="stat-card">
              <h4>Delayed</h4>
              <h2>3</h2>
              <p className="red">Immediate action needed</p>
            </div>
            
            <div className="stat-card">
              <h4>On-Time Rate</h4>
              <h2>87%</h2>
              <p className="yellow">Today's active shipments</p>
            </div>
          </div>

          {/* Table */}
          <div className="shipment-table-card">
            <div className="table-header">
              <input
                type="text"
                className="table-search"
                placeholder="Search by shipment ID..."
              />
            </div>

            <table className="shipment-table">
              <thead>
                <tr>
                  <th>Shipment ID</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Driver</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>SHP-8042</td>
                  <td>Cabanatuan</td>
                  <td>Gapan City</td>
                  <td><span className="status transit">IN TRANSIT</span></td>
                  <td>Ricardo Mendoza</td>
                </tr>

                <tr>
                  <td>SHP-8039</td>
                  <td>San Jose City</td>
                  <td>Science City</td>
                  <td><span className="status delayed">DELAYED</span></td>
                  <td>Eduardo Garcia</td>
                </tr>

                <tr>
                  <td>SHP-8050</td>
                  <td>Talavera</td>
                  <td>Guimba</td>
                  <td><span className="status loading">LOADING</span></td>
                  <td>Jose Dizon</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}