import { useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./pricing.css";

/* =========================
   ICONS (inline SVG, no deps)
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
  <Svg size={20} strokeWidth="2.2">
    <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8" />
    <path d="M10.3 21a1.9 1.9 0 003.4 0" />
  </Svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3L2 21h20L12 3z" fill="#EA580C" />
    <rect x="11" y="9" width="2" height="6" rx="1" fill="#FFEDD5" />
    <circle cx="12" cy="17.7" r="1.2" fill="#FFEDD5" />
  </svg>
);

const CashIcon = () => (
  <Svg size={22} strokeWidth="2">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </Svg>
);

const BoxIcon = () => (
  <Svg size={22} strokeWidth="2" style={{ color: "#EA580C" }}>
    <rect x="3" y="3" width="18" height="5" rx="1" />
    <path d="M5 8v12a1 1 0 001 1h12a1 1 0 001-1V8" />
    <path d="M10 13h4" />
  </Svg>
);

const TruckIcon = ({ size = 22 }) => (
  <Svg size={size} strokeWidth="2">
    <path d="M2 6a1 1 0 011-1h11v12H2z" />
    <path d="M14 9h4l4 4v4h-8" />
    <circle cx="7" cy="18" r="2" fill="#fff" />
    <circle cx="18" cy="18" r="2" fill="#fff" />
  </Svg>
);

const SnowIcon = () => (
  <Svg size={22} strokeWidth="1.8">
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
    <path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3.5 9.5L6 12l-2.5 2.5M20.5 9.5L18 12l2.5 2.5" />
  </Svg>
);

const TollIcon = () => (
  <Svg size={22} strokeWidth="2.4">
    <path d="M17.5 6.5A8 8 0 1017.5 17.5" />
    <path d="M14.5 9A4.5 4.5 0 1014.5 15" />
  </Svg>
);

/* =========================
   DATA
========================= */
const VEHICLES = [
  { id: "dropside", name: "6-Wheeler Dropside", capacity: "Up to 5,000 kg", rate: "55.00" },
  { id: "closed", name: "6-Wheeler Closed Van", capacity: "Up to 5,000 kg", rate: "65.00" },
  { id: "wing", name: "10-Wheeler Wing Van", capacity: "Up to 15,000 kg", rate: "85.00", wide: true },
  { id: "flatbed", name: "10-Wheeler Flatbed", capacity: "Up to 12,000 kg", rate: "80.00" },
  { id: "boom", name: "10-Wheeler Boom Truck", capacity: "Up to 10,000 kg", rate: "95.00", wide: true },
  { id: "reefer", name: "Refrigerated Van", capacity: "Up to 3,000 kg", rate: "90.00", snow: true },
];

const SURCHARGES = [
  { id: "fragile", label: "Fragile", amount: "500.00", appliedAs: "Per trip (flat fee)" },
  { id: "keepdry", label: "Keep Dry", amount: "300.00", appliedAs: "Per trip (flat fee)" },
  { id: "temp", label: "Temperature Sensitive", amount: "800.00", appliedAs: "Per trip (flat fee)", multiline: true },
  { id: "perishable", label: "Perishable", amount: "600.00", appliedAs: "Per trip (flat fee)" },
  { id: "cold", label: "Cold Chain (Refrigerated)", amount: "15.00", appliedAs: "Per km additional", multiline: true, strong: true },
];

const TOLLS = [
  { id: 1, gate: "NLEX Balintawak", highway: "NLEX", cls: "Class 2 (Truck)", fee: "204.00" },
  { id: 2, gate: "NLEX Bocaue", highway: "NLEX", cls: "Class 2", fee: "168.00" },
  { id: 3, gate: "NLEX San Fernando", highway: "NLEX", cls: "Class 2", fee: "336.00" },
  { id: 4, gate: "NLEX Tarlac/Gerona", highway: "NLEX", cls: "Class 2", fee: "420.00" },
  { id: 5, gate: "TPLEX Tarlac Entry", highway: "TPLEX", cls: "Class 2", fee: "162.00" },
  { id: 6, gate: "TPLEX San Jose Exit", highway: "TPLEX", cls: "Class 2", fee: "216.00" },
  { id: 7, gate: "SCTEX Entry", highway: "SCTEX", cls: "Class 2", fee: "198.00" },
];

/* =========================
   PAGE
========================= */
export default function Pricing() {
  const [fees, setFees] = useState({ minBooking: "2500.00", driver: "500.00" });
  const [rates, setRates] = useState(
    Object.fromEntries(VEHICLES.map((v) => [v.id, v.rate]))
  );
  const [surcharges, setSurcharges] = useState(
    Object.fromEntries(SURCHARGES.map((s) => [s.id, s.amount]))
  );

  const setFee = (key) => (e) => setFees((p) => ({ ...p, [key]: e.target.value }));
  const setRate = (id) => (e) => setRates((p) => ({ ...p, [id]: e.target.value }));
  const setSurcharge = (id) => (e) => setSurcharges((p) => ({ ...p, [id]: e.target.value }));

  return (
    <MainLayout>
      <div className="pricing-page">
        {/* Topbar */}
        <header className="topbar">
          <label className="search-box">
            <SearchIcon />
            <input type="text" placeholder="Search..." />
          </label>

          <div className="topbar-right">
            <button className="icon-btn" aria-label="Notifications">
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

        {/* Content */}
        <section className="content">
          {/* Notice */}
          <div className="notice-box">
            <div className="notice-title">
              <WarningIcon />
              <strong>Super Admin Notice</strong>
            </div>
            <p>
              Pricing &amp; Rates can only be modified by Super Admin accounts.
              Changes affect all future shipments and are recorded in the audit log.
            </p>
          </div>

          {/* Header */}
          <div className="page-header">
            <h2>Settings — Pricing &amp; Rates</h2>
            <p>
              Configure base rates, weight tiers, handling surcharges, and toll
              fee presets for all shipments.
            </p>
          </div>

          {/* Grid */}
          <div className="pricing-grid">
            {/* ============ LEFT ============ */}
            <div className="left-column">
              {/* Fixed Trip Fees */}
              <div className="settings-card card-accent">
                <div className="card-header">
                  <CashIcon />
                  <h3>Fixed Trip Fees</h3>
                </div>

                <p className="card-desc">
                  Flat fees automatically applied to every shipment regardless of
                  distance or cargo.
                </p>

                <div className="form-grid">
                  <div className="input-group">
                    <label htmlFor="minBooking">MINIMUM BOOKING FEE</label>
                    <div className="money-input">
                      <span>₱</span>
                      <input
                        id="minBooking"
                        type="text"
                        inputMode="decimal"
                        value={fees.minBooking}
                        onChange={setFee("minBooking")}
                      />
                    </div>
                    <small>Applied when calculated base rate falls below this amount.</small>
                  </div>

                  <div className="input-group">
                    <label htmlFor="driver">DRIVER ALLOWANCE PER TRIP</label>
                    <div className="money-input">
                      <span>₱</span>
                      <input
                        id="driver"
                        type="text"
                        inputMode="decimal"
                        value={fees.driver}
                        onChange={setFee("driver")}
                      />
                    </div>
                    <small>Auto-applied to trip expenses for every completed shipment.</small>
                  </div>
                </div>
              </div>

              {/* Surcharges */}
              <div className="settings-card">
                <div className="card-header">
                  <BoxIcon />
                  <h3>Special Handling Surcharges</h3>
                </div>

                <p className="card-desc card-desc-tight">
                  Additional fees applied on top of base rate when cargo requires
                  special handling.
                </p>

                <table className="pricing-table surcharge-table">
                  <thead>
                    <tr>
                      <th>HANDLING TYPE</th>
                      <th>SURCHARGE AMOUNT (₱)</th>
                      <th className="ta-right">APPLIED AS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SURCHARGES.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className={`tag ${s.strong ? "tag-strong" : ""} ${s.multiline ? "tag-wrap" : ""}`}>
                            {s.label}
                          </span>
                        </td>
                        <td>
                          <div className="peso-cell">
                            <span>₱</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`${s.label} surcharge amount`}
                              value={surcharges[s.id]}
                              onChange={setSurcharge(s.id)}
                            />
                          </div>
                        </td>
                        <td className="ta-right applied-as">{s.appliedAs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="card-footnote">
                  Surcharges are added to the base rate during booking calculation.
                </p>
              </div>
            </div>

            {/* ============ RIGHT ============ */}
            <div className="right-column">
              {/* Base rate */}
              <div className="settings-card">
                <div className="card-header">
                  <TruckIcon />
                  <h3>Base Rate per Vehicle Type</h3>
                </div>

                <p className="card-desc card-desc-tight">
                  Rate applied per kilometer traveled based on truck type.
                </p>

                <table className="pricing-table vehicle-table">
                  <thead>
                    <tr>
                      <th>VEHICLE TYPE</th>
                      <th>CAPACITY</th>
                      <th className="ta-right">RATE PER KM (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VEHICLES.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <div className="vehicle-name">
                            <span className="vehicle-icon">
                              {v.snow ? <SnowIcon /> : <TruckIcon size={24} />}
                            </span>
                            <span>{v.name}</span>
                          </div>
                        </td>
                        <td className="muted-cell">{v.capacity}</td>
                        <td className="ta-right">
                          <input
                            className="rate-input"
                            type="text"
                            inputMode="decimal"
                            aria-label={`${v.name} rate per km`}
                            value={rates[v.id]}
                            onChange={setRate(v.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="card-footnote">
                  Rate is multiplied by the route distance to calculate the base shipment charge.
                </p>
              </div>

              {/* Toll gates */}
              <div className="settings-card">
                <div className="card-header">
                  <TollIcon />
                  <h3>Toll Gate Rates</h3>
                </div>

                <p className="card-desc card-desc-tight">
                  Pre-loaded toll gate locations and fees. Update when government
                  adjusts rates.
                </p>

                <table className="pricing-table toll-table">
                  <thead>
                    <tr>
                      <th>TOLL GATE</th>
                      <th>HIGHWAY</th>
                      <th>VEHICLE CLASS</th>
                      <th className="ta-right">FEE (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOLLS.map((t) => (
                      <tr key={t.id}>
                        <td className="toll-name">{t.gate}</td>
                        <td>
                          <span className={`hwy hwy-${t.highway.toLowerCase()}`}>{t.highway}</span>
                        </td>
                        <td className="muted-cell">{t.cls}</td>
                        <td className="ta-right toll-fee">
                          <span>₱</span>
                          <span>{t.fee}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="toll-footer">
                  <p>
                    Toll fees are auto-detected via driver GPS and matched against
                    this rate table.
                  </p>
                  <button type="button" className="add-toll-btn">
                    + Add Toll Gate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}