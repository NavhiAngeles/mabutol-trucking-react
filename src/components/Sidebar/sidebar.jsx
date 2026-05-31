import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./sidebar.css";

export default function Sidebar() {

    const navigate = useNavigate();

    const [reportsSubmenuHidden, setReportsSubmenuHidden] = useState(true);
    const [settingsSubmenuHidden, setSettingsSubmenuHidden] = useState(true);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <h2>Mabutol Tracking</h2>
        <p>NUEVA ECIJA LOGISTICS</p>
      </div>

      <nav className="menu">
        <div
          className="menu-item active"
          onClick={() => navigate("/dashboard")}
        >
          Dashboard
        </div>
        <div className="menu-item" onClick={() => navigate("/shipment")}>
          Shipments
        </div>
        <div className="menu-item" onClick={() => navigate("/fleet")}>
          Fleet Management
        </div>
        <div className="menu-item" onClick={() => navigate("/customer")}>
          Customers
        </div>
       

        {/* Reports Dropdown */}
        <div className="menu-group">
          <div
            className="menu-item"
            id="reportsToggle"
            onClick={() => setReportsSubmenuHidden(!reportsSubmenuHidden)}
          >
            Reports
          </div>

          <div
            className={`submenu ${reportsSubmenuHidden ? "hidden" : ""}`}
            id="reportsSubmenu"
          >
            <div
              className="submenu-item active"
              onClick={() => navigate("/report/overview")}
            >
              Overview
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/report/shipmentReport")}
            >
              Shipments
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/report/driverReport")}
            >
              Drivers
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/report/revenueReport")}
            >
              Revenue
            </div>
          </div>
        </div>

        {/* Settings Dropdown */}
        <div className="menu-group">
          <div
            className="menu-item"
            id="settingsToggle"
            onClick={() => setSettingsSubmenuHidden(!settingsSubmenuHidden)}
          >
            Settings
          </div>

          <div
            className={`submenu ${settingsSubmenuHidden ? "hidden" : ""}`}
            id="settingsSubmenu"
          >
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/account")}
            >
              Account
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/notification")}
            >
              Notifications
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/pricing")}
            >
              Pricing
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/complianceThreshold")}
            >
              Compliance Thresholds
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/userManagement")}
            >
              User Management
            </div>
            <div
              className="submenu-item"
              onClick={() => navigate("/settings/security")}
            >
              Security
            </div>
          </div>
        </div>
      </nav>

      <div className="sidebar-bottom">
        <span>Help Center</span>
        <span>Log Out</span>
      </div>
    </aside>
  );
}