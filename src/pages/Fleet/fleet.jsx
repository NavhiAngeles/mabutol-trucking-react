/* 
This file combines updated Fleet.jsx and fleet.css.
Note (from provided design doc): "This is our figma design and this opens when he click '+ register driver'." 
Note (from provided design doc): "In the '+add vehicle' this shows when he click"
*/

/////////////////////////
// Fleet.jsx (updated) //
/////////////////////////

import { useState, useRef, useEffect } from "react";
import MainLayout from "../../layouts/mainLayout";
import "./fleet.css";

export default function Fleet() {
  // Tab and Subview States
  const [vehicleTab, setVehicleTab] = useState("details");
  const [driverTab, setDriverTab] = useState("details");
  const [maintenanceView, setMaintenanceView] = useState("list");

  // Multi-step Modal States
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverStep, setDriverStep] = useState(1); // 1: Info, 2: Documents, 3: Success
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleStep, setVehicleStep] = useState(1); // 1: Info, 2: Compliance Docs, 3: Success

  // Form Field States
  const [driverForm, setDriverForm] = useState({
    fullName: "",
    contactNumber: "",
    dateHired: "",
    assignVehicle: "",
    emergencyContact: "",
    licenseNumber: "",
    licenseExpiry: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: "",
    model: "",
    type: "",
    capacity: "",
    cargoCompatibility: ""
  });

  // Maintenance schedule data (new/updated)
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([
    {
      id: 1,
      plate: "ABC 1234",
      vehicle: "Isuzu Forward",
      category: "Engine Oil Replacement & Brake Check Calibration",
      date: "2026-06-12",
      workshop: "Manila North Logistics Hub Center",
      urgency: "ROUTINE",
      createdAt: "2026-05-20T09:00:00"
    },
    {
      id: 2,
      plate: "XJ-772-L",
      vehicle: "2019 Isuzu Giga",
      category: "Transmission Box Diagnostic Overhaul",
      date: "2026-06-05",
      workshop: "Bulacan Central Fleet Yard",
      urgency: "URGENT",
      createdAt: "2026-05-18T14:30:00"
    }
  ]);

  // History & Add Schedule Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    plate: "",
    vehicle: "",
    category: "",
    date: "",
    workshop: "",
    urgency: "ROUTINE"
  });

  // Refs for focusing inputs (for "register driver" behavior like Figma)
  const driverFirstInputRef = useRef(null);
  const addScheduleFirstRef = useRef(null);

  // Handler functions for cleaning state resets on open
  const handleRegisterDriverClick = () => {
    // Matches Figma: reset to step 1, open modal, focus first input
    setDriverStep(1);
    setIsDriverModalOpen(true);
    // small timeout to ensure modal rendered before focus
    setTimeout(() => {
      driverFirstInputRef.current?.focus();
    }, 50);
  };

  const handleAddVehicleClick = () => {
    setVehicleStep(1);
    setIsVehicleModalOpen(true);
  };

  const handleDriverInputChange = (e, field) => {
    setDriverForm({ ...driverForm, [field]: e.target.value });
  };

  const handleVehicleInputChange = (e, field) => {
    setVehicleForm({ ...vehicleForm, [field]: e.target.value });
  };

  // Maintenance schedule functions
  const openHistory = () => {
    setIsHistoryOpen(true);
  };

  const openAddSchedule = () => {
    setNewSchedule({
      plate: "",
      vehicle: "",
      category: "",
      date: "",
      workshop: "",
      urgency: "ROUTINE"
    });
    setIsAddScheduleOpen(true);
    setTimeout(() => {
      addScheduleFirstRef.current?.focus();
    }, 50);
  };

  const saveNewSchedule = () => {
    if (!newSchedule.plate || !newSchedule.date) {
      // minimal validation
      alert("Please provide at least plate and date.");
      return;
    }
    const id = maintenanceSchedules.length ? Math.max(...maintenanceSchedules.map(s => s.id)) + 1 : 1;
    setMaintenanceSchedules([
      ...maintenanceSchedules,
      { ...newSchedule, id, createdAt: new Date().toISOString() }
    ]);
    setIsAddScheduleOpen(false);
    setMaintenanceView("list");
  };

  const exportMaintenanceCSV = () => {
    if (!maintenanceSchedules.length) {
      alert("No maintenance schedules to export.");
      return;
    }
    const headers = ["ID", "Plate", "Vehicle", "Category", "Date", "Workshop", "Urgency", "CreatedAt"];
    const rows = maintenanceSchedules.map(s => [
      s.id,
      s.plate,
      s.vehicle,
      s.category,
      s.date,
      s.workshop,
      s.urgency,
      s.createdAt
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance_schedules_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Small helper to format date for display
  const formatDateDisplay = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  // JSX render
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
        {/* HEADER ACTIONS BLOCK */}
        <div className="header-actions-row">
          <div className="header-titles">
            <h2>Fleet Management Overview</h2>
            <p className="subtitle">MANAGE YOUR FLEET, DRIVERS, COMPLIANCE DOCUMENTS, AND MAINTENANCE SCHEDULES.</p>
          </div>

          <div className="action-buttons-group">
            <button className="btn-secondary" onClick={handleRegisterDriverClick}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              <span>+ Register Driver</span>
            </button>

            <button className="btn-primary" onClick={handleAddVehicleClick}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <span>+ Add Vehicle</span>
            </button>
          </div>
        </div>

        {/* METRICS ROW */}
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

        {/* ================= SECTION 1: VEHICLES SECTION ================= */}
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

        {vehicleTab === "details" ? (
          <>
            <div className="table-filter-bar">
              <div className="filter-search-wrapper">
                <input type="text" className="inner-search" placeholder="Search by plate, vehicle type..." />
              </div>
            </div>

            <table className="premium-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>TYPE & CAPACITY</th>
                  <th>CARGO COMPATIBILITY</th>
                  <th>ASSIGNED DRIVER</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>XJ-772-L</strong><br/><span className="subtext">2019 Isuzu Giga</span></td>
                  <td>Heavy Freight, 15,000 kg</td>
                  <td><span className="badge">GENERAL</span> <span className="badge">BULK</span></td>
                  <td>Ramon Cruz</td>
                  <td><span className="status-pill status-transit">● IN TRANSIT</span></td>
                  <td><button className="action-dot-btn">⋮</button></td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="table-filter-bar">
              <div className="filter-search-wrapper">
                <input type="text" className="inner-search" placeholder="Search compliance by plate..." />
              </div>
            </div>

            <table className="premium-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>OR/CR REGISTRATION</th>
                  <th>LTFRB PERMIT</th>
                  <th>EMISSION TEST</th>
                  <th>COMPLIANCE STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>XJ-772-L</strong><br/><span className="subtext">2019 Isuzu Giga</span></td>
                  <td><span className="doc-pill doc-success">Valid (Dec 15, 2026)</span></td>
                  <td><span className="doc-pill doc-warning">Expiring Soon</span></td>
                  <td><span className="doc-pill doc-success">Valid</span></td>
                  <td><span className="status-pill status-active">● Verified</span></td>
                  <td><button className="action-dot-btn">⋮</button></td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* ================= SECTION 2: DRIVERS SECTION ================= */}
        <div className="section-tab-container" style={{ marginTop: "40px" }}>
          <div className="section-titles">
            <h3>Drivers</h3>
            <p className="section-subtitle">
              {driverTab === "details" ? "REGISTERED DRIVERS AND SYSTEM ROSTERS." : "DETAILED COMPLIANCE METRICS AND EXPIRY TRACKING."}
            </p>
          </div>

          <div className="tab-pill-box">
            <button
              className={`tab-pill ${driverTab === "details" ? "active" : ""}`}
              onClick={() => setDriverTab("details")}
              type="button"
            >
              Details
            </button>

            <button
              className={`tab-pill ${driverTab === "compliance" ? "active" : ""}`}
              onClick={() => setDriverTab("compliance")}
              type="button"
            >
              Compliance
            </button>
          </div>
        </div>

        {driverTab === "details" ? (
          <table className="premium-table">
            <thead>
              <tr>
                <th>DRIVER DETAILS</th>
                <th>LICENSE INFORMATION</th>
                <th>VEHICLE</th>
                <th>CURRENT LOCATION</th>
                <th>STATUS</th>
                <th>COMPLIANCE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Jose Dela Cruz</strong><br/><span className="subtext">0917-123-4567</span></td>
                <td>N01-22-34981<br/><span className="subtext text-success">Exp: Oct 2026</span></td>
                <td>Isuzu Forward (ABC 123)</td>
                <td>NLEX, km 42</td>
                <td><span className="status-pill status-transit">ON ROUTE</span></td>
                <td><span className="text-success">4/4 Verified</span></td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>DRIVER DETAILS</th>
                <th>DRIVERS LICENCE</th>
                <th>MEDICAL CERTIFICATE</th>
                <th>NBI CLEARANCE</th>
                <th>OVERALL STATUS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Jose Dela Cruz</strong></td>
                <td><span className="doc-pill doc-success">Valid</span></td>
                <td><span className="doc-pill doc-success">Valid</span></td>
                <td><span className="doc-pill doc-warning">Pending Renewal</span></td>
                <td><span className="status-pill status-active">● Compliant</span></td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ================= SECTION 3: MAINTENANCE SCHEDULE (RESTORED PANEL) ================= */}
        <div className="section-tab-container" style={{ marginTop: "40px" }}>
          <div className="section-titles">
            <h3>Maintenance Schedule</h3>
            <p className="section-subtitle">MONITOR PREVENTIVE SERVICE RUNS AND CRITICAL MECHANICAL REPAIRS.</p>
          </div>

          <div className="tab-pill-box">
            <button
              className={`tab-pill ${maintenanceView === "list" ? "active" : ""}`}
              onClick={() => setMaintenanceView("list")}
              type="button"
            >
              List View
            </button>

            <button
              className={`tab-pill ${maintenanceView === "calendar" ? "active" : ""}`}
              onClick={() => setMaintenanceView("calendar")}
              type="button"
            >
              Calendar View
            </button>
          </div>
        </div>

        {maintenanceView === "list" ? (
          <table className="premium-table">
            <thead>
              <tr>
                <th>VEHICLE</th>
                <th>SERVICE CATEGORY</th>
                <th>SCHEDULED DATE</th>
                <th>ASSIGNED WORKSHOP</th>
                <th>URGENCY STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceSchedules.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.plate}</strong><br/><span className="subtext">{s.vehicle}</span></td>
                  <td>{s.category}</td>
                  <td>{formatDateDisplay(s.date)}</td>
                  <td>{s.workshop}</td>
                  <td><span className={`status-pill ${s.urgency === "URGENT" ? "status-warning" : "status-active"}`}>{s.urgency}</span></td>
                  <td><button className="action-dot-btn">⋮</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="calendar-mock-container">
            <div className="calendar-header-mock">
              <h4>June 2026</h4>

              <div className="calendar-actions">
                <div className="calendar-nav-mock">
                  <button type="button">&lt;</button>
                  <button type="button">Today</button>
                  <button type="button">&gt;</button>
                </div>

                {/* NEW: three buttons beside calendar view per Figma */}
                <div className="calendar-action-buttons">
                  <button className="btn-secondary small" onClick={openHistory}>View History</button>
                  <button className="btn-primary small" onClick={openAddSchedule}>Add Schedule</button>
                  <button className="btn-secondary small" onClick={exportMaintenanceCSV}>Export CSV</button>
                </div>
              </div>
            </div>

            <div className="calendar-grid-mock">
              <div className="calendar-day-header">Sun</div>
              <div className="calendar-day-header">Mon</div>
              <div className="calendar-day-header">Tue</div>
              <div className="calendar-day-header">Wed</div>
              <div className="calendar-day-header">Thu</div>
              <div className="calendar-day-header">Fri</div>
              <div className="calendar-day-header">Sat</div>

              {/* Row 1 Mock Days */}
              <div className="calendar-day text-muted">31</div>
              <div className="calendar-day">1</div>
              <div className="calendar-day">2</div>
              <div className="calendar-day">3</div>
              <div className="calendar-day">4</div>
              <div className="calendar-day event-urgent">
                5<div className="day-event-tag">XJ-772-L Repair</div>
              </div>
              <div className="calendar-day">6</div>

              {/* Row 2 Mock Days */}
              <div className="calendar-day">7</div>
              <div className="calendar-day">8</div>
              <div className="calendar-day">9</div>
              <div className="calendar-day">10</div>
              <div className="calendar-day">11</div>
              <div className="calendar-day event-routine">
                12<div className="day-event-tag">ABC 1234 Oil</div>
              </div>
              <div className="calendar-day">13</div>
            </div>
          </div>
        )}
      </section>

      {/* ================= REGISTER DRIVER MULTI-STEP MODAL ================= */}
      {isDriverModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <div>
                <h3>Register New Driver</h3>
                <p className="modal-subtitle">
                  {driverStep === 1 && "Basic Information"}
                  {driverStep === 2 && "Document Control Upload"}
                  {driverStep === 3 && "Registration Executed"}
                </p>
              </div>
              <button className="close-modal-btn" onClick={() => setIsDriverModalOpen(false)}>×</button>
            </div>

            <div className="modal-steps-indicator">
              <span className={`step-badge ${driverStep === 1 ? "active" : ""}`}>1 Driver Info</span>
              <span className="step-line"></span>
              <span className={`step-badge ${driverStep === 2 ? "active" : ""}`}>2 Documents</span>
              <span className="step-line"></span>
              <span className={`step-badge ${driverStep === 3 ? "active" : ""}`}>3 Completed</span>
            </div>

            <div className="modal-body">
              {driverStep === 1 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>FULL NAME *</label>
                    <input ref={driverFirstInputRef} type="text" placeholder="e.g. Juan dela Cruz" value={driverForm.fullName} onChange={(e) => handleDriverInputChange(e, 'fullName')} />
                  </div>

                  <div className="form-group">
                    <label>CONTACT NUMBER *</label>
                    <input type="text" placeholder="09XX XXX XXXX" value={driverForm.contactNumber} onChange={(e) => handleDriverInputChange(e, 'contactNumber')} />
                  </div>

                  <div className="form-group">
                    <label>DATE HIRED *</label>
                    <input type="date" value={driverForm.dateHired} onChange={(e) => handleDriverInputChange(e, 'dateHired')} />
                  </div>

                  <div className="form-group">
                    <label>ASSIGN VEHICLE</label>
                    <select value={driverForm.assignVehicle} onChange={(e) => handleDriverInputChange(e, 'assignVehicle')}>
                      <option value="">Select vehicle...</option>
                      <option value="xj772l">Isuzu Giga (XJ-772-L)</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>EMERGENCY CONTACT NUMBER</label>
                    <input type="text" placeholder="09XX XXX XXXX" value={driverForm.emergencyContact} onChange={(e) => handleDriverInputChange(e, 'emergencyContact')} />
                  </div>

                  <div className="form-divider-title">License Information</div>

                  <div className="form-group">
                    <label>LICENSE NUMBER <span className="auto-fill-hint">⚡ Auto-fill ready</span></label>
                    <input type="text" placeholder="N01-23-45678" value={driverForm.licenseNumber} onChange={(e) => handleDriverInputChange(e, 'licenseNumber')} />
                  </div>

                  <div className="form-group">
                    <label>LICENSE EXPIRY <span className="auto-fill-hint">⚡ Auto-fill ready</span></label>
                    <input type="date" value={driverForm.licenseExpiry} onChange={(e) => handleDriverInputChange(e, 'licenseExpiry')} />
                  </div>

                  <div className="form-section-box">
                    <h4>Driver Mobile Application Account</h4>

                    <div className="form-group full-width">
                      <label>EMAIL ADDRESS *</label>
                      <input type="email" placeholder="driver@tanawlogistics.com" value={driverForm.email} onChange={(e) => handleDriverInputChange(e, 'email')} />
                    </div>

                    <div className="form-group">
                      <label>TEMPORARY PASSWORD *</label>
                      <input type="password" placeholder="........" value={driverForm.password} onChange={(e) => handleDriverInputChange(e, 'password')} />
                    </div>

                    <div className="form-group">
                      <label>CONFIRM PASSWORD *</label>
                      <input type="password" placeholder="........" value={driverForm.confirmPassword} onChange={(e) => handleDriverInputChange(e, 'confirmPassword')} />
                    </div>

                    <p className="notice-text">ℹ System configuration enforces forced password update sequences on initial platform access.</p>
                  </div>
                </div>
              )}

              {driverStep === 2 && (
                <div className="documents-upload-container">
                  <p className="info-banner">⚡ Document scanner extracts validation sequences and expiry bounds immediately on upload.</p>

                  <div className="avatar-upload-zone">
                    <div className="avatar-placeholder-box">📷</div>
                    <p>Driver Profile Identification Photo<br/><span className="subtext">PNG, JPG format up to 2MB allowed limits</span></p>
                  </div>

                  <div className="upload-cards-grid">
                    <div className="upload-card required">
                      <h4>PROFESSIONAL DRIVER'S LICENSE <span className="req-label">REQUIRED</span></h4>
                      <div className="uploaded-file-row">
                        <span>mark_lorenzo_license_doc.png</span>
                        <span className="auto-fill-msg">✓ OCR Verification Complete: N01-22-34981</span>
                      </div>
                    </div>

                    <div className="upload-card required">
                      <h4>MEDICAL CLEARANCE CERTIFICATE <span className="req-label">REQUIRED</span></h4>
                      <div className="uploaded-file-row">
                        <span>mark_lorenzo_medical_fit.png</span>
                        <span className="auto-fill-msg">✓ OCR Parsed: Exp July 25, 2026</span>
                      </div>
                    </div>

                    <div className="upload-card optional">
                      <h4>NATIONAL BUREAU OF INVESTIGATION (NBI) CLEARANCE <span className="opt-label">OPTIONAL</span></h4>
                      <div className="dropzone-box">
                        <p>Drag and drop or click to allocate digital document copies</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {driverStep === 3 && (
                <div className="success-modal-view">
                  <div className="success-icon-circle">✓</div>
                  <h2>Driver Registered Successfully</h2>
                  <span className="system-id-badge">SYSTEM GEN ID: DRV-1043</span>

                  <div className="status-box">
                    <p>Status: <span className="text-success">ACTIVE & READY FOR DISPATCH</span></p>
                    <p className="subtext">Account credentials and compliance tracking configurations have been successfully integrated into active scheduling trees.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {driverStep < 3 ? (
                <>
                  <button className="btn-link" onClick={() => setIsDriverModalOpen(false)}>CANCEL</button>

                  <div className="footer-right-buttons">
                    {driverStep === 2 && (
                      <button className="btn-secondary" onClick={() => setDriverStep(3)}>UPLOAD LATER</button>
                    )}

                    <button className="btn-primary" onClick={() => setDriverStep(driverStep + 1)}>
                      {driverStep === 2 ? "SUBMIT ROSTER" : "NEXT STEP →"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="success-actions-layout">
                  <button className="btn-primary" onClick={() => setIsDriverModalOpen(false)}>View Driver Profile</button>
                  <button className="btn-secondary" onClick={() => { setDriverStep(1); setDriverForm({ fullName: "", contactNumber: "", dateHired: "", assignVehicle: "", emergencyContact: "", licenseNumber: "", licenseExpiry: "", email: "", password: "", confirmPassword: "" }); }}>Register Another Driver</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD VEHICLE MULTI-STEP MODAL ================= */}
      {isVehicleModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <div>
                <h3>Add New Fleet Vehicle</h3>
                <p className="modal-subtitle">
                  {vehicleStep === 1 && "Vehicle Technical Specifications"}
                  {vehicleStep === 2 && "Compliance and Registration Logs"}
                  {vehicleStep === 3 && "Registry Entry Added"}
                </p>
              </div>
              <button className="close-modal-btn" onClick={() => setIsVehicleModalOpen(false)}>×</button>
            </div>

            <div className="modal-steps-indicator">
              <span className={`step-badge ${vehicleStep === 1 ? "active" : ""}`}>1 Vehicle Info</span>
              <span className="step-line"></span>
              <span className={`step-badge ${vehicleStep === 2 ? "active" : ""}`}>2 Compliance Docs</span>
              <span className="step-line"></span>
              <span className={`step-badge ${vehicleStep === 3 ? "active" : ""}`}>3 Completed</span>
            </div>

            <div className="modal-body">
              {vehicleStep === 1 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>PLATE NUMBER *</label>
                    <input type="text" placeholder="e.g. ABC 1234" value={vehicleForm.plateNumber} onChange={(e) => handleVehicleInputChange(e, 'plateNumber')} />
                  </div>

                  <div className="form-group">
                    <label>MODEL / BRAND MANUFACTURER *</label>
                    <input type="text" placeholder="e.g. Isuzu Giga" value={vehicleForm.model} onChange={(e) => handleVehicleInputChange(e, 'model')} />
                  </div>

                  <div className="form-group">
                    <label>VEHICLE TYPE CATEGORY *</label>
                    <select value={vehicleForm.type} onChange={(e) => handleVehicleInputChange(e, 'type')}>
                      <option value="">Select type...</option>
                      <option value="heavy">Heavy Freight Truck (10w)</option>
                      <option value="medium">Medium Closed Van (6w)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>MAX NET CAPACITY WEIGHT (KG) *</label>
                    <input type="number" placeholder="15000" value={vehicleForm.capacity} onChange={(e) => handleVehicleInputChange(e, 'capacity')} />
                  </div>
                </div>
              )}

              {vehicleStep === 2 && (
                <div className="documents-upload-container">
                  <p className="info-banner">⚡ OR/CR and Active Insurance lines are mandatory validation components.</p>

                  <div className="upload-cards-grid">
                    <div className="upload-card required">
                      <h4>OFFICIAL RECEIPT / CERTIFICATE OF REGISTRATION (OR/CR) *</h4>
                      <div className="dropzone-box"><p>Drag & drop or Click to attach active LTO verification records</p></div>
                    </div>

                    <div className="upload-card required">
                      <h4>COMPREHENSIVE MOTOR VEHICLE INSURANCE POLICIES *</h4>
                      <div className="dropzone-box"><p>Drag & drop or Click to attach proof files</p></div>
                    </div>
                  </div>
                </div>
              )}

              {vehicleStep === 3 && (
                <div className="success-modal-view">
                  <div className="success-icon-circle">✓</div>
                  <h2>Vehicle Added Successfully</h2>

                  <div className="status-box">
                    <p className="subtext">Asset catalog entry updated. Parameters and logistics compliance profiles are verified and compiled safely inside backend storage nodes.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {vehicleStep < 3 ? (
                <>
                  <button className="btn-link" onClick={() => setIsVehicleModalOpen(false)}>CANCEL</button>

                  <div className="footer-right-buttons">
                    {vehicleStep === 2 && (
                      <button className="btn-secondary" onClick={() => setVehicleStep(3)}>UPLOAD LATER</button>
                    )}

                    <button className="btn-primary" onClick={() => setVehicleStep(vehicleStep + 1)}>
                      {vehicleStep === 2 ? "SAVE INVENTORY" : "NEXT STEP →"}
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn-primary" onClick={() => setIsVehicleModalOpen(false)}>Complete Registration Process</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MAINTENANCE HISTORY MODAL ================= */}
      {isHistoryOpen && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <div>
                <h3>Maintenance History</h3>
                <p className="modal-subtitle">All past and scheduled maintenance entries.</p>
              </div>
              <button className="close-modal-btn" onClick={() => setIsHistoryOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>PLATE</th>
                    <th>VEHICLE</th>
                    <th>CATEGORY</th>
                    <th>WORKSHOP</th>
                    <th>URGENCY</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceSchedules.map(s => (
                    <tr key={s.id}>
                      <td>{formatDateDisplay(s.date)}</td>
                      <td>{s.plate}</td>
                      <td>{s.vehicle}</td>
                      <td>{s.category}</td>
                      <td>{s.workshop}</td>
                      <td><span className={`status-pill ${s.urgency === "URGENT" ? "status-warning" : "status-active"}`}>{s.urgency}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button className="btn-link" onClick={() => setIsHistoryOpen(false)}>CLOSE</button>
              <div className="footer-right-buttons">
                <button className="btn-secondary" onClick={() => { exportMaintenanceCSV(); }}>Export CSV</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD SCHEDULE MODAL ================= */}
      {isAddScheduleOpen && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <div>
                <h3>Add Maintenance Schedule</h3>
                <p className="modal-subtitle">Create a new maintenance entry for the fleet.</p>
              </div>
              <button className="close-modal-btn" onClick={() => setIsAddScheduleOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>PLATE NUMBER *</label>
                  <input ref={addScheduleFirstRef} type="text" value={newSchedule.plate} onChange={(e) => setNewSchedule({ ...newSchedule, plate: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>VEHICLE</label>
                  <input type="text" value={newSchedule.vehicle} onChange={(e) => setNewSchedule({ ...newSchedule, vehicle: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>SERVICE CATEGORY</label>
                  <input type="text" value={newSchedule.category} onChange={(e) => setNewSchedule({ ...newSchedule, category: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>SCHEDULED DATE *</label>
                  <input type="date" value={newSchedule.date} onChange={(e) => setNewSchedule({ ...newSchedule, date: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>ASSIGNED WORKSHOP</label>
                  <input type="text" value={newSchedule.workshop} onChange={(e) => setNewSchedule({ ...newSchedule, workshop: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>URGENCY</label>
                  <select value={newSchedule.urgency} onChange={(e) => setNewSchedule({ ...newSchedule, urgency: e.target.value })}>
                    <option value="ROUTINE">ROUTINE</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-link" onClick={() => setIsAddScheduleOpen(false)}>CANCEL</button>
              <div className="footer-right-buttons">
                <button className="btn-primary" onClick={saveNewSchedule}>SAVE SCHEDULE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
