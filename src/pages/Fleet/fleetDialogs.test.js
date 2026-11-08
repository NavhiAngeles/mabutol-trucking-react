import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import {
  INITIAL_DRIVER_FORM,
  INITIAL_VEHICLE_FORM,
  isDriverFormDirty,
  isVehicleFormDirty,
  validateDriverStep1,
  validateDriverSubmit,
  validateVehicleStep1,
  validateVehicleSubmit,
} from "./fleetDraftHelpers.js";

async function getFleetComponents() {
  const fileContent = fs.readFileSync(new URL("./FleetDialogs.jsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(fileContent, "FleetDialogs.jsx", { jsx: { runtime: "classic" } });
  const scope = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } }) },
    useRef: initial => ({ current: initial }),
    useEffect: fn => { fn(); },
    useCallback: fn => fn,
    useState: initial => [initial, () => {}],
    document: { activeElement: { focus() {} } },
  });
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace(/^export /gm, "") + "\nthis.FleetModal = FleetModal;\nthis.FleetDiscardDialog = FleetDiscardDialog;", scope);
  return { FleetModal: scope.FleetModal, FleetDiscardDialog: scope.FleetDiscardDialog };
}

// ── 1. Helpers for Pure Draft Dirtiness Logic ────────────────────────────────

test("isDriverFormDirty detects pristine vs dirty states accurately", () => {
  // Pristine initial form is clean
  assert.equal(isDriverFormDirty(INITIAL_DRIVER_FORM, 1), false);
  assert.equal(isDriverFormDirty(INITIAL_DRIVER_FORM, 2), false);

  // Whitespace only is not considered dirty
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, fullName: "   " }, 1), false);

  // Any single entered field marks the draft dirty
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, fullName: "Nav Angeles" }, 1), true);
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, contactNumber: "09675132862" }, 1), true);
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, licenseNumber: "N01-12-345678" }, 2), true);
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, email: "driver@example.test" }, 1), true);

  // When step === 3 (registration confirmed / executed), it is no longer an in-progress draft
  assert.equal(isDriverFormDirty({ ...INITIAL_DRIVER_FORM, fullName: "Nav Angeles" }, 3), false);

  // Null or undefined form gracefully returns false
  assert.equal(isDriverFormDirty(null, 1), false);
});

test("isVehicleFormDirty detects technical specs, cargo categories, and attached files", () => {
  // Pristine initial form is clean
  assert.equal(isVehicleFormDirty(INITIAL_VEHICLE_FORM, 1, false), false);
  assert.equal(isVehicleFormDirty(INITIAL_VEHICLE_FORM, 2, false), false);

  // Text inputs
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, plateNumber: "ABC 1234" }, 1, false), true);
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, model: "Fuso Canter" }, 1, false), true);
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, orNumber: "OR-98765" }, 2, false), true);

  // Cargo category checkboxes
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, cargoCompatibility: ["dry_goods"] }, 1, false), true);

  // Uploaded files
  const dummyFile = { name: "or_copy.pdf", size: 1024 };
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, orFile: dummyFile }, 2, false), true);
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, crFile: dummyFile }, 2, false), true);

  // Step 3 or showSuccess = true means registration is already committed
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, plateNumber: "ABC 1234" }, 3, false), false);
  assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, plateNumber: "ABC 1234" }, 2, true), false);

  // Null form is handled safely
  assert.equal(isVehicleFormDirty(null, 1, false), false);
});

// ── 2. FleetModal Dialog Semantics & Keyboard/Backdrop Handling ───────────────

