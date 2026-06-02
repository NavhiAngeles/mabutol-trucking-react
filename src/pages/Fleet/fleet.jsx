// fleet.jsx
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
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              <span>+ Register Driver</span>
            </button>
            <button className="btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <span>+ Add Vehicle</span>
            </button>
          </div>
        </div>

        {/* Vehicles Cards Metrics row */}
        <div className="stats-grid">
          <div className="metric-card border-slate">
            <div className="metric-header">
              <h4>TOTAL VEHICLES</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <h2>36</h2>
            <p className="growth-indicator positive"><span className="arrow">↗</span> <strong>+2%</strong> vs last month</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>AVAILABLE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2>18</h2>
            <p className="growth-indicator target">50% of total fleet</p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header">
              <h4>IN MAINTENANCE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
            </div>
            <h2>4</h2>
            <p className="growth-indicator maintenance">Currently under maintenance</p>
          </div>
          <div className="metric-card border-blue-accent">
            <div className="metric-header">
              <h4>IN TRANSIT</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
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
              {vehicleTab === "details" ? "REGISTERED FLEET VEHICLES AND COMPLIANCE STATUS." : "REGISTERED FLEET VEHICLES AND COMPLIANCE DOCUMENT STATUS."}
            </p>
          </div>
          <div className="tab-pill-box">
            <button
              className={`tab-pill ${vehicleTab === "details" ? "active" : ""}`}
              onClick={() => setVehicleTab("details")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              Details
            </button>
            <button
              className={`tab-pill ${vehicleTab === "compliance" ? "active" : ""}`}
              onClick={() => setVehicleTab("compliance")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
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
            <button className="btn-filter">
              <span>SORT BY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
            </button>
            <button className="btn-filter">
              <span>TODAY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </button>
            <button className="btn-filter-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
          </div>
        </div>

        {/* Vehicles Datatable layout matrix */}
        <div className="fleet-table-card spaced-card">
          <table className="fleet-table">
            {vehicleTab === "details" ? (
              <>
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
                    <td className="font-medium text-primary">Ramon Cruz</td>
                    <td>
                      <div className="assignment-cell">
                        <span className="shp-link">SHP-NE-8042</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        <span className="location-text">Gapan City</span>
                      </div>
                    </td>
                    <td><span className="status-pill status-transit"><span className="dot"></span>IN TRANSIT</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn"> ⋮ </button></td>
                  </tr>
                  <tr>
                    <td><div className="vehicle-cell"><span className="plate-number">AB-123-C</span><span className="vehicle-model">2021 Toyota Hi-Ace</span></div></td>
                    <td className="text-secondary">Delivery Van, 1,500 kg</td>
                    <td><div className="tag-badges"><span className="badge-tag">GENERAL</span></div></td>
                    <td className="text-muted italic font-medium">Unassigned</td>
                    <td>
                      <div className="assignment-cell">
                        <span className="shp-link">SHP-NE-8042</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        <span className="location-text">Gapan City</span>
                      </div>
                    </td>
                    <td><span className="status-pill status-available"><span className="dot"></span>AVAILABLE</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn"> ⋮ </button></td>
                  </tr>
                  <tr>
                    <td><div className="vehicle-cell"><span className="plate-number">KL-990-P</span><span className="vehicle-model">2018 Mitsubishi Canter</span></div></td>
                    <td className="text-secondary">Refrigerated, 5,000 kg</td>
                    <td>
                      <div className="tag-badges">
                        <span className="badge-tag badge-cold">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '2px', verticalAlign: 'middle'}}><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="4.93" y1="19.07" x2="19.07" y2="4.93"></line></svg>
                          COLD CHAIN
                        </span>
                        <span className="badge-tag">GENERAL</span>
                      </div>
                    </td>
                    <td className="font-medium text-primary">Ana Bautista</td>
                    <td>
                      <div className="assignment-cell">
                        <span className="shp-link">SHP-NE-8042</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        <span className="location-text">Gapan City</span>
                      </div>
                    </td>
                    <td><span className="status-pill status-maintenance"><span className="dot"></span>UNDER MAINTENANCE</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn"> ⋮ </button></td>
                  </tr>
                  <tr>
                    <td><div className="vehicle-cell"><span className="plate-number">AA-554-Q</span><span className="vehicle-model">2020 Hino 500</span></div></td>
                    <td className="text-secondary">Flatbed, 12,000 kg</td>
                    <td><div className="tag-badges"><span className="badge-tag">FLATBED</span><span className="badge-tag">BULK</span><span className="badge-tag">GENERAL</span></div></td>
                    <td className="font-medium text-primary">Carlo Reyes</td>
                    <td>
                      <div className="assignment-cell">
                        <span className="shp-link">SHP-NE-8042</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        <span className="location-text">Gapan City</span>
                      </div>
                    </td>
                    <td><span className="status-pill status-idle"><span className="dot"></span>IDLE</span></td>
                    <td style={{ textAlign: "center" }}><button className="action-dot-btn"> ⋮ </button></td>
                  </tr>
                </tbody>
              </>
            ) : null}
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1–4 of 145 vehicles</span>
            <div className="pagination-controls">
              <button className="page-nav-arrow" disabled>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button className="page-num active">1</button>
              <button className="page-num">2</button>
              <button className="page-num">3</button>
              <span className="page-ellipsis">...</span>
              <button className="page-num">37</button>
              <button className="page-nav-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ================= SECTION 2: DRIVERS OVERVIEW ================= */}
        <div className="stats-grid" style={{ marginTop: "40px" }}>
          <div className="metric-card border-slate">
            <div className="metric-header">
              <h4>TOTAL DRIVERS</h4>
              <h2>42</h2>
            </div>
            <p className="growth-indicator">Registered drivers</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>AVAILABLE</h4>
              <h2>24</h2>
            </div>
            <p className="growth-indicator target">Ready to dispatch</p>
          </div>
          <div className="metric-card border-orange">
            <div className="metric-header">
              <h4>ON LEAVE</h4>
              <h2>4</h2>
            </div>
            <p className="growth-indicator maintenance">Currently on vacation</p>
          </div>
          <div className="metric-card border-blue-accent">
            <div className="metric-header">
              <h4>ON ROUTE</h4>
              <h2>14</h2>
            </div>
            <p className="growth-indicator transit">Currently on shipment</p>
          </div>
        </div>

        {/* Drivers Tab Controller */}
        <div className="section-tab-container">
          <div className="section-titles">
            <h3>Drivers</h3>
            <p className="section-subtitle">REGISTERED DRIVERS AND COMPLIANCE DOCUMENT STATUS.</p>
          </div>
          <div className="tab-pill-box">
            <button
              className={`tab-pill ${driverTab === "details" ? "active" : ""}`}
              onClick={() => setDriverTab("details")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              Details
            </button>
            <button
              className={`tab-pill ${driverTab === "compliance" ? "active" : ""}`}
              onClick={() => setDriverTab("compliance")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Compliance
            </button>
          </div>
        </div>

        {/* Drivers Table Filters */}
        <div className="table-filter-bar">
          <div className="filter-search-wrapper">
            <svg className="inner-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Search by ID, Vehicle Type, or Driver..." className="input-table-search" />
          </div>
          <div className="filter-actions-right">
            <button className="btn-filter">
              <span>SORT BY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
            </button>
            <button className="btn-filter">
              <span>TODAY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </button>
            <button className="btn-filter-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
          </div>
        </div>

        {/* Drivers Datatable Matrix */}
        <div className="fleet-table-card spaced-card">
          <table className="fleet-table text-left-rows">
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
              <tr className="border-left-orange-active">
                <td>
                  <div className="driver-profile-cell">
                    <img className="driver-avatar-img" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80" alt="Jose Dela Cruz" />
                    <div>
                      <span className="driver-name-span">Jose Dela Cruz</span>
                      <span className="driver-meta-subtext">Hired Jan 2022 • 📞 0917-123-4567</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="license-info-block">
                    <strong>N01-22-34981</strong>
                    <span className="license-status-success"><span className="checkmark">✔</span> Exp: Oct 2026</span>
                  </div>
                </td>
                <td><div className="vehicle-cell"><span className="text-primary font-semibold">Isuzu Forward</span><span className="text-muted text-xs">ABC 123</span></div></td>
                <td>
                  <div className="shipment-active-block">
                    <strong>SHP-NE-8042</strong>
                    <span className="shipment-sub-location"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '2px'}}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>Gapan City</span>
                  </div>
                </td>
                <td>
                  <div className="current-location-block">
                    <span className="loc-dot-green"></span>
                    <div>
                      <strong>NLEX, km 42</strong>
                      <span className="live-tracking-pill">Live Tracking Active</span>
                    </div>
                  </div>
                </td>
                <td><span className="status-badge-blue">ON ROUTE</span></td>
                <td>
                  <div className="compliance-progress-wrapper">
                    <div className="progress-bar-container"><div className="progress-bar-fill fill-green" style={{ width: "100%" }}></div></div>
                    <span className="compliance-ratio-text text-green font-semibold">4/4 ✔</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div className="driver-profile-cell">
                    <img className="driver-avatar-img" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80" alt="Ricardo Bautista" />
                    <div>
                      <span className="driver-name-span">Ricardo Bautista</span>
                      <span className="driver-meta-subtext">Hired Mar 2023 • 📞 0918-987-6543</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="license-info-block">
                    <strong>N02-23-11234</strong>
                    <span className="license-status-warning">⚠️ Exp: Jun 2025</span>
                  </div>
                </td>
                <td><span className="text-muted italic">Unassigned</span></td>
                <td><span className="text-muted">—</span></td>
                <td>
                  <div className="current-location-block">
                    <span className="loc-dot-grey"></span>
                    <div>
                      <strong>Off Duty</strong>
                      <span className="live-tracking-pill text-muted">Stationary</span>
                    </div>
                  </div>
                </td>
                <td><span className="status-badge-grey">OFF DUTY</span></td>
                <td>
                  <div className="compliance-progress-wrapper">
                    <div className="progress-bar-container"><div className="progress-bar-fill fill-orange" style={{ width: "75%" }}></div></div>
                    <span className="compliance-ratio-text text-orange font-semibold">3/4</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div className="driver-profile-cell">
                    <img className="driver-avatar-img" src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80" alt="Manuel Pascual" />
                    <div>
                      <span className="driver-name-span">Manuel Pascual</span>
                      <span className="driver-meta-subtext">Hired Aug 2021 • 📞 0920-456-7890</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="license-info-block">
                    <strong>N01-21-88421</strong>
                    <span className="license-status-muted">📅 Exp: Dec 2027</span>
                  </div>
                </td>
                <td><span className="text-muted italic">Unassigned</span></td>
                <td><span className="text-muted">—</span></td>
                <td>
                  <div className="current-location-block">
                    <span className="loc-dot-orange"></span>
                    <div>
                      <strong>On Leave</strong>
                      <span className="live-tracking-pill text-muted">N/A</span>
                    </div>
                  </div>
                </td>
                <td><span className="status-badge-orange">LEAVE</span></td>
                <td>
                  <div className="compliance-progress-wrapper">
                    <div className="progress-bar-container"><div className="progress-bar-fill fill-orange" style={{ width: "50%" }}></div></div>
                    <span className="compliance-ratio-text text-orange font-semibold">2/4</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div className="driver-profile-cell">
                    <img className="driver-avatar-img" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" alt="Antonio Luna" />
                    <div>
                      <span className="driver-name-span">Antonio Luna</span>
                      <span className="driver-meta-subtext">Hired May 2022 • 📞 0922-321-0987</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="license-info-block">
                    <strong>N01-19-445566</strong>
                    <span className="license-status-success"><span className="checkmark">✔</span> Exp: Dec 2026</span>
                  </div>
                </td>
                <td><div className="vehicle-cell"><span className="text-primary font-semibold">Isuzu Giga</span><span className="text-muted text-xs">DEF 456</span></div></td>
                <td>
                  <div className="shipment-active-block">
                    <strong>SHP-NE-8045</strong>
                    <span className="shipment-sub-location"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '2px'}}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>Palayan City</span>
                  </div>
                </td>
                <td>
                  <div className="current-location-block">
                    <span className="loc-dot-green"></span>
                    <div>
                      <strong>Cabanatuan Hub</strong>
                      <span className="live-tracking-pill">Live Tracking Active</span>
                    </div>
                  </div>
                </td>
                <td><span className="status-badge-blue">ON ROUTE</span></td>
                <td>
                  <div className="compliance-progress-wrapper">
                    <div className="progress-bar-container"><div className="progress-bar-fill fill-green" style={{ width: "100%" }}></div></div>
                    <span className="compliance-ratio-text text-green font-semibold">4/4 ✔</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1–4 of 42 Drivers</span>
            <div className="pagination-controls">
              <button className="page-nav-arrow" disabled>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button className="page-num active">1</button>
              <button className="page-num">2</button>
              <button className="page-num">3</button>
              <span className="page-ellipsis">...</span>
              <button className="page-nav-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ================= SECTION 3: MAINTENANCE OVERVIEW ================= */}
        <div className="stats-grid" style={{ marginTop: "40px" }}>
          <div className="metric-card border-orange">
            <div className="metric-header">
              <h4>DUE FOR SERVICE</h4>
              <h2>5</h2>
            </div>
            <p className="growth-indicator positive"><span className="arrow">↗</span> <strong>+2%</strong> vs last month</p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>UP TO DATE</h4>
              <h2>20</h2>
            </div>
            <p className="growth-indicator target">50% of total fleet</p>
          </div>
          <div className="metric-card border-orange">
            <div className="metric-header">
              <h4>IN MAINTENANCE</h4>
              <h2>6</h2>
            </div>
            <p className="growth-indicator maintenance">Currently under maintenance</p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header">
              <h4>OVERDUE</h4>
              <h2>4</h2>
            </div>
            <p className="growth-indicator transit">Currently on shipment</p>
          </div>
        </div>

        {/* Maintenance Schedule Layout Controller */}
        <div className="section-tab-container">
          <div className="section-titles">
            <h3>Maintenance Schedule</h3>
            <p className="section-subtitle">SCHEDULE MAINTENANCE FOR REGISTERED VEHICLES</p>
          </div>
          <div className="tab-pill-box">
            <button
              className={`tab-pill ${maintenanceView === "list" ? "active" : ""}`}
              onClick={() => setMaintenanceView("list")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              List View
            </button>
            <button
              className={`tab-pill ${maintenanceView === "calendar" ? "active" : ""}`}
              onClick={() => setMaintenanceView("calendar")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              Calendar View
            </button>
          </div>
        </div>

        {/* Maintenance Filters row */}
        <div className="table-filter-bar">
          <div className="filter-search-wrapper">
            <svg className="inner-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Search by ID, Vehicle Type, or Driver..." className="input-table-search" />
          </div>
          <div className="filter-actions-right">
            <button className="btn-filter">
              <span>SORT BY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
            </button>
            <button className="btn-filter">
              <span>TODAY</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </button>
            <button className="btn-filter-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
          </div>
        </div>

        {/* Secondary Maintenance Sub-action-buttons row */}
        <div className="maintenance-sub-actions-bar" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "16px" }}>
          <button className="btn-filter" style={{ height: "36px" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M12 20v-6M9 17h6M4 4h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"></path></svg>
            <span>View History</span>
          </button>
          <button className="btn-primary" style={{ padding: "8px 14px", height: "36px" }}>
            <span>+ Add Schedule</span>
          </button>
          <button className="btn-filter" style={{ height: "36px" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
            <span>Export CSV</span>
          </button>
        </div>

        {/* Maintenance Schedule Table view */}
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
              <tr>
                <td><div className="vehicle-cell"><strong>XJ-772-L</strong><span className="sub-text">Isuzu Giga • Heavy Freight</span></div></td>
                <td><div className="service-date-cell"><strong>Oct 15, 2024</strong><span className="sub-text">48,200 km</span></div></td>
                <td><strong>Nov 15, 2024</strong></td>
                <td><span className="service-badge badge-blue-type">Oil Change</span></td>
                <td>
                  <div className="m-availability-cell">
                    <span className="loc-dot-orange"></span>
                    <div>
                      <strong>On Active Shipment</strong>
                      <span className="sub-text">SHP-NE-8042 • Returns Today 14:00</span>
                    </div>
                  </div>
                </td>
                <td><span className="doc-pill doc-success">● On Schedule</span></td>
                <td><span className="doc-pill doc-warning">⚠ Emission: 30 days</span></td>
                <td><button className="action-dot-btn"> ⋮ </button></td>
              </tr>
              <tr>
                <td><div className="vehicle-cell"><strong>AB-123-C</strong><span className="sub-text">Ford Transit • Delivery Van</span></div></td>
                <td><div className="service-date-cell"><strong>Aug 20, 2024</strong><span className="sub-text">32,100 km</span></div></td>
                <td><strong>Oct 28, 2024</strong></td>
                <td><span className="service-badge badge-blue-type">Full Service</span></td>
                <td>
                  <div className="m-availability-cell">
                    <span className="loc-dot-blue"></span>
                    <div>
                      <strong>Available for Service</strong>
                    </div>
                  </div>
                </td>
                <td><span className="doc-pill doc-warning">● Due Soon</span></td>
                <td><span className="doc-pill doc-success">● All Valid</span></td>
                <td><button className="action-dot-btn"> ⋮ </button></td>
              </tr>
              <tr>
                <td><div className="vehicle-cell"><strong>KL-990-P</strong><span className="sub-text">Hino 500 • Refrigerated</span></div></td>
                <td><div className="service-date-cell"><strong>Aug 10, 2024</strong><span className="sub-text">61,000 km</span></div></td>
                <td><strong className="text-red">Oct 10, 2024</strong></td>
                <td><span className="service-badge badge-red-type">Brake Inspection</span></td>
                <td>
                  <div className="m-availability-cell">
                    <span className="loc-dot-red"></span>
                    <div>
                      <strong className="text-red">Not Available</strong>
                    </div>
                  </div>
                </td>
                <td><span className="doc-pill doc-danger">● On Maintenance</span></td>
                <td>
                  <div className="multi-doc-pills">
                    <span className="doc-pill doc-danger">● OR/CR Expired</span>
                    <span className="doc-pill doc-danger">● LTFRB Expired</span>
                  </div>
                </td>
                <td><button className="action-dot-btn"> ⋮ </button></td>
              </tr>
              <tr>
                <td><div className="vehicle-cell"><strong>AA-554-Q</strong><span className="sub-text">Isuzu Elf • Flatbed</span></div></td>
                <td><div className="service-date-cell"><strong>Sep 28, 2024</strong><span className="sub-text">44,500 km</span></div></td>
                <td><span className="text-muted">Not Scheduled</span></td>
                <td><span className="text-muted">Not Scheduled</span></td>
                <td>
                  <div className="m-availability-cell">
                    <span className="loc-dot-blue"></span>
                    <div>
                      <strong>Available for Service</strong>
                    </div>
                  </div>
                </td>
                <td><span className="doc-pill doc-slate">Not Scheduled</span></td>
                <td><span className="doc-pill doc-success">● All Valid</span></td>
                <td><button className="action-dot-btn"> ⋮ </button></td>
              </tr>
            </tbody>
          </table>
          <div className="table-pagination-footer">
            <span className="results-count">Showing 1–4 of 10 Schedules</span>
            <div className="pagination-controls">
              <button className="page-nav-arrow" disabled>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button className="page-num active">1</button>
              <button className="page-num">2</button>
              <button className="page-num">3</button>
              <span className="page-ellipsis">...</span>
              <button className="page-nav-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}