import { useCallback, useEffect, useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import {
  fetchPricingData,
  saveVehicleRates,
  savePricingSettings,
} from "../../../services/pricingService";
import { getCurrentPricingUser } from "../../../services/tollGateService";
import TollGateManager from "./TollGateManager";
import { HANDLING_OPTIONS } from "../../../services/handlingPricing";
import "./pricing.css";

/* =========================
   ICONS
========================= */

const Svg = ({ size = 20, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

const SearchIcon = () => (
  <Svg size={18}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

const BellIcon = () => (
  <Svg size={20}>
    <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8" />
    <path d="M10.3 21a1.9 1.9 0 003.4 0" />
  </Svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M12 3L2 21h20L12 3z" fill="#EA580C" />
    <rect
      x="11"
      y="9"
      width="2"
      height="6"
      rx="1"
      fill="#FFEDD5"
    />
    <circle cx="12" cy="17.7" r="1.2" fill="#FFEDD5" />
  </svg>
);

const CashIcon = () => (
  <Svg size={22}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </Svg>
);

const BoxIcon = () => (
  <Svg size={22}>
    <rect x="3" y="3" width="18" height="5" rx="1" />
    <path d="M5 8v12a1 1 0 001 1h12a1 1 0 001-1V8" />
    <path d="M10 13h4" />
  </Svg>
);

const TruckIcon = ({ size = 22 }) => (
  <Svg size={size}>
    <path d="M2 6a1 1 0 011-1h11v12H2z" />
    <path d="M14 9h4l4 4v4h-8" />
    <circle cx="7" cy="18" r="2" fill="#fff" />
    <circle cx="18" cy="18" r="2" fill="#fff" />
  </Svg>
);

/* =========================
   SURCHARGE CONFIGURATION
========================= */

const SURCHARGES = HANDLING_OPTIONS;

const DEFAULT_FEES = {
  minBooking: "",
  driver: "",
};

const DEFAULT_SURCHARGES = Object.fromEntries(
  SURCHARGES.map((item) => [item.id, ""])
);

const isValidAmount = (value) =>
  String(value ?? "").trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;

/* =========================
   PRICING PAGE
========================= */

export default function Pricing() {
  const [vehicles, setVehicles] = useState([]);
  const [rates, setRates] = useState({});
  const [fees, setFees] = useState(DEFAULT_FEES);
  const [surcharges, setSurcharges] = useState(
    DEFAULT_SURCHARGES
  );

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const loadPricing = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = await getCurrentPricingUser();
      setIsAdmin(currentUser.isAdmin);

      const data = await fetchPricingData();

      setVehicles(data.vehicles);

      setRates(
        Object.fromEntries(
          data.vehicles.map((vehicle) => [
            vehicle.id,
            vehicle.pricing
              ? String(vehicle.pricing.per_km_rate)
              : "",
          ])
        )
      );

      const settings = data.settings || {};

      setFees({
        minBooking:
          settings.minimum_booking_fee == null
            ? ""
            : String(settings.minimum_booking_fee),

        driver:
          settings.driver_allowance == null
            ? ""
            : String(settings.driver_allowance),
      });

      const savedSurcharges =
        settings.handling_surcharges || {};

      setSurcharges(
        Object.fromEntries(
          SURCHARGES.map((item) => [
            item.id,
            savedSurcharges[item.id] == null
              ? ""
              : String(savedSurcharges[item.id]),
          ])
        )
      );
    } catch (err) {
      console.error("Pricing load error:", err);
      setIsAdmin(false);
      setError(err.message || "Unable to load pricing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  const setFee = (key) => (event) => {
    if (!isAdmin) return;

    setFees((previous) => ({
      ...previous,
      [key]: event.target.value,
    }));

    setSuccess("");
  };

  const setRate = (id) => (event) => {
    if (!isAdmin) return;

    setRates((previous) => ({
      ...previous,
      [id]: event.target.value,
    }));

    setSuccess("");
  };

  const setSurcharge = (id) => (event) => {
    if (!isAdmin) return;

    setSurcharges((previous) => ({
      ...previous,
      [id]: event.target.value,
    }));

    setSuccess("");
  };

  const handleSave = async () => {
    if (!isAdmin || saving) return;

    setError("");
    setSuccess("");

    const amounts = [
      ...Object.values(fees),
      ...Object.values(surcharges),
      ...vehicles
        .filter((vehicle) => vehicle.pricing)
        .map((vehicle) => rates[vehicle.id]),
    ];

    if (!amounts.every(isValidAmount)) {
      setError(
        "Please enter valid, non-negative amounts in all pricing fields."
      );
      return;
    }

    setSaving(true);

    try {
      await saveVehicleRates(vehicles, rates);
      await savePricingSettings(fees, surcharges);

      await loadPricing();

      setSuccess("Pricing changes saved to Supabase.");
    } catch (err) {
      console.error("Pricing save error:", err);

      setError(
        `${err.message || "Unable to save pricing."} ` +
          "Some updates may have succeeded. Reload and verify."
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredVehicles = vehicles.filter((vehicle) =>
    vehicle.name
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="pricing-page">
        {/* TOPBAR */}
        <header className="topbar">
          <label className="search-box">
            <SearchIcon />

            <input
              type="text"
              placeholder="Search vehicle types..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </label>

          <div className="topbar-right">
            <button
              className="icon-btn"
              type="button"
              aria-label="Notifications"
              disabled
            >
              <BellIcon />
            </button>

            <span className="topbar-divider" />

            <div className="avatar">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60"
                alt="User Profile"
                className="avatar-img"
              />
            </div>
          </div>
        </header>

        <section className="content">
          {/* ADMIN NOTICE */}
          <div className="notice-box">
            <div className="notice-title">
              <WarningIcon />
              <strong>Admin Notice</strong>
            </div>

            <p>
              Only active Admin accounts can modify Pricing
              &amp; Rates. Other authenticated users have
              read-only access where permitted by Supabase.
            </p>
          </div>

          {/* HEADER */}
          <div className="page-header">
            <h2>Settings — Pricing &amp; Rates</h2>

            <p>
              Configure vehicle rates, fixed trip fees,
              handling surcharges, and toll gate presets.
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div
              role="alert"
              style={{
                padding: "12px 16px",
                marginBottom: 16,
                color: "#991b1b",
                background: "#fee2e2",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          {/* SUCCESS */}
          {success && (
            <div
              role="status"
              style={{
                padding: "12px 16px",
                marginBottom: 16,
                color: "#166534",
                background: "#dcfce7",
                borderRadius: 6,
              }}
            >
              {success}
            </div>
          )}

          {loading ? (
            <p>Loading pricing data from Supabase...</p>
          ) : (
            <>
              <div className="pricing-grid">
                {/* LEFT COLUMN */}
                <div className="left-column">
                  {/* FIXED TRIP FEES */}
                  <div className="settings-card card-accent">
                    <div className="card-header">
                      <CashIcon />
                      <h3>Fixed Trip Fees</h3>
                    </div>

                    <p className="card-desc">
                      Configure the minimum booking fee and
                      default driver allowance.
                    </p>

                    <div className="form-grid">
                      <div className="input-group">
                        <label htmlFor="minBooking">
                          MINIMUM BOOKING FEE
                        </label>

                        <div className="money-input">
                          <span>₱</span>

                          <input
                            id="minBooking"
                            type="text"
                            inputMode="decimal"
                            value={fees.minBooking}
                            onChange={setFee("minBooking")}
                            placeholder="0.00"
                            readOnly={!isAdmin}
                          />
                        </div>

                        <small>
                          Applied when the calculated base
                          rate falls below this amount.
                        </small>
                      </div>

                      <div className="input-group">
                        <label htmlFor="driver">
                          DRIVER ALLOWANCE PER TRIP
                        </label>

                        <div className="money-input">
                          <span>₱</span>

                          <input
                            id="driver"
                            type="text"
                            inputMode="decimal"
                            value={fees.driver}
                            onChange={setFee("driver")}
                            placeholder="0.00"
                            readOnly={!isAdmin}
                          />
                        </div>

                        <small>
                          Default driver allowance per trip.
                        </small>
                      </div>
                    </div>
                  </div>

                  {/* SURCHARGES */}
                  <div className="settings-card">
                    <div className="card-header">
                      <BoxIcon />
                      <h3>Special Handling Surcharges</h3>
                    </div>

                    <p className="card-desc card-desc-tight">
                      Additional fees for cargo requiring
                      special handling.
                    </p>

                    <table className="pricing-table surcharge-table">
                      <thead>
                        <tr>
                          <th>HANDLING TYPE</th>
                          <th>SURCHARGE AMOUNT (₱)</th>
                          <th className="ta-right">
                            APPLIED AS
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {SURCHARGES.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span
                                className={[
                                  "tag",
                                  item.strong
                                    ? "tag-strong"
                                    : "",
                                  item.multiline
                                    ? "tag-wrap"
                                    : "",
                                ].join(" ")}
                              >
                                {item.label}
                              </span>
                            </td>

                            <td>
                              <div className="peso-cell">
                                <span>₱</span>

                                <input
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`${item.label} surcharge`}
                                  value={
                                    surcharges[item.id] ?? ""
                                  }
                                  onChange={setSurcharge(
                                    item.id
                                  )}
                                  readOnly={!isAdmin}
                                />
                              </div>
                            </td>

                            <td className="ta-right applied-as">
                              {item.appliedAs}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <p className="card-footnote">
                      Surcharges are stored in Supabase
                      system_settings.
                    </p>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="right-column">
                  {/* VEHICLE RATES */}
                  <div className="settings-card">
                    <div className="card-header">
                      <TruckIcon />
                      <h3>Base Rate per Vehicle Type</h3>
                    </div>

                    <p className="card-desc card-desc-tight">
                      Vehicle rates and capacities loaded
                      directly from Supabase.
                    </p>

                    <table className="pricing-table vehicle-table">
                      <thead>
                        <tr>
                          <th>VEHICLE TYPE</th>
                          <th>CAPACITY</th>
                          <th className="ta-right">
                            RATE PER KM (₱)
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredVehicles.map((vehicle) => (
                          <tr key={vehicle.id}>
                            <td>
                              <div className="vehicle-name">
                                <span className="vehicle-icon">
                                  <TruckIcon size={24} />
                                </span>

                                <span>{vehicle.name}</span>
                              </div>
                            </td>

                            <td className="muted-cell">
                              {vehicle.default_capacity_kg != null
                                ? `Up to ${Number(
                                    vehicle.default_capacity_kg
                                  ).toLocaleString(
                                    "en-PH"
                                  )} kg`
                                : "Not specified"}
                            </td>

                            <td className="ta-right">
                              {vehicle.pricing ? (
                                <input
                                  className="rate-input"
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`${vehicle.name} rate per km`}
                                  value={
                                    rates[vehicle.id] ?? ""
                                  }
                                  onChange={setRate(
                                    vehicle.id
                                  )}
                                  readOnly={!isAdmin}
                                />
                              ) : (
                                <span
                                  style={{
                                    color: "#b45309",
                                    fontSize: 12,
                                  }}
                                >
                                  No active rate
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}

                        {filteredVehicles.length === 0 && (
                          <tr>
                            <td colSpan={3}>
                              No matching vehicle types.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <p className="card-footnote">
                      Rates are stored in pricing_rates and
                      linked to vehicle_types.
                    </p>
                  </div>

                  {/* SUPABASE TOLL GATE MANAGEMENT */}
                  <TollGateManager isAdmin={isAdmin} />
                </div>
              </div>

              {/* PRICING SAVE BUTTONS */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  marginTop: 28,
                  paddingBottom: 24,
                }}
              >
                <button
                  type="button"
                  onClick={loadPricing}
                  disabled={saving}
                  style={{
                    padding: "12px 24px",
                    border: "1px solid #0b2a4a",
                    borderRadius: 6,
                    background: "#fff",
                    color: "#0b2a4a",
                    cursor: saving
                      ? "not-allowed"
                      : "pointer",
                    fontWeight: 600,
                  }}
                >
                  Reload
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "12px 28px",
                      border: "none",
                      borderRadius: 6,
                      background: saving
                        ? "#64748b"
                        : "#0b2a4a",
                      color: "#fff",
                      cursor: saving
                        ? "not-allowed"
                        : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {saving
                      ? "Saving..."
                      : "Save Pricing Changes"}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </MainLayout>
  );
}