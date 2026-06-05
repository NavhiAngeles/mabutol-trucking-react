import { useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./account.css";

export default function Account() {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw]     = useState("");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError]         = useState("");
  const [pwSuccess, setPwSuccess]     = useState(false);

  // Profile state
  const [profile, setProfile] = useState({
    firstName: "Juan",
    lastName: "dela Cruz",
    email: "juan.delacruz@tanaw.ph",
    contact: "0917 123 4567",
    role: "Super Admin",
  });
  const [showEditProfile, setShowEditProfile]   = useState(false);
  const [editForm, setEditForm]                 = useState({ ...profile });
  const [photoPreview, setPhotoPreview]         = useState(null);
  const [editSuccess, setEditSuccess]           = useState(false);
  const [editError, setEditError]               = useState("");

  const handleOpenEdit = () => {
    setEditForm({ ...profile });
    setPhotoPreview(null);
    setEditError("");
    setEditSuccess(false);
    setShowEditProfile(true);
  };

  const handleCloseEdit = () => {
    setShowEditProfile(false);
    setEditError("");
    setEditSuccess(false);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setEditError("Photo must be under 2MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setEditError("");
  };

  const handleSaveProfile = () => {
    setEditError("");
    if (!editForm.firstName.trim()) { setEditError("First name is required."); return; }
    if (!editForm.lastName.trim())  { setEditError("Last name is required."); return; }
    if (!editForm.email.trim())     { setEditError("Email address is required."); return; }
    if (!/\S+@\S+\.\S+/.test(editForm.email)) { setEditError("Enter a valid email address."); return; }
    setProfile({ ...editForm });
    setEditSuccess(true);
    setTimeout(() => { handleCloseEdit(); }, 1400);
  };

  const initials = `${profile.firstName[0] || ""}${profile.lastName[0] || ""}`.toUpperCase();

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
    setTimeout(() => {
      setShowPasswordModal(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwSuccess(false); setPwError("");
    }, 1500);
  };

  const handleCloseModal = () => {
    setShowPasswordModal(false);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setPwError(""); setPwSuccess(false);
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
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
              <div className="card-header ep-card-header">
                <h3>Profile Information</h3>
                <button className="ep-edit-btn" onClick={handleOpenEdit}>✏️ Edit</button>
              </div>

              <div className="profile-layout">
                <div className="avatar-box">
                  {photoPreview
                    ? <img src={photoPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "18px" }} />
                    : initials
                  }
                </div>

                <div className="profile-info">
                  <div className="info-group">
                    <label>FULL NAME</label>
                    <span>{profile.firstName} {profile.lastName}</span>
                  </div>

                  <div className="info-group">
                    <label>EMAIL ADDRESS</label>
                    <span>{profile.email}</span>
                  </div>

                  <div className="info-group">
                    <label>ROLE</label>
                    <div className="role-badge">{profile.role}</div>
                  </div>
                </div>

                <div className="profile-info">
                  <div className="info-group">
                    <label>CONTACT NUMBER</label>
                    <span>{profile.contact}</span>
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

              <button className="primary-btn" onClick={() => setShowPasswordModal(true)}>
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
      {/* ===== CHANGE PASSWORD MODAL ===== */}
      {showPasswordModal && (
        <div className="pw-backdrop" onClick={handleCloseModal}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="pw-modal-header">
              <h3 className="pw-modal-title">Change Password</h3>
              <button className="pw-close-btn" onClick={handleCloseModal}>✕</button>
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
              <button className="pw-cancel-btn" onClick={handleCloseModal}>Cancel</button>
            </div>

          </div>
        </div>
      )}
      {/* ===== EDIT PROFILE MODAL ===== */}
      {showEditProfile && (
        <div className="ep-backdrop" onClick={handleCloseEdit}>
          <div className="ep-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="ep-modal-header">
              <h3 className="ep-modal-title">Edit Profile Information</h3>
              <button className="ep-close-btn" onClick={handleCloseEdit}>✕</button>
            </div>

            {/* Body */}
            <div className="ep-modal-body">

              {/* Photo Upload */}
              <div className="ep-photo-row">
                <label className="ep-photo-box" htmlFor="ep-photo-input">
                  {photoPreview
                    ? <img src={photoPreview} alt="preview" className="ep-photo-preview" />
                    : <span className="ep-photo-icon">📷</span>
                  }
                </label>
                <input
                  id="ep-photo-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: "none" }}
                  onChange={handlePhotoChange}
                />
                <div className="ep-photo-meta">
                  <span className="ep-photo-label">Change Photo</span>
                  <span className="ep-photo-hint">JPG OR PNG, MAX 2MB</span>
                </div>
              </div>

              {/* First + Last Name */}
              <div className="ep-row-2">
                <div className="ep-field-group">
                  <label className="ep-label">FIRST NAME</label>
                  <input
                    type="text"
                    className="ep-input"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="ep-field-group">
                  <label className="ep-label">LAST NAME</label>
                  <input
                    type="text"
                    className="ep-input"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="ep-field-group">
                <label className="ep-label">EMAIL ADDRESS</label>
                <input
                  type="email"
                  className="ep-input ep-input--muted"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Email address"
                />
              </div>

              {/* Contact + Role */}
              <div className="ep-row-2">
                <div className="ep-field-group">
                  <label className="ep-label">CONTACT NUMBER</label>
                  <input
                    type="text"
                    className="ep-input"
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                    placeholder="Contact number"
                  />
                </div>
                <div className="ep-field-group">
                  <label className="ep-label">ROLE</label>
                  <input
                    type="text"
                    className="ep-input ep-input--role"
                    value={editForm.role}
                    readOnly
                  />
                </div>
              </div>

              {/* Error / Success */}
              {editError   && <p className="pw-error">{editError}</p>}
              {editSuccess && <p className="pw-success">✓ Profile updated successfully!</p>}
            </div>

            {/* Footer */}
            <div className="ep-modal-footer">
              <button className="ep-cancel-btn" onClick={handleCloseEdit}>Cancel</button>
              <button
                className={`ep-save-btn ${editSuccess ? "ep-save-btn--success" : ""}`}
                onClick={handleSaveProfile}
                disabled={editSuccess}
              >
                {editSuccess ? "✓ Saved" : "Save Changes"}
              </button>
            </div>

          </div>
        </div>
      )}
    </MainLayout>
  );
}