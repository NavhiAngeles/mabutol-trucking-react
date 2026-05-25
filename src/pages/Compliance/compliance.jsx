import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./compliance.css";

export default function Compliance() {
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
            className="menu-item active" 
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
          <h1>Compliance</h1>

          <input
            type="text"
            placeholder="Search compliance..."
            id="complianceSearch"
            onChange={(e) => console.log("Searching compliance:", e.target.value)}
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
            <span>DRIVER REGULATIONS</span>
            <h2>Driver Compliance</h2>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>Fully Compliant</h4>
              <h2>98</h2>
              <p className="green">All requirements complete</p>
            </div>
            
            <div className="stat-card">
              <h4>Expiring Soon</h4>
              <h2>14</h2>
              <p className="yellow">Renewal required</p>
            </div>
            
            <div className="stat-card">
              <h4>Expired</h4>
              <h2>6</h2>
              <p className="red">Immediate action needed</p>
            </div>
            
            <div className="stat-card">
              <h4>Pending Review</h4>
              <h2>9</h2>
              <p className="blue">Awaiting approval</p>
            </div>
          </div>

          {/* Compliance Table */}
          <div className="compliance-table-card">
            <div className="table-header">
              <input
                type="text"
                className="table-search"
                placeholder="Search compliance..."
              />
            </div>

            <table className="compliance-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>License</th>
                  <th>Medical</th>
                  <th>NBI</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>Jose Dela Cruz</td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="status compliant">Compliant</span></td>
                  <td>Oct 12, 2023</td>
                </tr>

                <tr>
                  <td>Ricardo Bautista</td>
                  <td><span className="badge expired">Expired</span></td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="status expired-status">Non-Compliant</span></td>
                  <td>Oct 10, 2023</td>
                </tr>

                <tr>
                  <td>Manuel Pascual</td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="badge review">Under Review</span></td>
                  <td><span className="badge valid">Valid</span></td>
                  <td><span className="status review-status">Pending Review</span></td>
                  <td>Oct 15, 2023</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}