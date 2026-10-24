// fleet.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getDispatchReadyTruckIds, subscribeToDashboardChanges } from '../../services/dashboardService';
import MainLayout from "../../layouts/mainLayout";
import { useFleetViewModel } from "../../viewmodels/FleetViewModel";
import "./fleet.css";
import OfficeTools from "../../components/OfficeTools";
import { FleetEditor, ComplianceDialog } from "./FleetDialogs";
import MaintenancePanel from "./MaintenancePanel";
import { validateComplianceFile } from "../../services/fleetWorkspaceService";

export default function Fleet() {
  const [params, setParams] = useSearchParams();
  const readyOnly = params.get('availability') === 'dispatch-ready';
  const [readyIds, setReadyIds] = useState(null);
  const [readyError, setReadyError] = useState('');
  useEffect(() => {
    if (!readyOnly) return;
    let disposed = false, running = false;
    async function load() {
      if (running || disposed) return;
      running = true;
      try {
        const ids = await getDispatchReadyTruckIds();
        if (!disposed) { setReadyIds(new Set(ids)); setReadyError(''); }
      } catch (err) { if (!disposed) { setReadyIds(null); setReadyError(err.message); } }
      finally { running = false; }
    }
    const initial = setTimeout(load, 0);
    const poll = setInterval(load, 15000);
    const unsubscribe = subscribeToDashboardChanges(load);
    return () => { disposed = true; clearTimeout(initial); clearInterval(poll); unsubscribe(); };
  }, [readyOnly]);

  const fleet = useFleetViewModel();
  const [editing, setEditing] = useState(null);
  const [complianceTarget, setComplianceTarget] = useState(null);
  // ViewModel State & Actions
  const {
    // KPI cards
    kpis,
    kpisLoading,

    // Vehicles table
    trucks,
    trucksLoading,

    // Drivers table
    drivers,
    driversLoading,

    // Maintenance table

    // Compliance
    truckComplianceRows,
    truckComplianceLoading,
    driverComplianceRows,
    driverComplianceLoading,

    // Modal lookups
    vehicleTypes,
    assignableTrucks,
    cargoCategories,

    // Mutations
    submitNewDriver,
    submitNewTruck,
    isSubmittingDriver,
    isSubmittingTruck,
  } = fleet;

  // Tab and Subview States
  const [vehicleTab, setVehicleTab] = useState(() => params.get("view") === "compliance" ? "compliance" : "details");
  const [driverTab, setDriverTab] = useState(() => params.get("view") === "compliance" ? "compliance" : "details");


  // Search Filter States
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleComplianceSearch, setVehicleComplianceSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  // Multi-step Modal States
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverStep, setDriverStep] = useState(1); // 1: Info, 2: Documents, 3: Success
  const [registeredDriverId, setRegisteredDriverId] = useState("");

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleStep, setVehicleStep] = useState(1); // 1: Info, 2: Compliance Docs, 3: Success
  const [showVehicleSuccess, setShowVehicleSuccess] = useState(false);
  const [registeredTruckId, setRegisteredTruckId] = useState("");

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
    orFile: null,
    crFile: null,
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

  useEffect(() => {
    if (params.get('view') === 'maintenance') document.getElementById('fleet-maintenance')?.scrollIntoView({ behavior: 'smooth' });
  }, [params]);

  const getDocBadgeClass = (state) => {
    if (state === "critical") return "doc-pill doc-critical";
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
      orFile: null,
      crFile: null,
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

  const handleFile = (event, key) => {
    const file = event.target.files[0] || null;
    try { validateComplianceFile(file); setVehicleForm(previous => ({ ...previous, [key]: file })); }
    catch (error) { event.target.value = ''; alert(error.message); }
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
      setRegisteredDriverId(created?.id ? `DRV-${created.id.slice(0, 8).toUpperCase()}` : "");
      setDriverStep(3);
    } catch (err) {
      console.error("Failed to register driver:", err);
      alert("Failed to register driver: " + (err.message || "Unknown error"));
    }
  };

  const handleVehicleSubmit = async () => {
    if (!vehicleForm.plateNumber.trim() || !vehicleForm.model.trim() || !vehicleForm.type || !(Number(vehicleForm.capacity) > 0)) {
      alert("Please provide a plate number, model, vehicle type and positive capacity.");
      return;
    }
    try {
      const created = await submitNewTruck(vehicleForm);
      setRegisteredTruckId(created?.id ? `TRK-${created.id.slice(0, 8).toUpperCase()}` : "");
      setShowVehicleSuccess(true);
    } catch (err) {
      console.error("Failed to register vehicle:", err);
      alert("Failed to register vehicle: " + (err.message || "Unknown error"));
    }
  };

  // Filtered Lists
  const filteredTrucks = trucks.filter((truck) => {
    if (readyOnly && !readyIds?.has(truck.id)) return false;
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
            placeholder="Search vehicles…"
            id="fleetSearch" aria-label="Search vehicles" value={vehicleSearch}
            onChange={(e) => setVehicleSearch(e.target.value)}
          />
        </div>
        <div className="topbar-right"><OfficeTools /></div>
      </header>

      {/* Primary Scrolling Content Frame */}
      <section className="content scrollable-panel">
        {fleet.error && <p role="alert">Could not refresh fleet records. {fleet.hasData ? 'Showing last loaded data.' : 'Data is unavailable.'} <button onClick={fleet.refresh}>Retry</button></p>}
        <button className="btn-secondary" onClick={fleet.refresh}>Refresh fleet</button>
        {readyOnly && <p role="status">Dispatch-ready vehicles only. {readyError || (!readyIds ? 'Checking assignments and maintenance…' : `${readyIds.size} eligible vehicles`)} <button onClick={() => setParams({})}>Show all vehicles</button></p>}

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
            <h2>{kpisLoading ? "—" : kpis.total ?? "—"}</h2>
            <p className="growth-indicator positive"><span className="arrow">↗</span> <strong>Total Fleet</strong></p>
          </div>
          <div className="metric-card border-green">
            <div className="metric-header">
              <h4>AVAILABLE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.available ?? "—"}</h2>
            <p className="growth-indicator target">
              {kpis.total > 0 ? `${Math.round((kpis.available / kpis.total) * 100)}% of total fleet` : "0% of total fleet"}
            </p>
          </div>
          <div className="metric-card border-red">
            <div className="metric-header">
              <h4>IN MAINTENANCE</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.maintenance ?? "—"}</h2>
            <p className="growth-indicator ">Currently under maintenance</p>
          </div>
          <div className="metric-card border-blue-accent">
            <div className="metric-header">
              <h4>IN USE / RESERVED</h4>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"></rect><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
            </div>
            <h2>{kpisLoading ? "—" : kpis.onTrip ?? "—"}</h2>
            <p className="growth-indicator transit">Assigned or on shipment</p>
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
            <div className="fleet-table-scroll"><table className="premium-table">
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
                      {fleet.error ? "Vehicle data unavailable; retry above." : vehicleSearch ? "No vehicles matching search filter." : "No vehicles registered in fleet yet."}
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
                        {(truck.displayStatus || truck.status) === "on_trip" ? (
                          <span className="status-pill status-transit">● IN TRANSIT</span>
                        ) : (truck.displayStatus || truck.status) === "maintenance" ? (
                          <span className="status-pill status-danger">● IN MAINTENANCE</span>
                        ) : (truck.displayStatus || truck.status) === "available" ? (
                          <span className="status-pill status-active">● AVAILABLE</span>
                        ) : (
                          <span className="status-pill status-warning">● {(truck.displayStatus || truck.status || "OFFLINE").replaceAll('_', ' ').toUpperCase()}</span>
                        )}
                      </td>
                      <td>
                        <button className="btn-link" onClick={() => setEditing({ kind: "truck", record: truck })}>Edit vehicle</button><button className="btn-link" onClick={() => setComplianceTarget({ kind: "truck", entity: truck })}>Documents</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></div>
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
            <div className="fleet-table-scroll"><table className="premium-table">
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
                      {fleet.error ? "Compliance data unavailable; retry above." : "No vehicle compliance records found."}
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
                          <button className="btn-link" onClick={() => setComplianceTarget({ kind: "truck", entity: row.truck })}>Manage documents</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table></div>
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

        <div className="table-filter-bar"><input className="inner-search" placeholder="Search drivers by name, phone or license…" aria-label="Search drivers" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} /></div>
        {driverTab === "details" ? (
          <div className="fleet-table-scroll"><table className="premium-table">
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
                    {fleet.error ? "Driver data unavailable; retry above." : driverSearch ? "No drivers matching search filter." : "No drivers registered yet."}
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
                        <span className="subtext">{driver.contact_number || "No contact"}</span><button className="btn-link" onClick={() => setEditing({ kind: "driver", record: driver })}>Edit driver</button><button className="btn-link" onClick={() => setComplianceTarget({ kind: "driver", entity: driver })}>Documents</button>
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
                      <td>{driver.location ? <><span>{driver.location.latitude.toFixed(4)}, {driver.location.longitude.toFixed(4)}</span><span className="subtext">{driver.location.stale ? "Last known GPS · " : "GPS · "}{new Date(driver.location.recorded_at).toLocaleString()}</span></> : "No GPS report"}</td>
                      <td>
                        {driver.status === "on_route" || driver.status === "on_trip" ? (
                          <span className="status-pill status-transit">ON ROUTE</span>
                        ) : driver.status === "inactive" ? (
                          <span className="status-pill status-danger">INACTIVE</span>
                        ) : (
                          <span className="status-pill status-active">{driver.reserved ? "RESERVED" : driver.status ? driver.status.toUpperCase() : "UNKNOWN"}</span>
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
          </table></div>
        ) : (
          <div className="fleet-table-scroll"><table className="premium-table">
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
                    {fleet.error ? "Compliance data unavailable; retry above." : "No driver compliance records found."}
                  </td>
                </tr>
              ) : (
                driverComplianceRows.filter(row => !driverSearch.trim() || row.driver.full_name.toLowerCase().includes(driverSearch.trim().toLowerCase())).map((row) => {
                  const licenseDoc = row.docs.find((d) => d.docType === "drivers_license");
                  const medicalDoc = row.docs.find((d) => d.docType === "medical_certificate");
                  const nbiDoc = row.docs.find((d) => d.docType === "nbi_clearance");

                  return (
                    <tr key={row.driver.id}>
                      <td>
                        <strong>{row.driver.full_name}<button className="btn-link" onClick={() => setComplianceTarget({ kind: "driver", entity: row.driver })}>Manage documents</button></strong>
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
          </table></div>
        )}

        <MaintenancePanel fleet={fleet} />
      </section>

      {editing && <FleetEditor key={editing.record.id} {...editing} fleet={fleet} onClose={() => setEditing(null)} onSaved={fleet.refresh} />}
      {complianceTarget && <ComplianceDialog key={complianceTarget.entity.id} {...complianceTarget} onClose={() => setComplianceTarget(null)} onSaved={fleet.refresh} />}

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
              <button className="close-modal-btn" disabled={isSubmittingDriver} onClick={() => setIsDriverModalOpen(false)}>×</button>
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
                    <label>DATE HIRED</label>
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
                    <p className="notice-text">Email and password create a mobile login. Leave both empty to add a roster-only driver.</p>
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
                    <p>Status: <span className="text-success">REGISTERED — COMPLIANCE REVIEW PENDING</span></p>
                    <p className="subtext">{driverForm.email ? "Driver record and mobile login created. Review compliance before dispatch." : "Driver roster record created without a mobile login. Review compliance before dispatch."}</p>
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
              <button className="close-modal-btn" disabled={isSubmittingTruck} onClick={() => setIsVehicleModalOpen(false)}>×</button>
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
                    <label>MODEL YEAR</label>
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
                      {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
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
                      {cargoCategories.length === 0 && <p>No cargo categories configured.</p>}
                      {cargoCategories.map(c => ({ id: c.id, label: c.name })).map((option) => {
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
                          <span>Choose a file</span>
                        </p>
                        <p className="upload-sub-text">{vehicleForm.orFile ? vehicleForm.orFile.name + " — ready to upload" : "Official Receipt (OR) Copy (PDF, PNG, JPG up to 10MB)"}</p>
                      </div>
                      <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Official receipt file" onChange={e => handleFile(e, "orFile")} />
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
                          <span>Choose a file</span>
                        </p>
                        <p className="upload-sub-text">{vehicleForm.crFile ? vehicleForm.crFile.name + " — ready to upload" : "Certificate of Registration (CR) Copy (PDF, PNG, JPG up to 10MB)"}</p>
                      </div>
                      <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Registration file" onChange={e => handleFile(e, "crFile")} />
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
                    disabled={isSubmittingTruck} onClick={() => setVehicleStep(1)}
                  >
                    ← BACK
                  </button>

                  <div className="footer-right-buttons">
                    <button
                      className="btn-secondary"
                      onClick={handleVehicleSubmit}
                      disabled={isSubmittingTruck}
                    >
                      Save registration
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
                      <strong> REGISTERED</strong>
                    </p>

                    <p>
                      The vehicle has been saved. Any supplied documents are pending review in the Compliance tab.
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
