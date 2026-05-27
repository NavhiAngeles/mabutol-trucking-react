import { useNavigate } from "react-router-dom";
import "./notification.css";

export default function Notifications() {
  const navigate = useNavigate();

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
          <div 
            className="menu-item" 
            onClick={() => navigate("/report/overview")}
          >
            Reports
          </div>

          {/* Settings */}
          <div className="menu-group">
            <div className="menu-item active">
              Settings
            </div>

            <div className="submenu">
              <div
                className="submenu-item"
                onClick={() => navigate("/settings/account")}
              >
                Account
              </div>

              <div
                className="submenu-item active"
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
            <button>🔔</button>
            <div className="avatar"></div>
          </div>
        </header>

        {/* Content */}
        <section className="content">
          {/* Header */}
          <div className="page-header">
            <div>
              <h2>Settings — Notifications</h2>
              <p>
                Configure how and when you
                receive operational alerts.
              </p>
            </div>
          </div>

          {/* Grid */}
          <div className="notification-grid">
            {/* Delivery Channels */}
            <div className="settings-card">
              <div className="card-header">
                <h3>Delivery Channels</h3>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Email Notifications</strong>
                  <p>Daily summaries and delayed reports</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Push Notifications</strong>
                  <p>Real-time mobile alerts</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>SMS Alerts</strong>
                  <p>Reserved for critical alerts</p>
                </div>
                <div className="toggle">
                  <div className="toggle-circle"></div>
                </div>
              </div>
            </div>

            {/* Shipment Alerts */}
            <div className="settings-card wide">
              <div className="card-header">
                <h3>Shipment Alerts</h3>
              </div>

              <div className="alert-row">
                <div>
                  <strong>Status Changes</strong>
                  <p>Shipment status updates</p>
                </div>
                <div className="alert-options">
                  <label>
                    <input type="checkbox" defaultChecked />
                    EMAIL
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    PUSH
                  </label>
                </div>
              </div>

              <div className="alert-row">
                <div>
                  <strong>Off-Route Alert</strong>
                  <p>Vehicle route deviation</p>
                </div>
                <div className="alert-options">
                  <label>
                    <input type="checkbox" defaultChecked />
                    EMAIL
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    PUSH
                  </label>
                </div>
              </div>

              <div className="alert-row">
                <div>
                  <strong>Cold Chain Alert</strong>
                  <p>Temperature issue detected</p>
                </div>
                <div className="alert-options">
                  <label>
                    <input type="checkbox" defaultChecked />
                    EMAIL
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    PUSH
                  </label>
                </div>
              </div>
            </div>

            {/* Compliance */}
            <div className="settings-card">
              <div className="card-header">
                <h3>Compliance Alerts</h3>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Document Expiry Warning</strong>
                  <p>Expiring within 30 days</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Document Expired</strong>
                  <p>Already expired documents</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Permit Expiration</strong>
                  <p>Vehicle permits warning</p>
                </div>
                <div className="toggle">
                  <div className="toggle-circle"></div>
                </div>
              </div>
            </div>

            {/* Fleet */}
            <div className="settings-card">
              <div className="card-header">
                <h3>Fleet Alerts</h3>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Maintenance Due</strong>
                  <p>Scheduled service intervals</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>Vehicle Overdue</strong>
                  <p>Missed maintenance schedule</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <strong>New Customer Booking</strong>
                  <p>Customer submitted booking</p>
                </div>
                <div className="toggle active">
                  <div className="toggle-circle"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}