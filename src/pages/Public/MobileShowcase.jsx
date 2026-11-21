import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./MobileShowcase.css";

const ROLE_VIEWS = [
  {
    id: "customer",
    label: "Customer App",
    headline: "Customer View",
    summary: "Scheduled FTL Booking, Office Quote Breakdown, Live ETA & Digital POD Viewer",
  },
  {
    id: "driver",
    label: "Driver App",
    headline: "Driver View",
    summary: "Assigned FTL Trips, 6-Step Delivery Milestones, Fuel & Incident Reporting",
  },
];

const CUSTOMER_NAV_ITEMS = [
  { id: "home", label: "Home", active: true },
  { id: "active", label: "Active", active: false },
  { id: "history", label: "History", active: false },
  { id: "alerts", label: "Alerts", active: false },
  { id: "profile", label: "Profile", active: false },
];

const DRIVER_NAV_ITEMS = [
  { id: "home", label: "Home", active: true },
  { id: "navigate", label: "Navigate", active: false },
  { id: "trips", label: "Trips", active: false },
  { id: "profile", label: "Profile", active: false },
];

const DRIVER_MILESTONES = [
  { step: 1, label: "1. Assigned", detail: "Synced from office dispatch" },
  { step: 2, label: "2. Route Started", detail: "Foreground GPS active" },
  { step: 3, label: "3. Arrived at Pickup", detail: "Peñaranda Hub Bay 2" },
  { step: 4, label: "4. Cargo Loaded", detail: "8,000 kg manifest verified" },
  { step: 5, label: "5. In Transit", detail: "NLEX Southbound corridor" },
  { step: 6, label: "6. Proof Submitted", detail: "Photo & E-Sign logged (UTC+8)" },
];

function renderRoleIcon(roleId) {
  if (roleId === "customer") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  }

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

function renderNavIcon(id) {
  switch (id) {
    case "home":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case "active":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="13" height="10" rx="2" />
          <path d="M15 9h4l3 3v4h-7V9z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    case "history":
    case "trips":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      );
    case "alerts":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "navigate":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 3 19 20 12 16 5 20 12 3" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
      );
  }
}

