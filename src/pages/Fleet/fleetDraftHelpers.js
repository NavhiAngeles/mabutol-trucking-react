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
  licenseFile: null,
  medicalFile: null,
  nbiFile: null,
});

export const INITIAL_VEHICLE_FORM = Object.freeze({
  plateNumber: "",
  modelYear: "",
  model: "",
  type: "",
  capacity: "",
  heightM: "",
  widthM: "",
  lengthM: "",
  tareWeightKg: "",
  grossWeightKg: "",
  axleCount: "",
  cargoCompatibility: [],
  assignedDriver: "",
  orNumber: "",
  crNumber: "",
  orFile: null,
  crFile: null,
});

export function isDriverFormDirty(form, step = 1) {
  if (step === 3 || !form) return false;
  const hasText = Object.values(form).some(value => typeof value === 'string' && value.trim().length > 0);
  const hasFiles = Boolean(form.licenseFile || form.medicalFile || form.nbiFile);
  return hasText || hasFiles;
}

export function isVehicleFormDirty(form, step = 1, showSuccess = false) {
  if (showSuccess || step === 3 || !form) return false;
  const hasText = [
    'plateNumber',
    'modelYear',
    'model',
    'type',
    'capacity',
    'heightM',
    'widthM',
    'lengthM',
    'tareWeightKg',
    'grossWeightKg',
    'axleCount',
    'assignedDriver',
    'orNumber',
    'crNumber',
  ]
    .some(key => typeof form[key] === 'string' && form[key].trim().length > 0);
  const hasCargo = Array.isArray(form.cargoCompatibility) && form.cargoCompatibility.length > 0;
  const hasFiles = Boolean(form.orFile || form.crFile);
  return hasText || hasCargo || hasFiles;
}

export function validateTruckHgvSpecs(specs = {}) {
  const toNum = (raw) => {
    if (raw === "" || raw == null) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    return Number(trimmed);
  };

  const height = toNum(specs.heightM);
  const width = toNum(specs.widthM);
  const length = toNum(specs.lengthM);
  const tare = toNum(specs.tareWeightKg);
  const gross = toNum(specs.grossWeightKg);
  const axles = toNum(specs.axleCount);

  if (height !== null && (!Number.isFinite(height) || height <= 0 || height > 10)) {
    return "Truck height must be greater than 0 and at most 10 meters.";
  }
  if (width !== null && (!Number.isFinite(width) || width <= 0 || width > 10)) {
    return "Truck width must be greater than 0 and at most 10 meters.";
  }
  if (length !== null && (!Number.isFinite(length) || length <= 0 || length > 50)) {
    return "Truck length must be greater than 0 and at most 50 meters.";
  }
  if (tare !== null && (!Number.isFinite(tare) || tare < 0)) {
    return "Tare weight cannot be negative.";
  }
  if (gross !== null && (!Number.isFinite(gross) || gross <= 0)) {
    return "Gross vehicle weight must be positive.";
  }
  if (tare !== null && gross !== null && gross < tare) {
    return "Gross vehicle weight cannot be less than tare weight.";
  }
  if (axles !== null && (!Number.isInteger(axles) || axles < 2 || axles > 20)) {
    return "Axle count must be a whole number between 2 and 20.";
  }
  return null;
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
  return validateTruckHgvSpecs(form);
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
  return validateTruckHgvSpecs(form);
}


