import { useNavigate } from "react-router-dom";
import "./account.css";

export default function Account() {
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
                className="submenu-item active"
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
            <button>🔔</button>
            <div className="avatar"></div>
          </div>
        </header>

        {/* Content */}
        <section className="content">
          {/* Header */}
          <div className="page-header">
            <div>
              <h2>Settings — Account</h2>
              <p>
                Manage your personal details,
                contact information, and
                account preferences.
              </p>
            </div>
          </div>

          {/* Grid */}
          <div className="settings-grid">
            {/* Left */}
            <div className="left-column">
              {/* Profile */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>Profile Information</h3>
                </div>

                <div className="profile-layout">
                  <div className="avatar-box">
                    JD
                  </div>

                  <div className="profile-info">
                    <div className="info-group">
                      <label>FULL NAME</label>
                      <span>Juan dela Cruz</span>
                    </div>

                    <div className="info-group">
                      <label>EMAIL ADDRESS</label>
                      <span>
                        juan.delacruz@tanaw.ph
                      </span>
                    </div>

                    <div className="info-group">
                      <label>ROLE</label>
                      <div className="role-badge">
                        Super Admin
                      </div>
                    </div>
                  </div>

                  <div className="profile-info">
                    <div className="info-group">
                      <label>CONTACT NUMBER</label>
                      <span>0917 123 4567</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="settings-card">
                <div className="card-header">
                  <div>
                    <h3>Password & Authentication</h3>
                    <p>
                      Manage your password
                      to secure your account.
                    </p>
                  </div>
                </div>

                <div className="password-grid">
                  <div>
                    <label>PASSWORD STRENGTH</label>
                    <div className="strength-bar">
                      <div className="strength-fill"></div>
                    </div>
                    <span className="green">
                      Strong
                    </span>
                  </div>

                  <div>
                    <label>LAST CHANGED</label>
                    <span>30 days ago</span>
                  </div>

                  <div>
                    <label>STATUS</label>
                    <span className="green">
                      Secure
                    </span>
                  </div>
                </div>

                <button className="primary-btn">
                  Change Password
                </button>
              </div>
            </div>

            {/* Right */}
            <div className="right-column">
              {/* Login Security */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>Login & Security</h3>
                </div>

                <div className="security-box">
                  <div className="recent-session">
                    <strong>
                      Today, 08:30 AM
                    </strong>
                    <span>
                      Chrome on Windows
                    </span>
                    <small>
                      Cabanatuan City
                    </small>
                  </div>
                </div>

                <div className="session-box">
                  <strong>
                    Safari on iPhone
                  </strong>
                  <span>
                    Yesterday, 10:15 PM
                  </span>
                </div>

                <button className="logout-btn">
                  Log Out All Other Sessions
                </button>
              </div>

              {/* Account Details */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>Account Details</h3>
                </div>

                <div className="details-row">
                  <span>Account ID:</span>
                  <strong>ADM-0001</strong>
                </div>

                <div className="details-row">
                  <span>Member Since:</span>
                  <strong>Jan 15, 2025</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}