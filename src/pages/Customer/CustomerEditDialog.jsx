import { useEffect, useMemo, useRef, useState } from "react";
import { customerEditValues, updateCustomer } from "../../services/customerService";
import PhAddressAutocomplete from "../../components/PhAddressAutocomplete/PhAddressAutocomplete";
import {
  resolveCity,
  resolveProvince,
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

const AlertTriangleIcon = () => (
  <svg {...iconProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
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

function buildInitialEditState(customer) {
  const raw = customerEditValues(customer);
  return {
    ...raw,
    phone: formatPhMobileInput(raw.phone),
  };
}

export default function CustomerEditDialog({ customer, existingCustomers = [], onClose, onSaved }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);

  const rawInitial = useMemo(() => customerEditValues(customer), [customer]);
  const initialFormValues = useMemo(() => buildInitialEditState(customer), [customer]);

  const [formState, setFormState] = useState(() => {
    const matchedProv = resolveProvince(rawInitial.province);
    const matchedCity = resolveCity(rawInitial.city, matchedProv?.code || rawInitial.province);
    return {
      values: buildInitialEditState(customer),
      provinceCode: matchedProv ? matchedProv.code : "",
      cityCode: matchedCity ? matchedCity.code : "",
    };
  });
  const { values, provinceCode: selectedProvinceCode, cityCode: selectedCityCode } = formState;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [enableMobile, setEnableMobile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(initialFormValues) ||
    (enableMobile && Boolean(password.trim()));

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
      excludeId: customer?.id || null,
    }),
    [existingCustomers, values.name, values.phone, customer?.id]
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
      const submissionPhone =
        values.phone === initialFormValues.phone
          ? rawInitial.phone
          : toFullPhPhone(values.phone);
      const payload = {
        ...values,
        phone: submissionPhone,
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

  return (
    <dialog
      ref={dialogRef}
      className="customer-edit-dialog"
      aria-labelledby="customer-edit-title"
      aria-describedby="customer-edit-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={saving}>
        <div className="cp-modal-header">
          <div className="cp-modal-title-row">
            <h2 id="customer-edit-title" className="cp-modal-title">Edit Customer</h2>
          </div>
          <button
            type="button"
            className="cp-close-btn"
            aria-label="Close edit customer"
            disabled={saving}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="customer-edit-body">
          <p id="customer-edit-description" className="customer-add-description">
            Update this customer’s contact details and primary address.
          </p>

          {error && <p className="customer-edit-error" role="alert">{error}</p>}

          {/* Group 1: Customer & Contact Details */}
          <fieldset className="customer-form-section">
            <legend className="customer-section-legend">1. Customer &amp; Contact Details</legend>
            <div className="customer-add-grid">
              <div className="customer-form-field customer-field-wide">
                <label htmlFor="customer-edit-name">
                  Customer Name <span className="field-required">*</span>
                </label>
                <input
                  id="customer-edit-name"
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

              <div className="customer-form-field">
                <label htmlFor="customer-edit-email">Contact Email</label>
                <input
                  id="customer-edit-email"
                  name="email"
                  type="email"
                  placeholder="e.g. billing@company.com"
                  disabled={saving}
                  value={values.email}
                  onChange={handleChange("email")}
                />
              </div>

              <div className="customer-form-field">
                <label htmlFor="customer-edit-phone">Contact Number</label>
                <div className="customer-phone-input-wrap">
                  <span className="customer-phone-prefix" aria-hidden="true">+63</span>
                  <input
                    id="customer-edit-phone"
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
              <PhAddressAutocomplete
                id="customer-edit-province"
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
                id="customer-edit-city"
                name="city"
                label="City / Municipality"
                placeholder="e.g. Pasig City or Cabanatuan City"
                disabled={saving}
                value={values.city}
                options={cityOptions}
                onChange={handleCityChange}
                onSelect={handleCitySelect}
              />

              <PhAddressAutocomplete
                id="customer-edit-barangay"
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

              <div className="customer-form-field customer-field-wide">
                <label htmlFor="customer-edit-address">Street Address / Building / Landmark</label>
                <input
                  id="customer-edit-address"
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
        </div>

        <div className="customer-edit-footer">
          <button type="button" className="filter-btn" disabled={saving} onClick={close}>Cancel</button>
          <button type="submit" className="btn-add-submit" disabled={saving || !dirty}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </dialog>
  );
}
