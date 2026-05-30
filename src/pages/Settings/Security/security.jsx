import MainLayout from "../../../layouts/mainLayout";
import "./security.css";

export default function Security() {
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
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>Settings — Security</h2>
            <p>
              Configure authentication methods,
              active sessions, and login activity.
            </p>
          </div>
        </div>

        {/* Authentication */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Authentication</h3>
          </div>

          <div className="security-row">
            <div>
              <strong>Password</strong>
              <p>Last updated 45 days ago.</p>
            </div>
            <button className="primary-btn">
              Update Password
            </button>
          </div>

          <div className="security-row">
            <div>
              <strong>
                Two-Factor Authentication (2FA)
              </strong>
              <p>
                Require an extra security step.
              </p>
            </div>
            <div className="toggle active">
              <div className="toggle-circle"></div>
            </div>
          </div>
        </div>

        {/* Sessions */}
        <div className="settings-card">
          <div className="card-header sessions-header">
            <h3>Active Sessions</h3>
            <button className="danger-btn">
              TERMINATE ALL
            </button>
          </div>

          <table className="session-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Location / IP</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>MacBook Pro 16"</td>
                <td>
                  Seattle, WA
                  <br />
                  <small>192.168.1.45</small>
                </td>
                <td>
                  <span className="status current">
                    Current Session
                  </span>
                </td>
                <td>-</td>
              </tr>

              <tr>
                <td>iPhone 14 Pro</td>
                <td>
                  Portland, OR
                  <br />
                  <small>16.0.8.12</small>
                </td>
                <td>
                  <span className="inactive">
                    Last active 2 hrs ago
                  </span>
                </td>
                <td>
                  <button className="revoke-btn">
                    REVOKE
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Activity */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Recent Login Activity</h3>
          </div>

          <div className="activity-list">
            <div className="activity-item success">
              <div>
                <strong>
                  Successful Login
                </strong>
                <p>
                  IP: 192.168.1.45 • Seattle, WA
                </p>
              </div>
              <span>TODAY, 08:42 AM</span>
            </div>

            <div className="activity-item failed">
              <div>
                <strong>
                  Failed Login Attempt
                </strong>
                <p>
                  IP: 45.22.80.44 • Unknown Location
                </p>
              </div>
              <span>YESTERDAY, 11:20 PM</span>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}