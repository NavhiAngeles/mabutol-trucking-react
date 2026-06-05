import MainLayout from "../../../layouts/mainLayout";
import "./account.css";

export default function Account() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input
          type="text"
          placeholder="Search..."
        />

        <div className="topbar-right">
          <button>🔔</button>
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
    </MainLayout>
  );
}