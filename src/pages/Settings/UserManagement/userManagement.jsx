import { useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./userManagement.css";

const INITIAL_USERS = [
  {
    id: 1,
    firstName: "Juan",
    lastName: "dela Cruz",
    email: "juan.admin@tanaw.ph",
    role: "Super Admin",
    permissions: "Full Access",
    lastLogin: "Oct 24, 08:30 AM",
    status: "active",
  },
  {
    id: 2,
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@tanaw.ph",
    role: "Super Admin",
    permissions: "Full Access",
    lastLogin: "Oct 23, 02:15 PM",
    status: "active",
  },
  {
    id: 3,
    firstName: "Ricardo",
    lastName: "Mendoza",
    email: "ricardo@tanaw.ph",
    role: "Staff",
    permissions: "Dashboard, Reports",
    lastLogin: "Oct 20, 09:00 AM",
    status: "inactive",
  },
  {
    id: 4,
    firstName: "Elena",
    lastName: "Reyes",
    email: "elena@tanaw.ph",
    role: "Staff",
    permissions: "Fleet, Customers",
    lastLogin: "Never",
    status: "pending",
  },
];

const ALL_PERMISSIONS = [
  "Dashboard",
  "Reports",
  "Fleet",
  "Customers",
  "Settings",
  "User Management",
];

const ROLE_DEFAULTS = {
  "Super Admin": ALL_PERMISSIONS,
  Admin: ["Dashboard", "Reports", "Fleet", "Customers"],
  Staff: ["Dashboard", "Reports"],
};

// Role permissions matrix for the Role Permission Summary modal
const ROLE_PERMISSIONS_MATRIX = [
  { module: "Dashboard",        superAdmin: "view", staff: "view" },
  { module: "Shipments",        superAdmin: "full", staff: "full" },
  { module: "Fleet Management", superAdmin: "full", staff: "view" },
  { module: "Customers",        superAdmin: "full", staff: "view" },
  { module: "Reports",          superAdmin: "full", staff: "view" },
  { module: "Settings",         superAdmin: "full", staff: "none" },
  { module: "User Management",  superAdmin: "full", staff: "none" },
];

function getInitials(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function formatNow() {
  const now = new Date();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = (h % 12 || 12).toString().padStart(2, "0");
  return `${months[now.getMonth()]} ${now.getDate()}, ${hour}:${m} ${ampm}`;
}

// Helper: renders the access level badge cell
function PermBadge({ level }) {
  if (level === "full") {
    return (
      <span className="perm-badge perm-full">
        <span className="perm-badge-icon">✓</span> Full
      </span>
    );
  }
  if (level === "view") {
    return (
      <span className="perm-badge perm-view">
        <span className="perm-badge-icon">◉</span> View Only
      </span>
    );
  }
  return (
    <span className="perm-badge perm-none">
      <span className="perm-badge-icon">✕</span> No Access
    </span>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null); // user id of open dropdown
  const [toast, setToast] = useState({ show: false, message: "" });

  // Form state
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "Super Admin",
    status: "active",
    permissions: [...ALL_PERMISSIONS],
    // Website Application Credentials
    webEmail: "",
    webPassword: "",
    webConfirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [showWebPassword, setShowWebPassword] = useState(false);
  const [showWebConfirmPassword, setShowWebConfirmPassword] = useState(false);

  /* ─── Helpers ─── */
  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 3500);
  };

  const toggleMenu = (userId) => {
    setActiveMenu((prev) => (prev === userId ? null : userId));
  };

  const closeMenu = () => setActiveMenu(null);

  /* ─── Action handlers ─── */
  const handleViewDetails = (user) => {
    closeMenu();
    showToast(`Viewing details for ${user.firstName} ${user.lastName}.`);
  };

  const handleEditInfo = (user) => {
    closeMenu();
    showToast(`Edit info for ${user.firstName} ${user.lastName} — coming soon.`);
  };

  const handleChangeRole = (user) => {
    closeMenu();
    showToast(`Change role for ${user.firstName} ${user.lastName} — coming soon.`);
  };

  const handleResetPassword = (user) => {
    closeMenu();
    showToast(`Password reset link sent to ${user.email}.`);
  };

  const handleToggleActivation = (user) => {
    closeMenu();
    const nextStatus = user.status === "active" ? "inactive" : "active";
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );
    const label = nextStatus === "active" ? "activated" : "deactivated";
    showToast(`${user.firstName} ${user.lastName} has been ${label}.`);
  };

  const handleDeleteAccount = (user) => {
    closeMenu();
    if (window.confirm(`Delete account for ${user.firstName} ${user.lastName}? This cannot be undone.`)) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast(`${user.firstName} ${user.lastName}'s account has been deleted.`);
    }
  };

  const openModal = () => {
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      role: "Super Admin",
      status: "active",
      permissions: [...ALL_PERMISSIONS],
      webEmail: "",
      webPassword: "",
      webConfirmPassword: "",
    });
    setErrors({});
    setShowWebPassword(false);
    setShowWebConfirmPassword(false);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleRoleChange = (role) => {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: [...(ROLE_DEFAULTS[role] ?? [])],
    }));
    setErrors((prev) => ({ ...prev, role: "" }));
  };

  const togglePermission = (perm) => {
    setForm((prev) => {
      const has = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  /* ─── Validation ─── */
  const validate = () => {
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address.";
    } else if (users.some((u) => u.email.toLowerCase() === form.email.toLowerCase())) {
      newErrors.email = "This email is already in use.";
    }
    // Website credentials
    if (!form.webEmail.trim()) {
      newErrors.webEmail = "Website login email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.webEmail)) {
      newErrors.webEmail = "Enter a valid email address.";
    }
    if (!form.webPassword) {
      newErrors.webPassword = "Temporary password is required.";
    } else if (form.webPassword.length < 8) {
      newErrors.webPassword = "Password must be at least 8 characters.";
    }
    if (!form.webConfirmPassword) {
      newErrors.webConfirmPassword = "Please confirm the password.";
    } else if (form.webPassword !== form.webConfirmPassword) {
      newErrors.webConfirmPassword = "Passwords do not match.";
    }
    return newErrors;
  };

  /* ─── Submit ─── */
  const handleSubmit = () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const permText =
      form.role === "Super Admin"
        ? "Full Access"
        : form.permissions.length > 0
        ? form.permissions.join(", ")
        : "No Permissions";

    const newUser = {
      id: Date.now(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      role: form.role,
      permissions: permText,
      lastLogin: formatNow(),
      status: form.status,
    };

    setUsers((prev) => [...prev, newUser]);
    closeModal();
    showToast(`${newUser.firstName} ${newUser.lastName} added as ${newUser.role}.`);
  };

  /* ─── Filtered users ─── */
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  /* ─── Render ─── */
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input type="text" placeholder="Search..." />
        <div className="topbar-right">
          <button>🔔</button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h2>Settings — User Management</h2>
            <p>Add, edit, and control access levels for users.</p>
          </div>
          <div className="header-actions">
            <button className="secondary-btn" onClick={() => setShowRoleModal(true)}>Role Permission Summary</button>
            <button className="primary-btn" onClick={openModal}>
              + Add Admin User
            </button>
          </div>
        </div>

        {/* Search Row */}
        <div className="search-row">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary-btn">Filter</button>
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
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {getInitials(user.firstName, user.lastName)}
                        </div>
                        <div>
                          <strong>
                            {user.firstName} {user.lastName}
                          </strong>
                          <p>{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`role-badge ${
                          user.role === "Staff" ? "role-staff" : ""
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>{user.permissions}</td>
                    <td>{user.lastLogin}</td>
                    <td>
                      <span className={`status ${user.status}`}>
                        {user.status.charAt(0).toUpperCase() +
                          user.status.slice(1)}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <div className="action-menu-wrapper">
                        <button
                          className="action-dots-btn"
                          onClick={(e) => { e.stopPropagation(); toggleMenu(user.id); }}
                          aria-label="User actions"
                        >
                          ⋮
                        </button>

                        {activeMenu === user.id && (
                          <>
                            {/* Click-outside backdrop */}
                            <div
                              className="action-menu-backdrop"
                              onClick={closeMenu}
                            />
                            <div className="action-dropdown">
                              <button
                                className="action-item"
                                onClick={() => handleViewDetails(user)}
                              >
                                <span className="action-item-icon">👁</span>
                                View Details
                              </button>
                              <button
                                className="action-item"
                                onClick={() => handleEditInfo(user)}
                              >
                                <span className="action-item-icon">✏️</span>
                                Edit Info
                              </button>
                              <button
                                className="action-item"
                                onClick={() => handleChangeRole(user)}
                              >
                                <span className="action-item-icon">🔑</span>
                                Change Role
                              </button>
                              <button
                                className="action-item"
                                onClick={() => handleResetPassword(user)}
                              >
                                <span className="action-item-icon">🔒</span>
                                Reset Password
                              </button>
                              <button
                                className="action-item"
                                onClick={() => handleToggleActivation(user)}
                              >
                                <span className="action-item-icon">
                                  {user.status === "active" ? "⏸" : "▶️"}
                                </span>
                                {user.status === "active" ? "Deactivate Account" : "Activate Account"}
                              </button>
                              <div className="action-divider" />
                              <button
                                className="action-item action-item-danger"
                                onClick={() => handleDeleteAccount(user)}
                              >
                                <span className="action-item-icon">🗑</span>
                                Delete Account
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Add Admin User Modal ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={handleOverlayClick}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">

            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3 id="modal-title">Add Admin User</h3>
                <p>Fill in the details to create a new admin account.</p>
              </div>
              <button className="modal-close-btn" onClick={closeModal} aria-label="Close modal">
                ✕
              </button>
            </div>

            {/* Form Body */}
            <div className="modal-body">

              {/* Name Row */}
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="firstName">First Name</label>
                  <input
                    id="firstName"
                    type="text"
                    placeholder="e.g. Juan"
                    value={form.firstName}
                    onChange={(e) => handleFieldChange("firstName", e.target.value)}
                    className={errors.firstName ? "input-error" : ""}
                  />
                  {errors.firstName && (
                    <span className="field-error">{errors.firstName}</span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="lastName">Last Name</label>
                  <input
                    id="lastName"
                    type="text"
                    placeholder="e.g. dela Cruz"
                    value={form.lastName}
                    onChange={(e) => handleFieldChange("lastName", e.target.value)}
                    className={errors.lastName ? "input-error" : ""}
                  />
                  {errors.lastName && (
                    <span className="field-error">{errors.lastName}</span>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="form-field">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="e.g. user@tanaw.ph"
                  value={form.email}
                  onChange={(e) => handleFieldChange("email", e.target.value)}
                  className={errors.email ? "input-error" : ""}
                />
                {errors.email && (
                  <span className="field-error">{errors.email}</span>
                )}
              </div>

              {/* Role + Status Row */}
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="role">Role</label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin">Admin</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(e) => handleFieldChange("status", e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Permissions */}
              <div className="form-field">
                <label>Permissions</label>
                <div className="permissions-grid">
                  {ALL_PERMISSIONS.map((perm) => {
                    const checked = form.permissions.includes(perm);
                    return (
                      <label
                        key={perm}
                        className={`perm-checkbox ${checked ? "checked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePermission(perm)}
                        />
                        {perm}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ─── Website Application Credentials ─── */}
              <div className="credentials-section">
                <div className="credentials-section-header">
                  <h4>Website Application Account</h4>
                  <p>Set login credentials for this admin's web portal access.</p>
                </div>

                {/* Web Email */}
                <div className="form-field">
                  <label htmlFor="webEmail">Email Address <span className="required-star">*</span></label>
                  <input
                    id="webEmail"
                    type="email"
                    placeholder="admin@tanaw.ph"
                    value={form.webEmail}
                    onChange={(e) => handleFieldChange("webEmail", e.target.value)}
                    className={errors.webEmail ? "input-error" : ""}
                  />
                  {errors.webEmail && (
                    <span className="field-error">{errors.webEmail}</span>
                  )}
                </div>

                {/* Password Row */}
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="webPassword">Temporary Password <span className="required-star">*</span></label>
                    <div className="password-wrapper">
                      <input
                        id="webPassword"
                        type={showWebPassword ? "text" : "password"}
                        placeholder="········"
                        value={form.webPassword}
                        onChange={(e) => handleFieldChange("webPassword", e.target.value)}
                        className={errors.webPassword ? "input-error" : ""}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowWebPassword((v) => !v)}
                        aria-label={showWebPassword ? "Hide password" : "Show password"}
                      >
                        {showWebPassword ? "🙈" : "👁"}
                      </button>
                    </div>
                    {errors.webPassword && (
                      <span className="field-error">{errors.webPassword}</span>
                    )}
                  </div>

                  <div className="form-field">
                    <label htmlFor="webConfirmPassword">Confirm Password <span className="required-star">*</span></label>
                    <div className="password-wrapper">
                      <input
                        id="webConfirmPassword"
                        type={showWebConfirmPassword ? "text" : "password"}
                        placeholder="········"
                        value={form.webConfirmPassword}
                        onChange={(e) => handleFieldChange("webConfirmPassword", e.target.value)}
                        className={errors.webConfirmPassword ? "input-error" : ""}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowWebConfirmPassword((v) => !v)}
                        aria-label={showWebConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showWebConfirmPassword ? "🙈" : "👁"}
                      </button>
                    </div>
                    {errors.webConfirmPassword && (
                      <span className="field-error">{errors.webConfirmPassword}</span>
                    )}
                  </div>
                </div>

                {/* Info note */}
                <p className="credentials-note">
                  <span className="note-icon">ℹ</span>
                  System configuration enforces a forced password update sequence on initial platform access.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button className="secondary-btn" onClick={closeModal}>
                Cancel
              </button>
              <button className="primary-btn" onClick={handleSubmit}>
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Role Permission Summary Modal ─── */}
      {showRoleModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowRoleModal(false); }}
        >
          <div className="modal rp-modal" role="dialog" aria-modal="true" aria-labelledby="rp-modal-title">

            {/* Header */}
            <div className="modal-header">
              <div>
                <h3 id="rp-modal-title">Role Permissions</h3>
                <p>Access levels for each admin role in Tanaw.</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowRoleModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Permissions Table */}
            <div className="rp-table-wrapper">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th className="rp-col-module">Modules</th>
                    <th className="rp-col-role">Super Admin</th>
                    <th className="rp-col-role">Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_PERMISSIONS_MATRIX.map((row) => (
                    <tr key={row.module}>
                      <td className="rp-module-name">{row.module}</td>
                      <td><PermBadge level={row.superAdmin} /></td>
                      <td><PermBadge level={row.staff} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="rp-legend">
              <span className="rp-legend-label">Legend</span>
              <div className="rp-legend-items">
                <span className="rp-legend-item">
                  <span className="rp-icon full-icon">✓</span>
                  <strong className="rp-full-text">Full Access</strong>
                  <span className="rp-legend-desc">Can view, edit, and delete.</span>
                </span>
                <span className="rp-legend-item">
                  <span className="rp-icon view-icon">◉</span>
                  <strong className="rp-view-text">View Only</strong>
                  <span className="rp-legend-desc">Can only view.</span>
                </span>
                <span className="rp-legend-item">
                  <span className="rp-icon none-icon">✕</span>
                  <strong className="rp-none-text">No Access</strong>
                  <span className="rp-legend-desc">Cannot view or edit.</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Success Toast ─── */}
      {toast.show && (
        <div className="success-toast">
          <span className="toast-icon">✓</span>
          {toast.message}
        </div>
      )}
    </MainLayout>
  );
}