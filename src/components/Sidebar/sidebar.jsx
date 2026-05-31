import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./sidebar.css";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [reportsOpen, setReportsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const isActive = (path) => location.pathname === path;
  const isParentActive = (prefix) => location.pathname.startsWith(prefix);

  // Synchronize menu open states and clean up highlights dynamically
  useEffect(() => {
    if (isParentActive("/report")) {
      setReportsOpen(true);
      setSettingsOpen(false);
    } else if (isParentActive("/settings")) {
      setSettingsOpen(true);
      setReportsOpen(false);
    } else {
      // FIX: When any other root menu is clicked, clear dropdown states and highlights
      setReportsOpen(false);
      setSettingsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleConfirmLogout = () => {
    setIsLogoutModalOpen(false);
    navigate("/");
  };

  return (
    <>
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div className="brand-text">
            <h2>TANAW</h2>
            <p>NUEVA ECIJA LOGISTICS</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div
            className={`nav-item ${isActive("/dashboard") ? "active" : ""}`}
            onClick={() => navigate("/dashboard")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </div>

          <div
            className={`nav-item ${isActive("/shipment") ? "active" : ""}`}
            onClick={() => navigate("/shipment")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
              <rect x="9" y="11" width="14" height="10" rx="2"/>
              <circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            </svg>
            Shipments
          </div>

          <div
            className={`nav-item ${isActive("/fleet") ? "active" : ""}`}
            onClick={() => navigate("/fleet")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="3" width="15" height="13" rx="2"/>
              <path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            Fleet Management
          </div>

          <div
            className={`nav-item ${isActive("/customer") ? "active" : ""}`}
            onClick={() => navigate("/customer")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Customers
          </div>

          {/* Reports Dropdown */}
          <div className="nav-group">
            <div
              className={`nav-item ${isParentActive("/report") || reportsOpen ? "active" : ""}`}
              onClick={() => {
                setReportsOpen((prev) => !prev);
                setSettingsOpen(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Reports
              <svg
                className={`nav-chevron ${reportsOpen ? "open" : ""}`}
                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            
            {reportsOpen && (
              <div className="submenu" onClick={(e) => e.stopPropagation()}>
                <div className={`submenu-item ${isActive("/report/overview") ? "active" : ""}`} onClick={() => navigate("/report/overview")}>Overview</div>
                <div className={`submenu-item ${isActive("/report/shipmentReport") ? "active" : ""}`} onClick={() => navigate("/report/shipmentReport")}>Shipments</div>
                <div className={`submenu-item ${isActive("/report/driverReport") ? "active" : ""}`} onClick={() => navigate("/report/driverReport")}>Drivers</div>
                <div className={`submenu-item ${isActive("/report/revenueReport") ? "active" : ""}`} onClick={() => navigate("/report/revenueReport")}>Revenue</div>
              </div>
            )}
          </div>

          {/* Settings Dropdown */}
          <div className="nav-group">
            <div
              className={`nav-item ${isParentActive("/settings") || settingsOpen ? "active" : ""}`}
              onClick={() => {
                setSettingsOpen((prev) => !prev);
                setReportsOpen(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
              <svg
                className={`nav-chevron ${settingsOpen ? "open" : ""}`}
                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {settingsOpen && (
              <div className="submenu" onClick={(e) => e.stopPropagation()}>
                <div className={`submenu-item ${isActive("/settings/account") ? "active" : ""}`} onClick={() => navigate("/settings/account")}>Account</div>
                <div className={`submenu-item ${isActive("/settings/notification") ? "active" : ""}`} onClick={() => navigate("/settings/notification")}>Notifications</div>
                <div className={`submenu-item ${isActive("/settings/pricing") ? "active" : ""}`} onClick={() => navigate("/settings/pricing")}>Pricing</div>
                <div className={`submenu-item ${isActive("/settings/complianceThreshold") ? "active" : ""}`} onClick={() => navigate("/settings/complianceThreshold")}>Compliance thresholds</div>
                <div className={`submenu-item ${isActive("/settings/userManagement") ? "active" : ""}`} onClick={() => navigate("/settings/userManagement")}>User management</div>
                <div className={`submenu-item ${isActive("/settings/security") ? "active" : ""}`} onClick={() => navigate("/settings/security")}>Security</div>
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="nav-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Help Center
          </div>
          
          <div className="nav-item logout-button" onClick={() => setIsLogoutModalOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </div>
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="logout-modal-backdrop">
          <div className="logout-modal-box">
            <h3>Confirm Log Out</h3>
            <p>Are you sure you want to log out?</p>
            <div className="logout-modal-actions">
              <button className="btn-modal-yes" onClick={handleConfirmLogout}>
                Yes
              </button>
              <button className="btn-modal-no" onClick={() => setIsLogoutModalOpen(false)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}