import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./sidebar.css";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabaseClient";
import OfficeHelpDialog from "./OfficeHelpDialog";

const SUBMENU_SVG_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

const FLEET_SUBMENU = [
  {
    path: "/fleet/overview",
    label: "Overview",
    isCurrent: (isActive) => isActive("/fleet") || isActive("/fleet/overview"),
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    path: "/fleet/vehicles",
    label: "Vehicles",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <path d="M16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    path: "/fleet/drivers",
    label: "Drivers",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
      </svg>
    ),
  },
  {
    path: "/fleet/maintenance",
    label: "Maintenance",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

const REPORTS_SUBMENU = [
  {
    path: "/report/overview",
    label: "Overview",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="8" y1="18" x2="8" y2="15" />
        <line x1="16" y1="18" x2="16" y2="14" />
      </svg>
    ),
  },
  {
    path: "/report/shipmentReport",
    label: "Shipments",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    path: "/report/driverReport",
    label: "Drivers",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
      </svg>
    ),
  },
  {
    path: "/report/revenueReport",
    label: "Revenue",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

const SETTINGS_SUBMENU = [
  {
    path: "/settings/account",
    label: "Account",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="10" r="3" />
        <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
      </svg>
    ),
  },
  {
    path: "/settings/notification",
    label: "Notifications",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    path: "/settings/pricing",
    label: "Pricing",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    path: "/settings/complianceThreshold",
    label: "Compliance thresholds",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
  },
  {
    path: "/settings/userManagement",
    label: "User management",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    path: "/settings/security",
    label: "Security",
    icon: (
      <svg {...SUBMENU_SVG_PROPS}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

export default function Sidebar({ id = "main-sidebar", mobileOpen = false, onClose }) {
  const navigate = useNavigate();
  const { clearAuth } = useAuth();
  const logoutInFlight = useRef(false);
  const logoutModalRef = useRef(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const location = useLocation();

  const handleNav = (path) => {
    navigate(path);
    if (typeof onClose === "function") {
      onClose();
    }
  };

  const pathname = location.pathname.toLowerCase();
  const isActive = (path) => pathname === path.toLowerCase();
  const isParentActive = (prefix) => pathname.startsWith(prefix.toLowerCase());

  const [prevPathname, setPrevPathname] = useState(pathname);
  const [fleetOpen, setFleetOpen] = useState(() => isParentActive("/fleet"));
  const [reportsOpen, setReportsOpen] = useState(() => isParentActive("/report"));
  const [settingsOpen, setSettingsOpen] = useState(() => isParentActive("/settings"));
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  let currentFleetOpen = fleetOpen;
  let currentReportsOpen = reportsOpen;
  let currentSettingsOpen = settingsOpen;

  // Synchronize menu open states when the active route changes
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (isParentActive("/fleet")) {
      currentFleetOpen = true;
      currentReportsOpen = false;
      currentSettingsOpen = false;
    } else if (isParentActive("/report")) {
      currentReportsOpen = true;
      currentFleetOpen = false;
      currentSettingsOpen = false;
    } else if (isParentActive("/settings")) {
      currentSettingsOpen = true;
      currentFleetOpen = false;
      currentReportsOpen = false;
    } else {
      currentFleetOpen = false;
      currentReportsOpen = false;
      currentSettingsOpen = false;
    }
    setFleetOpen(currentFleetOpen);
    setReportsOpen(currentReportsOpen);
    setSettingsOpen(currentSettingsOpen);
  }

  const closeLogoutModal = useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
    if (typeof document !== "undefined") {
      document.querySelector(".logout-button")?.focus?.();
    }
  }, [isLoggingOut]);

  useEffect(() => {
    if (!isLogoutModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeLogoutModal();
      } else if (e.key === "Tab" && logoutModalRef.current) {
        const buttons = Array.from(
          logoutModalRef.current.querySelectorAll?.("button:not([disabled])") || []
        );
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !logoutModalRef.current.contains?.(document.activeElement)
          ) {
            e.preventDefault();
            last.focus?.();
          }
        } else if (
          document.activeElement === last ||
          !logoutModalRef.current.contains?.(document.activeElement)
        ) {
          e.preventDefault();
          first.focus?.();
        }
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isLogoutModalOpen, closeLogoutModal]);

  const handleConfirmLogout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      clearAuth();
      navigate("/", { replace: true });
    } catch {
      setLogoutError("Unable to log out. Please try again.");
    } finally {
      logoutInFlight.current = false;
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <aside id={id} className={`sidebar ${mobileOpen ? "mobile-open" : ""}`.trim()}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            <img src="/tanaw-logo.png" alt="" width="44" height="44" className="brand-logo-img" />
          </div>
          <div className="brand-text">
            <h2>TANAW</h2>
            <p>MABUTOL TRUCKING</p>
          </div>
          {typeof onClose === "function" && (
            <button
              type="button"
              className="sidebar-mobile-close"
              onClick={onClose}
              aria-label="Close navigation sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" aria-label="Main navigation">
          <button type="button"
            className={`nav-item ${isActive("/dashboard") ? "active" : ""}`}
            onClick={() => handleNav("/dashboard")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            Dashboard
          </button>

          <button type="button"
            className={`nav-item ${isActive("/shipment") ? "active" : ""}`}
            onClick={() => handleNav("/shipment")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
              <rect x="9" y="11" width="14" height="10" rx="2" />
              <circle cx="12" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            </svg>
            Shipments
          </button>

          {/* Fleet Management Dropdown */}
          <div className="nav-group">
            <button type="button"
              aria-expanded={currentFleetOpen}
              aria-controls="sidebar-fleet"
              className={`nav-item ${isParentActive("/fleet") || currentFleetOpen ? "active" : ""}`}
              onClick={() => {
                setFleetOpen(!currentFleetOpen);
                setReportsOpen(false);
                setSettingsOpen(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <path d="M16 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              Fleet Management
              <svg
                className={`nav-chevron ${currentFleetOpen ? "open" : ""}`}
                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {currentFleetOpen && (
              <div id="sidebar-fleet" className="submenu">
                {FLEET_SUBMENU.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`submenu-item ${(item.isCurrent ? item.isCurrent(isActive) : isActive(item.path)) ? "active" : ""}`}
                    onClick={() => handleNav(item.path)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button"
            className={`nav-item ${isActive("/customer") ? "active" : ""}`}
            onClick={() => handleNav("/customer")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Customers
          </button>

          <button type="button"
            className={`nav-item ${isActive("/compliance") ? "active" : ""}`}
            onClick={() => handleNav("/compliance")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 12l2 2 4-4" /><path d="M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z" />
            </svg>
            Compliance
          </button>

          <div className="sidebar-nav-divider" role="separator" />

          {/* Reports Dropdown */}
          <div className="nav-group">
            <button type="button"
              aria-expanded={currentReportsOpen}
              aria-controls="sidebar-reports"
              className={`nav-item ${isParentActive("/report") || currentReportsOpen ? "active" : ""}`}
              onClick={() => {
                setReportsOpen(!currentReportsOpen);
                setFleetOpen(false);
                setSettingsOpen(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Reports
              <svg
                className={`nav-chevron ${currentReportsOpen ? "open" : ""}`}
                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {currentReportsOpen && (
              <div id="sidebar-reports" className="submenu">
                {REPORTS_SUBMENU.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`submenu-item ${isActive(item.path) ? "active" : ""}`}
                    onClick={() => handleNav(item.path)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings Dropdown */}
          <div className="nav-group">
            <button type="button"
              aria-expanded={currentSettingsOpen}
              aria-controls="sidebar-settings"
              className={`nav-item ${isParentActive("/settings") || currentSettingsOpen ? "active" : ""}`}
              onClick={() => {
                setSettingsOpen(!currentSettingsOpen);
                setFleetOpen(false);
                setReportsOpen(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0 1.51 1z" />
              </svg>
              Settings
              <svg
                className={`nav-chevron ${currentSettingsOpen ? "open" : ""}`}
                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {currentSettingsOpen && (
              <div id="sidebar-settings" className="submenu">
                {SETTINGS_SUBMENU.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`submenu-item ${isActive(item.path) ? "active" : ""}`}
                    onClick={() => handleNav(item.path)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button type="button" className="nav-item sidebar-help-button" aria-haspopup="dialog" aria-expanded={isHelpOpen} onClick={() => setIsHelpOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help &amp; Operations Guide
          </button>

          <button type="button" className="nav-item logout-button" onClick={() => { setLogoutError(""); setIsLogoutModalOpen(true); }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {isHelpOpen && <OfficeHelpDialog onClose={() => setIsHelpOpen(false)} />}

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="logout-modal-backdrop">
          <div ref={logoutModalRef} className="logout-modal-box" role="dialog" aria-modal="true" aria-labelledby="logout-title" aria-busy={isLoggingOut}>
            <h3 id="logout-title">Confirm Log Out</h3>
            <p>Are you sure you want to log out?</p>
            {logoutError && <p role="alert">{logoutError}</p>}
            <div className="logout-modal-actions">
              <button type="button" className="btn-modal-yes" disabled={isLoggingOut} onClick={handleConfirmLogout}>
                {isLoggingOut ? "Logging out…" : "Yes"}
              </button>
              <button type="button" className="btn-modal-no" disabled={isLoggingOut} onClick={closeLogoutModal} autoFocus>
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