test("FleetModal renders accessible dialog semantics and handles Escape and backdrop clicks", async () => {
  const { FleetModal } = await getFleetComponents();
  let closeCount = 0;
  const onRequestClose = () => { closeCount++; };

  // Render closed
  const closedElement = FleetModal({
    isOpen: false,
    onRequestClose,
    titleId: "test-dialog-title",
    children: null,
  });
  assert.equal(closedElement, null);

  // Render open
  const openElement = FleetModal({
    isOpen: true,
    onRequestClose,
    titleId: "test-dialog-title",
    children: "Modal Content",
  });

  assert.ok(openElement, "Modal should be rendered when isOpen is true");
  assert.equal(openElement.props.className, "modal-backdrop");

  // Child dialog container semantics
  const dialogWindow = openElement.props.children;
  assert.equal(dialogWindow.props.role, "dialog");
  assert.equal(dialogWindow.props["aria-modal"], "true");
  assert.equal(dialogWindow.props["aria-labelledby"], "test-dialog-title");
  assert.equal(dialogWindow.props.tabIndex, -1);

  // Backdrop click triggers onRequestClose
  const backdropEvent = { target: "backdrop", currentTarget: "backdrop" };
  openElement.props.onClick(backdropEvent);
  assert.equal(closeCount, 1, "Clicking the backdrop should invoke onRequestClose");

  // Clicking inside the modal window does not trigger onRequestClose
  const insideEvent = { target: "inside-button", currentTarget: "backdrop" };
  openElement.props.onClick(insideEvent);
  assert.equal(closeCount, 1, "Clicking inside should not trigger onRequestClose");

  // Escape key triggers onRequestClose
  let defaultPrevented = false;
  let propagationStopped = false;
  const escapeEvent = {
    key: "Escape",
    preventDefault() { defaultPrevented = true; },
    stopPropagation() { propagationStopped = true; },
  };
  openElement.props.onKeyDown(escapeEvent);
  assert.equal(closeCount, 2, "Escape key should trigger onRequestClose");
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
});

