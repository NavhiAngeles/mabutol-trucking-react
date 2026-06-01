import React, { useState } from "react";
import "./createShipment.css";

export default function CreateShipmentDrawer({ isOpen, onClose }) {
  // Stepper tracking state engine (Starts smoothly at Step 1)
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Form Fields Interactive Reactive Value States
  const [weight, setWeight] = useState("6000");
  const [specialHandling, setSpecialHandling] = useState("Keep Dry");
  const [selectedVehicle, setSelectedVehicle] = useState("10-wheeler-wing");
  const [overrideAmount, setOverrideAmount] = useState("884.00");

  if (!isOpen) return null;

  // Handles closing the entire workspace clean
  const handleCloseAll = () => {
    setShowSuccessModal(false);
    setCurrentStep(1);
    onClose();
  };

  // --- STEP 1 CONTENT: ROUTE & SCHEDULE ---
  const renderRouteStep = () => (
    <div className="step-scroll-content">
      {/* Pick-up Location */}
      <div className="form-group">
        <label className="input-title">PICK-UP LOCATION</label>
        <div className="input-search-wrapper">
          <i className="las la-circle-notch input-icon input-blue-icon"></i>
          <input type="text" defaultValue="Cabanatuan City Hub Alpha" readOnly />
          <i className="las la-search trailing-search-icon"></i>
        </div>
        <div className="hub-pills-row">
          <button className="hub-pill active">Hub Alpha</button>
          <button className="hub-pill">Agri-Terminal</button>
          <button className="hub-pill">Cold Storage B</button>
          <button className="hub-pill">Yard 4</button>
        </div>
      </div>

      {/* Destination */}
      <div className="form-group">
        <label className="input-title">DESTINATION</label>
        <div className="input-search-wrapper">
          <i className="las la-map-marker input-icon input-orange-icon"></i>
          <input type="text" defaultValue="Gapan City" readOnly />
          <i className="las la-search trailing-search-icon"></i>
        </div>
      </div>

      {/* Route Summary Card */}
      <div className="route-summary-card">
        <div className="summary-header">
          <h3>Route Summary</h3>
          <span className="toll-badge">TOLL ROAD</span>
        </div>
        <div className="summary-timeline">
          <div className="timeline-node blue-node">Cabanatuan City Hub Alpha</div>
          <div className="timeline-node orange-node">Gapan City</div>
        </div>
        <div className="summary-footer-metrics">
          <div>
            <span className="metric-label">DISTANCE</span>
            <strong className="metric-val">38 km</strong>
          </div>
          <div>
            <span className="metric-label">EST. TIME</span>
            <strong className="metric-val">1h 15m</strong>
          </div>
          <button className="view-map-text-btn">
            <i className="las la-map"></i> View on map
          </button>
        </div>
      </div>

      {/* Departure Schedule */}
      <div className="form-grid-2x2">
        <div className="form-group">
          <label className="input-title">SCHEDULE DEPARTURE</label>
          <div className="input-search-wrapper">
            <i className="las la-calendar input-icon"></i>
            <input type="text" defaultValue="10/24/2023" readOnly />
          </div>
        </div>
        <div className="form-group">
          <label className="input-title">&nbsp;</label>
          <div className="input-search-wrapper">
            <i className="las la-clock input-icon"></i>
            <input type="text" defaultValue="08:00 AM" readOnly />
          </div>
        </div>
      </div>

      {/* Customer Billing dropdown box */}
      <div className="form-group">
        <label className="input-title">CUSTOMER BILLING</label>
        <div className="select-dropdown-wrapper">
          <select defaultValue="1">
            <option value="1">Agri-Logistics Inc. (Maria Santos)</option>
            <option value="2">San Miguel Corp</option>
          </select>
          <i className="las la-angle-down custom-select-arrow"></i>
        </div>
        <p className="field-info-text">
          <i className="las la-info-circle"></i> Only registered customer accounts appear here.
        </p>
      </div>
    </div>
  );

  // --- STEP 2 CONTENT: CARGO & VEHICLE SELECTION ---
  const renderCargoStep = () => {
    const vehicleFleetData = [
      { id: "4-wheeler-closed", name: "4-Wheeler Closed Van", maxWeight: 2000, fleetCode: "Fleet: T-102", typeTag: "ENCLOSED", isEnclosed: true, iconClass: "las la-truck-pickup" },
      { id: "6-wheeler-forward", name: "6-Wheeler Forward", maxWeight: 5000, fleetCode: "Fleet: T-305", typeTag: "OPEN DROPSIDE", isEnclosed: false, iconClass: "las la-truck" },
      { id: "10-wheeler-wing", name: "10-Wheeler Wing Van", maxWeight: 15000, fleetCode: "Fleet: T-402", typeTag: "ENCLOSED WING", isEnclosed: true, iconClass: "las la-dolly-flatbed" },
      { id: "10-wheeler-flatbed", name: "10-Wheeler Flatbed", maxWeight: 12000, fleetCode: "Fleet: T-409", typeTag: "OPEN FLATBED", isEnclosed: false, iconClass: "las la-truck-loading" }
    ];

    return (
      <div className="step-scroll-content">
        <div className="form-group">
          <label className="input-title">TOTAL WEIGHT</label>
          <div className="input-search-wrapper">
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span className="trailing-unit">kg</span>
          </div>
        </div>

        <div className="form-group">
          <label className="input-title">SPECIAL HANDLING</label>
          <div className="handling-badges-row">
            {["None", "Fragile", "Keep Dry", "Temperature Sensitive"].map((tag) => (
              <button 
                key={tag}
                type="button"
                className={`handling-badge-btn ${specialHandling === tag ? "active" : ""}`}
                onClick={() => setSpecialHandling(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="input-title">NOTES TO DRIVER</label>
          <textarea className="form-textarea" placeholder="Instructions..." rows={2} defaultValue="Handle with care. Stack max 3 high." />
        </div>

        <div className="form-group">
          <div className="vehicle-header-row">
            <label className="input-title">SELECT VEHICLE</label>
            <span className="weight-filter-label">Filtered by weight ({Number(weight).toLocaleString()} kg)</span>
          </div>

          <div className="vehicle-selection-grid">
            {vehicleFleetData.map((truck) => {
              const isOverweight = Number(weight) > truck.maxWeight;
              const isSelected = selectedVehicle === truck.id;

              return (
                <div 
                  key={truck.id}
                  className={`vehicle-card ${isOverweight ? "disabled" : "searchable"} ${isSelected && !isOverweight ? "active" : ""}`}
                  onClick={() => !isOverweight && setSelectedVehicle(truck.id)}
                >
                  <div className="vehicle-card-icon"><i className={truck.iconClass}></i></div>
                  <div className="vehicle-card-details">
                    <div className="vehicle-title-line">
                      <h4>{truck.name}</h4>
                      <span className="vehicle-fleet-id-tag">{truck.fleetCode}</span>
                    </div>
                    <p>Up to {truck.maxWeight.toLocaleString()} kg</p>
                    <span className={`vehicle-tag ${truck.isEnclosed ? "blue-tag" : "grey-tag"}`}>{truck.typeTag}</span>
                  </div>
                  {isOverweight ? (
                    <div className="error-alert-text"><i className="las la-exclamation-circle"></i> Exceeds weight</div>
                  ) : isSelected ? (
                    <i className="las la-check-circle select-check-icon"></i>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // --- STEP 3 CONTENT: COMPLETE SCROLLABLE REVIEW PANEL ---
  const renderReviewStep = () => (
    <div className="step-scroll-content">
      <div className="review-alert-banner">
        <i className="las la-exclamation-triangle alert-banner-icon"></i>
        <p>Assign a driver and vehicle to confirm this shipment allocation parameters.</p>
      </div>

      <div className="review-section">
        <label className="review-section-title">ROUTE</label>
        <div className="review-timeline-display">
          <div className="review-node blue-dot">
            <strong>Cabanatuan City Hub Alpha</strong>
            <span>Pick-up</span>
          </div>
          <div className="review-node orange-dot">
            <strong>Gapan City</strong>
            <span>Destination</span>
          </div>
        </div>
        <div className="review-inline-pills">
          <span className="info-inline-pill">38 km</span>
          <span className="info-inline-pill">1h 15m</span>
          <span className="info-inline-pill highlight-orange">TOLL ROAD</span>
        </div>
      </div>

      <div className="review-section-split">
        <div>
          <label className="review-section-title">SCHEDULE</label>
          <div className="review-data-text">
            <i className="las la-calendar"></i> Oct 24, 2023 &nbsp;&nbsp; <i className="las la-clock"></i> 08:00 AM
          </div>
        </div>
        <div>
          <label className="review-section-title">CUSTOMER</label>
          <div className="review-data-text">
            <strong>Maria Santos</strong> <span className="blue-status-tag">REGISTERED</span>
          </div>
        </div>
      </div>

      <div className="review-section">
        <label className="review-section-title">CARGO</label>
        <div className="review-data-row align-center">
          <strong className="font-bold"><i className="las la-weight-hanging"></i> {weight}kg</strong> 
          <span className="blue-status-tag">{specialHandling}</span>
        </div>
        <p className="review-sub-notes">Notes: "Handle with care. Stack max 3 high."</p>
      </div>

      <div className="review-section">
        <label className="review-section-title">VEHICLE</label>
        <div className="assigned-entity-card">
          <div className="entity-icon-box"><i className="las la-truck"></i></div>
          <div className="entity-info-box">
            <h4>10-Wheeler Wing Van</h4>
            <p>Plate ABC-1234</p>
          </div>
          <span className="live-status-indicator"><span className="green-dot"></span> Available</span>
        </div>
      </div>

      <div className="review-section">
        <label className="review-section-title">DRIVER</label>
        <div className="assigned-entity-card">
          <div className="entity-avatar-box">RC</div>
          <div className="entity-info-box">
            <h4>Ramon Cruz</h4>
            <p><span className="green-dot-text">● Available</span> &nbsp;<span className="green-check-text">✓ Compliance</span></p>
          </div>
          <span className="auto-assign-tag">Auto-assigned.</span>
        </div>
      </div>

      {/* Shipment Charge Invoice Card */}
      <div className="financial-statement-card cost-charge-blue">
        <div className="financial-header-row">
          <h3>Shipment Charge</h3>
          <span className="financial-badge-tag orange-bg">WHAT CUSTOMER PAYS</span>
        </div>
        <div className="financial-data-row">
          <span>Base Rate (10-Wheeler × 38km)</span>
          <strong>₱3,080.00</strong>
        </div>
        <div className="financial-data-row">
          <span>Special Handling ({specialHandling})</span>
          <strong>+₱200.00</strong>
        </div>
        <div className="financial-total-row">
          <span>Total Suggested Charge</span>
          <span className="total-price-text">₱3,280.00</span>
        </div>
        <div className="override-input-group">
          <label className="override-label">Override Amount (₱)</label>
          <input type="text" className="override-text-field" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
        </div>
      </div>

      {/* Trip Estimate Cost Allowance Card */}
      <div className="financial-statement-card operational-grey">
        <div className="financial-header-row">
          <h3>Trip Estimate</h3>
          <span className="financial-badge-tag grey-bg">DRIVER TRIP ALLOWANCE</span>
        </div>
        <div className="financial-data-row">
          <span>Tolls</span>
          <strong>₱150.00</strong>
        </div>
        <div className="financial-data-row">
          <span>Allowance</span>
          <strong>₱500.00</strong>
        </div>
        <div className="financial-total-row">
          <span>TOTAL OPERATIONAL COST</span>
          <span className="total-price-text-sm">₱650.00</span>
        </div>
      </div>

      {/* Estimated Profit Panel Summary Widget */}
      <div className="financial-statement-card profit-panel-white">
        <div className="financial-header-row border-none no-margin">
          <label className="review-section-title">ESTIMATED PROFIT</label>
        </div>
        <div className="financial-data-row">
          <span>Total Suggested Charge</span>
          <span>₱3,280.00</span>
        </div>
        <div className="financial-data-row">
          <span>Total Operational Cost</span>
          <span>-₱650.00</span>
        </div>
        <div className="financial-total-row border-dashed">
          <span className="profit-final-label">TOTAL ESTIMATED PROFIT</span>
          <span className="total-profit-highlight">₱2,630.00</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="drawer-overlay" onClick={handleCloseAll}>
      <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
        
        {/* LEFT COMPONENT PANEL WORKSPACE */}
        <div className="drawer-form-panel">
          
          {/* Frozen Static Header Area */}
          <div className="drawer-fixed-header-block">
            <div className="drawer-header">
              <button className="back-link-btn" onClick={handleCloseAll}>
                <i className="las la-arrow-left"></i> BACK TO SHIPMENTS
              </button>
              <h2>Create New Shipment</h2>
            </div>

            {/* Stepper Steps Rows Chain */}
            <div className="stepper-wrapper">
              <div className={`step-item ${currentStep >= 1 ? "active" : ""} ${currentStep > 1 ? "checked" : ""}`}>
                <span className="step-num">{currentStep > 1 ? "✓" : "1"}</span>
                {currentStep === 1 && <span className="step-label">Route & Schedule</span>}
              </div>
              <div className={`step-line ${currentStep >= 2 ? "active-line" : ""}`}></div>
              
              <div className={`step-item ${currentStep >= 2 ? "active" : ""} ${currentStep > 2 ? "checked" : ""}`}>
                <span className="step-num">{currentStep > 2 ? "✓" : "2"}</span>
                {currentStep === 2 && <span className="step-label">Cargo & Vehicle</span>}
              </div>
              <div className={`step-line ${currentStep === 3 ? "active-line" : ""}`}></div>
              
              <div className={`step-item ${currentStep === 3 ? "active" : ""}`}>
                <span className="step-num">3</span>
                {currentStep === 3 && <span className="step-label">Review & Confirmation</span>}
              </div>
            </div>
          </div>

          {/* Scrollable Middle View Space */}
          <div className="drawer-form-body-scrollable">
            {currentStep === 1 && renderRouteStep()}
            {currentStep === 2 && renderCargoStep()}
            {currentStep === 3 && renderReviewStep()}
          </div>

          {/* Frozen Base Execution Action Footer */}
          <div className="drawer-footer-wrapper-fixed">
            {currentStep < 3 ? (
              <div className="drawer-footer">
                <button className="btn-cancel" onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : handleCloseAll()}>
                  {currentStep > 1 ? "Back" : "Cancel"}
                </button>
                <button className="btn-submit" onClick={() => setCurrentStep(currentStep + 1)}>
                  {currentStep === 1 ? "Cargo & Vehicle" : "Review & Confirm"} <i className="las la-arrow-right"></i>
                </button>
              </div>
            ) : (
              <div className="drawer-review-footer-block">
                <button className="btn-full-confirm" onClick={() => setShowSuccessModal(true)}>
                  <i className="las la-check-circle"></i> Confirm Shipment Booking
                </button>
                <span className="footer-notice-subtext">Driver will be notified immediately via mobile app.</span>
                <button className="btn-discard-action" onClick={handleCloseAll}>Cancel and discard shipment</button>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT PANEL MAP OVERLAY Dashboard Grid View */}
        <div className="drawer-map-panel">
          <div className="simulated-map-canvas">
            <div className="map-fallback-overlay">
              <p>🗺️ Regional Logistics Map Dashboard View Layer</p>
              <span>Active Routing Chain Corridor: Cabanatuan City → Gapan City</span>
            </div>
          </div>
        </div>

        {/* Beautiful Custom Success Popup Modal Viewport */}
        {showSuccessModal && (
          <div className="alert-modal-backdrop" onClick={handleCloseAll}>
            <div className="alert-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="alert-success-icon-ring"><i className="las la-check"></i></div>
              <h2>Shipment Booked Successfully</h2>
              <p className="alert-modal-subtitle">The shipment allocation has been safely recorded onto the logistics database panel.</p>
              
              <div className="alert-meta-summary-box">
                <div className="meta-row"><span className="meta-lbl">SHIPMENT ID</span><strong className="meta-val color-blue">#SH-2026-0601</strong></div>
                <div className="meta-row"><span className="meta-lbl">ASSIGNED DRIVER</span><strong className="meta-val">Ramon Cruz</strong></div>
                <div className="meta-row"><span className="meta-lbl">NET VALUE</span><strong className="meta-val">₱3,280.00</strong></div>
              </div>
              <button className="btn-alert-dismiss" onClick={handleCloseAll}>Go back to Dashboard Overview</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}