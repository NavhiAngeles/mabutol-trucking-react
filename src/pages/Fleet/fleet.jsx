// fleet.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { getDispatchReadyTruckIds, subscribeToDashboardChanges } from '../../services/dashboardService';
import MainLayout from "../../layouts/mainLayout";
import { useFleetViewModel } from "../../viewmodels/FleetViewModel";
import "./fleet.css";
import OfficeTools from "../../components/OfficeTools";
import { FleetEditor, AssignDriverModal, ComplianceDialog, FleetModal, FleetDiscardDialog, FleetDeleteDialog } from "./FleetDialogs";
import {
  DEFAULT_DRIVER_TEMP_PASSWORD,
  INITIAL_DRIVER_FORM,
  INITIAL_VEHICLE_FORM,
  findDuplicateDriver,
  formatLtoLicenseInput,
  formatPhMobileInput,
  getManilaTodayIso,
  getVehicleCapacityBounds,
  isDriverFormDirty,
  isValidDriverEmail,
  isValidDriverLicenseNumber,
  isVehicleFormDirty,
  normalizeDriverPhone,
  validateDriverStep1,
  validateDriverSubmit,
  validateVehicleCapacity,
  validateVehicleStep1,
  validateVehicleSubmit,
} from "./fleetDraftHelpers";
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
  const [driverTouched, setDriverTouched] = useState({});
  const [enableDriverMobileAccount, setEnableDriverMobileAccount] = useState(false);
  const [useCustomDriverPassword, setUseCustomDriverPassword] = useState(false);
  const [showDriverPassword, setShowDriverPassword] = useState(false);
  const [copiedDriverPassword, setCopiedDriverPassword] = useState(false);

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleStep, setVehicleStep] = useState(1); // 1: Info, 2: Compliance Docs, 3: Success
  const [showVehicleSuccess, setShowVehicleSuccess] = useState(false);
  const [registeredTruckId, setRegisteredTruckId] = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [vehicleCapacityTouched, setVehicleCapacityTouched] = useState(false);
  const [confirmDiscardTarget, setConfirmDiscardTarget] = useState(null); // 'driver' | 'vehicle' | null

  const todayIso = useMemo(() => getManilaTodayIso(), []);

  // Form Field States
  const [driverForm, setDriverForm] = useState(() => ({
    ...INITIAL_DRIVER_FORM,
    dateHired: getManilaTodayIso(),
  }));

  const [vehicleForm, setVehicleForm] = useState(() => ({
    ...INITIAL_VEHICLE_FORM,
    cargoCompatibility: [],
  }));

  const duplicateDriverMatch = useMemo(
    () =>
      findDuplicateDriver(drivers, {
        fullName: driverForm.fullName,
        contactNumber: driverForm.contactNumber,
        licenseNumber: driverForm.licenseNumber,
      }),
    [drivers, driverForm.fullName, driverForm.contactNumber, driverForm.licenseNumber]
  );

  // Handler functions for modal open / form reset
  const resetDriverForm = () => {
    setDriverForm({
      ...INITIAL_DRIVER_FORM,
      dateHired: getManilaTodayIso(),
    });
    setDriverTouched({});
    setEnableDriverMobileAccount(false);
    setUseCustomDriverPassword(false);
    setShowDriverPassword(false);
    setCopiedDriverPassword(false);
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
    setVehicleCapacityTouched(false);
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
    let val = e.target.value;
    if (field === "contactNumber" || field === "emergencyContact") {
      val = formatPhMobileInput(val);
    } else if (field === "licenseNumber") {
      val = formatLtoLicenseInput(val);
    }
    setDriverForm((previous) => ({
      ...previous,
      [field]: val,
      ...(field === "password" && !useCustomDriverPassword ? { confirmPassword: val } : {}),
    }));
    setDriverError("");
  };

  const handleDriverPhonePaste = (e, field) => {
    const pasted = e?.clipboardData?.getData?.("text");
    if (typeof pasted === "string" && pasted.length > 0) {
      e.preventDefault();
      const formatted = formatPhMobileInput(pasted);
      setDriverForm((previous) => ({ ...previous, [field]: formatted }));
      setDriverError("");
    }
  };

  const handleDriverFieldBlur = (field) => {
    setDriverTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleToggleDriverMobileAccount = () => {
    setEnableDriverMobileAccount((prev) => {
      const next = !prev;
      if (!next) {
        setDriverForm((f) => ({
          ...f,
          email: "",
          password: DEFAULT_DRIVER_TEMP_PASSWORD,
          confirmPassword: DEFAULT_DRIVER_TEMP_PASSWORD,
        }));
        setUseCustomDriverPassword(false);
        setShowDriverPassword(false);
      } else {
        setDriverForm((f) => ({
          ...f,
          password: f.password || DEFAULT_DRIVER_TEMP_PASSWORD,
          confirmPassword: f.confirmPassword || f.password || DEFAULT_DRIVER_TEMP_PASSWORD,
        }));
      }
      return next;
    });
    setDriverError("");
  };

  const handleCopyDriverPassword = async () => {
    const pwdToCopy = driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pwdToCopy);
      }
      setCopiedDriverPassword(true);
      setTimeout(() => setCopiedDriverPassword(false), 2000);
    } catch {
      setCopiedDriverPassword(true);
      setTimeout(() => setCopiedDriverPassword(false), 2000);
    }
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
    setDriverTouched((prev) => ({
      ...prev,
      fullName: true,
      contactNumber: true,
      emergencyContact: true,
      dateHired: true,
      ...(enableDriverMobileAccount ? { email: true, password: true, confirmPassword: true } : {}),
    }));
    if (enableDriverMobileAccount && !driverForm.email.trim()) {
      setDriverError("Enter the driver's email address to enable mobile application login, or turn off Mobile Access for a roster-only record.");
      return;
    }
    const effectiveForm = {
      ...driverForm,
      email: enableDriverMobileAccount ? driverForm.email : "",
      password: enableDriverMobileAccount ? (driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD) : "",
      confirmPassword: enableDriverMobileAccount
        ? (useCustomDriverPassword ? driverForm.confirmPassword : (driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD))
        : "",
    };
    const error = validateDriverStep1(effectiveForm, { todayIso });
    if (error) {
      setDriverError(error);
      return;
    }
    setDriverError("");
    setDriverStep(2);
  };

  const handleVehicleNextStep = () => {
    setVehicleCapacityTouched(true);
    const error = validateVehicleStep1(vehicleForm, { vehicleTypes });
    if (error) {
      setVehicleError(error);
      return;
    }
    setVehicleError("");
    setVehicleStep(2);
  };

  // Submission Handlers
  const handleDriverSubmit = async () => {
    setDriverTouched((prev) => ({
      ...prev,
      fullName: true,
      contactNumber: true,
      emergencyContact: true,
      dateHired: true,
      licenseNumber: true,
      licenseExpiry: true,
      medicalExpiry: true,
      nbiExpiry: true,
      ...(enableDriverMobileAccount ? { email: true, password: true, confirmPassword: true } : {}),
    }));
    if (enableDriverMobileAccount && !driverForm.email.trim()) {
      setDriverError("Enter the driver's email address to enable mobile application login, or turn off Mobile Access for a roster-only record.");
      return;
    }
    const submissionForm = {
      ...driverForm,
      email: enableDriverMobileAccount ? driverForm.email.trim() : "",
      password: enableDriverMobileAccount ? (driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD) : "",
      confirmPassword: enableDriverMobileAccount
        ? (useCustomDriverPassword ? driverForm.confirmPassword : (driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD))
        : "",
    };
    const error = validateDriverSubmit(submissionForm, { todayIso });
    if (error) {
      setDriverError(error);
      return;
    }
    try {
      setDriverError("");
      const created = await submitNewDriver(submissionForm);
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
    setVehicleCapacityTouched(true);
    const error = validateVehicleSubmit(vehicleForm, { vehicleTypes });
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
              {driverStep === 1 && "Step 1 of 2: Driver profile, emergency contact, and optional mobile access"}
              {driverStep === 2 && "Step 2 of 2: Professional driver's license, medical certificate, and NBI clearance"}
              {driverStep === 3 && "Driver record saved to roster"}
            </p>
          </div>
          <button
            type="button"
            className="close-modal-btn"
            disabled={isSubmittingDriver}
            onClick={handleCloseDriverModal}
            aria-label="Close dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Steps Progress Metrics Indicator */}
        <nav className="modal-steps-indicator" aria-label="Driver registration steps">
          <span
            className={`step-badge ${driverStep === 1 ? "active" : driverStep > 1 ? "completed" : ""}`}
            aria-current={driverStep === 1 ? "step" : undefined}
          >
            <span className="step-num" aria-hidden="true">{driverStep > 1 ? "✓" : "1"}</span>
            <span>Basic Information</span>
          </span>

          <span className={`step-line ${driverStep > 1 ? "completed" : ""}`} aria-hidden="true"></span>

          <span
            className={`step-badge ${driverStep === 2 ? "active" : driverStep > 2 ? "completed" : ""}`}
            aria-current={driverStep === 2 ? "step" : undefined}
          >
            <span className="step-num" aria-hidden="true">{driverStep > 2 ? "✓" : "2"}</span>
            <span>Compliance Documents</span>
          </span>

          <span className={`step-line ${driverStep > 2 ? "completed" : ""}`} aria-hidden="true"></span>

          <span
            className={`step-badge ${driverStep === 3 ? "active" : ""}`}
            aria-current={driverStep === 3 ? "step" : undefined}
          >
            <span className="step-num" aria-hidden="true">3</span>
            <span>Confirmation</span>
          </span>
        </nav>

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

          {driverStep !== 3 && duplicateDriverMatch && (
            <div className="driver-duplicate-callout" role="status" aria-live="polite">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{duplicateDriverMatch.message}</span>
            </div>
          )}

          {driverStep === 1 && (() => {
            const fullNameInvalid = Boolean(driverTouched.fullName && driverForm.fullName.trim().length < 2);
            const contactNormalized = normalizeDriverPhone(driverForm.contactNumber);
            const contactInvalid = Boolean(driverTouched.contactNumber && !contactNormalized);
            const emergencyHasValue = Boolean(driverForm.emergencyContact.trim());
            const emergencyNormalized = emergencyHasValue ? normalizeDriverPhone(driverForm.emergencyContact) : null;
            const emergencySameAsPrimary = Boolean(
              emergencyHasValue && contactNormalized && emergencyNormalized && emergencyNormalized === contactNormalized
            );
            const emergencyInvalid = Boolean(
              driverTouched.emergencyContact && emergencyHasValue && (!emergencyNormalized || emergencySameAsPrimary)
            );
            const dateHiredInvalid = Boolean(
              driverTouched.dateHired && driverForm.dateHired && todayIso && driverForm.dateHired > todayIso
            );
            const emailInvalid = Boolean(
              enableDriverMobileAccount &&
                driverTouched.email &&
                (!driverForm.email.trim() || !isValidDriverEmail(driverForm.email))
            );
            const activePassword = driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD;
            const passwordInvalid = Boolean(
              enableDriverMobileAccount &&
                useCustomDriverPassword &&
                driverTouched.password &&
                activePassword.length < 6
            );
            const confirmInvalid = Boolean(
              enableDriverMobileAccount &&
                useCustomDriverPassword &&
                driverTouched.confirmPassword &&
                driverForm.confirmPassword !== activePassword
            );
            const formattedDisplayPhone = driverForm.contactNumber ? `+63 ${driverForm.contactNumber}` : "";

            return (
              <div className="driver-reg-sections">
                {/* Section 1: Driver Identity & Assignment */}
                <fieldset className="driver-form-section" disabled={isSubmittingDriver}>
                  <legend className="driver-section-legend">1. Driver Profile &amp; Vehicle Assignment</legend>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="driver-form-full-name">
                        Full Name <span className="field-required">*</span>
                      </label>
                      <input
                        id="driver-form-full-name"
                        name="fullName"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="e.g. Juan dela Cruz"
                        disabled={isSubmittingDriver}
                        value={driverForm.fullName}
                        aria-invalid={fullNameInvalid ? "true" : "false"}
                        aria-describedby={fullNameInvalid ? "driver-full-name-error" : undefined}
                        onBlur={() => handleDriverFieldBlur("fullName")}
                        onChange={(e) => handleDriverInputChange(e, "fullName")}
                      />
                      {fullNameInvalid && (
                        <span id="driver-full-name-error" className="form-field-error">
                          Enter the driver&apos;s full name (at least 2 characters).
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="driver-form-contact-number">
                        Contact Number <span className="field-required">*</span>
                      </label>
                      <div className={`driver-phone-input-wrap ${contactInvalid ? "is-invalid" : ""}`}>
                        <span className="driver-phone-prefix" aria-hidden="true">+63</span>
                        <input
                          id="driver-form-contact-number"
                          name="contactNumber"
                          type="tel"
                          inputMode="tel"
                          required
                          autoComplete="tel-national"
                          placeholder="9XX XXX XXXX"
                          disabled={isSubmittingDriver}
                          value={driverForm.contactNumber}
                          aria-invalid={contactInvalid ? "true" : "false"}
                          aria-describedby={contactInvalid ? "driver-contact-error" : "driver-contact-hint"}
                          onBlur={() => handleDriverFieldBlur("contactNumber")}
                          onChange={(e) => handleDriverInputChange(e, "contactNumber")}
                          onPaste={(e) => handleDriverPhonePaste(e, "contactNumber")}
                        />
                      </div>
                      {contactInvalid ? (
                        <span id="driver-contact-error" className="form-field-error">
                          Enter a valid 10-digit Philippine mobile number starting with 9 (e.g. 917 123 4567).
                        </span>
                      ) : (
                        <span id="driver-contact-hint" className="form-field-hint">
                          Used for dispatch calls and Tanaw Mobile phone sign-in.
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="driver-form-date-hired">Date Hired</label>
                      <input
                        id="driver-form-date-hired"
                        name="dateHired"
                        type="date"
                        max={todayIso || undefined}
                        disabled={isSubmittingDriver}
                        value={driverForm.dateHired}
                        aria-invalid={dateHiredInvalid ? "true" : "false"}
                        aria-describedby={dateHiredInvalid ? "driver-date-hired-error" : "driver-date-hired-hint"}
                        onBlur={() => handleDriverFieldBlur("dateHired")}
                        onChange={(e) => handleDriverInputChange(e, "dateHired")}
                      />
                      {dateHiredInvalid ? (
                        <span id="driver-date-hired-error" className="form-field-error">
                          Date hired cannot be in the future.
                        </span>
                      ) : (
                        <span id="driver-date-hired-hint" className="form-field-hint">
                          Defaults to today (Asia/Manila).
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="driver-form-assign-vehicle">Assign Vehicle (Optional)</label>
                      <select
                        id="driver-form-assign-vehicle"
                        name="assignVehicle"
                        disabled={isSubmittingDriver}
                        value={driverForm.assignVehicle}
                        onChange={(e) => handleDriverInputChange(e, "assignVehicle")}
                      >
                        <option value="">Unassigned (assign later)</option>
                        {assignableTrucks.map((truck) => (
                          <option key={truck.id} value={truck.id}>
                            {truck.model ? `${truck.model} (${truck.plate_number})` : truck.plate_number}
                          </option>
                        ))}
                      </select>
                      <span className="form-field-hint">
                        {assignableTrucks.length > 0
                          ? `${assignableTrucks.length} dispatch-ready ${assignableTrucks.length === 1 ? "vehicle" : "vehicles"} available.`
                          : "No unassigned dispatch-ready vehicles at the moment."}
                      </span>
                    </div>
                  </div>
                </fieldset>

                {/* Section 2: Emergency Contact & Operational Notes */}
                <fieldset className="driver-form-section" disabled={isSubmittingDriver}>
                  <legend className="driver-section-legend">2. Emergency Contact &amp; Notes (Optional)</legend>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="driver-form-emergency-name">Emergency Contact Person</label>
                      <input
                        id="driver-form-emergency-name"
                        name="emergencyContactName"
                        type="text"
                        placeholder="e.g. Maria dela Cruz (Spouse)"
                        disabled={isSubmittingDriver}
                        value={driverForm.emergencyContactName || ""}
                        onChange={(e) => handleDriverInputChange(e, "emergencyContactName")}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="driver-form-emergency-contact">Emergency Contact Number</label>
                      <div className={`driver-phone-input-wrap ${emergencyInvalid ? "is-invalid" : ""}`}>
                        <span className="driver-phone-prefix" aria-hidden="true">+63</span>
                        <input
                          id="driver-form-emergency-contact"
                          name="emergencyContact"
                          type="tel"
                          inputMode="tel"
                          placeholder="9XX XXX XXXX"
                          disabled={isSubmittingDriver}
                          value={driverForm.emergencyContact}
                          aria-invalid={emergencyInvalid ? "true" : "false"}
                          aria-describedby={emergencyInvalid ? "driver-emergency-error" : undefined}
                          onBlur={() => handleDriverFieldBlur("emergencyContact")}
                          onChange={(e) => handleDriverInputChange(e, "emergencyContact")}
                          onPaste={(e) => handleDriverPhonePaste(e, "emergencyContact")}
                        />
                      </div>
                      {emergencyInvalid && (
                        <span id="driver-emergency-error" className="form-field-error">
                          {emergencySameAsPrimary
                            ? "Emergency contact number must be different from the driver's primary number."
                            : "Enter a valid 10-digit Philippine mobile number (e.g. 918 234 5678)."}
                        </span>
                      )}
                    </div>

                    <div className="form-group full-width">
                      <label htmlFor="driver-form-notes">Operational Notes</label>
                      <input
                        id="driver-form-notes"
                        name="notes"
                        type="text"
                        placeholder="e.g. Familiar with NLEX/TPLEX North Luzon routes, night-shift certified"
                        disabled={isSubmittingDriver}
                        value={driverForm.notes || ""}
                        onChange={(e) => handleDriverInputChange(e, "notes")}
                      />
                    </div>
                  </div>
                </fieldset>

                {/* Section 3: Driver Mobile Application Account */}
                <div className={`driver-cred-box ${enableDriverMobileAccount ? "is-enabled" : ""}`}>
                  <div className="driver-cred-header">
                    <div className="driver-cred-header-info">
                      <div className="driver-cred-icon-badge" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="driver-cred-title">Driver Mobile Application Account</h4>
                        <p className="driver-cred-subtitle">
                          Provision Tanaw Mobile login credentials using the default temporary password (<code>{DEFAULT_DRIVER_TEMP_PASSWORD}</code>).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`driver-cred-toggle-btn ${enableDriverMobileAccount ? "is-active" : ""}`}
                      aria-pressed={enableDriverMobileAccount}
                      disabled={isSubmittingDriver}
                      onClick={handleToggleDriverMobileAccount}
                    >
                      {enableDriverMobileAccount ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      )}
                      <span>{enableDriverMobileAccount ? "Mobile Access Active" : "+ Enable Mobile Access"}</span>
                    </button>
                  </div>

                  {enableDriverMobileAccount && (
                    <div className="driver-cred-body">
                      <div className="form-grid">
                        <div className="form-group full-width">
                          <label htmlFor="driver-form-email">
                            Driver Email Address <span className="field-required">*</span>
                          </label>
                          <input
                            id="driver-form-email"
                            name="email"
                            type="email"
                            required
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="e.g. juan.delacruz@tanawlogistics.com"
                            disabled={isSubmittingDriver}
                            value={driverForm.email}
                            aria-invalid={emailInvalid ? "true" : "false"}
                            aria-describedby={emailInvalid ? "driver-email-error" : undefined}
                            onBlur={() => handleDriverFieldBlur("email")}
                            onChange={(e) => handleDriverInputChange(e, "email")}
                          />
                          {emailInvalid && (
                            <span id="driver-email-error" className="form-field-error">
                              Enter a valid email address (e.g. driver@tanawlogistics.com).
                            </span>
                          )}
                        </div>

                        {!useCustomDriverPassword ? (
                          <div className="form-group full-width">
                            <div className="driver-default-pwd-bar">
                              <div className="driver-default-pwd-info">
                                <span className="driver-default-pwd-label">Default Temporary Password</span>
                                <div className="driver-default-pwd-value-row">
                                  <code className="driver-default-pwd-chip">
                                    {showDriverPassword ? DEFAULT_DRIVER_TEMP_PASSWORD : "•••••••••"}
                                  </code>
                                  <span className="driver-default-pwd-tag">Pre-filled automatically</span>
                                </div>
                              </div>
                              <div className="driver-default-pwd-actions">
                                <button
                                  type="button"
                                  className="btn-secondary small"
                                  disabled={isSubmittingDriver}
                                  aria-pressed={showDriverPassword}
                                  aria-label={showDriverPassword ? "Hide default temporary password" : "Show default temporary password"}
                                  onClick={() => setShowDriverPassword((v) => !v)}
                                >
                                  {showDriverPassword ? "Hide" : "Show"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary small"
                                  disabled={isSubmittingDriver}
                                  onClick={handleCopyDriverPassword}
                                >
                                  {copiedDriverPassword ? "Copied" : "Copy"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary small"
                                  disabled={isSubmittingDriver}
                                  onClick={() => {
                                    setUseCustomDriverPassword(true);
                                    setDriverForm((prev) => ({
                                      ...prev,
                                      password: prev.password || DEFAULT_DRIVER_TEMP_PASSWORD,
                                      confirmPassword: prev.password || DEFAULT_DRIVER_TEMP_PASSWORD,
                                    }));
                                  }}
                                >
                                  Customize
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="form-group">
                              <label htmlFor="driver-form-password">
                                Custom Temporary Password <span className="field-required">*</span>
                              </label>
                              <div className="driver-password-input-wrap">
                                <input
                                  id="driver-form-password"
                                  name="password"
                                  type={showDriverPassword ? "text" : "password"}
                                  autoComplete="new-password"
                                  placeholder="Min. 6 characters"
                                  disabled={isSubmittingDriver}
                                  value={driverForm.password}
                                  aria-invalid={passwordInvalid ? "true" : "false"}
                                  aria-describedby={passwordInvalid ? "driver-password-error" : undefined}
                                  onBlur={() => handleDriverFieldBlur("password")}
                                  onChange={(e) => handleDriverInputChange(e, "password")}
                                />
                                <button
                                  type="button"
                                  className="driver-pwd-toggle"
                                  disabled={isSubmittingDriver}
                                  aria-pressed={showDriverPassword}
                                  aria-label={showDriverPassword ? "Hide password" : "Show password"}
                                  onClick={() => setShowDriverPassword((v) => !v)}
                                >
                                  {showDriverPassword ? "Hide" : "Show"}
                                </button>
                              </div>
                              {passwordInvalid && (
                                <span id="driver-password-error" className="form-field-error">
                                  Temporary password must be at least 6 characters.
                                </span>
                              )}
                            </div>

                            <div className="form-group">
                              <label htmlFor="driver-form-confirm-password">
                                Confirm Password <span className="field-required">*</span>
                              </label>
                              <input
                                id="driver-form-confirm-password"
                                name="confirmPassword"
                                type={showDriverPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Repeat temporary password"
                                disabled={isSubmittingDriver}
                                value={driverForm.confirmPassword}
                                aria-invalid={confirmInvalid ? "true" : "false"}
                                aria-describedby={confirmInvalid ? "driver-confirm-password-error" : undefined}
                                onBlur={() => handleDriverFieldBlur("confirmPassword")}
                                onChange={(e) => handleDriverInputChange(e, "confirmPassword")}
                              />
                              {confirmInvalid && (
                                <span id="driver-confirm-password-error" className="form-field-error">
                                  Passwords do not match.
                                </span>
                              )}
                            </div>

                            <div className="form-group full-width">
                              <button
                                type="button"
                                className="driver-reset-default-pwd-btn"
                                disabled={isSubmittingDriver}
                                onClick={() => {
                                  setUseCustomDriverPassword(false);
                                  setDriverForm((prev) => ({
                                    ...prev,
                                    password: DEFAULT_DRIVER_TEMP_PASSWORD,
                                    confirmPassword: DEFAULT_DRIVER_TEMP_PASSWORD,
                                  }));
                                }}
                              >
                                Use default temporary password ({DEFAULT_DRIVER_TEMP_PASSWORD}) instead
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <p className="notice-text">
                        The driver can sign in on Tanaw Mobile using either their contact number ({formattedDisplayPhone || "entered above"}) or email ({driverForm.email.trim() || "entered above"}) with this temporary password.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {driverStep === 2 && (() => {
            const licenseInvalid = Boolean(
              driverTouched.licenseNumber &&
                (!driverForm.licenseNumber.trim() || !isValidDriverLicenseNumber(driverForm.licenseNumber))
            );
            const licenseExpiryInvalid = Boolean(
              driverTouched.licenseExpiry &&
                driverForm.licenseExpiry &&
                todayIso &&
                driverForm.licenseExpiry < todayIso
            );
            const medicalExpiryInvalid = Boolean(
              driverTouched.medicalExpiry &&
                driverForm.medicalExpiry &&
                todayIso &&
                driverForm.medicalExpiry < todayIso
            );
            const nbiExpiryInvalid = Boolean(
              driverTouched.nbiExpiry &&
                driverForm.nbiExpiry &&
                todayIso &&
                driverForm.nbiExpiry < todayIso
            );

            return (
              <div className="documents-upload-container">
                <p className="info-banner">
                  Enter the driver&apos;s professional license details (required) and attach any available compliance scans (PDF, PNG, JPG, or WebP up to 10 MB).
                </p>

                <div className="upload-cards-grid">
                  {/* Card 1: Driver's License */}
                  <div className="upload-card">
                    <div className="upload-card-header">
                      <h4>Professional Driver&apos;s License</h4>
                      <span className="doc-req-badge is-required">Required</span>
                    </div>
                    <div className="form-grid" style={{ marginTop: "12px" }}>
                      <div className="form-group">
                        <label htmlFor="driver-step2-license-number">
                          License Number <span className="field-required">*</span>
                        </label>
                        <input
                          id="driver-step2-license-number"
                          name="licenseNumber"
                          type="text"
                          required
                          autoFocus
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          placeholder="e.g. N01-23-456789"
                          disabled={isSubmittingDriver}
                          value={driverForm.licenseNumber}
                          aria-invalid={licenseInvalid ? "true" : "false"}
                          aria-describedby={licenseInvalid ? "driver-license-error" : "driver-license-hint"}
                          onBlur={() => handleDriverFieldBlur("licenseNumber")}
                          onChange={(e) => handleDriverInputChange(e, "licenseNumber")}
                        />
                        {licenseInvalid ? (
                          <span id="driver-license-error" className="form-field-error">
                            Enter a valid LTO license number (e.g. N01-23-456789).
                          </span>
                        ) : (
                          <span id="driver-license-hint" className="form-field-hint">
                            Auto-formats standard LTO codes as you type.
                          </span>
                        )}
                      </div>
                      <div className="form-group">
                        <label htmlFor="driver-step2-license-expiry">Expiry Date</label>
                        <input
                          id="driver-step2-license-expiry"
                          name="licenseExpiry"
                          type="date"
                          min={todayIso || undefined}
                          disabled={isSubmittingDriver}
                          value={driverForm.licenseExpiry}
                          aria-invalid={licenseExpiryInvalid ? "true" : "false"}
                          aria-describedby={licenseExpiryInvalid ? "driver-license-expiry-error" : undefined}
                          onBlur={() => handleDriverFieldBlur("licenseExpiry")}
                          onChange={(e) => handleDriverInputChange(e, "licenseExpiry")}
                        />
                        {licenseExpiryInvalid && (
                          <span id="driver-license-expiry-error" className="form-field-error">
                            License expiry date cannot be in the past.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`file-upload-dropzone ${driverForm.licenseFile ? "has-file" : ""}`} style={{ marginTop: "14px" }}>
                      <div className="upload-icon-container">
                        {driverForm.licenseFile ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        )}
                      </div>
                      <div className="upload-text-content">
                        <p className="upload-main-text">
                          <span>{driverForm.licenseFile ? "Replace file" : "Choose a file"}</span>
                        </p>
                        <p className="upload-sub-text">
                          {driverForm.licenseFile
                            ? `${driverForm.licenseFile.name} (${(driverForm.licenseFile.size / 1024 / 1024).toFixed(2)} MB) ready to upload`
                            : "Driver's License Copy (PDF, PNG, JPG, WebP up to 10 MB)"}
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden-file-input"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        aria-label="Driver's license file"
                        disabled={isSubmittingDriver}
                        onChange={(e) => handleDriverFile(e, "licenseFile")}
                      />
                    </div>
                    {driverForm.licenseFile && (
                      <div className="uploaded-file-actions">
                        <button
                          type="button"
                          className="remove-file-btn"
                          disabled={isSubmittingDriver}
                          onClick={() => setDriverForm((prev) => ({ ...prev, licenseFile: null }))}
                        >
                          Remove attached license file
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Medical Clearance Certificate */}
                  <div className="upload-card">
                    <div className="upload-card-header">
                      <h4>Medical Clearance Certificate</h4>
                      <span className="doc-req-badge is-recommended">Recommended</span>
                    </div>
                    <div className="form-grid" style={{ marginTop: "12px" }}>
                      <div className="form-group">
                        <label htmlFor="driver-step2-medical-number">Certificate Number / Clinic</label>
                        <input
                          id="driver-step2-medical-number"
                          name="medicalDocNumber"
                          type="text"
                          placeholder="e.g. MED-2026-8891"
                          disabled={isSubmittingDriver}
                          value={driverForm.medicalDocNumber || ""}
                          onChange={(e) => handleDriverInputChange(e, "medicalDocNumber")}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="driver-step2-medical-expiry">Valid Until / Expiry Date</label>
                        <input
                          id="driver-step2-medical-expiry"
                          name="medicalExpiry"
                          type="date"
                          min={todayIso || undefined}
                          disabled={isSubmittingDriver}
                          value={driverForm.medicalExpiry || ""}
                          aria-invalid={medicalExpiryInvalid ? "true" : "false"}
                          aria-describedby={medicalExpiryInvalid ? "driver-medical-expiry-error" : undefined}
                          onBlur={() => handleDriverFieldBlur("medicalExpiry")}
                          onChange={(e) => handleDriverInputChange(e, "medicalExpiry")}
                        />
                        {medicalExpiryInvalid && (
                          <span id="driver-medical-expiry-error" className="form-field-error">
                            Medical certificate expiry date cannot be in the past.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`file-upload-dropzone ${driverForm.medicalFile ? "has-file" : ""}`} style={{ marginTop: "14px" }}>
                      <div className="upload-icon-container">
                        {driverForm.medicalFile ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        )}
                      </div>
                      <div className="upload-text-content">
                        <p className="upload-main-text">
                          <span>{driverForm.medicalFile ? "Replace file" : "Choose a file"}</span>
                        </p>
                        <p className="upload-sub-text">
                          {driverForm.medicalFile
                            ? `${driverForm.medicalFile.name} (${(driverForm.medicalFile.size / 1024 / 1024).toFixed(2)} MB) ready to upload`
                            : "Medical Certificate Copy (PDF, PNG, JPG, WebP up to 10 MB)"}
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden-file-input"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        aria-label="Medical certificate file"
                        disabled={isSubmittingDriver}
                        onChange={(e) => handleDriverFile(e, "medicalFile")}
                      />
                    </div>
                    {driverForm.medicalFile && (
                      <div className="uploaded-file-actions">
                        <button
                          type="button"
                          className="remove-file-btn"
                          disabled={isSubmittingDriver}
                          onClick={() => setDriverForm((prev) => ({ ...prev, medicalFile: null }))}
                        >
                          Remove attached medical file
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 3: NBI Clearance */}
                  <div className="upload-card">
                    <div className="upload-card-header">
                      <h4>National Bureau of Investigation (NBI) Clearance</h4>
                      <span className="doc-req-badge is-optional">Optional</span>
                    </div>
                    <div className="form-grid" style={{ marginTop: "12px" }}>
                      <div className="form-group">
                        <label htmlFor="driver-step2-nbi-number">NBI Clearance Number</label>
                        <input
                          id="driver-step2-nbi-number"
                          name="nbiDocNumber"
                          type="text"
                          placeholder="e.g. NBI-2026-4492"
                          disabled={isSubmittingDriver}
                          value={driverForm.nbiDocNumber || ""}
                          onChange={(e) => handleDriverInputChange(e, "nbiDocNumber")}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="driver-step2-nbi-expiry">Expiry Date</label>
                        <input
                          id="driver-step2-nbi-expiry"
                          name="nbiExpiry"
                          type="date"
                          min={todayIso || undefined}
                          disabled={isSubmittingDriver}
                          value={driverForm.nbiExpiry || ""}
                          aria-invalid={nbiExpiryInvalid ? "true" : "false"}
                          aria-describedby={nbiExpiryInvalid ? "driver-nbi-expiry-error" : undefined}
                          onBlur={() => handleDriverFieldBlur("nbiExpiry")}
                          onChange={(e) => handleDriverInputChange(e, "nbiExpiry")}
                        />
                        {nbiExpiryInvalid && (
                          <span id="driver-nbi-expiry-error" className="form-field-error">
                            NBI clearance expiry date cannot be in the past.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`file-upload-dropzone ${driverForm.nbiFile ? "has-file" : ""}`} style={{ marginTop: "14px" }}>
                      <div className="upload-icon-container">
                        {driverForm.nbiFile ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        )}
                      </div>
                      <div className="upload-text-content">
                        <p className="upload-main-text">
                          <span>{driverForm.nbiFile ? "Replace file" : "Choose a file"}</span>
                        </p>
                        <p className="upload-sub-text">
                          {driverForm.nbiFile
                            ? `${driverForm.nbiFile.name} (${(driverForm.nbiFile.size / 1024 / 1024).toFixed(2)} MB) ready to upload`
                            : "NBI Clearance Copy (PDF, PNG, JPG, WebP up to 10 MB)"}
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden-file-input"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        aria-label="NBI clearance file"
                        disabled={isSubmittingDriver}
                        onChange={(e) => handleDriverFile(e, "nbiFile")}
                      />
                    </div>
                    {driverForm.nbiFile && (
                      <div className="uploaded-file-actions">
                        <button
                          type="button"
                          className="remove-file-btn"
                          disabled={isSubmittingDriver}
                          onClick={() => setDriverForm((prev) => ({ ...prev, nbiFile: null }))}
                        >
                          Remove attached NBI file
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {driverStep === 3 && (
            <div className="success-modal-view">
              <div className="success-icon-circle" aria-hidden="true">✓</div>
              <h2>Driver Registered Successfully</h2>
              <span className="system-id-badge">SYSTEM ID: {registeredDriverId}</span>
              <div className="status-box">
                <p>Status: <span className="text-success">REGISTERED: COMPLIANCE REVIEW PENDING</span></p>
                <p className="subtext">
                  {enableDriverMobileAccount && driverForm.email
                    ? "Driver record and Tanaw Mobile login created. Review compliance documents before dispatch."
                    : "Driver roster record created without a mobile login. Review compliance documents before dispatch."}
                </p>
              </div>
              {enableDriverMobileAccount && driverForm.email && (
                <div className="driver-credentials-summary-card">
                  <div className="driver-credentials-summary-header">
                    <strong>Tanaw Mobile Sign-In Credentials</strong>
                    <button
                      type="button"
                      className="btn-secondary small"
                      onClick={handleCopyDriverPassword}
                    >
                      {copiedDriverPassword ? "Password Copied" : "Copy Temporary Password"}
                    </button>
                  </div>
                  <div className="driver-credentials-summary-grid">
                    <div>
                      <span className="cred-summary-label">Phone Login</span>
                      <code className="cred-summary-value">+63 {driverForm.contactNumber}</code>
                    </div>
                    <div>
                      <span className="cred-summary-label">Email Login</span>
                      <code className="cred-summary-value">{driverForm.email.trim()}</code>
                    </div>
                    <div>
                      <span className="cred-summary-label">Temporary Password</span>
                      <code className="cred-summary-value">{driverForm.password || DEFAULT_DRIVER_TEMP_PASSWORD}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions Footer Grouping */}
        <div className="modal-footer">
          {driverStep === 1 && (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmittingDriver}
                onClick={handleCloseDriverModal}
              >
                Cancel
              </button>

              <div className="footer-right-buttons">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isSubmittingDriver}
                  onClick={handleDriverNextStep}
                >
                  Next: Compliance Documents
                </button>
              </div>
            </>
          )}

          {driverStep === 2 && (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmittingDriver}
                onClick={() => {
                  setDriverError("");
                  setDriverStep(1);
                }}
              >
                Back to Basic Info
              </button>

              <div className="footer-right-buttons">
                <button
                  type="button"
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
                type="button"
                className="btn-secondary"
                onClick={resetDriverForm}
              >
                Register Another Driver
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCloseDriverModal}
              >
                Done
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
            const capacityBounds = getVehicleCapacityBounds(selectedAddVehicleType);
            const capacityValidationError = vehicleCapacityTouched && String(vehicleForm.capacity ?? '').trim() !== ''
              ? validateVehicleCapacity(vehicleForm.capacity, {
                  vehicleType: selectedAddVehicleType,
                  tareWeightKg: vehicleForm.tareWeightKg,
                  grossWeightKg: vehicleForm.grossWeightKg,
                })
              : null;
            const capacityDescribedBy = capacityValidationError
              ? "vehicle-form-capacity-hint vehicle-form-capacity-error"
              : "vehicle-form-capacity-hint";
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
                  <input
                    id="vehicle-form-capacity"
                    type="number"
                    min={capacityBounds.min}
                    max={capacityBounds.max}
                    step="any"
                    required
                    placeholder={capacityBounds.defaultCapacityKg ? String(capacityBounds.defaultCapacityKg) : "e.g. 6000"}
                    value={vehicleForm.capacity}
                    aria-invalid={capacityValidationError ? "true" : "false"}
                    aria-describedby={capacityDescribedBy}
                    onBlur={() => setVehicleCapacityTouched(true)}
                    onChange={(e) => handleVehicleInputChange(e, 'capacity')}
                  />
                  <span id="vehicle-form-capacity-hint" className="form-field-hint">
                    {capacityBounds.hasTypeBounds
                      ? `Type default: ${capacityBounds.defaultCapacityKg.toLocaleString()} kg (model range: ${capacityBounds.min.toLocaleString()} - ${capacityBounds.max.toLocaleString()} kg)`
                      : `Enter this model's rated payload (${capacityBounds.min.toLocaleString()} - ${capacityBounds.max.toLocaleString()} kg)`}
                  </span>
                  {capacityValidationError && (
                    <span id="vehicle-form-capacity-error" className="form-field-error">
                      {capacityValidationError}
                    </span>
                  )}
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
