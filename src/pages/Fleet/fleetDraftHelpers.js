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

export function normalizeDriverPhone(raw) {
  const value = String(raw ?? '').trim().replace(/[\s()\-–—.]/g, '');
  let phone = value;
  if (/^09\d{9}$/.test(value)) {
    phone = `+63${value.slice(1)}`;
  } else if (/^9\d{9}$/.test(value)) {
    phone = `+63${value}`;
  } else if (/^639\d{9}$/.test(value)) {
    phone = `+${value}`;
  } else if (/^\+?6309\d{9}$/.test(value)) {
    phone = `+63${value.replace(/^\+?630/, '')}`;
  } else if (/^00630?9\d{9}$/.test(value)) {
    phone = `+63${value.replace(/^00630?/, '')}`;
  }
  return /^\+639\d{9}$/.test(phone) ? phone : null;
}

export function validateDriverStep1(form) {
  if (!form?.fullName?.trim() || !form?.contactNumber?.trim()) {
    return "Please fill in Full Name and Contact Number before proceeding.";
  }
  if (!normalizeDriverPhone(form.contactNumber)) {
    return "Enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).";
  }
  if (form?.emergencyContact?.trim() && !normalizeDriverPhone(form.emergencyContact)) {
    return "Enter a valid Philippine mobile number for the emergency contact (e.g. 0917 123 4567 or +63 917 123 4567).";
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
  if (!normalizeDriverPhone(form.contactNumber)) {
    return "Enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).";
  }
  if (form?.emergencyContact?.trim() && !normalizeDriverPhone(form.emergencyContact)) {
    return "Enter a valid Philippine mobile number for the emergency contact (e.g. 0917 123 4567 or +63 917 123 4567).";
  }
  if (!form?.licenseNumber?.trim()) {
    return "Please provide the professional license number.";
  }
  return null;
}

export const MIN_VEHICLE_CARGO_KG = 100;
export const MAX_VEHICLE_CARGO_KG = 50000;

export function getVehicleCapacityBounds(vehicleType = null) {
  const defaultCap = Number(vehicleType?.default_capacity_kg);
  if (Number.isFinite(defaultCap) && defaultCap > 0) {
    const min = Math.max(MIN_VEHICLE_CARGO_KG, Math.round(defaultCap * 0.5));
    const max = Math.min(MAX_VEHICLE_CARGO_KG, Math.max(min, Math.round(defaultCap * 1.5)));
    return {
      min,
      max,
      defaultCapacityKg: defaultCap,
      hasTypeBounds: true,
    };
  }
  return {
    min: MIN_VEHICLE_CARGO_KG,
    max: MAX_VEHICLE_CARGO_KG,
    defaultCapacityKg: null,
    hasTypeBounds: false,
  };
}

export function validateVehicleCapacity(rawCapacity, { vehicleType = null, tareWeightKg = null, grossWeightKg = null } = {}) {
  const raw = rawCapacity === "" || rawCapacity == null ? "" : String(rawCapacity).trim();
  const cap = raw ? Number(raw) : NaN;
  if (!Number.isFinite(cap) || cap <= 0) {
    return "Max cargo weight must be a positive number in kg.";
  }
  if (cap < MIN_VEHICLE_CARGO_KG) {
    return `Max cargo weight must be at least ${MIN_VEHICLE_CARGO_KG.toLocaleString()} kg.`;
  }
  if (cap > MAX_VEHICLE_CARGO_KG) {
    return `Max cargo weight cannot exceed ${MAX_VEHICLE_CARGO_KG.toLocaleString()} kg.`;
  }

  const bounds = getVehicleCapacityBounds(vehicleType);
  if (bounds.hasTypeBounds && (cap < bounds.min || cap > bounds.max)) {
    const typeName = vehicleType?.name || "this vehicle type";
    return `Max cargo weight for ${typeName} (standard ${bounds.defaultCapacityKg.toLocaleString()} kg) must be between ${bounds.min.toLocaleString()} kg and ${bounds.max.toLocaleString()} kg.`;
  }

  const grossRaw = grossWeightKg === "" || grossWeightKg == null ? "" : String(grossWeightKg).trim();
  const gross = grossRaw ? Number(grossRaw) : null;
  const tareRaw = tareWeightKg === "" || tareWeightKg == null ? "" : String(tareWeightKg).trim();
  const tare = tareRaw ? Number(tareRaw) : null;

  if (gross !== null && Number.isFinite(gross) && gross > 0) {
    if (tare !== null && Number.isFinite(tare) && tare >= 0 && gross >= tare) {
      const maxPayload = gross - tare;
      if (cap > maxPayload) {
        return `Max cargo weight (${cap.toLocaleString()} kg) exceeds available payload (${maxPayload.toLocaleString()} kg from GVW minus tare weight).`;
      }
    } else if (cap > gross) {
      return `Max cargo weight (${cap.toLocaleString()} kg) cannot exceed gross vehicle weight (${gross.toLocaleString()} kg).`;
    }
  }

  return null;
}

export function validateVehicleStep1(form, { vehicleTypes = [] } = {}) {
  if (
    !form?.plateNumber?.trim() ||
    !form?.model?.trim() ||
    !form?.type ||
    !(Number(form?.capacity) > 0)
  ) {
    return "Please provide a plate number, model, vehicle type and positive capacity before proceeding.";
  }
  const hgvError = validateTruckHgvSpecs(form);
  if (hgvError) return hgvError;
  const vehicleType = (vehicleTypes || []).find((vt) => vt.id === form.type) || null;
  return validateVehicleCapacity(form.capacity, {
    vehicleType,
    tareWeightKg: form.tareWeightKg,
    grossWeightKg: form.grossWeightKg,
  });
}

export function validateVehicleSubmit(form, { vehicleTypes = [] } = {}) {
  if (
    !form?.plateNumber?.trim() ||
    !form?.model?.trim() ||
    !form?.type ||
    !(Number(form?.capacity) > 0)
  ) {
    return "Please provide a plate number, model, vehicle type and positive capacity.";
  }
  const hgvError = validateTruckHgvSpecs(form);
  if (hgvError) return hgvError;
  const vehicleType = (vehicleTypes || []).find((vt) => vt.id === form.type) || null;
  return validateVehicleCapacity(form.capacity, {
    vehicleType,
    tareWeightKg: form.tareWeightKg,
    grossWeightKg: form.grossWeightKg,
  });
}


