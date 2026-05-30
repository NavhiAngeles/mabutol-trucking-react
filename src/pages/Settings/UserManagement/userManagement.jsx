import MainLayout from "../../../layouts/mainLayout";
import "./userManagement.css";

export default function UserManagement() {
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
            <h2>
              Settings — User Management
            </h2>
            <p>
              Add, edit, and control
              access levels for users.
            </p>
          </div>

          <div className="header-actions">
            <button className="secondary-btn">
              Role Permission Summary
            </button>
            <button className="primary-btn">
              + Add Admin User
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-row">
          <input
            type="text"
            placeholder="Search by name or email..."
          />
          <button className="secondary-btn">
            Filter
          </button>
        </div>

        {/* Table */}
        <div className="table-card">
          <table className="user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {/* User 1 */}
              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">
                      J
                    </div>
                    <div>
                      <strong>Juan dela Cruz</strong>
                      <p>juan.admin@tanaw.ph</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge">
                    Super Admin
                  </span>
                </td>
                <td>Full Access</td>
                <td>Oct 24, 08:30 AM</td>
                <td>
                  <span className="status active">
                    Active
                  </span>
                </td>
                <td>⋮</td>
              </tr>

              {/* User 2 */}
              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">
                      M
                    </div>
                    <div>
                      <strong>Maria Santos</strong>
                      <p>maria@tanaw.ph</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge">
                    Super Admin
                  </span>
                </td>
                <td>Full Access</td>
                <td>Oct 23, 02:15 PM</td>
                <td>
                  <span className="status active">
                    Active
                  </span>
                </td>
                <td>⋮</td>
              </tr>

              {/* User 3 */}
              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">
                      R
                    </div>
                    <div>
                      <strong>Ricardo Mendoza</strong>
                      <p>ricardo@tanaw.ph</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge">
                    Staff
                  </span>
                </td>
                <td>Dashboard, Reports</td>
                <td>Oct 20, 09:00 AM</td>
                <td>
                  <span className="status inactive">
                    Inactive
                  </span>
                </td>
                <td>⋮</td>
              </tr>

              {/* User 4 */}
              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">
                      E
                    </div>
                    <div>
                      <strong>Elena Reyes</strong>
                      <p>elena@tanaw.ph</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge">
                    Staff
                  </span>
                </td>
                <td>Fleet, Customers</td>
                <td>Never</td>
                <td>
                  <span className="status pending">
                    Pending
                  </span>
                </td>
                <td>⋮</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}