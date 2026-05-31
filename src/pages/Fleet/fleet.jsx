import { useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import "./fleet.css";

export default function Fleet() {
  const [vehicleTab, setVehicleTab] = useState("details");
  const [driverTab, setDriverTab] = useState("details");
  const [maintenanceView, setMaintenanceView] = useState("list");

  return (
    <MainLayout>
      {/* Dynamic Topbar Header Context */}
      <header className="topbar">
        <div className="search-container">
          <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search..."
            id="fleetSearch"
            onChange={(e) => console.log("Searching fleet panel:", e.target.value)}
          />
        </div>

        <div className="topbar-right">
          <button className="icon-btn" aria-label="Notifications">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </button>
          <button className="icon-btn" aria-label="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <div className="avatar">
            <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" alt="Profile View" />
          </div>
        </div>
      </header>

      {/* Primary Scrolling Content Frame */}
      <section className="content scrollable-panel">
        
        {/* ================= SECTION 1: VEHICLES OVERVIEW ================= */}
        <div className="header-actions-row">
          <div className="header-titles">
            <h2>Fleet Management Overview</h2>
            <p className="subtitle">MANAGE YOUR FLEET, DRIVERS, COMPLIANCE DOCUMENTS, AND MAINTENANCE SCHEDULES.</p>
          </div>
          <div className="action-buttons-group">
            <button className="btn-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              <span>+ Register Driver</span>
            </button>
            <button className="btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <span>+ Add Vehicle</span>
            </button>
          </div>
        </div>

        {/* Vehicles Cards Metrics row */}
        <div className="stats-grid">
          <div className="metric-card border-slate">
            <div className="metric-header">
              <h4>TOTAL VEHICLES</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path></svg>
            </div>
            <h2>36</h2>
            <p className="growth-indicator positive"><span className="arrow">▲</span> <strong>+2%</strong> vs last month</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>AVAILABLE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2>18</h2>
            <p className="growth-indicator target">50% of total fleet</p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header">
              <h4>IN MAINTENANCE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
            </div>
            <h2>4</h2>
            <p className="growth-indicator maintenance">Currently under maintenance</p>
          </div>
          <div className="metric-card border-blue">
            <div className="metric-header">
              <h4>IN TRANSIT</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon></svg>
            </div>
            <h2>14</h2>
            <p className="growth-indicator transit">Currently on shipment</p>
          </div>
        </div>

        {/* Vehicles Tab Controller */}
        <div className="section-tab-container">
          <div className="section-titles">
            <h3>Vehicles</h3>
            <p className="section-subtitle">
              {vehicleTab === "details" ? "REGISTERED FLEET VEHICLES AND OPERATIONAL STATUS." : "REGISTERED FLEET VEHICLES AND COMPLIANCE DOCUMENT STATUS."}
            </p>
          </div>
          <div className="tab-pill-box">
            <button 
              className={`tab-pill ${vehicleTab === "details" ? "active" : ""}`} 
              onClick={() => setVehicleTab("details")}
              type="button"
              style={{ cursor: "pointer" }}
            >
              Details
            </button>
            <button 
              className={`tab-pill ${vehicleTab === "compliance" ? "active" : ""}`} 
              onClick={() => setVehicleTab("compliance")}
              type="button"
              style={{ cursor: "pointer" }}
            >
              Compliance
            </button>
          </div>
        </div>

        {/* Table Filters Search row */}
        <div className="table-filter-bar">
          <div className="filter-search-wrapper">
            <svg className="inner-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Search by plate, vehicle type..." className="input-table-search" />
          </div>
          <div className="filter-actions-right">
            <button className="btn-filter"><span>SORT BY</span></button>
            <button className="btn-filter"><span>TODAY</span></button>
            <button className="btn-filter-icon">⚙</button>
          </div>
        </div>

        {/* Vehicles Datatable layout matrix */}
        <div className="fleet-table-card spaced-card">
          <table className="fleet-table">
            {vehicleTab === "details" ? (
              <>
                {/* HEADERS FOR DETAILS VIEW */}
                <thead>
                  <tr>
                    <th>VEHICLE</th>
                    <th>TYPE & CAPACITY</th>
                    <th>CARGO COMPATIBILITY</th>
                    <th>ASSIGNED DRIVER</th>
                    <th>CURRENT ASSIGNMENT</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: "center" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><div className="vehicle-cell"><span className="plate-number">XJ-772-L</span><span className="vehicle-model">2019 Isuzu Giga</span></div></td>
                    <td className="text-secondary">Heavy Freight, 15,000 kg</td>
                    <td><div className="tag-badges"><span className="badge-tag">GENERAL</span><span className="badge-tag">BULK</span></div></td>
                    <td className="text-primary font-medium">Ramon Cruz</td>
                    <td><div className="assignment-cell"><span className="shp-link">SHP-NE-8042</span><span>→</span><span className="location-text">Gapan City</span></div></td>
                    <td><span className="status-pill status-transit"><span className="dot"></span> IN TRANSIT</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>
                  <tr>
                    <td><div className="vehicle-cell"><span className="plate-number">AB-123-C</span><span className="vehicle-model">2021 Toyota Hi-Ace</span></div></td>
                    <td className="text-secondary">Delivery Van, 1,500 kg</td>
                    <td><div className="tag-badges"><span className="badge-tag">GENERAL</span></div></td>
                    <td className="text-muted italic">Unassigned</td>
                    <td><div className="assignment-cell"><span className="shp-link">SHP-NE-8042</span><span>→</span><span className="location-text">Gapan City</span></div></td>
                    <td><span className="status-pill status-available"><span className="dot"></span> AVAILABLE</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>
                </tbody>
              </>
            ) : (
              <>
                {/* HEADERS FOR COMPLIANCE VIEW */}
                <thead>
                  <tr>
                    <th>VEHICLE</th>
                    <th style={{ textAlign: "center" }}>OR/CR</th>
                    <th style={{ textAlign: "center" }}>INSURANCE</th>
                    <th style={{ textAlign: "center" }}>LTFRB PERMIT</th>
                    <th style={{ textAlign: "center" }}>EMISSION TEST</th>
                    <th style={{ textAlign: "center" }}>OVERALL STATUS</th>
                    <th>LAST MAINTENANCE</th>
                    <th style={{ textAlign: "center" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Isuzu Forward */}
                  <tr className="compliance-row accent-orange-border">
                    <td>
                      <div className="vehicle-cell-with-icon">
                        <span className="vehicle-table-icon">🚚</span>
                        <div>
                          <span className="plate-number">Isuzu Forward</span>
                          <span className="vehicle-model">XYZ-1234</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="warning-icon-alert">⚠️</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="compliance-badge c-action">ACTION NEEDED</span></td>
                    <td><div className="maintenance-cell-data"><strong>Oct 12, 2023</strong><span className="sub-text">Next: Nov 12, 2023</span></div></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>

                  {/* 10-Wheeler Wing Van */}
                  <tr className="compliance-row">
                    <td>
                      <div className="vehicle-cell-with-icon">
                        <span className="vehicle-table-icon">¼</span>
                        <div>
                          <span className="plate-number">10-Wheeler Wing Van</span>
                          <span className="vehicle-model">ABC-9876</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="fail-icon-invalid">❌</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="compliance-badge c-noncompliant">NON-COMPLIANT</span></td>
                    <td><div className="maintenance-cell-data"><strong>Jun 05, 2023</strong><span className="sub-text text-red">⚠️ Overdue</span></div></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>

                  {/* Hino 500 */}
                  <tr className="compliance-row">
                    <td>
                      <div className="vehicle-cell-with-icon">
                        <span className="vehicle-table-icon">🚚</span>
                        <div>
                          <span className="plate-number">Hino 500</span>
                          <span className="vehicle-model">PLT-555</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="compliance-badge c-compliant">FULLY COMPLIANT</span></td>
                    <td><div className="maintenance-cell-data"><strong>Jan 15, 2024</strong><span className="sub-text">Next: Apr 15, 2024</span></div></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>

                  {/* Isuzu Elf */}
                  <tr className="compliance-row">
                    <td>
                      <div className="vehicle-cell-with-icon">
                        <span className="vehicle-table-icon">🚚</span>
                        <div>
                          <span className="plate-number">Isuzu Elf</span>
                          <span className="vehicle-model">TUV-987</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="hourglass-icon">⏳</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="compliance-badge c-review">PENDING REVIEW</span></td>
                    <td><div className="maintenance-cell-data"><strong>Feb 20, 2024</strong><span className="sub-text">Next: May 20, 2024</span></div></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>

                  {/* Mitsubishi Canter */}
                  <tr className="compliance-row">
                    <td>
                      <div className="vehicle-cell-with-icon">
                        <span className="vehicle-table-icon">🚚</span>
                        <div>
                          <span className="plate-number">Mitsubishi Canter</span>
                          <span className="vehicle-model">QWE-123</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="warning-icon-alert">⚠️</span></td>
                    <td style={{ textAlign: "center" }}><span className="check-icon-valid">✓</span></td>
                    <td style={{ textAlign: "center" }}><span className="compliance-badge c-action">ACTION NEEDED</span></td>
                    <td><div className="maintenance-cell-data"><strong>Mar 05, 2024</strong><span className="sub-text">Next: Jun 05, 2024</span></div></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn">⋮</button></td>
                  </tr>
                </tbody>
              </>
            )}
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1–4 of 145 vehicles</span>
            <div className="pagination-controls">
              <button className="page-num active">1</button>
              <button className="page-num">2</button>
            </div>
          </div>
        </div>


        {/* ================= SECTION 2: DRIVERS MODULE ================= */}
        <div className="stats-grid margin-top-large">
          <div className="metric-card border-slate">
            <div className="metric-header"><h4>TOTAL DRIVERS</h4></div>
            <h2>42</h2>
            <p className="growth-indicator">Registered drivers</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header"><h4>AVAILABLE</h4></div>
            <h2>24</h2>
            <p className="growth-indicator target">Ready to dispatch</p>
          </div>
          <div className="metric-card border-orange">
            <div className="metric-header"><h4>ON LEAVE</h4></div>
            <h2>4</h2>
            <p className="growth-indicator maintenance">Currently on vacation</p>
          </div>
          <div className="metric-card border-blue">
            <div className="metric-header"><h4>ON ROUTE</h4></div>
            <h2>14</h2>
            <p className="growth-indicator transit">Currently on shipment</p>
          </div>
        </div>

        <div className="section-tab-container">
          <div className="section-titles">
            <h3>Drivers</h3>
            <p className="section-subtitle">
              {driverTab === "details" ? "REGISTERED DRIVERS AND OPERATIONAL ROUTE DATA." : "REGISTERED DRIVERS AND COMPLIANCE DOCUMENT STATUS."}
            </p>
          </div>
          <div className="tab-pill-box">
            <button 
              className={`tab-pill ${driverTab === "details" ? "active" : ""}`} 
              onClick={() => setDriverTab("details")}
              type="button"
              style={{ cursor: "pointer" }}
            >
              Details
            </button>
            <button 
              className={`tab-pill ${driverTab === "compliance" ? "active" : ""}`} 
              onClick={() => setDriverTab("compliance")}
              type="button"
              style={{ cursor: "pointer" }}
            >
              Compliance
            </button>
          </div>
        </div>

        <div className="table-filter-bar">
          <div className="filter-search-wrapper">
            <svg className="inner-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Search by ID, Vehicle Type, or Driver..." className="input-table-search" />
          </div>
          <div className="filter-actions-right">
            <button className="btn-filter"><span>SORT BY</span></button>
            <button className="btn-filter"><span>TODAY</span></button>
          </div>
        </div>

        <div className="fleet-table-card spaced-card">
          <table className="fleet-table">
            {driverTab === "details" ? (
              <>
                <thead>
                  <tr>
                    <th>DRIVER DETAILS</th>
                    <th>LICENSE INFORMATION</th>
                    <th>VEHICLE</th>
                    <th>ACTIVE SHIPMENT</th>
                    <th>CURRENT LOCATION</th>
                    <th>STATUS</th>
                    <th>COMPLIANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Jose Dela Cruz */}
                  <tr className="border-left-indicator status-on-route-row">
                    <td>
                      <div className="driver-profile-cell">
                        <img className="driver-avatar" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100" alt="Avatar" />
                        <div>
                          <div className="driver-name">Jose Dela Cruz</div>
                          <div className="sub-text">Hired Jan 2022 • <span className="tel">📞 0917-123-4567</span></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="license-cell">
                        <strong>N01-22-34981</strong>
                        <span className="green-label"><span className="check-mark">✓</span> Exp: Oct 2026</span>
                      </div>
                    </td>
                    <td><div className="vehicle-cell"><strong>Isuzu Forward</strong><span className="sub-text">ABC 123</span></div></td>
                    <td><div className="shipment-cell"><strong>SHP-NE-8042</strong><span className="sub-text">📍 Gapan City</span></div></td>
                    <td><div className="location-cell"><span className="green-dot">•</span> <strong>NLEX, km 42</strong><span className="sub-text">Live Tracking Active</span></div></td>
                    <td><span className="driver-badge badge-blue">ON ROUTE</span></td>
                    <td>
                      <div className="compliance-progress-box">
                        <span className="progress-bar-fill progress-full"></span>
                        <span className="progress-text-label text-green">4/4 ✓</span>
                      </div>
                    </td>
                  </tr>
                  {/* Ricardo Bautista */}
                  <tr className="border-left-indicator status-off-duty-row">
                    <td>
                      <div className="driver-profile-cell">
                        <img className="driver-avatar" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100" alt="Avatar" />
                        <div>
                          <div className="driver-name">Ricardo Bautista</div>
                          <div className="sub-text">Hired Mar 2023 • <span className="tel">📞 0918-987-6543</span></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="license-cell">
                        <strong>N02-23-11234</strong>
                        <span className="orange-label">⚠️ Exp: Jun 2025</span>
                      </div>
                    </td>
                    <td><span className="text-muted italic">Unassigned</span></td>
                    <td><span className="text-muted">—</span></td>
                    <td><div className="location-cell"><span className="grey-dot">•</span> <strong>Off Duty</strong><span className="sub-text">Stationary</span></div></td>
                    <td><span className="driver-badge badge-grey">OFF DUTY</span></td>
                    <td>
                      <div className="compliance-progress-box">
                        <span className="progress-bar-fill progress-warning"></span>
                        <span className="progress-text-label text-orange">3/4</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </>
            ) : (
              <>
                {/* FALLBACK PLACEHOLDER IF DRIVER COMPLIANCE COMPONENT GREW INTO ITS OWN MATRIX */}
                <thead>
                  <tr>
                    <th>DRIVER DETAILS</th>
                    <th>NBI CLEARANCE</th>
                    <th>MEDICAL CERTIFICATE</th>
                    <th>DRUG TEST</th>
                    <th>COMPLIANCE STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Jose Dela Cruz</strong></td>
                    <td><span className="check-icon-valid">✓ Valid</span></td>
                    <td><span className="check-icon-valid">✓ Valid</span></td>
                    <td><span className="check-icon-valid">✓ Cleared</span></td>
                    <td><span className="compliance-badge c-compliant">PASSED</span></td>
                  </tr>
                </tbody>
              </>
            )}
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1–4 of 42 Drivers</span>
            <div className="pagination-controls"><button className="page-num active">1</button></div>
          </div>
        </div>


        {/* ================= SECTION 3: MAINTENANCE MODULE ================= */}
        <div className="stats-grid margin-top-large">
          <div className="metric-card border-orange">
            <div className="metric-header"><h4>DUE FOR SERVICE</h4></div>
            <h2>5</h2>
            <p className="growth-indicator positive"><span className="arrow">▲</span> <strong>+2%</strong> vs last month</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header"><h4>UP TO DATE</h4></div>
            <h2>20</h2>
            <p className="growth-indicator target">50% of total fleet</p>
          </div>
          <div className="metric-card border-orange-dark">
            <div className="metric-header"><h4>IN MAINTENANCE</h4></div>
            <h2>6</h2>
            <p className="growth-indicator maintenance">Currently under maintenance</p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header"><h4>OVERDUE</h4></div>
            <h2>4</h2>
            <p className="growth-indicator transit">Currently on shipment</p>
          </div>
        </div>

        <div className="header-actions-row border-bottom-style">
          <div className="header-titles">
            <h2>Maintenance Schedule</h2>
            <p className="subtitle">SCHEDULE MAINTENANCE FOR REGISTERED VEHICLES</p>
          </div>
        </div>

        <div className="table-filter-bar">
          <div className="filter-search-wrapper">
            <svg className="inner-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Search by ID, Vehicle Type, or Driver..." className="input-table-search" />
          </div>
          <div className="filter-actions-right">
            <button className="btn-filter"><span>SORT BY</span></button>
            <button className="btn-filter"><span>TODAY</span></button>
          </div>
        </div>

        <div className="maintenance-action-row">
          <div className="tab-pill-box">
            <button className={`tab-pill ${maintenanceView === "list" ? "active" : ""}`} onClick={() => setMaintenanceView("list")}>📋 List View</button>
            <button className={`tab-pill ${maintenanceView === "calendar" ? "active" : ""}`} onClick={() => setMaintenanceView("calendar")}>📅 Calendar View</button>
          </div>
          <div className="action-buttons-group">
            <button className="btn-filter">🕒 View History</button>
            <button className="btn-primary"><span>+ Add Schedule</span></button>
            <button className="btn-filter">📥 Export CSV</button>
          </div>
        </div>

        <div className="fleet-table-card spaced-card">
          <table className="fleet-table">
            <thead>
              <tr>
                <th>VEHICLE</th>
                <th>LAST SERVICE</th>
                <th>NEXT SCHEDULED SERVICE</th>
                <th>SERVICE TYPE</th>
                <th>AVAILABILITY</th>
                <th>STATUS</th>
                <th>DOCUMENTS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1 */}
              <tr>
                <td><div className="vehicle-cell"><strong>XJ-772-L</strong><span className="sub-text">Isuzu Giga • Heavy Freight</span></div></td>
                <td><div className="service-date-cell"><strong>Oct 15, 2024</strong><span className="sub-text">48,200 km</span></div></td>
                <td><strong>Nov 15, 2024</strong></td>
                <td><span className="service-badge badge-blue-type">Oil Change</span></td>
                <td>
                  <div className="availability-status">
                    <span className="orange-dot">•</span> <strong>On Active Shipment</strong>
                    <span className="sub-text">SHP-NE-8042 • Returns Today 14:00</span>
                  </div>
                </td>
                <td><span className="m-status-pill m-green">On Schedule</span></td>
                <td><span className="doc-pill doc-warning">⚠ Emission: 30 days</span></td>
                <td><button className="action-dot-btn">⋮</button></td>
              </tr>
              {/* Row 2 */}
              <tr>
                <td><div className="vehicle-cell"><strong>KL-990-P</strong><span className="sub-text">Hino 500 • Refrigerated</span></div></td>
                <td><div className="service-date-cell"><strong>Aug 10, 2024</strong><span className="sub-text">61,000 km</span></div></td>
                <td><strong className="text-red">Oct 10, 2024</strong></td>
                <td><span className="service-badge badge-red-type">Brake Inspection</span></td>
                <td><div><span className="red-dot">•</span> <strong className="text-red">Not Available</strong></div></td>
                <td><span className="m-status-pill m-red">On Maintenance</span></td>
                <td><div className="doc-stack"><span className="doc-pill doc-danger">• OR/CR Expired</span><span className="doc-pill doc-danger">• LTFRB Expired</span></div></td>
                <td><button className="action-dot-btn">⋮</button></td>
              </tr>
            </tbody>
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1-4 of 10 Schedules</span>
            <div className="pagination-controls"><button className="page-num active">1</button></div>
          </div>
        </div>

      </section>
    </MainLayout>
  );
}