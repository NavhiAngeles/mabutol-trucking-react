import { useEffect, useMemo, useRef, useState } from "react";
import { createCustomer } from "../../services/customerService";
import PhAddressAutocomplete from "../../components/PhAddressAutocomplete/PhAddressAutocomplete";
import {
  searchBarangays,
  searchCities,
  searchProvinces,
} from "../../utils/phAddress";
import {
  applyBarangaySelection,
  applyCitySelection,
  applyCityTextChange,
  applyProvinceSelection,
  applyProvinceTextChange,
  findDuplicateCustomer,
  formatPhMobileInput,
  toFullPhPhone,
} from "./customerFormUtils";

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

const AlertCircleIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const AlertTriangleIcon = () => (
  <svg {...iconProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const SmartphoneIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const PlusCircleIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
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

const InfoIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const initialValues = {
  name: "",
  email: "",
  phone: "",
  notes: "",
  province: "",
  city: "",
  barangay: "",
  address: "",
};

export default function CustomerAddDialog({ onClose, onSaved, callerRole, existingCustomers = [] }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [formState, setFormState] = useState(() => ({
    values: initialValues,
    provinceCode: "",
    cityCode: "",
  }));
  const { values, provinceCode: selectedProvinceCode, cityCode: selectedCityCode } = formState;
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

  const provinceOptions = useMemo(
    () => searchProvinces(values.province),
    [values.province]
  );

  const cityOptions = useMemo(
    () => searchCities(values.city, {
      provinceCode: selectedProvinceCode,
      provinceName: values.province,
    }),
    [values.city, selectedProvinceCode, values.province]
  );

  const barangayOptions = useMemo(
    () => searchBarangays(values.barangay, {
      cityCode: selectedCityCode,
      cityName: values.city,
      provinceCode: selectedProvinceCode,
      provinceName: values.province,
    }),
    [values.barangay, selectedCityCode, values.city, selectedProvinceCode, values.province]
  );

  const duplicateMatch = useMemo(
    () => findDuplicateCustomer(existingCustomers, {
      name: values.name,
      phone: values.phone,
    }),
    [existingCustomers, values.name, values.phone]
  );

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
      const normalizedPhone = toFullPhPhone(values.phone);
      const payload = {
        ...values,
        phone: normalizedPhone,
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
    setFormState((current) => ({
      ...current,
      values: { ...current.values, [field]: val },
    }));
  };

  function handlePhoneChange(event) {
    const formatted = formatPhMobileInput(event.target.value);
    setFormState((current) => ({
      ...current,
      values: { ...current.values, phone: formatted },
    }));
  }

  function handlePhonePaste(event) {
    const pasted = event?.clipboardData?.getData?.("text");
    if (typeof pasted === "string" && pasted.length > 0) {
      event.preventDefault();
      const formatted = formatPhMobileInput(pasted);
      setFormState((current) => ({
        ...current,
        values: { ...current.values, phone: formatted },
      }));
    }
  }

  function handleProvinceChange(text) {
    setFormState((current) => applyProvinceTextChange(current, text));
  }

  function handleProvinceSelect(option) {
    setFormState((current) => applyProvinceSelection(current, option));
  }

  function handleCityChange(text) {
    setFormState((current) => applyCityTextChange(current, text));
  }

  function handleCitySelect(option) {
    setFormState((current) => applyCitySelection(current, option));
  }

  function handleBarangayChange(text) {
    setFormState((current) => ({
      ...current,
      values: { ...current.values, barangay: text },
    }));
  }

  function handleBarangaySelect(option) {
    setFormState((current) => applyBarangaySelection(current, option));
  }

  const formattedDisplayPhone = values.phone ? `+63 ${values.phone}` : "";

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
            <CloseIcon />
          </button>
        </div>

        <div className="customer-add-body">
          <p id="customer-add-description" className="customer-add-description">
            Register a new billing customer record. Newly added customers can immediately be selected for booking in Shipment Dispatch.
          </p>

          {error && (
            <div className="customer-add-error" role="alert">
              <AlertCircleIcon />
              <span>{error}</span>
            </div>
          )}

          {/* Group 1: Customer & Contact Details */}
          <fieldset className="customer-form-section">
            <legend className="customer-section-legend">1. Customer &amp; Contact Details</legend>
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
                <div className="customer-phone-input-wrap">
                  <span className="customer-phone-prefix" aria-hidden="true">+63</span>
                  <input
                    id="customer-add-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="9XX XXX XXXX"
                    disabled={saving}
                    value={values.phone}
                    onChange={handlePhoneChange}
                    onPaste={handlePhonePaste}
                  />
                </div>
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
            </div>

            {duplicateMatch && (
              <div className="customer-duplicate-callout" role="status" aria-live="polite">
                <AlertTriangleIcon />
                <span>{duplicateMatch.message}</span>
              </div>
            )}
          </fieldset>

          {/* Group 2: Primary Address */}
          <fieldset className="customer-form-section">
            <legend className="customer-section-legend">2. Primary Address</legend>
            <div className="customer-add-grid">
              {/* Row 1: Province / Region & City / Municipality */}
              <PhAddressAutocomplete
                id="customer-add-province"
                name="province"
                label="Province / Region"
                placeholder="e.g. Metro Manila or Nueva Ecija"
                disabled={saving}
                value={values.province}
                options={provinceOptions}
                onChange={handleProvinceChange}
                onSelect={handleProvinceSelect}
              />

              <PhAddressAutocomplete
                id="customer-add-city"
                name="city"
                label="City / Municipality"
                placeholder="e.g. Pasig City or Cabanatuan City"
                disabled={saving}
                value={values.city}
                options={cityOptions}
                onChange={handleCityChange}
                onSelect={handleCitySelect}
              />

              {/* Row 2: Barangay */}
              <PhAddressAutocomplete
                id="customer-add-barangay"
                name="barangay"
                label="Barangay"
                className="customer-field-wide"
                placeholder="e.g. San Antonio or Ugong"
                disabled={saving}
                value={values.barangay}
                options={barangayOptions}
                idleHint="Type a barangay name to search nationwide, or pick a Province / City above."
                onChange={handleBarangayChange}
                onSelect={handleBarangaySelect}
              />

              {/* Row 3: Street Address / Building / Landmark */}
              <div className="customer-form-field customer-field-wide">
                <label htmlFor="customer-add-address">Street Address / Building / Landmark</label>
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
            </div>
          </fieldset>

          {/* Customer Mobile Application Account (Credentials) */}
          <div className="customer-cred-box">
            <div className="customer-cred-header">
              <div className="customer-cred-header-info">
                <div className="customer-cred-icon-badge" aria-hidden="true">
                  <SmartphoneIcon />
                </div>
                <div>
                  <h3 className="customer-cred-title">Customer Mobile Application Account</h3>
                  <p className="customer-cred-subtitle">
                    Create credentials so this customer can sign in to Tanaw Mobile to book and track shipments.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`customer-cred-toggle-btn ${createMobileAccount ? "is-active" : ""}`}
                aria-pressed={createMobileAccount}
                disabled={saving}
                onClick={() => setCreateMobileAccount(!createMobileAccount)}
              >
                {createMobileAccount ? <CheckCircleIcon /> : <PlusCircleIcon />}
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
                        disabled={saving}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
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
                        disabled={saving}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="customer-cred-notice">
                  <InfoIcon />
                  <span>
                    The customer can sign in on Tanaw Mobile using either their contact email ({values.email ? `"${values.email}"` : "entered above"}) or contact number ({formattedDisplayPhone ? `"${formattedDisplayPhone}"` : "entered above"}).
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
                  aria-hidden="true"
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
