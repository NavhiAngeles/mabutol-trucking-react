import { useEffect, useRef, useState } from "react";
import { createCustomer } from "../../services/customerService";

const initialValues = {
  name: "",
  email: "",
  phone: "",
  notes: "",
  address: "",
  barangay: "",
  city: "",
  province: "",
};

export default function CustomerAddDialog({ onClose, onSaved, callerRole }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [values, setValues] = useState(initialValues);
  const [createMobileAccount, setCreateMobileAccount] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const dirty = Object.values(values).some((val) => val.trim() !== "") ||
    createMobileAccount || Boolean(password.trim());

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.showModal();
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  function handleCancelAttempt() {
    if (locked.current) return;
    if (showDiscard) {
      setShowDiscard(false);
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    setShowDiscard(true);
  }

  function handleConfirmDiscard() {
    setShowDiscard(false);
    onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    setError("");

    if (createMobileAccount) {
      if (!values.email.trim()) {
        setError("Contact Email is required to create a mobile application account.");
        return;
      }
      if (!password) {
        setError("Please enter a temporary password for the mobile account.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please re-enter the confirmation password.");
        return;
      }
    }

    locked.current = true;
    setSaving(true);

    try {
      const payload = {
        ...values,
        ...(createMobileAccount ? { password, confirmPassword } : {}),
      };
      const created = await createCustomer(payload, { callerRole });
      if (alive.current) {
        onSaved(created);
      }
    } catch (err) {
      if (alive.current) {
        setError(err.message || "Failed to register customer.");
      }
    } finally {
      locked.current = false;
      if (alive.current) {
        setSaving(false);
      }
    }
  }

  const handleChange = (field) => (event) => {
    const val = event.target.value;
    setValues((current) => ({ ...current, [field]: val }));
  };

  return (
    <dialog
      ref={dialogRef}
      className="customer-add-dialog"
      aria-labelledby="customer-add-title"
      aria-describedby="customer-add-description"
      onCancel={(event) => {
        event.preventDefault();
        handleCancelAttempt();
      }}
    >
      <form onSubmit={submit} aria-busy={saving}>
        <div className="cp-modal-header">
          <div className="cp-modal-title-row">
            <h2 id="customer-add-title" className="cp-modal-title">
              Add New Customer
            </h2>
          </div>
          <button
            type="button"
            className="cp-close-btn"
            aria-label="Close add customer"
            disabled={saving}
            onClick={handleCancelAttempt}
          >
            ✕
          </button>
        </div>

        <div className="customer-add-body">
          <p id="customer-add-description" className="customer-add-description">
            Register a new billing customer record. Newly added customers can immediately be selected for booking in Shipment Dispatch.
          </p>

          {error && (
            <div className="customer-add-error" role="alert">
              <i className="las la-exclamation-circle" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="customer-add-grid">
            {/* Customer Name */}
            <div className="customer-form-field customer-field-wide">
              <label htmlFor="customer-add-name">
                Customer Name <span className="field-required">*</span>
              </label>
              <input
                id="customer-add-name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="e.g. Juan dela Cruz or Acme Logistics"
                disabled={saving}
                value={values.name}
                onChange={handleChange("name")}
              />
            </div>

            {/* Email Address */}
            <div className="customer-form-field">
              <label htmlFor="customer-add-email">Contact Email</label>
              <input
                id="customer-add-email"
                name="email"
                type="email"
                placeholder="e.g. billing@company.com"
                disabled={saving}
                value={values.email}
                onChange={handleChange("email")}
              />
            </div>

            {/* Contact Phone */}
            <div className="customer-form-field">
              <label htmlFor="customer-add-phone">Contact Number</label>
              <input
                id="customer-add-phone"
                name="phone"
                type="tel"
                placeholder="e.g. 0917 123 4567"
                disabled={saving}
                value={values.phone}
                onChange={handleChange("phone")}
              />
            </div>

            {/* Company / Notes */}
            <div className="customer-form-field customer-field-wide">
              <label htmlFor="customer-add-notes">Company / Billing Notes</label>
              <input
                id="customer-add-notes"
                name="notes"
                type="text"
                placeholder="e.g. Corporate account, Net 30 terms, Warehouse B delivery"
                disabled={saving}
                value={values.notes}
                onChange={handleChange("notes")}
              />
            </div>

            {/* Street Address */}
            <div className="customer-form-field customer-field-wide">
              <label htmlFor="customer-add-address">Street Address</label>
              <input
                id="customer-add-address"
                name="address"
                type="text"
                placeholder="e.g. Unit 402 Emerald Tower, Ortigas Ave"
                disabled={saving}
                value={values.address}
                onChange={handleChange("address")}
              />
            </div>

            {/* Barangay */}
            <div className="customer-form-field">
              <label htmlFor="customer-add-barangay">Barangay</label>
              <input
                id="customer-add-barangay"
                name="barangay"
                type="text"
                placeholder="e.g. San Antonio"
                disabled={saving}
                value={values.barangay}
                onChange={handleChange("barangay")}
              />
            </div>

            {/* City */}
            <div className="customer-form-field">
              <label htmlFor="customer-add-city">City / Municipality</label>
              <input
                id="customer-add-city"
                name="city"
                type="text"
                placeholder="e.g. Pasig City"
                disabled={saving}
                value={values.city}
                onChange={handleChange("city")}
              />
            </div>

            {/* Province */}
            <div className="customer-form-field customer-field-wide">
              <label htmlFor="customer-add-province">Province / Region</label>
              <input
                id="customer-add-province"
                name="province"
                type="text"
                placeholder="e.g. Metro Manila"
                disabled={saving}
                value={values.province}
                onChange={handleChange("province")}
              />
            </div>
          </div>

          {/* Customer Mobile Application Account (Credentials) */}
          <div className="customer-cred-box">
            <div className="customer-cred-header">
              <div className="customer-cred-header-info">
                <div className="customer-cred-icon-badge" aria-hidden="true">
                  <i className="las la-mobile-alt" />
                </div>
                <div>
                  <h4 className="customer-cred-title">Customer Mobile Application Account</h4>
                  <p className="customer-cred-subtitle">
                    Create credentials so this customer can sign in to Tanaw Mobile to book and track shipments.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`customer-cred-toggle-btn ${createMobileAccount ? "is-active" : ""}`}
                disabled={saving}
                onClick={() => setCreateMobileAccount(!createMobileAccount)}
              >
                <i className={`las ${createMobileAccount ? "la-check-circle" : "la-plus-circle"}`} />
                <span>{createMobileAccount ? "Mobile Access Active" : "+ Enable Mobile Access"}</span>
              </button>
            </div>

            {createMobileAccount && (
              <div className="customer-cred-body">
                <div className="customer-add-grid">
                  <div className="customer-form-field">
                    <label htmlFor="customer-add-password">
                      Temporary Password <span className="field-required">*</span>
                    </label>
                    <div className="customer-password-input-wrap">
                      <input
                        id="customer-add-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        disabled={saving}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="customer-pwd-toggle"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <i className={`las ${showPassword ? "la-eye-slash" : "la-eye"}`} />
                      </button>
                    </div>
                  </div>

                  <div className="customer-form-field">
                    <label htmlFor="customer-add-confirm-password">
                      Confirm Password <span className="field-required">*</span>
                    </label>
                    <div className="customer-password-input-wrap">
                      <input
                        id="customer-add-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repeat password"
                        disabled={saving}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="customer-pwd-toggle"
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        tabIndex={-1}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        <i className={`las ${showConfirmPassword ? "la-eye-slash" : "la-eye"}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="customer-cred-notice">
                  <i className="las la-info-circle" />
                  <span>
                    The customer can sign in on Tanaw Mobile using either their contact email ({values.email ? `"${values.email}"` : "entered above"}) or contact number ({values.phone ? `"${values.phone}"` : "entered above"}).
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="customer-add-footer">
          <button
            type="button"
            className="filter-btn"
            disabled={saving}
            onClick={handleCancelAttempt}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-add-submit"
            disabled={saving || !values.name.trim()}
          >
            {saving ? "Registering..." : "Add Customer"}
          </button>
        </div>

        {showDiscard && (
          <div className="customer-discard-overlay" role="presentation">
            <div
              className="customer-discard-card"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="customer-discard-title"
              aria-describedby="customer-discard-description"
            >
              <div className="customer-discard-icon" aria-hidden="true">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                </svg>
              </div>
              <h3 id="customer-discard-title" className="customer-discard-title">
                Discard unsaved customer?
              </h3>
              <p id="customer-discard-description" className="customer-discard-description">
                You have unsaved changes in this form. If you discard now, all entered customer details will be lost.
              </p>
              <div className="customer-discard-actions">
                <button
                  type="button"
                  className="customer-discard-keep"
                  autoFocus
                  onClick={() => setShowDiscard(false)}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="customer-discard-confirm"
                  onClick={handleConfirmDiscard}
                >
                  Discard Customer
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </dialog>
  );
}