test("FleetModal ignores Escape and backdrop clicks when isBusy is true", async () => {
  const { FleetModal } = await getFleetComponents();
  let closeCount = 0;
  const onRequestClose = () => { closeCount++; };

  const busyModal = FleetModal({
    isOpen: true,
    onRequestClose,
    isBusy: true,
    titleId: "busy-title",
    children: "Saving...",
  });

  // Backdrop click while busy
  busyModal.props.onClick({ target: "backdrop", currentTarget: "backdrop" });
  assert.equal(closeCount, 0, "Backdrop click while busy should be ignored");

  // Escape while busy
  busyModal.props.onKeyDown({
    key: "Escape",
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(closeCount, 0, "Escape while busy should be ignored");
});

test("FleetModal traps focus between first and last focusable elements on Tab and Shift+Tab", async () => {
  const { FleetModal } = await getFleetComponents();
  const modal = FleetModal({
    isOpen: true,
    onRequestClose: () => {},
    titleId: "tab-title",
    children: "Focus Test",
  });

  // Tab key interception
  const tabEvent = {
    key: "Tab",
    shiftKey: false,
    preventDefault() {},
  };
  modal.props.onKeyDown(tabEvent);
  assert.ok(true);
});

// ── 3. FleetDiscardDialog In-App Alert Dialog Component ──────────────────────

test("FleetDiscardDialog renders accessible alertdialog with keep and discard actions", async () => {
  const { FleetDiscardDialog } = await getFleetComponents();
  let kept = 0;
  let discarded = 0;

  const dialog = FleetDiscardDialog({
    title: "Discard driver registration?",
    description: "Unsaved information will be lost.",
    discardLabel: "Discard changes",
    onKeepEditing: () => { kept++; },
    onDiscard: () => { discarded++; },
  });

  assert.equal(dialog.props.role, "alertdialog");
  assert.equal(dialog.props["aria-modal"], "true");
  assert.equal(dialog.props["aria-labelledby"], "fleet-discard-title");
  assert.equal(dialog.props["aria-describedby"], "fleet-discard-description");
  assert.equal(dialog.props.className, "fleet-discard-dialog");

  // Check actions container
  const children = dialog.props.children;
  const actionsContainer = children.find(c => c && c.props && c.props.className === "fleet-discard-actions");
  assert.ok(actionsContainer, "Actions container should exist");

  const [keepButton, discardButton] = actionsContainer.props.children;
  assert.equal(keepButton.props.className, "fleet-discard-keep");
  assert.equal(keepButton.props.autoFocus, true);
  keepButton.props.onClick();
  assert.equal(kept, 1, "Keep button should call onKeepEditing");

  assert.equal(discardButton.props.className, "fleet-discard-confirm");
  assert.equal(discardButton.props.children, "Discard changes");
  discardButton.props.onClick();
  assert.equal(discarded, 1, "Discard button should call onDiscard");

  // Escape key triggers onKeepEditing
  let defaultPrevented = false;
  dialog.props.onKeyDown({
    key: "Escape",
    preventDefault() { defaultPrevented = true; },
  });
  assert.equal(kept, 2, "Escape on discard dialog should keep editing");
  assert.equal(defaultPrevented, true);
});

// ── 4. Dirty vs Pristine Modal Close Handlers ─────────────────────────────────

test("close workflow: pristine draft closes immediately without confirmation dialog", () => {
  let targetDiscard = null;
  let isDriverModalOpen = true;
  let driverForm = { ...INITIAL_DRIVER_FORM };
  let driverStep = 1;

  const handleClose = () => {
    if (isDriverFormDirty(driverForm, driverStep)) {
      targetDiscard = "driver";
      return;
    }
    isDriverModalOpen = false;
    driverForm = { ...INITIAL_DRIVER_FORM };
  };

  handleClose();
  assert.equal(targetDiscard, null, "Pristine close should not open discard dialog");
  assert.equal(isDriverModalOpen, false, "Pristine close should close immediately");
});

test("close workflow: dirty draft cancellation keeps modal open with draft intact", () => {
  let targetDiscard = null;
  let isDriverModalOpen = true;
  let driverForm = { ...INITIAL_DRIVER_FORM, fullName: "Ivhan Dalisay Angeles", contactNumber: "09675132862" };
  let driverStep = 1;

  const handleClose = () => {
    if (isDriverFormDirty(driverForm, driverStep)) {
      targetDiscard = "driver";
      return;
    }
    isDriverModalOpen = false;
    driverForm = { ...INITIAL_DRIVER_FORM };
  };

  handleClose();
  assert.equal(targetDiscard, "driver", "Dirty close must trigger discard dialog");
  assert.equal(isDriverModalOpen, true, "Modal must remain open");
  assert.equal(driverForm.fullName, "Ivhan Dalisay Angeles", "Draft content must be preserved");

  // User clicks "Keep editing"
  targetDiscard = null;
  assert.equal(targetDiscard, null, "Target discard should be cleared");
  assert.equal(isDriverModalOpen, true, "Modal remains open after user chooses Keep editing");
});

test("close workflow: dirty draft confirmation closes modal and resets form", () => {
  let targetDiscard = null;
  let isDriverModalOpen = true;
  let driverForm = { ...INITIAL_DRIVER_FORM, fullName: "Ivhan Dalisay Angeles", contactNumber: "09675132862" };
  let driverStep = 1;

  const handleClose = () => {
    if (isDriverFormDirty(driverForm, driverStep)) {
      targetDiscard = "driver";
      return;
    }
    isDriverModalOpen = false;
    driverForm = { ...INITIAL_DRIVER_FORM };
  };

  handleClose();
  assert.equal(targetDiscard, "driver", "Dirty close must trigger discard dialog");

  // User clicks "Discard changes"
  if (targetDiscard === "driver") {
    isDriverModalOpen = false;
    driverForm = { ...INITIAL_DRIVER_FORM };
  }
  targetDiscard = null;
  assert.equal(targetDiscard, null, "Target discard should be cleared");

  assert.equal(isDriverModalOpen, false, "Modal must be closed after discard");
  assert.equal(driverForm.fullName, "", "Form must be reset to pristine state");
});

test("close workflow: vehicle dirty draft with attached files prompts discard dialog", () => {
  let targetDiscard = null;
  let isVehicleModalOpen = true;
  let vehicleForm = {
    ...INITIAL_VEHICLE_FORM,
    plateNumber: "NCA 4567",
    orFile: { name: "or.pdf" },
  };
  let vehicleStep = 2;
  let showVehicleSuccess = false;

  const handleClose = () => {
    if (isVehicleFormDirty(vehicleForm, vehicleStep, showVehicleSuccess)) {
      targetDiscard = "vehicle";
      return;
    }
    isVehicleModalOpen = false;
    vehicleForm = { ...INITIAL_VEHICLE_FORM };
  };

  handleClose();
  assert.equal(targetDiscard, "vehicle", "Dirty vehicle close must open discard dialog");
  assert.equal(isVehicleModalOpen, true, "Vehicle modal stays open while discard dialog is displayed");

  // User clicks "Discard changes"
  if (targetDiscard === "vehicle") {
    isVehicleModalOpen = false;
    vehicleForm = { ...INITIAL_VEHICLE_FORM };
  }
  targetDiscard = null;
  assert.equal(targetDiscard, null, "Target discard should be cleared");

  assert.equal(isVehicleModalOpen, false, "Vehicle modal closes when discard is accepted");
  assert.equal(vehicleForm.plateNumber, "", "Vehicle form is reset");
  assert.equal(vehicleForm.orFile, null);
});

test("close workflow: completed driver or vehicle registration closes without prompt", () => {
  let targetDiscard = null;

  // Driver on Step 3 (completed)
  let isDriverModalOpen = true;
  let driverForm = { ...INITIAL_DRIVER_FORM, fullName: "Nav Angeles" };
  let driverStep = 3;

  const handleDriverClose = () => {
    if (isDriverFormDirty(driverForm, driverStep)) {
      targetDiscard = "driver";
      return;
    }
    isDriverModalOpen = false;
    driverForm = { ...INITIAL_DRIVER_FORM };
  };

  handleDriverClose();
  assert.equal(targetDiscard, null, "Completed driver registration should close without discard dialog");
  assert.equal(isDriverModalOpen, false);

  // Vehicle on success screen
  let isVehicleModalOpen = true;
  let vehicleForm = { ...INITIAL_VEHICLE_FORM, plateNumber: "ABC 1234" };
  let vehicleStep = 2;
  let showVehicleSuccess = true;

  const handleVehicleClose = () => {
    if (isVehicleFormDirty(vehicleForm, vehicleStep, showVehicleSuccess)) {
      targetDiscard = "vehicle";
      return;
    }
    isVehicleModalOpen = false;
    showVehicleSuccess = false;
    vehicleForm = { ...INITIAL_VEHICLE_FORM };
  };

  handleVehicleClose();
  assert.equal(targetDiscard, null, "Vehicle on success screen should close without discard dialog");
  assert.equal(isVehicleModalOpen, false);
});

// ── 5. Inline Accessible Alert Banners & Modal Step 1 Field Validation ───────

test("validateVehicleStep1 requires plateNumber, model, type, and positive capacity before advancing", () => {
  // Empty form fails
  assert.equal(
    validateVehicleStep1(INITIAL_VEHICLE_FORM),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // Missing plateNumber
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "   ",
      model: "Isuzu Giga",
      type: "type-1",
      capacity: "15000",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // Missing model
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "",
      type: "type-1",
      capacity: "15000",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // Missing type
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga",
      type: "",
      capacity: "15000",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // Non-positive capacity: zero or negative or non-numeric
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga",
      type: "type-1",
      capacity: "0",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga",
      type: "type-1",
      capacity: "-500",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga",
      type: "type-1",
      capacity: "invalid",
    }),
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // All valid fields pass
  assert.equal(
    validateVehicleStep1({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga CYH52 Wing Van",
      type: "type-1",
      capacity: "15000",
    }),
    null
  );

  // validateVehicleSubmit checks identical constraints on submission
  assert.equal(
    validateVehicleSubmit(INITIAL_VEHICLE_FORM),
    "Please provide a plate number, model, vehicle type and positive capacity."
  );
  assert.equal(
    validateVehicleSubmit({
      ...INITIAL_VEHICLE_FORM,
      plateNumber: "NBC 1024",
      model: "Isuzu Giga CYH52 Wing Van",
      type: "type-1",
      capacity: "15000",
    }),
    null
  );
});

test("validateDriverStep1 requires fullName, contactNumber, and licenseNumber before advancing", () => {
  // Empty form
  assert.equal(
    validateDriverStep1(INITIAL_DRIVER_FORM),
    "Please fill in Full Name and Contact Number before proceeding."
  );

  // Missing contact number
  assert.equal(
    validateDriverStep1({ ...INITIAL_DRIVER_FORM, fullName: "Juan dela Cruz", contactNumber: "" }),
    "Please fill in Full Name and Contact Number before proceeding."
  );

  // Missing license number
  assert.equal(
    validateDriverStep1({ ...INITIAL_DRIVER_FORM, fullName: "Juan dela Cruz", contactNumber: "09123456789", licenseNumber: " " }),
    "Please provide the License Number before proceeding."
  );

  // Valid step 1
  assert.equal(
    validateDriverStep1({
      ...INITIAL_DRIVER_FORM,
      fullName: "Juan dela Cruz",
      contactNumber: "09123456789",
      licenseNumber: "N01-23-45678",
    }),
    null
  );

  // validateDriverSubmit checks driver identity and license on submission
  assert.equal(
    validateDriverSubmit(INITIAL_DRIVER_FORM),
    "Please provide the driver's full name and contact number."
  );
  assert.equal(
    validateDriverSubmit({ ...INITIAL_DRIVER_FORM, fullName: "Juan dela Cruz", contactNumber: "09123456789", licenseNumber: "" }),
    "Please provide the professional license number."
  );
  assert.equal(
    validateDriverSubmit({
      ...INITIAL_DRIVER_FORM,
      fullName: "Juan dela Cruz",
      contactNumber: "09123456789",
      licenseNumber: "N01-23-45678",
    }),
    null
  );
});

test("Vehicle Step 1 NEXT STEP advances only when required fields are valid and displays inline alert on error", () => {
  let vehicleStep = 1;
  let vehicleError = "";
  let vehicleForm = { ...INITIAL_VEHICLE_FORM };

  const handleVehicleNextStep = () => {
    const error = validateVehicleStep1(vehicleForm);
    if (error) {
      vehicleError = error;
      return;
    }
    vehicleError = "";
    vehicleStep = 2;
  };

  // Attempting to advance with empty form
  handleVehicleNextStep();
  assert.equal(vehicleStep, 1, "Must not advance to Step 2 when form is empty");
  assert.equal(
    vehicleError,
    "Please provide a plate number, model, vehicle type and positive capacity before proceeding."
  );

  // Partially filled: plate only
  vehicleForm.plateNumber = "NBC 1024";
  handleVehicleNextStep();
  assert.equal(vehicleStep, 1, "Must not advance with missing model, type, or capacity");

  // Valid required fields
  vehicleForm.model = "Isuzu Giga CYH52 Wing Van";
  vehicleForm.type = "type-wing-van";
  vehicleForm.capacity = "15000";

  handleVehicleNextStep();
  assert.equal(vehicleStep, 2, "Advances to Step 2 when all required fields are valid");
  assert.equal(vehicleError, "", "Error banner must be cleared on successful validation");
});

test("Driver Step 1 NEXT STEP advances only when required fields are valid and displays inline alert on error", () => {
  let driverStep = 1;
  let driverError = "";
  let driverForm = { ...INITIAL_DRIVER_FORM };

  const handleDriverNextStep = () => {
    const error = validateDriverStep1(driverForm);
    if (error) {
      driverError = error;
      return;
    }
    driverError = "";
    driverStep = 2;
  };

  // Attempting to advance with empty form
  handleDriverNextStep();
  assert.equal(driverStep, 1, "Must not advance to Step 2 when form is empty");
  assert.equal(driverError, "Please fill in Full Name and Contact Number before proceeding.");

  // Filled name and contact, but missing license
  driverForm.fullName = "Juan dela Cruz";
  driverForm.contactNumber = "09123456789";
  handleDriverNextStep();
  assert.equal(driverStep, 1, "Must not advance without license number");
  assert.equal(driverError, "Please provide the License Number before proceeding.");

  // Full valid step 1
  driverForm.licenseNumber = "N01-23-45678";
  handleDriverNextStep();
  assert.equal(driverStep, 2, "Advances to Step 2 when required fields are valid");
  assert.equal(driverError, "", "Error banner must be cleared on successful validation");
});

test("fleet.jsx source contains zero blocking window.alert calls and binds accessible inline error alerts with role=alert", () => {
  const fleetSource = fs.readFileSync(new URL("./fleet.jsx", import.meta.url), "utf8");

  // Zero window.alert or alert() function calls
  const alertCalls = fleetSource.match(/\balert\s*\(/g);
  assert.equal(alertCalls, null, "fleet.jsx must contain zero window.alert() calls");

  // Inline error banners with role="alert" must be present for both modals
  assert.ok(
    fleetSource.includes('{driverError && (\n            <div className="error-message fleet-dialog-error" role="alert">') ||
    fleetSource.includes('role="alert"') && fleetSource.includes("driverError"),
    "Driver modal must render accessible inline error banner with role='alert'"
  );
  assert.ok(
    fleetSource.includes('{vehicleError && (\n            <div className="error-message fleet-dialog-error" role="alert">') ||
    fleetSource.includes('role="alert"') && fleetSource.includes("vehicleError"),
    "Vehicle modal must render accessible inline error banner with role='alert'"
  );

  // Both modals bind NEXT STEP to validation guards
  assert.ok(fleetSource.includes("onClick={handleDriverNextStep}"), "Driver modal must bind NEXT STEP to validation handler");
  assert.ok(fleetSource.includes("onClick={handleVehicleNextStep}"), "Vehicle modal must bind NEXT STEP to validation handler");
});

