// fleet.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { getDispatchReadyTruckIds, subscribeToDashboardChanges } from '../../services/dashboardService';
import MainLayout from "../../layouts/mainLayout";
import { useFleetViewModel } from "../../viewmodels/FleetViewModel";
import "./fleet.css";
import OfficeTools from "../../components/OfficeTools";
import { FleetEditor, AssignDriverModal, ComplianceDialog, FleetModal, FleetDiscardDialog, FleetDeleteDialog } from "./FleetDialogs";
import { INITIAL_VEHICLE_FORM, isDriverFormDirty, isVehicleFormDirty, validateDriverStep1, validateDriverSubmit, validateVehicleStep1, validateVehicleSubmit } from "./fleetDraftHelpers";
import FleetOverview from "./FleetOverview";
import FleetVehiclesView from "./FleetVehiclesView";
import FleetDriversView from "./FleetDriversView";
import FleetMaintenanceView from "./FleetMaintenanceView";
import { validateComplianceFile } from "../../services/fleetWorkspaceService";

export default function Fleet() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const readyOnly = params.get('availability') === 'dispatch-ready';
  const viewParam = params.get('view');
  const pathname = location.pathname.toLowerCase();
  const activeSubView = (() => {
    if (pathname === "/fleet/vehicles" || readyOnly) return "vehicles";
    if (pathname === "/fleet/drivers") return "drivers";
    if (pathname === "/fleet/maintenance" || viewParam === "maintenance") return "maintenance";
    return "overview";
  })();
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
  const [assignDriverTarget, setAssignDriverTarget] = useState(null);
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

    // Compliance status lookups for inline row badges
    truckComplianceRows,
    driverComplianceRows,

    // Modal lookups
    vehicleTypes,
    assignableTrucks,
    cargoCategories,

    // Mutations
    submitNewDriver,
    submitNewTruck,
    removeTruck,
    removeDriver,
    isSubmittingDriver,
    isSubmittingTruck,
  } = fleet;

  // Deletion States
  const [deleteTarget, setDeleteTarget] = useState(null); // { kind: 'truck'|'driver', record }
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null); // 'truck-<id>' | 'driver-<id>' | null
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);

  const handleOpenMenu = useCallback((e, menuKey) => {
    e.stopPropagation();
    if (openMenuId === menuKey) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const spaceBelow = winHeight - rect.bottom;
    const openUpward = spaceBelow < 165 && rect.top > 165;

    setMenuPosition({
      top: openUpward ? 'auto' : `${rect.bottom + 4}px`,
      bottom: openUpward ? `${winHeight - rect.top + 4}px` : 'auto',
      right: `${Math.max(12, winWidth - rect.right)}px`,
    });
    setOpenMenuId(menuKey);
  }, [openMenuId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    function handleDismiss() {
      setOpenMenuId(null);
      setMenuPosition(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, []);

  const handleCloseMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuPosition(null);
  }, []);

  // Multi-step Modal States
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverStep, setDriverStep] = useState(1); // 1: Info, 2: Documents, 3: Success
  const [registeredDriverId, setRegisteredDriverId] = useState("");
  const [driverError, setDriverError] = useState("");

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleStep, setVehicleStep] = useState(1); // 1: Info, 2: Compliance Docs, 3: Success
  const [showVehicleSuccess, setShowVehicleSuccess] = useState(false);
  const [registeredTruckId, setRegisteredTruckId] = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [confirmDiscardTarget, setConfirmDiscardTarget] = useState(null); // 'driver' | 'vehicle' | null

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
    licenseFile: null,
    medicalFile: null,
    nbiFile: null,
  });

  const [vehicleForm, setVehicleForm] = useState(() => ({
    ...INITIAL_VEHICLE_FORM,
    cargoCompatibility: [],
  }));

  // Handler functions for modal open / form reset
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
      licenseFile: null,
      medicalFile: null,
      nbiFile: null,
    });
    setDriverStep(1);
    setDriverError("");
  };

  const resetVehicleForm = () => {
    setVehicleForm({
      ...INITIAL_VEHICLE_FORM,
      cargoCompatibility: [],
    });
    setVehicleStep(1);
    setShowVehicleSuccess(false);
    setVehicleError("");
  };

  const handleRegisterDriverClick = () => {
    resetDriverForm();
    setIsDriverModalOpen(true);
  };

  const handleAddVehicleClick = () => {
    resetVehicleForm();
    setIsVehicleModalOpen(true);
  };

  const handleCloseDriverModal = useCallback(() => {
    if (isSubmittingDriver) return;
    if (isDriverFormDirty(driverForm, driverStep)) {
      setConfirmDiscardTarget('driver');
      return;
    }
    setIsDriverModalOpen(false);
    resetDriverForm();
  }, [isSubmittingDriver, driverForm, driverStep]);

  const handleCloseVehicleModal = useCallback(() => {
    if (isSubmittingTruck) return;
    if (isVehicleFormDirty(vehicleForm, vehicleStep, showVehicleSuccess)) {
      setConfirmDiscardTarget('vehicle');
      return;
    }
    setShowVehicleSuccess(false);
    setIsVehicleModalOpen(false);
    resetVehicleForm();
  }, [isSubmittingTruck, vehicleForm, vehicleStep, showVehicleSuccess]);

  const handleDriverInputChange = (e, field) => {
    setDriverForm(previous => ({ ...previous, [field]: e.target.value }));
    setDriverError("");
  };

  const handleCargoToggle = (id) => {
    const currentCargo = vehicleForm.cargoCompatibility || [];
    const updatedCargo = currentCargo.includes(id)
      ? currentCargo.filter((item) => item !== id)
      : [...currentCargo, id];

    setVehicleForm({ ...vehicleForm, cargoCompatibility: updatedCargo });
    setVehicleError("");
  };

  const handleVehicleInputChange = (e, field) => {
    setVehicleForm(previous => ({ ...previous, [field]: e.target.value }));
    setVehicleError("");
  };

  const handleFile = (event, key) => {
    const file = event.target.files[0] || null;
    try {
      validateComplianceFile(file);
      setVehicleForm(previous => ({ ...previous, [key]: file }));
      setVehicleError("");
    }
    catch (error) {
      event.target.value = '';
      setVehicleError(error.message);
    }
  };

  const handleDriverFile = (event, key) => {
    const file = event.target.files[0] || null;
    try {
      validateComplianceFile(file);
      setDriverForm(previous => ({ ...previous, [key]: file }));
      setDriverError("");
    }
    catch (error) {
      event.target.value = '';
      setDriverError(error.message);
    }
  };

  // Next Step Handlers
  const handleDriverNextStep = () => {
    const error = validateDriverStep1(driverForm);
    if (error) {
      setDriverError(error);
      return;
    }
    setDriverError("");
    setDriverStep(2);
  };

  const handleVehicleNextStep = () => {
    const error = validateVehicleStep1(vehicleForm);
    if (error) {
      setVehicleError(error);
      return;
    }
    setVehicleError("");
    setVehicleStep(2);
  };

  // Submission Handlers
  const handleDriverSubmit = async () => {
    const error = validateDriverSubmit(driverForm);
    if (error) {
      setDriverError(error);
      return;
    }
    try {
      setDriverError("");
      const created = await submitNewDriver(driverForm);
      if (!created?.id) {
        throw new Error("Driver registration was not confirmed by the database.");
      }
      setRegisteredDriverId(`DRV-${created.id.slice(0, 8).toUpperCase()}`);
      setDriverStep(3);
    } catch (err) {
      console.error("Failed to register driver:", err);
      setDriverError("Failed to register driver: " + (err.message || "Unknown error"));
    }
  };

  const handleVehicleSubmit = async () => {
    const error = validateVehicleSubmit(vehicleForm);
    if (error) {
      setVehicleError(error);
      return;
    }
    try {
      setVehicleError("");
      const created = await submitNewTruck(vehicleForm);
      if (!created?.id) {
        throw new Error("Vehicle registration was not confirmed by the database.");
      }
      setRegisteredTruckId(`TRK-${created.id.slice(0, 8).toUpperCase()}`);
      setShowVehicleSuccess(true);
    } catch (err) {
      console.error("Failed to register vehicle:", err);
      setVehicleError("Failed to register vehicle: " + (err.message || "Unknown error"));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      if (deleteTarget.kind === "truck") {
        await removeTruck(deleteTarget.record.id);
        setActionFeedback(`Vehicle "${deleteTarget.record.plate_number}" was successfully removed.`);
      } else if (deleteTarget.kind === "driver") {
        await removeDriver(deleteTarget.record.id);
        setActionFeedback(`Driver "${deleteTarget.record.full_name}" was successfully removed.`);
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err.message || "Failed to remove the record.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <MainLayout>
      {/* Dynamic Topbar Header Context */}
      <header className="topbar fleet-topbar">
        <div className="topbar-right"><OfficeTools /></div>
      </header>

      {/* Primary Scrolling Content Frame */}
      <section className="content scrollable-panel fleet-page">
        {actionFeedback && (
          <div className="fleet-feedback-banner is-success" role="status" aria-live="polite">
            <div className="fleet-feedback-content">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="fleet-feedback-icon" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{actionFeedback}</span>
            </div>
            <button
              type="button"
              className="fleet-feedback-close"
              aria-label="Dismiss notification"
              onClick={() => setActionFeedback("")}
            >
              Dismiss
            </button>
          </div>
        )}
        {fleet.error && <p role="alert">Could not refresh fleet records. {fleet.hasData ? 'Showing last loaded data.' : 'Data is unavailable.'} <button type="button" onClick={fleet.refresh}>Retry</button></p>}

        {activeSubView === "overview" && (
          <FleetOverview
            fleet={fleet}
            kpis={kpis}
            kpisLoading={kpisLoading}
            trucks={trucks}
            trucksLoading={trucksLoading}
            vehicleTypes={vehicleTypes}
            drivers={drivers}
            driversLoading={driversLoading}
            truckComplianceRows={truckComplianceRows}
            driverComplianceRows={driverComplianceRows}
            onAssignDriver={(truck) => setAssignDriverTarget(truck)}
            onOpenDocuments={(target) => setComplianceTarget(target)}
            onRegisterDriver={handleRegisterDriverClick}
            onAddVehicle={handleAddVehicleClick}
          />
        )}

        {activeSubView === "vehicles" && (
          <FleetVehiclesView
            fleet={fleet}
            trucks={trucks}
            trucksLoading={trucksLoading}
            vehicleTypes={vehicleTypes}
            truckComplianceRows={truckComplianceRows}
            readyOnly={readyOnly}
            readyIds={readyIds}
            readyError={readyError}
            onClearReadyOnly={() => setParams({})}
            onAddVehicle={handleAddVehicleClick}
            onEditTruck={(truck) => setEditing({ kind: "truck", record: truck })}
            onOpenDocuments={(truck) => setComplianceTarget({ kind: "truck", entity: truck })}
            onDeleteTruck={(truck) => {
              setDeleteError("");
              setDeleteTarget({ kind: "truck", record: truck });
            }}
            openMenuId={openMenuId}
            menuRef={menuRef}
            menuPosition={menuPosition}
            onOpenMenu={handleOpenMenu}
            onCloseMenu={handleCloseMenu}
          />
        )}

        {activeSubView === "drivers" && (
          <FleetDriversView
            fleet={fleet}
            drivers={drivers}
            driversLoading={driversLoading}
            driverComplianceRows={driverComplianceRows}
            onRegisterDriver={handleRegisterDriverClick}
            onEditDriver={(driver) => setEditing({ kind: "driver", record: driver })}
            onOpenDocuments={(driver) => setComplianceTarget({ kind: "driver", entity: driver })}
            onDeleteDriver={(driver) => {
              setDeleteError("");
              setDeleteTarget({ kind: "driver", record: driver });
            }}
            openMenuId={openMenuId}
            menuRef={menuRef}
            menuPosition={menuPosition}
            onOpenMenu={handleOpenMenu}
            onCloseMenu={handleCloseMenu}
          />
        )}

        {activeSubView === "maintenance" && (
          <FleetMaintenanceView fleet={fleet} />
        )}

      {editing && <FleetEditor key={editing.record.id} {...editing} fleet={fleet} onClose={() => setEditing(null)} onSaved={fleet.refresh} />}
      {assignDriverTarget && (
        <AssignDriverModal
          key={assignDriverTarget.id}
          truck={assignDriverTarget}
          drivers={fleet.assignableDrivers || []}
          onClose={() => setAssignDriverTarget(null)}
          onAssigned={(driverName, plate) => {
            setAssignDriverTarget(null);
            setActionFeedback(`Driver ${driverName} assigned to ${plate}.`);
            fleet.refresh();
          }}
        />
      )}
      {complianceTarget && <ComplianceDialog key={complianceTarget.entity.id} {...complianceTarget} onClose={() => setComplianceTarget(null)} onSaved={fleet.refresh} />}

      {/* ================= REGISTER DRIVER MULTI-STEP MODAL ================= */}
      <FleetModal
        isOpen={isDriverModalOpen}
        onRequestClose={handleCloseDriverModal}
        titleId="register-driver-modal-title"
        isBusy={isSubmittingDriver}
      >
        <div className="modal-header">
          <div>
            <h3 id="register-driver-modal-title">Register New Driver</h3>
            <p className="modal-subtitle">
              {driverStep === 1 && "Basic Information"}
              {driverStep === 2 && "Manual Compliance Documents"}
              {driverStep === 3 && "Registration Executed"}
            </p>
          </div>
          <button className="close-modal-btn" disabled={isSubmittingDriver} onClick={handleCloseDriverModal} aria-label="Close dialog">×</button>
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
          {driverError && (
            <div className="error-message fleet-dialog-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{driverError}</span>
            </div>
          )}
          {driverStep === 1 && (
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="driver-form-full-name">FULL NAME *</label>
                <input id="driver-form-full-name" type="text" placeholder="e.g. Juan dela Cruz" value={driverForm.fullName} onChange={(e) => handleDriverInputChange(e, 'fullName')} />
              </div>
              <div className="form-group">
                <label htmlFor="driver-form-contact-number">CONTACT NUMBER *</label>
                <input id="driver-form-contact-number" type="text" placeholder="09XX XXX XXXX" value={driverForm.contactNumber} onChange={(e) => handleDriverInputChange(e, 'contactNumber')} />
              </div>
              <div className="form-group">
                <label htmlFor="driver-form-date-hired">DATE HIRED</label>
                <input id="driver-form-date-hired" type="date" value={driverForm.dateHired} onChange={(e) => handleDriverInputChange(e, 'dateHired')} />
              </div>
              <div className="form-group">
                <label htmlFor="driver-form-assign-vehicle">ASSIGN VEHICLE</label>
                <select id="driver-form-assign-vehicle" value={driverForm.assignVehicle} onChange={(e) => handleDriverInputChange(e, 'assignVehicle')}>
                  <option value="">Select vehicle...</option>
                  {assignableTrucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.model ? `${truck.model} (${truck.plate_number})` : truck.plate_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label htmlFor="driver-form-emergency-contact">EMERGENCY CONTACT NUMBER</label>
                <input id="driver-form-emergency-contact" type="text" placeholder="09XX XXX XXXX" value={driverForm.emergencyContact} onChange={(e) => handleDriverInputChange(e, 'emergencyContact')} />
              </div>

              <div className="form-divider-title">License Information</div>
              <div className="form-group">
                <label htmlFor="driver-form-license-number">LICENSE NUMBER *</label>
                <input id="driver-form-license-number" type="text" placeholder="e.g. N01-23-45678" value={driverForm.licenseNumber} onChange={(e) => handleDriverInputChange(e, 'licenseNumber')} />
              </div>
              <div className="form-group">
                <label htmlFor="driver-form-license-expiry">LICENSE EXPIRY</label>
                <input id="driver-form-license-expiry" type="date" value={driverForm.licenseExpiry} onChange={(e) => handleDriverInputChange(e, 'licenseExpiry')} />
              </div>

              <div className="form-section-box">
                <h4>Driver Mobile Application Account</h4>
                <div className="form-group full-width">
                  <label htmlFor="driver-form-email">EMAIL ADDRESS</label>
                  <input id="driver-form-email" type="email" placeholder="driver@tanawlogistics.com" value={driverForm.email} onChange={(e) => handleDriverInputChange(e, 'email')} />
                </div>
                <div className="form-group">
                  <label htmlFor="driver-form-password">TEMPORARY PASSWORD</label>
                  <input id="driver-form-password" type="password" placeholder="........" value={driverForm.password} onChange={(e) => handleDriverInputChange(e, 'password')} />
                </div>
                <div className="form-group">
                  <label htmlFor="driver-form-confirm-password">CONFIRM PASSWORD</label>
                  <input id="driver-form-confirm-password" type="password" placeholder="........" value={driverForm.confirmPassword} onChange={(e) => handleDriverInputChange(e, 'confirmPassword')} />
                </div>
                <p className="notice-text">Email and password create a mobile login. The driver can sign in on Tanaw Mobile using either their contact number or email.</p>
              </div>
            </div>
          )}

          {driverStep === 2 && (
            <div className="documents-upload-container">
              <p className="info-banner">Manual compliance entry: Enter driver license, medical clearance, and NBI verification records below.</p>

              <div className="upload-cards-grid">
                {/* Card 1: Driver's License */}
                <div className="upload-card required">
                  <h4>PROFESSIONAL DRIVER'S LICENSE <span className="req-label">REQUIRED</span></h4>
                  <div className="form-grid" style={{ marginTop: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="driver-step2-license-number">LICENSE NUMBER *</label>
                      <input
                        id="driver-step2-license-number"
                        type="text"
                        placeholder="e.g. N01-23-45678"
                        value={driverForm.licenseNumber}
                        onChange={(e) => handleDriverInputChange(e, "licenseNumber")}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver-step2-license-expiry">EXPIRY DATE *</label>
                      <input
                        id="driver-step2-license-expiry"
                        type="date"
                        value={driverForm.licenseExpiry}
                        onChange={(e) => handleDriverInputChange(e, "licenseExpiry")}
                      />
                    </div>
                  </div>
                  <div className="file-upload-dropzone" style={{ marginTop: "14px" }}>
                    <div className="upload-icon-container">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="upload-text-content">
                      <p className="upload-main-text">
                        <span>Choose a file</span>
                      </p>
                      <p className="upload-sub-text">{driverForm.licenseFile ? driverForm.licenseFile.name + ": ready to upload" : "Driver's License Copy (PDF, PNG, JPG up to 10MB)"}</p>
                    </div>
                    <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Driver's license file" onChange={e => handleDriverFile(e, "licenseFile")} />
                  </div>
                </div>

                {/* Card 2: Medical Clearance Certificate */}
                <div className="upload-card required">
                  <h4>MEDICAL CLEARANCE CERTIFICATE <span className="req-label">RECOMMENDED</span></h4>
                  <div className="form-grid" style={{ marginTop: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="driver-step2-medical-number">CERTIFICATE NUMBER / CLINIC</label>
                      <input
                        id="driver-step2-medical-number"
                        type="text"
                        placeholder="e.g. MED-2026-8891"
                        value={driverForm.medicalDocNumber || ""}
                        onChange={(e) => handleDriverInputChange(e, "medicalDocNumber")}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver-step2-medical-expiry">VALID UNTIL / EXPIRY DATE</label>
                      <input
                        id="driver-step2-medical-expiry"
                        type="date"
                        value={driverForm.medicalExpiry || ""}
                        onChange={(e) => handleDriverInputChange(e, "medicalExpiry")}
                      />
                    </div>
                  </div>
                  <div className="file-upload-dropzone" style={{ marginTop: "14px" }}>
                    <div className="upload-icon-container">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="upload-text-content">
                      <p className="upload-main-text">
                        <span>Choose a file</span>
                      </p>
                      <p className="upload-sub-text">{driverForm.medicalFile ? driverForm.medicalFile.name + ": ready to upload" : "Medical Certificate Copy (PDF, PNG, JPG up to 10MB)"}</p>
                    </div>
                    <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Medical certificate file" onChange={e => handleDriverFile(e, "medicalFile")} />
                  </div>
                </div>

                {/* Card 3: NBI Clearance */}
                <div className="upload-card optional">
                  <h4>NATIONAL BUREAU OF INVESTIGATION (NBI) CLEARANCE <span className="opt-label">OPTIONAL</span></h4>
                  <div className="form-grid" style={{ marginTop: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="driver-step2-nbi-number">NBI CLEARANCE NUMBER</label>
                      <input
                        id="driver-step2-nbi-number"
                        type="text"
                        placeholder="e.g. NBI-2026-4492"
                        value={driverForm.nbiDocNumber || ""}
                        onChange={(e) => handleDriverInputChange(e, "nbiDocNumber")}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver-step2-nbi-expiry">EXPIRY DATE</label>
                      <input
                        id="driver-step2-nbi-expiry"
                        type="date"
                        value={driverForm.nbiExpiry || ""}
                        onChange={(e) => handleDriverInputChange(e, "nbiExpiry")}
                      />
                    </div>
                  </div>
                  <div className="file-upload-dropzone" style={{ marginTop: "14px" }}>
                    <div className="upload-icon-container">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="upload-text-content">
                      <p className="upload-main-text">
                        <span>Choose a file</span>
                      </p>
                      <p className="upload-sub-text">{driverForm.nbiFile ? driverForm.nbiFile.name + ": ready to upload" : "NBI Clearance Copy (PDF, PNG, JPG up to 10MB)"}</p>
                    </div>
                    <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="NBI clearance file" onChange={e => handleDriverFile(e, "nbiFile")} />
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
                <p>Status: <span className="text-success">REGISTERED: COMPLIANCE REVIEW PENDING</span></p>
                <p className="subtext">{driverForm.email ? "Driver record and mobile login created. Driver can sign in using their contact number or email. Review compliance before dispatch." : "Driver roster record created without a mobile login. Review compliance before dispatch."}</p>
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
                disabled={isSubmittingDriver}
                onClick={handleCloseDriverModal}
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
                  onClick={handleDriverNextStep}
                >
                  NEXT STEP
                </button>
              </div>
            </>
          )}

          {driverStep === 2 && (
            <>
              <button
                className="btn-link"
                onClick={() => {
                  setDriverError("");
                  setDriverStep(1);
                }}
              >
                BACK
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
                  {isSubmittingDriver ? "Registering..." : "Complete Registration"}
                </button>
              </div>
            </>
          )}

          {driverStep === 3 && (
            <>
              <button
                className="btn-primary"
                onClick={handleCloseDriverModal}
              >
                Close
              </button>
            </>
          )}
        </div>
      </FleetModal>

      {/* ================= ADD VEHICLE MULTI-STEP MODAL ================= */}
      <FleetModal
        isOpen={isVehicleModalOpen}
        onRequestClose={handleCloseVehicleModal}
        titleId="add-vehicle-modal-title"
        isBusy={isSubmittingTruck}
      >
        <div className="modal-header">
          <div>
            <h3 id="add-vehicle-modal-title">Add New Fleet Vehicle</h3>
            <p className="modal-subtitle">
              {vehicleStep === 1 && "Vehicle Technical Specifications"}
              {vehicleStep === 2 && "Compliance and Registration Logs"}
              {vehicleStep === 3 && "Registry Entry Added"}
            </p>
          </div>
          <button className="close-modal-btn" disabled={isSubmittingTruck} onClick={handleCloseVehicleModal} aria-label="Close dialog">×</button>
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
          {vehicleError && (
            <div className="error-message fleet-dialog-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{vehicleError}</span>
            </div>
          )}
          {vehicleStep === 1 && (() => {
            const selectedAddVehicleType = vehicleTypes.find(vt => vt.id === vehicleForm.type);
            return (
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="vehicle-form-plate-number">PLATE NUMBER *</label>
                  <input id="vehicle-form-plate-number" type="text" placeholder="e.g. ABC 1234" value={vehicleForm.plateNumber} onChange={(e) => handleVehicleInputChange(e, 'plateNumber')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-model-year">MODEL YEAR</label>
                  <input id="vehicle-form-model-year" type="text" placeholder="e.g. 2024" value={vehicleForm.modelYear} onChange={(e) => handleVehicleInputChange(e, 'modelYear')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-model">MODEL *</label>
                  <input id="vehicle-form-model" type="text" placeholder="e.g. Isuzu Giga" value={vehicleForm.model} onChange={(e) => handleVehicleInputChange(e, 'model')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-type">VEHICLE TYPE *</label>
                  <select id="vehicle-form-type" value={vehicleForm.type} onChange={(e) => handleVehicleInputChange(e, 'type')}>
                    <option value="">Select type...</option>
                    {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-capacity">MAX CARGO WEIGHT (KG) *</label>
                  <input id="vehicle-form-capacity" type="number" placeholder="15000" value={vehicleForm.capacity} onChange={(e) => handleVehicleInputChange(e, 'capacity')} />
                </div>

                <div className="form-divider-title">HGV Dimensions & Weight Limits (Optional)</div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-height-m">HEIGHT (M)</label>
                  <input id="vehicle-form-height-m" type="number" step="0.01" min="0.01" max="10" placeholder={selectedAddVehicleType?.default_height_m ? String(selectedAddVehicleType.default_height_m) : "e.g. 3.20"} value={vehicleForm.heightM} onChange={(e) => handleVehicleInputChange(e, 'heightM')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-width-m">WIDTH (M)</label>
                  <input id="vehicle-form-width-m" type="number" step="0.01" min="0.01" max="10" placeholder={selectedAddVehicleType?.default_width_m ? String(selectedAddVehicleType.default_width_m) : "e.g. 2.20"} value={vehicleForm.widthM} onChange={(e) => handleVehicleInputChange(e, 'widthM')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-length-m">LENGTH (M)</label>
                  <input id="vehicle-form-length-m" type="number" step="0.01" min="0.01" max="50" placeholder={selectedAddVehicleType?.default_length_m ? String(selectedAddVehicleType.default_length_m) : "e.g. 7.50"} value={vehicleForm.lengthM} onChange={(e) => handleVehicleInputChange(e, 'lengthM')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-tare-weight-kg">TARE WEIGHT (KG)</label>
                  <input id="vehicle-form-tare-weight-kg" type="number" step="any" min="0" placeholder="e.g. 4200" value={vehicleForm.tareWeightKg} onChange={(e) => handleVehicleInputChange(e, 'tareWeightKg')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-gross-weight-kg">GROSS VEHICLE WEIGHT (KG)</label>
                  <input id="vehicle-form-gross-weight-kg" type="number" step="any" min="1" placeholder="e.g. 10200" value={vehicleForm.grossWeightKg} onChange={(e) => handleVehicleInputChange(e, 'grossWeightKg')} />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-axle-count">AXLE COUNT</label>
                  <input id="vehicle-form-axle-count" type="number" step="1" min="2" max="20" placeholder="2" value={vehicleForm.axleCount} onChange={(e) => handleVehicleInputChange(e, 'axleCount')} />
                </div>

                {/* ================= CARGO COMPATIBILITY DYNAMICALLY FROM DB ================= */}
                <div className="form-group full-width">
                  <span className="cargo-title-label">CARGO COMPATIBILITY</span>
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
                              aria-hidden="true"
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
            );
          })()}

          {vehicleStep === 2 && (
            <div className="compliance-documents-view">
              {/* Form Grid for Document Text Fields */}
              <div className="form-grid" style={{ marginBottom: "24px" }}>
                <div className="form-group">
                  <label htmlFor="vehicle-form-or-number">OR NUMBER <span className="required">*</span></label>
                  <input
                    id="vehicle-form-or-number"
                    type="text"
                    placeholder="Enter Official Receipt Number"
                    value={vehicleForm.orNumber || ""}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, orNumber: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="vehicle-form-cr-number">CR NUMBER <span className="required">*</span></label>
                  <input
                    id="vehicle-form-cr-number"
                    type="text"
                    placeholder="Enter Certificate of Registration Number"
                    value={vehicleForm.crNumber || ""}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, crNumber: e.target.value })}
                  />
                </div>
              </div>

              {/* Section Title for File Uploads */}
              <span className="cargo-title-label" style={{ display: "block", marginBottom: "12px" }}>
                Upload Official Compliance Digital Files
              </span>

              {/* File Upload Grid Area */}
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                {/* Upload Box 1: OR File */}
                <div className="file-upload-dropzone">
                  <div className="upload-icon-container">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="upload-text-content">
                    <p className="upload-main-text">
                      <span>Choose a file</span>
                    </p>
                    <p className="upload-sub-text">{vehicleForm.orFile ? vehicleForm.orFile.name + ": ready to upload" : "Official Receipt (OR) Copy (PDF, PNG, JPG up to 10MB)"}</p>
                  </div>
                  <input type="file" className="hidden-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Official receipt file" onChange={e => handleFile(e, "orFile")} />
                </div>

                {/* Upload Box 2: CR File */}
                <div className="file-upload-dropzone">
                  <div className="upload-icon-container">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="upload-text-content">
                    <p className="upload-main-text">
                      <span>Choose a file</span>
                    </p>
                    <p className="upload-sub-text">{vehicleForm.crFile ? vehicleForm.crFile.name + ": ready to upload" : "Certificate of Registration (CR) Copy (PDF, PNG, JPG up to 10MB)"}</p>
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
                disabled={isSubmittingTruck}
                onClick={handleCloseVehicleModal}
              >
                CANCEL
              </button>

              <div className="footer-right-buttons">
                <button
                  className="btn-primary"
                  onClick={handleVehicleNextStep}
                >
                  NEXT STEP
                </button>
              </div>
            </>
          )}

          {vehicleStep === 2 && (
            <>
              <button
                className="btn-link"
                disabled={isSubmittingTruck}
                onClick={() => {
                  setVehicleError("");
                  setVehicleStep(1);
                }}
              >
                BACK
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
                  {isSubmittingTruck ? "Registering..." : "Complete Registration"}
                </button>
              </div>
            </>
          )}
        </div>

        {showVehicleSuccess && (
          <div className="modal-backdrop">
            <div className="vehicle-success-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-success-modal-title">
              <div className="success-icon">
                ✓
              </div>

              <h2 id="vehicle-success-modal-title">
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
                onClick={handleCloseVehicleModal}
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
                onClick={handleCloseVehicleModal}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </FleetModal>

      {confirmDiscardTarget && (
        <FleetDiscardDialog
          title={confirmDiscardTarget === 'driver' ? "Discard driver registration?" : "Discard vehicle registration?"}
          description="You have unsaved changes in this registration draft. If you leave now, the information and documents you entered will be lost."
          discardLabel="Discard changes"
          onKeepEditing={() => setConfirmDiscardTarget(null)}
          onDiscard={() => {
            if (confirmDiscardTarget === 'driver') {
              setIsDriverModalOpen(false);
              resetDriverForm();
            } else if (confirmDiscardTarget === 'vehicle') {
              setShowVehicleSuccess(false);
              setIsVehicleModalOpen(false);
              resetVehicleForm();
            }
            setConfirmDiscardTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <FleetDeleteDialog
          title={deleteTarget.kind === "truck" ? `Delete Vehicle ${deleteTarget.record.plate_number}?` : `Delete Driver ${deleteTarget.record.full_name}?`}
          description={
            deleteTarget.kind === "truck"
              ? `Are you sure you want to remove vehicle ${deleteTarget.record.plate_number} (${deleteTarget.record.model || "Unknown model"}) from the fleet? Associated cargo categories, maintenance records, and compliance records will also be removed. Vehicles with active deliveries cannot be deleted.`
              : `Are you sure you want to remove driver ${deleteTarget.record.full_name} from the roster? Any assigned vehicle will be unlinked, and compliance documents will be removed. Drivers with active deliveries cannot be deleted.`
          }
          confirmLabel={deleteTarget.kind === "truck" ? "Delete Vehicle" : "Delete Driver"}
          isDeleting={isDeleting}
          error={deleteError}
          onCancel={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
              setDeleteError("");
            }
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
      </section>
    </MainLayout>
  );
}
