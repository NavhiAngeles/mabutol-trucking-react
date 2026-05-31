import { useState } from "react";
import MainLayout from "../../../layouts/mainLayout";
import "./notification.css";

export default function Notifications() {
  // State for On/Off Switches
  const [toggles, setToggles] = useState({
    emailNotifications: true,
    pushNotifications: true,
    smsAlerts: false,
    docExpiryWarning: true,
    docExpired: true,
    permitExpiration: false,
    maintenanceDue: true,
    vehicleOverdue: true,
    newBooking: true,
  });

  // Flat state for Shipment Alert Checkboxes (True = Checked/On, False = Empty/Off)
  const [shipmentAlerts, setShipmentAlerts] = useState({
    statusChangesEmail: true,
    statusChangesPush: true,
    offRouteEmail: true,
    offRoutePush: true,
    coldChainEmail: true,
    coldChainPush: true,
  });

  // Handler for Toggle Switches
  const handleToggle = (key) => {
    setToggles((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Handler for Checkboxes
  const handleCheckboxChange = (key) => {
    setShipmentAlerts((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input type="text" placeholder="Search..." />
        <div className="topbar-right">
          <button>🔔</button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        <div className="page-header">
          <div>
            <h2>Settings — Notifications</h2>
            <p>Configure how and when you receive operational alerts.</p>
          </div>
        </div>

        {/* Grid */}
        <div className="notification-grid">
          
          {/* Delivery Channels */}
          <div className="settings-card">
            <div className="card-header">
              <h3>Delivery Channels</h3>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Email Notifications</strong>
                <p>Daily summaries and delayed reports</p>
              </div>
              <div 
                className={`toggle ${toggles.emailNotifications ? "active" : "inactive"}`}
                onClick={() => handleToggle("emailNotifications")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Push Notifications</strong>
                <p>Real-time mobile alerts</p>
              </div>
              <div 
                className={`toggle ${toggles.pushNotifications ? "active" : "inactive"}`}
                onClick={() => handleToggle("pushNotifications")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>SMS Alerts</strong>
                <p>Reserved for critical alerts</p>
              </div>
              <div 
                className={`toggle ${toggles.smsAlerts ? "active" : "inactive"}`}
                onClick={() => handleToggle("smsAlerts")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>
          </div>

          {/* Shipment Alerts (Fully Responsive Checkboxes) */}
          <div className="settings-card wide">
            <div className="card-header">
              <h3>Shipment Alerts</h3>
            </div>

            {/* Status Changes */}
            <div className="alert-row">
              <div>
                <strong>Status Changes</strong>
                <p>Shipment status updates</p>
              </div>
              <div className="alert-options">
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.statusChangesEmail} 
                    onChange={() => handleCheckboxChange("statusChangesEmail")}
                  />
                  EMAIL
                </label>
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.statusChangesPush} 
                    onChange={() => handleCheckboxChange("statusChangesPush")}
                  />
                  PUSH
                </label>
              </div>
            </div>

            {/* Off-Route Alert */}
            <div className="alert-row">
              <div>
                <strong>Off-Route Alert</strong>
                <p>Vehicle route deviation</p>
              </div>
              <div className="alert-options">
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.offRouteEmail} 
                    onChange={() => handleCheckboxChange("offRouteEmail")}
                  />
                  EMAIL
                </label>
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.offRoutePush} 
                    onChange={() => handleCheckboxChange("offRoutePush")}
                  />
                  PUSH
                </label>
              </div>
            </div>

            {/* Cold Chain Alert */}
            <div className="alert-row">
              <div>
                <strong>Cold Chain Alert</strong>
                <p>Temperature issue detected</p>
              </div>
              <div className="alert-options">
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.coldChainEmail} 
                    onChange={() => handleCheckboxChange("coldChainEmail")}
                  />
                  EMAIL
                </label>
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={shipmentAlerts.coldChainPush} 
                    onChange={() => handleCheckboxChange("coldChainPush")}
                  />
                  PUSH
                </label>
              </div>
            </div>
          </div>

          {/* Compliance Alerts */}
          <div className="settings-card">
            <div className="card-header">
              <h3>Compliance Alerts</h3>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Document Expiry Warning</strong>
                <p>Expiring within 30 days</p>
              </div>
              <div 
                className={`toggle ${toggles.docExpiryWarning ? "active" : "inactive"}`}
                onClick={() => handleToggle("docExpiryWarning")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Document Expired</strong>
                <p>Already expired documents</p>
              </div>
              <div 
                className={`toggle ${toggles.docExpired ? "active" : "inactive"}`}
                onClick={() => handleToggle("docExpired")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Permit Expiration</strong>
                <p>Vehicle permits warning</p>
              </div>
              <div 
                className={`toggle ${toggles.permitExpiration ? "active" : "inactive"}`}
                onClick={() => handleToggle("permitExpiration")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>
          </div>

          {/* Fleet Alerts */}
          <div className="settings-card">
            <div className="card-header">
              <h3>Fleet Alerts</h3>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Maintenance Due</strong>
                <p>Scheduled service intervals</p>
              </div>
              <div 
                className={`toggle ${toggles.maintenanceDue ? "active" : "inactive"}`}
                onClick={() => handleToggle("maintenanceDue")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>Vehicle Overdue</strong>
                <p>Missed maintenance schedule</p>
              </div>
              <div 
                className={`toggle ${toggles.vehicleOverdue ? "active" : "inactive"}`}
                onClick={() => handleToggle("vehicleOverdue")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <strong>New Customer Booking</strong>
                <p>Customer submitted booking</p>
              </div>
              <div 
                className={`toggle ${toggles.newBooking ? "active" : "inactive"}`}
                onClick={() => handleToggle("newBooking")}
              >
                <div className="toggle-circle"></div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </MainLayout>
  );
}