export default function MobileShowcase({ variant = "full" }) {
  const baseId = useId();
  const [activeRole, setActiveRole] = useState("customer");
  const [completedStep, setCompletedStep] = useState(5);
  const [driverSheet, setDriverSheet] = useState(null);
  const tabRefs = useRef([]);

  const isCompact = variant === "compact";
  const currentRoleMeta = ROLE_VIEWS.find((item) => item.id === activeRole) || ROLE_VIEWS[0];

  const handleRoleChange = (nextRole) => {
    setActiveRole(nextRole);
    setDriverSheet(null);
  };

  const handleTabKeyDown = (event, index) => {
    const lastIndex = ROLE_VIEWS.length - 1;
    let nextIndex = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const targetRole = ROLE_VIEWS[nextIndex].id;
    handleRoleChange(targetRole);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleMilestoneSelect = (step) => {
    setCompletedStep(step);
    setDriverSheet(null);
  };

  const renderRoleTabs = () => (
    <div
      className="mobile-showcase-tablist"
      role="tablist"
      aria-label="TANAW Android App Role Views"
    >
      {ROLE_VIEWS.map((role, index) => {
        const isSelected = role.id === activeRole;
        return (
          <button
            key={role.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${role.id}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={`mobile-showcase-tab ${isSelected ? "is-selected" : ""}`}
            onClick={() => handleRoleChange(role.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <span className="mobile-showcase-tab-icon" aria-hidden="true">
              {renderRoleIcon(role.id)}
            </span>
            <span>{role.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderPhoneFrame = () => (
    <div
      className="mobile-device-frame"
      role="tabpanel"
      id={`${baseId}-panel-${activeRole}`}
      aria-labelledby={`${baseId}-tab-${activeRole}`}
    >
      <div className="mobile-device-screen">
        {/* Android Status Bar with Pure CSS Camera Punch-Hole */}
        <div className="mobile-status-bar" aria-hidden="true">
          <span className="mobile-status-time">14:32 PHT</span>
          <span className="mobile-camera-hole" />
          <span className="mobile-status-icons">
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
              <rect x="0.5" y="6.5" width="2" height="3" rx="0.5" fill="currentColor" />
              <rect x="3.8" y="4.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="7.1" y="2.5" width="2" height="7" rx="0.5" fill="currentColor" />
              <rect x="10.4" y="0.5" width="2" height="9" rx="0.5" fill="currentColor" />
            </svg>
            <svg width="15" height="10" viewBox="0 0 15 10" fill="none">
              <rect x="0.75" y="1" width="11.5" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="2.2" y="2.5" width="8.2" height="5" rx="0.5" fill="#4ADE80" />
              <rect x="12.8" y="3.2" width="1.5" height="3.6" rx="0.5" fill="currentColor" />
            </svg>
          </span>
        </div>

        {activeRole === "customer" ? (
          <div className="mobile-app-view is-customer">
            {/* Material 3 Top App Bar */}
            <header className="m3-app-topbar">
              <span className="m3-brand-lockup">
                <img
                  src="/tanaw-logo-dark.jpg"
                  alt=""
                  width="26"
                  height="26"
                  className="m3-brand-img"
                />
                <span className="m3-brand-wordmark">TANAW</span>
              </span>
              <div className="m3-topbar-actions" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
            </header>

            {/* Greeting & Location Row (Image 1 Reference) */}
            <div className="m3-greeting-row">
              <div className="m3-greeting-copy">
                <span className="m3-greeting-sub">Good morning,</span>
                <strong className="m3-greeting-title">Commercial Shipper</strong>
              </div>
              <span className="m3-location-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-6-5.33-6-10a6 6 0 1 1 12 0c0 4.67-6 10-6 10z" />
                  <circle cx="12" cy="11" r="2.2" />
                </svg>
                <span>Peñaranda, Nueva Ecija</span>
              </span>
            </div>

            {/* Active Shipment Status Pill Bar (Image 1 Reference) */}
            <div className="m3-active-strip">
              <div className="m3-active-strip-left">
                <span className="m3-shipment-id">SHP-NE-26-0104</span>
                <span className="m3-status-pill is-transit">
                  <span className="m3-status-dot" aria-hidden="true" />
                  <span>In Transit</span>
                </span>
              </div>
              <span className="m3-active-strip-meta">ETA 15:10 PHT</span>
            </div>

            {/* Route Card (Image 1 "Where are you shipping?" Dark Card) */}
            <section className="m3-surface-card m3-route-card" aria-label="Active shipment route">
              <h4 className="m3-card-heading">Active Route</h4>

              <div className="m3-route-row">
                <span className="m3-route-dot is-pickup" aria-hidden="true" />
                <div className="m3-route-copy">
                  <span className="m3-route-label">PICK-UP</span>
                  <span className="m3-route-value">Peñaranda Hub, Nueva Ecija</span>
                </div>
              </div>

              <div className="m3-route-row">
                <span className="m3-route-dot is-dest" aria-hidden="true" />
                <div className="m3-route-copy">
                  <span className="m3-route-label">DESTINATION</span>
                  <span className="m3-route-value">Balagtas, Bulacan</span>
                </div>
              </div>

              <div className="m3-route-footer">
                <span className="m3-route-summary">Peñaranda Hub &rarr; Balagtas, Bulacan</span>
                <span className="m3-schedule-chip">Live GPS</span>
              </div>
            </section>

            {/* Selected Vehicle Card (Image 1 "Available Vehicles" Dark Card) */}
            <section className="m3-vehicle-section" aria-label="Selected vehicle class">
              <div className="m3-vehicle-section-head">
                <h4 className="m3-card-heading">Assigned Vehicle</h4>
                <span className="m3-selected-badge">SELECTED</span>
              </div>

              <div className="m3-vehicle-card">
                <div className="m3-vehicle-thumb" aria-hidden="true">
                  <svg width="34" height="22" viewBox="0 0 36 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="21" height="12" rx="1.5" />
                    <path d="M23 9h6.5l3.5 4v4h-10V9z" />
                    <circle cx="8" cy="19" r="2.2" />
                    <circle cx="16" cy="19" r="2.2" />
                    <circle cx="28" cy="19" r="2.2" />
                  </svg>
                </div>
                <div className="m3-vehicle-copy">
                  <div className="m3-vehicle-title-row">
                    <strong>10-Wheeler Wing Van</strong>
                    <span className="m3-enclosed-badge">ENCLOSED</span>
                  </div>
                  <span className="m3-vehicle-cap">Up to 12,000 kg</span>
                  <span className="m3-vehicle-sub">Digital POD viewer ready on drop-off</span>
                </div>
              </div>
            </section>

            {/* Bottom Summary Bar + Material 3 Bottom Nav (Image 1 Reference) */}
            <div className="m3-customer-dock">
              <div className="m3-dock-summary">
                <span className="m3-dock-kicker">10-WHEELER WING VAN</span>
                <strong className="m3-dock-status">In Transit &middot; NLEX</strong>
              </div>
              <span className="m3-dock-pill">Live POD</span>
            </div>

            <nav className="m3-bottom-nav is-five" aria-hidden="true">
              {CUSTOMER_NAV_ITEMS.map((item) => (
                <span key={item.id} className={`m3-nav-item ${item.active ? "is-active-amber" : ""}`}>
                  <span className="m3-nav-icon-wrap">{renderNavIcon(item.id)}</span>
                  <span className="m3-nav-label">{item.label}</span>
                </span>
              ))}
            </nav>
          </div>
        ) : (
          <div className="mobile-app-view is-driver">
            {/* Driver Top Bar (Image 2 Reference) */}
            <header className="m3-app-topbar">
              <span className="m3-brand-lockup">
                <img
                  src="/tanaw-logo-dark.jpg"
                  alt=""
                  width="26"
                  height="26"
                  className="m3-brand-img"
                />
                <span className="m3-brand-wordmark">TANAW</span>
              </span>
              <div className="m3-driver-top-right">
                <span className="m3-topbar-text">Messages</span>
                <div className="m3-topbar-actions" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>
            </header>

            {/* Driver Unit Status Card with Green Bottom Accent (Image 2 Reference, Anonymized) */}
            <div className="m3-driver-unit-card">
              <div className="m3-driver-unit-info">
                <strong>Isuzu Forward Dropside</strong>
                <span>Palletized Agri Goods &middot; 8,000 kg</span>
              </div>
              <span className="m3-available-badge">ON TRIP</span>
            </div>

            {/* Trip Assignment Card (Image 2 Reference) */}
            <section className="m3-surface-card m3-assignment-card" aria-label="Driver trip assignment">
              <div className="m3-assignment-head">
                <h4 className="m3-card-heading">Trip Assignment</h4>
                <span className="m3-trip-id-pill">SHP-NE-26-0108</span>
              </div>

              <div className="m3-assignment-grid">
                <div className="m3-assignment-meta">
                  <span className="m3-meta-label">CARGO</span>
                  <span className="m3-meta-val">Palletized Agri Goods &middot; 8,000 kg</span>
                </div>
                <div className="m3-assignment-meta">
                  <span className="m3-meta-label">SERVICE</span>
                  <span className="m3-special-pill">FTL</span>
                </div>
              </div>

              <div className="m3-assignment-stops">
                <div className="m3-stop-line">
                  <span className="m3-stop-dot is-pickup" aria-hidden="true" />
                  <span className="m3-stop-text">Peñaranda Hub &rarr; Balagtas, Bulacan</span>
                </div>
              </div>
            </section>

            {/* Interactive 6-Step Milestone Checklist */}
            <section className="m3-checklist-section" aria-label="Interactive 6-step delivery milestones">
              <div className="m3-checklist-head">
                <h4 className="m3-section-label">Delivery Milestones</h4>
                <span className="m3-milestone-counter">
                  Step {completedStep} of 6
                </span>
              </div>

              <div className="m3-milestone-list">
                {DRIVER_MILESTONES.map((item) => {
                  const isCompleted = item.step <= completedStep;
                  const isCurrent = item.step === completedStep;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      aria-pressed={isCompleted}
                      className={`m3-milestone-btn ${isCompleted ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}`}
                      onClick={() => handleMilestoneSelect(item.step)}
                    >
                      <span className="m3-milestone-check" aria-hidden="true">
                        {isCompleted ? (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M3.5 8.5L6.5 11.5L12.5 4.5"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span className="m3-milestone-num">{item.step}</span>
                        )}
                      </span>
                      <span className="m3-milestone-text">
                        <span className="m3-milestone-title">{item.label}</span>
                        <span className="m3-milestone-detail">{item.detail}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Inline Driver Action Feedback Sheet */}
            {driverSheet && (
              <div className="m3-action-feedback" role="status">
                <div className="m3-action-feedback-copy">
                  <strong>
                    {driverSheet === "nav"
                      ? "Turn-by-Turn Navigation Ready"
                      : "Digital POD Capture Ready"}
                  </strong>
                  <span>
                    {driverSheet === "nav"
                      ? "Truck-ban & clearance notices active for NLEX Southbound."
                      : "Drop-off photo & recipient E-Sign stamped in PHT (UTC+8)."}
                  </span>
                </div>
                <button
                  type="button"
                  className="m3-action-dismiss"
                  onClick={() => setDriverSheet(null)}
                  aria-label="Close preview notice"
                >
                  Close
                </button>
              </div>
            )}

            {/* Driver Bottom Action Controls */}
            <div className="m3-driver-actions">
              <button
                type="button"
                className={`m3-driver-btn is-amber ${driverSheet === "nav" ? "is-active" : ""}`}
                onClick={() => setDriverSheet((prev) => (prev === "nav" ? null : "nav"))}
              >
                Open Navigation
              </button>
              <button
                type="button"
                className={`m3-driver-btn is-primary ${driverSheet === "pod" ? "is-active" : ""}`}
                onClick={() => {
                  setCompletedStep(6);
                  setDriverSheet((prev) => (prev === "pod" ? null : "pod"));
                }}
              >
                Submit POD
              </button>
            </div>

            <nav className="m3-bottom-nav is-four" aria-hidden="true">
              {DRIVER_NAV_ITEMS.map((item) => (
                <span key={item.id} className={`m3-nav-item ${item.active ? "is-active-blue" : ""}`}>
                  <span className="m3-nav-icon-wrap">{renderNavIcon(item.id)}</span>
                  <span className="m3-nav-label">{item.label}</span>
                </span>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );

  const renderFloatingCallouts = () => (
    <div className="mobile-callout-deck">
      {/* Left Floating Glassmorphic Card */}
      <aside className="mobile-callout-card is-left" aria-label="GPS Telemetry Capability">
        <span className="callout-badge is-telemetry">GPS TELEMETRY</span>
        <strong className="callout-title">Foreground Location Sync</strong>
        <p className="callout-desc">
          Live route &amp; ETA updates across Luzon corridors
        </p>
      </aside>

      {/* Right Floating Glassmorphic Card */}
      <aside className="mobile-callout-card is-right" aria-label="Verified Proof of Delivery Capability">
        <span className="callout-badge is-pod">VERIFIED POD</span>
        <strong className="callout-title">Photo &amp; E-Signature Capture</strong>
        <p className="callout-desc">
          Timestamped in PHT UTC+8 upon drop-off
        </p>
      </aside>
    </div>
  );

  if (isCompact) {
    return (
      <article className="mobile-showcase-compact" aria-label="TANAW Android App Interactive Preview">
        <div className="mobile-compact-copy">
          <div className="mobile-compact-header">
            <span className="mobile-compact-tag">ANDROID 7.0+ &middot; COMPANION APP</span>
            <h3>Interactive Mobile App Preview</h3>
            <p>
              Switch between Customer and Driver workspaces to inspect live shipment tracking, 6-step road milestones, and PHT-timestamped POD capture.
            </p>
          </div>

          <div className="mobile-compact-switcher">
            {renderRoleTabs()}
            <p className="mobile-showcase-role-desc">{currentRoleMeta.summary}</p>
          </div>

          <div className="mobile-compact-callouts" aria-label="Key Mobile App Capabilities">
            <aside className="mobile-compact-callout" aria-label="GPS Telemetry Capability">
              <span className="callout-badge is-telemetry">GPS TELEMETRY</span>
              <strong className="callout-title">Foreground Location Sync</strong>
              <p className="callout-desc">
                Live route &amp; ETA updates across Luzon corridors
              </p>
            </aside>

            <aside className="mobile-compact-callout" aria-label="Verified Proof of Delivery Capability">
              <span className="callout-badge is-pod">VERIFIED POD</span>
              <strong className="callout-title">Photo &amp; E-Signature Capture</strong>
              <p className="callout-desc">
                Timestamped in PHT UTC+8 upon drop-off
              </p>
            </aside>
          </div>

          <div className="mobile-compact-actions">
            <Link to="/mobile-app" className="mobile-compact-cta">
              <span>Open Mobile App Guide &amp; APK</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="mobile-compact-stage">
          <div className="mobile-showcase-spotlight" aria-hidden="true" />
          <div className="mobile-showcase-frame-wrap">
            {renderPhoneFrame()}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="mobile-showcase">
      <div className="mobile-showcase-controls">
        {renderRoleTabs()}
        <p className="mobile-showcase-role-desc">
          <strong>{currentRoleMeta.headline}:</strong> {currentRoleMeta.summary}
        </p>
      </div>

      <div className="mobile-showcase-stage">
        <div className="mobile-showcase-spotlight" aria-hidden="true" />

        <div className="mobile-showcase-frame-wrap">
          {renderPhoneFrame()}
          {renderFloatingCallouts()}
        </div>
      </div>
    </div>
  );
}
