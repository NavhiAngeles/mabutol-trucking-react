// fleet.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import { useFleetViewModel } from "../../viewmodels/FleetViewModel";
import "./fleet.css";

export default function Fleet() {
  const navigate = useNavigate();

  // ViewModel State & Actions
  const {
    // KPI cards
    kpis,
    kpisLoading,

    // Vehicles table
    trucks,
    trucksLoading,
    trucksError,

    // Drivers table
    drivers,
    driversLoading,
    driversError,

    // Maintenance table
    maintenanceRecords,
    maintenanceLoading,
    maintenanceError,

    // Compliance
    truckComplianceRows,
    truckComplianceLoading,
    truckComplianceError,
    driverComplianceRows,
    driverComplianceLoading,
    driverComplianceError,

    // Modal lookups
    vehicleTypes,
    assignableTrucks,
    cargoCategories,

    // Mutations
    submitNewDriver,
    submitNewTruck,
    isSubmittingDriver,
    isSubmittingTruck,
    submitError,
  } = useFleetViewModel();

  // Tab and Subview States
  const [vehicleTab, setVehicleTab] = useState("details");
  const [driverTab, setDriverTab] = useState("details");
  const [maintenanceView, setMaintenanceView] = useState("list");

  // Search Filter States
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleComplianceSearch, setVehicleComplianceSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  // Multi-step Modal States
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverStep, setDriverStep] = useState(1); // 1: Info, 2: Documents, 3: Success
  const [registeredDriverId, setRegisteredDriverId] = useState("DRV-1043");

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleStep, setVehicleStep] = useState(1); // 1: Info, 2: Compliance Docs, 3: Success
  const [showVehicleSuccess, setShowVehicleSuccess] = useState(false);
  const [registeredTruckId, setRegisteredTruckId] = useState("TRK-1043");

  // Form Field States
  const [driverForm, setDriverForm] = useState({
    fullName: "",
    contactNumber: "",
    dateHired: "",
    assignVehicle: "",
    emergencyContact: "",
    licenseNumber: "",
    licenseExpiry: "",
    medicalDocNumber: "",
    medicalExpiry: "",
    nbiDocNumber: "",
    nbiExpiry: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: "",
    modelYear: "",
    model: "",
    type: "",
    capacity: "",
    cargoCompatibility: [],
    assignedDriver: "",
    orNumber: "",
    crNumber: "",
  });

  // Helpers
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getDocBadgeClass = (state) => {
    if (state === "valid") return "doc-pill doc-success";
    if (state === "expiring_soon" || state === "pending_review") return "doc-pill doc-warning";
    return "doc-pill doc-warning";
  };

  // Handler functions for modal open / form reset
  const handleRegisterDriverClick = () => {
    resetDriverForm();
    setIsDriverModalOpen(true);
  };

  const handleAddVehicleClick = () => {
    resetVehicleForm();
    setIsVehicleModalOpen(true);
  };

  const resetDriverForm = () => {
    setDriverForm({
      fullName: "",
      contactNumber: "",
      dateHired: "",
      assignVehicle: "",
      emergencyContact: "",
      licenseNumber: "",
      licenseExpiry: "",
      medicalDocNumber: "",
      medicalExpiry: "",
      nbiDocNumber: "",
      nbiExpiry: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    setDriverStep(1);
  };

  const resetVehicleForm = () => {
    setVehicleForm({
      plateNumber: "",
      modelYear: "",
      model: "",
      type: "",
      capacity: "",
      cargoCompatibility: [],
      assignedDriver: "",
      orNumber: "",
      crNumber: "",
    });
    setVehicleStep(1);
    setShowVehicleSuccess(false);
  };

  const handleDriverInputChange = (e, field) => {
    setDriverForm({ ...driverForm, [field]: e.target.value });
  };

  const handleCargoToggle = (id) => {
    const currentCargo = vehicleForm.cargoCompatibility || [];
    const updatedCargo = currentCargo.includes(id)
      ? currentCargo.filter((item) => item !== id)
      : [...currentCargo, id];

    setVehicleForm({ ...vehicleForm, cargoCompatibility: updatedCargo });
  };

  const handleVehicleInputChange = (e, field) => {
    setVehicleForm({ ...vehicleForm, [field]: e.target.value });
  };

  // Submission Handlers
  const handleDriverSubmit = async () => {
    if (!driverForm.fullName || !driverForm.contactNumber) {
      alert("Please provide the driver's full name and contact number.");
      return;
    }
    if (!driverForm.licenseNumber) {
      alert("Please provide the professional license number.");
      return;
    }
    try {
      const created = await submitNewDriver(driverForm);
      setRegisteredDriverId(created?.id ? `DRV-${created.id.slice(0, 8).toUpperCase()}` : "DRV-1043");
      setDriverStep(3);
    } catch (err) {
      console.error("Failed to register driver:", err);
      alert("Failed to register driver: " + (err.message || "Unknown error"));
    }
  };

  const handleVehicleSubmit = async () => {
    if (!vehicleForm.plateNumber || !vehicleForm.model) {
      alert("Please provide at least a plate number and model.");
      return;
    }
    try {
      const created = await submitNewTruck(vehicleForm);
      setRegisteredTruckId(created?.id ? `TRK-${created.id.slice(0, 8).toUpperCase()}` : "TRK-1043");
      setShowVehicleSuccess(true);
    } catch (err) {
      console.error("Failed to register vehicle:", err);
      alert("Failed to register vehicle: " + (err.message || "Unknown error"));
    }
  };

  // Filtered Lists
  const filteredTrucks = trucks.filter((truck) => {
    if (!vehicleSearch.trim()) return true;
    const q = vehicleSearch.toLowerCase();
    return (
      truck.plate_number?.toLowerCase().includes(q) ||
      truck.model?.toLowerCase().includes(q) ||
      truck.vehicle_types?.name?.toLowerCase().includes(q) ||
      truck.drivers?.full_name?.toLowerCase().includes(q)
    );
  });

  const filteredTruckCompliance = truckComplianceRows.filter((row) => {
    if (!vehicleComplianceSearch.trim()) return true;
    const q = vehicleComplianceSearch.toLowerCase();
    return (
      row.truck?.plate_number?.toLowerCase().includes(q) ||
      row.truck?.model?.toLowerCase().includes(q)
    );
  });

  const filteredDrivers = drivers.filter((driver) => {
    if (!driverSearch.trim()) return true;
    const q = driverSearch.toLowerCase();
    return (
      driver.full_name?.toLowerCase().includes(q) ||
      driver.contact_number?.toLowerCase().includes(q) ||
      driver.license_number?.toLowerCase().includes(q) ||
      driver.assignedTruck?.plate_number?.toLowerCase().includes(q)
    );
  });

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
            onChange={(e) => setVehicleSearch(e.target.value)}
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
          <div
            className="avatar"
            onClick={() => navigate("/settings/account")}
            style={{ cursor: "pointer" }}
            title="Go to Account Settings"
          >
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
            <h2>{kpisLoading ? "—" : kpis.total}</h2>
            <p className="growth-indicator positive"><span className="arrow">↗</span> <strong>Total Fleet</strong></p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>AVAILABLE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.available}</h2>
            <p className="growth-indicator target">
              {kpis.total > 0 ? `${Math.round((kpis.available / kpis.total) * 100)}% of total fleet` : "0% of total fleet"}
            </p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header">
              <h4>IN MAINTENANCE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.maintenance}</h2>
            <p className="growth-indicator ">Currently under maintenance</p>
          </div>
          <div className="metric-card border-blue-accent">
            <div className="metric-header">
              <h4>IN TRANSIT</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.onTrip}</h2>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              Details
            </button>
            <button
              className={`tab-pill ${vehicleTab === "compliance" ? "active" : ""}`}
              onClick={() => setVehicleTab("compliance")}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Compliance
            </button>
          </div>
        </div>

        {vehicleTab === "details" ? (
          <>
            <div className="table-filter-bar">
              <div className="filter-search-wrapper">
                <input
                  type="text"
                  className="inner-search"
                  placeholder="Search by plate, vehicle type..."
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                />
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
                {trucksLoading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                      Loading fleet vehicles...
                    </td>
                  </tr>
                ) : filteredTrucks.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                      {vehicleSearch ? "No vehicles matching search filter." : "No vehicles registered in fleet yet."}
                    </td>
                  </tr>
                ) : (
                  filteredTrucks.map((truck) => (
                    <tr key={truck.id}>
                      <td>
                        <strong>{truck.plate_number}</strong>
                        {truck.fleet_code && <span className="subtext" style={{ marginLeft: "6px" }}>({truck.fleet_code})</span>}
                        <br />
                        <span className="subtext">{[truck.model_year, truck.model].filter(Boolean).join(" ") || "—"}</span>
                      </td>
                      <td>
                        {truck.vehicle_types?.name ?? "General Freight"}
                        {truck.capacity_kg ? `, ${truck.capacity_kg.toLocaleString()} kg` : ""}
                      </td>
                      <td>
                        {truck.cargoCategories && truck.cargoCategories.length > 0 ? (
                          truck.cargoCategories.map((c) => (
                            <span key={c.id} className="badge">
                              {c.name.toUpperCase()}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: "#94A3B8" }}>—</span>
                        )}
                      </td>
                      <td>{truck.drivers?.full_name ?? <span style={{ color: "#94A3B8" }}>Unassigned</span>}</td>
                      <td>
                        {truck.status === "on_trip" ? (
                          <span className="status-pill status-transit">● IN TRANSIT</span>
                        ) : truck.status === "maintenance" ? (
                          <span className="status-pill status-danger">● IN MAINTENANCE</span>
                        ) : truck.status === "available" ? (
                          <span className="status-pill status-active">● AVAILABLE</span>
                        ) : (
                          <span className="status-pill status-warning">● {(truck.status || "OFFLINE").toUpperCase()}</span>
                        )}
                      </td>
                      <td>
                        <button className="action-dot-btn">⋮</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="table-filter-bar">
              <div className="filter-search-wrapper">
                <input
                  type="text"
                  className="inner-search"
                  placeholder="Search compliance by plate..."
                  value={vehicleComplianceSearch}
                  onChange={(e) => setVehicleComplianceSearch(e.target.value)}
                />
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
                {truckComplianceLoading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                      Loading vehicle compliance records...
                    </td>
                  </tr>
                ) : filteredTruckCompliance.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                      No vehicle compliance records found.
                    </td>
                  </tr>
                ) : (
                  filteredTruckCompliance.map((row) => {
                    const orCrDoc = row.docs.find((d) => d.docType === "lto_registration");
                    const ltfrbDoc = row.docs.find((d) => d.docType === "franchise_permit");
                    const emissionDoc = row.docs.find((d) => d.docType === "emission_test");

                    return (
                      <tr key={row.truck.id}>
                        <td>
                          <strong>{row.truck.plate_number}</strong>
                          <br />
                          <span className="subtext">{[row.truck.model_year, row.truck.model].filter(Boolean).join(" ") || "—"}</span>
                        </td>
                        <td>
                          <span className={getDocBadgeClass(orCrDoc?.badge?.state)}>
                            {orCrDoc?.badge?.label ?? "Missing"}
                          </span>
                        </td>
                        <td>
                          <span className={getDocBadgeClass(ltfrbDoc?.badge?.state)}>
                            {ltfrbDoc?.badge?.label ?? "Missing"}
                          </span>
                        </td>
                        <td>
                          <span className={getDocBadgeClass(emissionDoc?.badge?.state)}>
                            {emissionDoc?.badge?.label ?? "Missing"}
                          </span>
                        </td>
                        <td>
                          {row.overallStatus === "verified" ? (
                            <span className="status-pill status-active">● Verified</span>
                          ) : (
                            <span className="status-pill status-warning">● Attention</span>
                          )}
                        </td>
                        <td>
                          <button className="action-dot-btn">⋮</button>
                        </td>
                      </tr>
                    );
                  })
                )}
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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
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
              {driversLoading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    Loading drivers list...
                  </td>
                </tr>
              ) : filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    {driverSearch ? "No drivers matching search filter." : "No drivers registered yet."}
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const complianceRow = driverComplianceRows.find((r) => r.driver.id === driver.id);
                  const isVerified = complianceRow?.overallStatus === "verified";

                  return (
                    <tr key={driver.id}>
                      <td>
                        <strong>{driver.full_name}</strong>
                        <br />
                        <span className="subtext">{driver.contact_number || "No contact"}</span>
                      </td>
                      <td>
                        {driver.license_number || "—"}
                        {driver.date_hired && (
                          <>
                            <br />
                            <span className="subtext">Hired: {formatDate(driver.date_hired)}</span>
                          </>
                        )}
                      </td>
                      <td>
                        {driver.assignedTruck ? (
                          `${driver.assignedTruck.model || "Truck"} (${driver.assignedTruck.plate_number})`
                        ) : (
                          <span style={{ color: "#94A3B8" }}>Unassigned</span>
                        )}
                      </td>
                      <td>Depot Center</td>
                      <td>
                        {driver.status === "on_route" || driver.status === "on_trip" ? (
                          <span className="status-pill status-transit">ON ROUTE</span>
                        ) : driver.status === "inactive" ? (
                          <span className="status-pill status-danger">INACTIVE</span>
                        ) : (
                          <span className="status-pill status-active">{driver.status ? driver.status.toUpperCase() : "AVAILABLE"}</span>
                        )}
                      </td>
                      <td>
                        {isVerified ? (
                          <span className="text-success">Verified</span>
                        ) : (
                          <span className="text-warning">Pending Review</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
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
              {driverComplianceLoading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    Loading driver compliance records...
                  </td>
                </tr>
              ) : driverComplianceRows.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    No driver compliance records found.
                  </td>
                </tr>
              ) : (
                driverComplianceRows.map((row) => {
                  const licenseDoc = row.docs.find((d) => d.docType === "drivers_license");
                  const medicalDoc = row.docs.find((d) => d.docType === "medical_certificate");
                  const nbiDoc = row.docs.find((d) => d.docType === "nbi_clearance");

                  return (
                    <tr key={row.driver.id}>
                      <td>
                        <strong>{row.driver.full_name}</strong>
                      </td>
                      <td>
                        <span className={getDocBadgeClass(licenseDoc?.badge?.state)}>
                          {licenseDoc?.badge?.label ?? "Missing"}
                        </span>
                      </td>
                      <td>
                        <span className={getDocBadgeClass(medicalDoc?.badge?.state)}>
                          {medicalDoc?.badge?.label ?? "Missing"}
                        </span>
                      </td>
                      <td>
                        <span className={getDocBadgeClass(nbiDoc?.badge?.state)}>
                          {nbiDoc?.badge?.label ?? "Missing"}
                        </span>
                      </td>
                      <td>
                        {row.overallStatus === "verified" ? (
                          <span className="status-pill status-active">Verified</span>
                        ) : (
                          <span className="status-pill status-warning">Pending Review</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* ================= SECTION 3: MAINTENANCE SCHEDULE ================= */}
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
                <th>LAST SCHEDULED SERVICE</th>
                <th>NEXT SCHEDULED SERVICE</th>
                <th>ASSIGNED WORKSHOP</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceLoading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    Loading maintenance records...
                  </td>
                </tr>
              ) : maintenanceRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                    No maintenance records found.
                  </td>
                </tr>
              ) : (
                maintenanceRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.trucks?.plate_number || "—"}</strong>
                      <br />
                      <span className="subtext">{record.trucks?.model || record.kind || "Maintenance"}</span>
                    </td>
                    <td>{formatDate(record.scheduled_date)}</td>
                    <td>{formatDate(record.next_due_date)}</td>
                    <td>{record.vendor || record.description || "Manila North Logistics Hub Center"}</td>
                    <td>
                      {record.status === "completed" || record.status === "scheduled" ? (
                        <span className="status-pill status-active">● ON SCHEDULE</span>
                      ) : record.status === "due_soon" ? (
                        <span className="status-pill status-warning">● DUE SOON</span>
                      ) : record.status === "in_progress" || record.status === "maintenance" ? (
                        <span className="status-pill status-danger">● ON MAINTENANCE</span>
                      ) : (
                        <span className="status-pill status-active">● {(record.status || "ON SCHEDULE").toUpperCase()}</span>
                      )}
                    </td>
                    <td>
                      <button className="action-dot-btn">⋮</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <div className="calendar-mock-container">
            <div className="calendar-header-mock">
              <h4>June 2026</h4>
              <div className="calendar-nav-mock">
                <button type="button">&lt;</button>
                <button type="button">Today</button>
                <button type="button">&gt;</button>
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
              <div className="calendar-day">5</div>
              <div className="calendar-day">6</div>

              {/* Row 2 Mock Days */}
              <div className="calendar-day">7</div>
              <div className="calendar-day">8</div>
              <div className="calendar-day">9</div>
              <div className="calendar-day">10</div>
              <div className="calendar-day">11</div>
              <div className="calendar-day event-routine">
                12<div className="day-event-tag">ON SCHEDULE</div>
              </div>
              <div className="calendar-day">13</div>

              {/* Row 3 Mock Days */}
              <div className="calendar-day">14</div>
              <div className="calendar-day">15</div>
              <div className="calendar-day">16</div>
              <div className="calendar-day">17</div>
              <div className="calendar-day">18</div>
              <div className="calendar-day">19</div>
              <div className="calendar-day">20</div>

              {/* Row 4 Mock Days */}
              <div className="calendar-day">21</div>
              <div className="calendar-day">22</div>
              <div className="calendar-day">23</div>
              <div className="calendar-day">24</div>
              <div className="calendar-day event-urgent">
                25<div className="day-event-tag">DUE SOON</div>
              </div>
              <div className="calendar-day">26</div>
              <div className="calendar-day">27</div>

              {/* Row 5 Mock Days */}
              <div className="calendar-day">28</div>
              <div className="calendar-day">29</div>
              <div className="calendar-day event-danger">
                30<div className="day-event-tag">ON MAINTENANCE</div>
              </div>
              <div className="calendar-day">31</div>
              <div className="calendar-day text-muted">1</div>
              <div className="calendar-day text-muted">2</div>
              <div className="calendar-day text-muted">3</div>
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
                  {driverStep === 2 && "Manual Compliance Documents"}
                  {driverStep === 3 && "Registration Executed"}
                </p>
              </div>
              <button className="close-modal-btn" onClick={() => setIsDriverModalOpen(false)}>×</button>
            </div>

            {/* Steps Progress Metrics Indicator */}
            <div className="modal-steps-indicator">
              <span className={`step-badge ${driverStep === 1 ? "active" : ""}`}>
                1 Basic Information
              </span>

              <span className="step-line"></span>

              <span className={`step-badge ${driverStep === 2 ? "active" : ""}`}>
                2 Compliance Documents
              </span>

              <span className="step-line"></span>

              <span className={`step-badge ${driverStep === 3 ? "active" : ""}`}>
                3 Confirmation
              </span>
            </div>

            {/* Modal Form Body Segment Switcher */}
            <div className="modal-body">
              {driverStep === 1 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>FULL NAME *</label>
                    <input type="text" placeholder="e.g. Juan dela Cruz" value={driverForm.fullName} onChange={(e) => handleDriverInputChange(e, 'fullName')} />
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
                      {assignableTrucks.map((truck) => (
                        <option key={truck.id} value={truck.id}>
                          {truck.model ? `${truck.model} (${truck.plate_number})` : truck.plate_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>EMERGENCY CONTACT NUMBER</label>
                    <input type="text" placeholder="09XX XXX XXXX" value={driverForm.emergencyContact} onChange={(e) => handleDriverInputChange(e, 'emergencyContact')} />
                  </div>

                  <div className="form-divider-title">License Information</div>
                  <div className="form-group">
                    <label>LICENSE NUMBER *</label>
                    <input type="text" placeholder="e.g. N01-23-45678" value={driverForm.licenseNumber} onChange={(e) => handleDriverInputChange(e, 'licenseNumber')} />
                  </div>
                  <div className="form-group">
                    <label>LICENSE EXPIRY</label>
                    <input type="date" value={driverForm.licenseExpiry} onChange={(e) => handleDriverInputChange(e, 'licenseExpiry')} />
                  </div>

                  <div className="form-section-box">
                    <h4>Driver Mobile Application Account</h4>
                    <div className="form-group full-width">
                      <label>EMAIL ADDRESS</label>
                      <input type="email" placeholder="driver@tanawlogistics.com" value={driverForm.email} onChange={(e) => handleDriverInputChange(e, 'email')} />
                    </div>
                    <div className="form-group">
                      <label>TEMPORARY PASSWORD</label>
                      <input type="password" placeholder="........" value={driverForm.password} onChange={(e) => handleDriverInputChange(e, 'password')} />
                    </div>
                    <div className="form-group">
                      <label>CONFIRM PASSWORD</label>
                      <input type="password" placeholder="........" value={driverForm.confirmPassword} onChange={(e) => handleDriverInputChange(e, 'confirmPassword')} />
                    </div>
                    <p className="notice-text">ℹ System configuration enforces forced password update sequences on initial platform access.</p>
                  </div>
                </div>
              )}

              {driverStep === 2 && (
                <div className="documents-upload-container">
                  <p className="info-banner">⚡ Manual compliance entry: Enter driver license, medical clearance, and NBI verification records below.</p>

                  <div className="upload-cards-grid">
                    {/* Card 1: Driver's License */}
                    <div className="upload-card required">
                      <h4>PROFESSIONAL DRIVER'S LICENSE <span className="req-label">REQUIRED</span></h4>
                      <div className="form-grid" style={{ marginTop: "12px" }}>
                        <div className="form-group">
                          <label>LICENSE NUMBER *</label>
                          <input
                            type="text"
                            placeholder="e.g. N01-23-45678"
                            value={driverForm.licenseNumber}
                            onChange={(e) => handleDriverInputChange(e, "licenseNumber")}
                          />
                        </div>
                        <div className="form-group">
                          <label>EXPIRY DATE *</label>
                          <input
                            type="date"
                            value={driverForm.licenseExpiry}
                            onChange={(e) => handleDriverInputChange(e, "licenseExpiry")}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Medical Clearance Certificate */}
                    <div className="upload-card required">
                      <h4>MEDICAL CLEARANCE CERTIFICATE <span className="req-label">RECOMMENDED</span></h4>
                      <div className="form-grid" style={{ marginTop: "12px" }}>
                        <div className="form-group">
                          <label>CERTIFICATE NUMBER / CLINIC</label>
                          <input
                            type="text"
                            placeholder="e.g. MED-2026-8891"
                            value={driverForm.medicalDocNumber || ""}
                            onChange={(e) => handleDriverInputChange(e, "medicalDocNumber")}
                          />
                        </div>
                        <div className="form-group">
                          <label>VALID UNTIL / EXPIRY DATE</label>
                          <input
                            type="date"
                            value={driverForm.medicalExpiry || ""}
                            onChange={(e) => handleDriverInputChange(e, "medicalExpiry")}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 3: NBI Clearance */}
                    <div className="upload-card optional">
                      <h4>NATIONAL BUREAU OF INVESTIGATION (NBI) CLEARANCE <span className="opt-label">OPTIONAL</span></h4>
                      <div className="form-grid" style={{ marginTop: "12px" }}>
                        <div className="form-group">
                          <label>NBI CLEARANCE NUMBER</label>
                          <input
                            type="text"
                            placeholder="e.g. NBI-2026-4492"
                            value={driverForm.nbiDocNumber || ""}
                            onChange={(e) => handleDriverInputChange(e, "nbiDocNumber")}
                          />
                        </div>
                        <div className="form-group">
                          <label>EXPIRY DATE</label>
                          <input
                            type="date"
                            value={driverForm.nbiExpiry || ""}
                            onChange={(e) => handleDriverInputChange(e, "nbiExpiry")}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {driverStep === 3 && (
                <div className="success-modal-view">
                  <div className="success-icon-circle">✓</div>
                  <h2>Driver Registered Successfully</h2>
                  <span className="system-id-badge">SYSTEM GEN ID: {registeredDriverId}</span>
                  <div className="status-box">
                    <p>Status: <span className="text-success">ACTIVE & READY FOR DISPATCH</span></p>
                    <p className="subtext">Account credentials and compliance tracking configurations have been successfully integrated into active scheduling trees.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer Grouping */}
            <div className="modal-footer">
              {driverStep === 1 && (
                <>
                  <button
                    className="btn-link"
                    onClick={() => setIsDriverModalOpen(false)}
                  >
                    CANCEL
                  </button>

                  <div className="footer-right-buttons">
                    <button
                      className="btn-secondary"
                      onClick={handleDriverSubmit}
                      disabled={isSubmittingDriver}
                      title="Quick register driver without entering additional compliance documents"
                    >
                      {isSubmittingDriver ? "Registering..." : "Quick Register"}
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (!driverForm.fullName || !driverForm.contactNumber) {
                          alert("Please fill in Full Name and Contact Number before proceeding.");
                          return;
                        }
                        if (!driverForm.licenseNumber) {
                          alert("Please provide the License Number before proceeding.");
                          return;
                        }
                        setDriverStep(2);
                      }}
                    >
                      NEXT STEP →
                    </button>
                  </div>
                </>
              )}

              {driverStep === 2 && (
                <>
                  <button
                    className="btn-link"
                    onClick={() => setDriverStep(1)}
                  >
                    ← BACK
                  </button>

                  <div className="footer-right-buttons">
                    <button
                      className="btn-secondary"
                      onClick={handleDriverSubmit}
                      disabled={isSubmittingDriver}
                    >
                      Skip & Complete
                    </button>

                    <button
                      className="btn-primary"
                      disabled={isSubmittingDriver}
                      onClick={handleDriverSubmit}
                    >
                      {isSubmittingDriver ? "Registering..." : "Complete Registration ✓"}
                    </button>
                  </div>
                </>
              )}

              {driverStep === 3 && (
                <>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setIsDriverModalOpen(false);
                      resetDriverForm();
                    }}
                  >
                    Close
                  </button>
                </>
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
              <span className={`step-badge ${vehicleStep === 1 ? "active" : ""}`}>
                1 Vehicle Info
              </span>

              <span className="step-line"></span>

              <span className={`step-badge ${vehicleStep === 2 ? "active" : ""}`}>
                2 Documents
              </span>
            </div>

            <div className="modal-body">
              {vehicleStep === 1 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>PLATE NUMBER *</label>
                    <input type="text" placeholder="e.g. ABC 1234" value={vehicleForm.plateNumber} onChange={(e) => handleVehicleInputChange(e, 'plateNumber')} />
                  </div>
                  <div className="form-group">
                    <label>MODEL YEAR *</label>
                    <input type="text" placeholder="e.g. 2024" value={vehicleForm.modelYear} onChange={(e) => handleVehicleInputChange(e, 'modelYear')} />
                  </div>
                  <div className="form-group">
                    <label>MODEL *</label>
                    <input type="text" placeholder="e.g. Isuzu Giga" value={vehicleForm.model} onChange={(e) => handleVehicleInputChange(e, 'model')} />
                  </div>
                  <div className="form-group">
                    <label>VEHICLE TYPE *</label>
                    <select value={vehicleForm.type} onChange={(e) => handleVehicleInputChange(e, 'type')}>
                      <option value="">Select type...</option>
                      {vehicleTypes.length > 0 ? (
                        vehicleTypes.map((vt) => (
                          <option key={vt.id} value={vt.id}>
                            {vt.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="heavy">Heavy Freight Truck (10w)</option>
                          <option value="medium">Medium Closed Van (6w)</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>MAX CARGO WEIGHT (KG) *</label>
                    <input type="number" placeholder="15000" value={vehicleForm.capacity} onChange={(e) => handleVehicleInputChange(e, 'capacity')} />
                  </div>

                  {/* ================= CARGO COMPATIBILITY DYNAMICALLY FROM DB ================= */}
                  <div className="form-group full-width">
                    <label className="cargo-title-label">CARGO COMPATIBILITY</label>
                    <div className="cargo-options-grid">
                      {(cargoCategories && cargoCategories.length > 0
                        ? cargoCategories.map((c) => ({ id: c.id, label: c.name }))
                        : [
                          { id: "general", label: "General" },
                          { id: "bulk", label: "Bulk" },
                          { id: "cold_chain", label: "Cold Chain" },
                          { id: "fragile", label: "Fragile" },
                          { id: "hazardous", label: "Hazardous" },
                          { id: "flatbed", label: "Flatbed" },
                        ]
                      ).map((option) => {
                        const isSelected = vehicleForm.cargoCompatibility?.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`cargo-option-btn ${isSelected ? "selected" : ""}`}
                            onClick={() => handleCargoToggle(option.id)}
                          >
                            {isSelected && (
                              <svg
                                className="checkmark-icon"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            )}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {vehicleStep === 2 && (
                <div className="compliance-documents-view">
                  {/* Form Grid for Document Text Fields */}
                  <div className="form-grid" style={{ marginBottom: "24px" }}>
                    <div className="form-group">
                      <label>OR NUMBER <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="Enter Official Receipt Number"
                        value={vehicleForm.orNumber || ""}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, orNumber: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>CR NUMBER <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="Enter Certificate of Registration Number"
                        value={vehicleForm.crNumber || ""}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, crNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Section Title for File Uploads */}
                  <label className="cargo-title-label" style={{ marginBottom: "12px" }}>
                    Upload Official Compliance Digital Files
                  </label>

                  {/* File Upload Grid Area */}
                  <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                    {/* Upload Box 1: OR File */}
                    <div className="file-upload-dropzone">
                      <div className="upload-icon-container">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="upload-text-content">
                        <p className="upload-main-text">
                          <span>Click to upload</span> or drag and drop
                        </p>
                        <p className="upload-sub-text">Official Receipt (OR) Copy (PDF, PNG, JPG up to 10MB)</p>
                      </div>
                      <input type="file" className="hidden-file-input" onChange={(e) => console.log('OR uploaded', e.target.files[0])} />
                    </div>

                    {/* Upload Box 2: CR File */}
                    <div className="file-upload-dropzone">
                      <div className="upload-icon-container">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="upload-text-content">
                        <p className="upload-main-text">
                          <span>Click to upload</span> or drag and drop
                        </p>
                        <p className="upload-sub-text">Certificate of Registration (CR) Copy (PDF, PNG, JPG up to 10MB)</p>
                      </div>
                      <input type="file" className="hidden-file-input" onChange={(e) => console.log('CR uploaded', e.target.files[0])} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {vehicleStep === 1 && (
                <>
                  <button
                    className="btn-link"
                    onClick={() => setIsVehicleModalOpen(false)}
                  >
                    CANCEL
                  </button>

                  <div className="footer-right-buttons">
                    <button
                      className="btn-primary"
                      onClick={() => setVehicleStep(2)}
                    >
                      NEXT STEP →
                    </button>
                  </div>
                </>
              )}

              {vehicleStep === 2 && (
                <>
                  <button
                    className="btn-link"
                    onClick={() => setVehicleStep(1)}
                  >
                    ← BACK
                  </button>

                  <div className="footer-right-buttons">
                    <button
                      className="btn-secondary"
                      onClick={handleVehicleSubmit}
                      disabled={isSubmittingTruck}
                    >
                      Upload Later
                    </button>

                    <button
                      className="btn-primary"
                      disabled={isSubmittingTruck}
                      onClick={handleVehicleSubmit}
                    >
                      {isSubmittingTruck ? "Registering..." : "Complete Registration ✓"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {showVehicleSuccess && (
              <div className="modal-backdrop">
                <div className="vehicle-success-modal">
                  <div className="success-icon">
                    ✓
                  </div>

                  <h2>
                    Vehicle Registered
                    <br />
                    Successfully
                  </h2>

                  <div className="vehicle-id">
                    SYSTEM ID:
                    <strong> {registeredTruckId}</strong>
                  </div>

                  <div className="success-status-box">
                    <p>
                      Status:
                      <strong> READY FOR DISPATCH</strong>
                    </p>

                    <p>
                      The credentials and compliance
                      documentation for the new vehicle
                      have been verified and integrated
                      into the Vehicle Directory.
                    </p>
                  </div>

                  <button
                    className="btn-primary success-full-btn"
                    onClick={() => {
                      setShowVehicleSuccess(false);
                      setIsVehicleModalOpen(false);
                      resetVehicleForm();
                    }}
                  >
                    View Vehicle Information
                  </button>

                  <button
                    className="btn-secondary success-full-btn"
                    onClick={resetVehicleForm}
                  >
                    Register Another Vehicle
                  </button>

                  <button
                    className="success-close"
                    onClick={() => {
                      setShowVehicleSuccess(false);
                      setIsVehicleModalOpen(false);
                      resetVehicleForm();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}