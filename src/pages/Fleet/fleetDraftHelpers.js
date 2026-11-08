// fleetDraftHelpers.js

export const INITIAL_DRIVER_FORM = Object.freeze({
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

export const INITIAL_VEHICLE_FORM = Object.freeze({
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

export function isDriverFormDirty(form, step = 1) {
  if (step === 3 || !form) return false;
  return Object.values(form).some(value => typeof value === 'string' && value.trim().length > 0);
}

export function isVehicleFormDirty(form, step = 1, showSuccess = false) {
  if (showSuccess || step === 3 || !form) return false;
  const hasText = ['plateNumber', 'modelYear', 'model', 'type', 'capacity', 'assignedDriver', 'orNumber', 'crNumber']
    .some(key => typeof form[key] === 'string' && form[key].trim().length > 0);
  const hasCargo = Array.isArray(form.cargoCompatibility) && form.cargoCompatibility.length > 0;
  const hasFiles = Boolean(form.orFile || form.crFile);
  return hasText || hasCargo || hasFiles;
}

export function validateDriverStep1(form) {
  if (!form?.fullName?.trim() || !form?.contactNumber?.trim()) {
    return "Please fill in Full Name and Contact Number before proceeding.";
  }
  if (!form?.licenseNumber?.trim()) {
    return "Please provide the License Number before proceeding.";
  }
  return null;
}

export function validateDriverSubmit(form) {
  if (!form?.fullName?.trim() || !form?.contactNumber?.trim()) {
    return "Please provide the driver's full name and contact number.";
  }
  if (!form?.licenseNumber?.trim()) {
    return "Please provide the professional license number.";
  }
  return null;
}

export function validateVehicleStep1(form) {
  if (
    !form?.plateNumber?.trim() ||
    !form?.model?.trim() ||
    !form?.type ||
    !(Number(form?.capacity) > 0)
  ) {
    return "Please provide a plate number, model, vehicle type and positive capacity before proceeding.";
  }
  return null;
}

export function validateVehicleSubmit(form) {
  if (
    !form?.plateNumber?.trim() ||
    !form?.model?.trim() ||
    !form?.type ||
    !(Number(form?.capacity) > 0)
  ) {
    return "Please provide a plate number, model, vehicle type and positive capacity.";
  }
  return null;
}


