import { useEffect, useRef, useState } from "react";
import { customerEditValues, updateCustomer } from "../../services/customerService";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const CloseIcon = () => (
  <svg {...iconProps}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const labels = { name: "Customer name", email: "Contact email", phone: "Contact number", address: "Street address", barangay: "Barangay", city: "City / municipality", province: "Province" };

export default function CustomerEditDialog({ customer, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [values, setValues] = useState(() => customerEditValues(customer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [enableMobile, setEnableMobile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(customerEditValues(customer)) ||
    (enableMobile && Boolean(password.trim()));

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

  function close() {
    if (!locked.current && (!dirty || window.confirm("Discard unsaved customer changes?"))) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    setError("");

    if (enableMobile) {
      if (!values.email?.trim()) {
        setError("Contact Email is required to create a mobile application account.");
        return;
      }
      if (!password) {
        setError("Please enter a password for the mobile account.");
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
        ...(enableMobile ? { password, confirmPassword } : {}),
      };
      const saved = await updateCustomer(customer, payload);
      if (alive.current) onSaved(saved);
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      locked.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <dialog ref={dialogRef} className="customer-edit-dialog" aria-labelledby="customer-edit-title" aria-describedby="customer-edit-description" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={submit} aria-busy={saving}>
      <div className="cp-modal-header">
        <h2 id="customer-edit-title" className="cp-modal-title">Edit Customer</h2>
        <button type="button" className="cp-close-btn" aria-label="Close edit customer" disabled={saving} onClick={close}>
          <CloseIcon />
        </button>
      </div>
      <div className="customer-edit-body">
        <p id="customer-edit-description">Update this customer’s contact details and address.</p>
        <div className="customer-edit-fields">
          {Object.entries(labels).map(([key, label]) => <label key={key} htmlFor={`customer-edit-${key}`}>
            <span>{label}{key === "name" ? <> <span className="field-required">*</span></> : ""}</span>
            <input id={`customer-edit-${key}`} name={key} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} required={key === "name"} autoFocus={key === "name"} disabled={saving} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
          </label>)}
        </div>

        <div className="customer-cred-box">
          <div className="customer-cred-header">
            <div>
              <h3 className="customer-cred-title">
                {customer?.user_id ? "Mobile Application Account (Active)" : "Customer Mobile Application Account"}
              </h3>
              <p className="customer-cred-subtitle">
                {customer?.user_id
                  ? "This customer has a linked mobile user account. You can set a new password below."
                  : "Enable mobile access so this customer can sign in to the Tanaw Mobile application."}
              </p>
            </div>
            <button
              type="button"
              className={`customer-cred-toggle-btn ${enableMobile ? "is-active active" : ""}`}
              aria-pressed={enableMobile}
              onClick={() => setEnableMobile(!enableMobile)}
              disabled={saving}
            >
              {enableMobile ? "Cancel Setup" : customer?.user_id ? "Reset Password" : "+ Enable Mobile Access"}
            </button>
          </div>

          {enableMobile && (
            <div className="customer-cred-body">
              <div className="customer-cred-fields customer-add-grid">
                <div className="cp-form-group customer-form-field">
                  <label className="cp-label" htmlFor="customer-edit-password">
                    {customer?.user_id ? "New Password" : "Login Password"} <span className="cp-required field-required">*</span>
                  </label>
                  <div className="customer-pwd-wrapper customer-password-input-wrap">
                    <input
                      id="customer-edit-password"
                      type={showPassword ? "text" : "password"}
                      className="cp-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={saving}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="customer-pwd-toggle"
                      disabled={saving}
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="cp-form-group customer-form-field">
                  <label className="cp-label" htmlFor="customer-edit-confirm-password">
                    Confirm Password <span className="cp-required field-required">*</span>
                  </label>
                  <div className="customer-pwd-wrapper customer-password-input-wrap">
                    <input
                      id="customer-edit-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      className="cp-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      disabled={saving}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="customer-pwd-toggle"
                      disabled={saving}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="customer-edit-error" role="alert">{error}</p>}
      </div>
      <div className="customer-edit-footer">
        <button type="button" className="filter-btn" disabled={saving} onClick={close}>Cancel</button>
        <button type="submit" className="btn-add-submit" disabled={saving || !dirty}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </form>
  </dialog>;
}
