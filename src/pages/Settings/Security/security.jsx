import { useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./security.css";

export default function Security() {
  // ===== Password modal state =====
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw]     = useState("");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError]         = useState("");
  const [pwSuccess, setPwSuccess]     = useState(false);
  const [lastChangedDays, setLastChangedDays] = useState(45);

  const getStrength = (pw) => {
    if (!pw) return { label: "", level: 0 };
    let score = 0;
    if (pw.length >= 8)  score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: "WEAK",   level: 1 };
    if (score === 2) return { label: "FAIR",   level: 2 };
    if (score === 3) return { label: "GOOD",   level: 3 };
    return              { label: "STRONG", level: 4 };
  };

  const strength = getStrength(newPw);

  const handleUpdatePassword = () => {
    setPwError("");
    if (!currentPw) { setPwError("Please enter your current password."); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match."); return; }
    // Simulate success
    setPwSuccess(true);
    setLastChangedDays(0);
    setTimeout(() => {
      handleClosePasswordModal();
    }, 1500);
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setPwError(""); setPwSuccess(false);
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
  };

  // ===== 2FA toggle state =====
  const [twoFAEnabled, setTwoFAEnabled] = useState(true);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);

  const handleToggle2FA = () => {
    if (twoFAEnabled) {
      // Turning OFF is the risky action — confirm first
      setShowDisable2FAConfirm(true);
    } else {
      // Turning ON is safe — just enable it
      setTwoFAEnabled(true);
    }
  };

  const confirmDisable2FA = () => {
    setTwoFAEnabled(false);
    setShowDisable2FAConfirm(false);
  };

  // ===== Active sessions state =====
  const [sessions, setSessions] = useState([
    {
      id: 1,
      device: 'MacBook Pro 16"',
      location: "Seattle, WA",
      ip: "192.168.1.45",
      current: true,
      lastActive: null,
    },
    {
      id: 2,
      device: "iPhone 14 Pro",
      location: "Portland, OR",
      ip: "16.0.8.12",
      current: false,
      lastActive: "Last active 2 hrs ago",
    },
  ]);
  const [showTerminateAllConfirm, setShowTerminateAllConfirm] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [terminateDone, setTerminateDone] = useState(false);

  const otherSessions = sessions.filter((s) => !s.current);

  const handleRevokeSession = (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleTerminateAll = () => {
    setTerminating(true);
    // Simulate API call to revoke every non-current session
    setTimeout(() => {
      setSessions((prev) => prev.filter((s) => s.current));
      setTerminating(false);
      setTerminateDone(true);
      setShowTerminateAllConfirm(false);
      setTimeout(() => setTerminateDone(false), 2500);
    }, 1000);
  };

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
              <p>
                {lastChangedDays === 0
                  ? "Updated just now."
                  : `Last updated ${lastChangedDays} days ago.`}
              </p>
            </div>
            <button className="primary-btn" onClick={() => setShowPasswordModal(true)}>
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
            <div
              className={`toggle ${twoFAEnabled ? "active" : ""}`}
              onClick={handleToggle2FA}
              role="switch"
              aria-checked={twoFAEnabled}
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <div className="toggle-circle"></div>
            </div>
          </div>
        </div>

        {/* Sessions */}
        <div className="settings-card">
          <div className="card-header sessions-header">
            <h3>Active Sessions</h3>
            <button
              className="danger-btn"
              onClick={() => setShowTerminateAllConfirm(true)}
              disabled={otherSessions.length === 0}
              style={otherSessions.length === 0 ? { color: "#CBD5E1", cursor: "default" } : undefined}
            >
              TERMINATE ALL
            </button>
          </div>

          {terminateDone && (
            <p className="pw-success" style={{ marginBottom: "16px" }}>
              ✓ All other sessions have been terminated
            </p>
          )}

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
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.device}</td>
                  <td>
                    {session.location}
                    <br />
                    <small>{session.ip}</small>
                  </td>
                  <td>
                    {session.current ? (
                      <span className="status current">
                        Current Session
                      </span>
                    ) : (
                      <span className="inactive">
                        {session.lastActive}
                      </span>
                    )}
                  </td>
                  <td>
                    {session.current ? (
                      "-"
                    ) : (
                      <button
                        className="revoke-btn"
                        onClick={() => handleRevokeSession(session.id)}
                      >
                        REVOKE
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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

      {/* ===== UPDATE PASSWORD MODAL ===== */}
      {showPasswordModal && (
        <div className="pw-backdrop" onClick={handleClosePasswordModal}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="pw-modal-header">
              <h3 className="pw-modal-title">Update Password</h3>
              <button className="pw-close-btn" onClick={handleClosePasswordModal}>✕</button>
            </div>

            {/* Body */}
            <div className="pw-modal-body">

              {/* Current Password */}
              <div className="pw-field-group">
                <label className="pw-label">CURRENT PASSWORD</label>
                <div className="pw-input-wrap">
                  <input
                    type={showCurrent ? "text" : "password"}
                    className="pw-input"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <button className="pw-eye-btn" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? "👁" : "🙈"}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="pw-field-group">
                <label className="pw-label">NEW PASSWORD</label>
                <div className="pw-input-wrap">
                  <input
                    type={showNew ? "text" : "password"}
                    className="pw-input"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button className="pw-eye-btn" onClick={() => setShowNew(!showNew)}>
                    {showNew ? "👁" : "🙈"}
                  </button>
                </div>
                {/* Strength bar */}
                {newPw && (
                  <div className="pw-strength-wrap">
                    <div className="pw-strength-bars">
                      {[1,2,3,4].map(lvl => (
                        <div
                          key={lvl}
                          className={`pw-strength-seg ${strength.level >= lvl ? `seg-${strength.label.toLowerCase()}` : ""}`}
                        />
                      ))}
                    </div>
                    <span className={`pw-strength-label str-${strength.label.toLowerCase()}`}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="pw-field-group">
                <label className="pw-label">CONFIRM NEW PASSWORD</label>
                <div className="pw-input-wrap">
                  <input
                    type={showConfirm ? "text" : "password"}
                    className="pw-input"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Confirm Password"
                  />
                  <button className="pw-eye-btn" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? "👁" : "🙈"}
                  </button>
                </div>
                {confirmPw && newPw && (
                  <p className={`pw-match-hint ${newPw === confirmPw ? "match" : "no-match"}`}>
                    {newPw === confirmPw ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </p>
                )}
              </div>

              {/* Error */}
              {pwError && <p className="pw-error">{pwError}</p>}

              {/* Success */}
              {pwSuccess && <p className="pw-success">✓ Password updated successfully!</p>}
            </div>

            {/* Footer */}
            <div className="pw-modal-footer">
              <button
                className={`pw-update-btn ${pwSuccess ? "pw-update-btn--success" : ""}`}
                onClick={handleUpdatePassword}
                disabled={pwSuccess}
              >
                {pwSuccess ? "✓ Password Updated" : "Update Password"}
              </button>
              <button className="pw-cancel-btn" onClick={handleClosePasswordModal}>Cancel</button>
            </div>

          </div>
        </div>
      )}

      {/* ===== DISABLE 2FA CONFIRM MODAL ===== */}
      {showDisable2FAConfirm && (
        <div className="pw-backdrop" onClick={() => setShowDisable2FAConfirm(false)}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>

            <div className="pw-modal-header">
              <h3 className="pw-modal-title">Turn Off 2FA?</h3>
              <button className="pw-close-btn" onClick={() => setShowDisable2FAConfirm(false)}>✕</button>
            </div>

            <div className="pw-modal-body">
              <p style={{ fontSize: "14px", color: "#475569", margin: 0 }}>
                Turning off two-factor authentication makes your account easier to access,
                but less secure. You'll only need your password to log in.
              </p>
            </div>

            <div className="pw-modal-footer">
              <button
                className="pw-update-btn"
                style={{ background: "#DC2626" }}
                onClick={confirmDisable2FA}
              >
                Turn Off 2FA
              </button>
              <button className="pw-cancel-btn" onClick={() => setShowDisable2FAConfirm(false)}>
                Keep 2FA On
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ===== TERMINATE ALL SESSIONS CONFIRM MODAL ===== */}
      {showTerminateAllConfirm && (
        <div className="pw-backdrop" onClick={() => !terminating && setShowTerminateAllConfirm(false)}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>

            <div className="pw-modal-header">
              <h3 className="pw-modal-title">Terminate All Other Sessions?</h3>
              <button
                className="pw-close-btn"
                onClick={() => setShowTerminateAllConfirm(false)}
                disabled={terminating}
              >
                ✕
              </button>
            </div>

            <div className="pw-modal-body">
              <p style={{ fontSize: "14px", color: "#475569", margin: 0 }}>
                This will sign you out everywhere except this device
                {otherSessions.length > 0 && (
                  <> — including <strong>{otherSessions.map((s) => s.device).join(", ")}</strong></>
                )}.
                You'll need to log in again on those devices.
              </p>
            </div>

            <div className="pw-modal-footer">
              <button
                className="pw-update-btn"
                style={{ background: "#DC2626" }}
                onClick={handleTerminateAll}
                disabled={terminating}
              >
                {terminating ? "Terminating..." : "Yes, Terminate All"}
              </button>
              <button
                className="pw-cancel-btn"
                onClick={() => setShowTerminateAllConfirm(false)}
                disabled={terminating}
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
    </MainLayout>
  );
}