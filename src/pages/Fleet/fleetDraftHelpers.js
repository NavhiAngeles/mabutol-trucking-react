// fleetDraftHelpers.js

export const DEFAULT_DRIVER_TEMP_PASSWORD = "driver123";

export const INITIAL_DRIVER_FORM = Object.freeze({
  fullName: "",
  contactNumber: "",
  dateHired: "",
  assignVehicle: "",
  emergencyContactName: "",
  emergencyContact: "",
  notes: "",
  licenseNumber: "",
  licenseExpiry: "",
  medicalDocNumber: "",
  medicalExpiry: "",
  nbiDocNumber: "",
  nbiExpiry: "",
  email: "",
  password: DEFAULT_DRIVER_TEMP_PASSWORD,
  confirmPassword: DEFAULT_DRIVER_TEMP_PASSWORD,
  licenseFile: null,
  medicalFile: null,
  nbiFile: null,
});

export function getManilaTodayIso(now = new Date()) {
  try {
    const d = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export function formatPhMobileInput(raw) {
  if (typeof raw !== "string") return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("006309")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("00639")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("0063") && digits.length > 4) {
    digits = digits.slice(4);
  } else if (digits.startsWith("6309")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("639")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("63") && digits.length > 2) {
    digits = digits.slice(2);
  } else if (digits.startsWith("09")) {
    digits = digits.slice(1);
  }

  if (digits.startsWith("9")) {
    const capped = digits.slice(0, 10);
    if (capped.length <= 3) return capped;
    if (capped.length <= 6) return `${capped.slice(0, 3)} ${capped.slice(3)}`;
    return `${capped.slice(0, 3)} ${capped.slice(3, 6)} ${capped.slice(6)}`;
  }

  return digits.slice(0, 10);
}

export function formatLtoLicenseInput(raw) {
  if (typeof raw !== "string") return "";
  const upper = raw.toUpperCase().replace(/[^A-Z0-9-\s]/g, "").replace(/\s+/g, "-");
  const alnum = upper.replace(/-/g, "");
  if (/^[A-Z]\d{2,10}$/.test(alnum)) {
    const p1 = alnum.slice(0, 3);
    const p2 = alnum.slice(3, 5);
    const p3 = alnum.slice(5, 11);
    if (alnum.length <= 3) return p1;
    if (alnum.length <= 5) return `${p1}-${p2}`;
    return `${p1}-${p2}-${p3}`;
  }
  return upper.replace(/-+/g, "-").slice(0, 20);
}

export function isValidDriverLicenseNumber(raw) {
  const cleaned = String(raw ?? "").trim().toUpperCase();
  if (!cleaned) return false;
  // Standard LTO format (e.g. N01-23-456789 or N01-23-45678) or general alphanumeric permit code (5-20 chars with letter + digits)
  if (/^[A-Z]\d{2}-\d{2}-\d{5,6}$/.test(cleaned)) return true;
  const compact = cleaned.replace(/[\s-]/g, "");
  return compact.length >= 5 && compact.length <= 20 && /[A-Z]/.test(compact) && /\d{3,}/.test(compact);
}

export function isValidDriverEmail(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function findDuplicateDriver(existingDrivers, { fullName = "", contactNumber = "", licenseNumber = "", excludeId = null } = {}) {
  if (!Array.isArray(existingDrivers) || existingDrivers.length === 0) return null;
  const targetName = String(fullName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const targetPhone = normalizeDriverPhone(contactNumber);
  const targetLicense = String(licenseNumber ?? "").trim().replace(/[\s-]/g, "").toUpperCase();

  const canCheckName = targetName.length >= 2;
  const canCheckPhone = Boolean(targetPhone);
  const canCheckLicense = targetLicense.length >= 5;

  if (!canCheckName && !canCheckPhone && !canCheckLicense) return null;

  for (let i = 0; i < existingDrivers.length; i++) {
    const drv = existingDrivers[i];
    if (!drv || (excludeId && drv.id === excludeId)) continue;

    if (canCheckLicense && typeof drv.license_number === "string") {
      const existingLicense = drv.license_number.trim().replace(/[\s-]/g, "").toUpperCase();
      if (existingLicense && existingLicense === targetLicense) {
        return {
          type: "license",
          driver: drv,
          message: `A driver with license number "${drv.license_number}" is already registered (${drv.full_name}).`,
        };
      }
    }

    if (canCheckPhone && typeof drv.contact_number === "string") {
      const existingPhone = normalizeDriverPhone(drv.contact_number);
      if (existingPhone && existingPhone === targetPhone) {
        return {
          type: "phone",
          driver: drv,
          message: `A driver with this contact number is already registered (${drv.full_name}).`,
        };
      }
    }

    if (canCheckName && typeof drv.full_name === "string") {
      const existingName = drv.full_name.trim().replace(/\s+/g, " ").toLowerCase();
      if (existingName && existingName === targetName) {
        return {
          type: "name",
          driver: drv,
          message: `A driver named "${drv.full_name}" is already on the roster.`,
        };
      }
    }
  }

  return null;
}

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
  const defaultToday = getManilaTodayIso();
  const textKeys = [
    "fullName",
    "contactNumber",
    "assignVehicle",
    "emergencyContactName",
    "emergencyContact",
    "notes",
    "licenseNumber",
    "licenseExpiry",
    "medicalDocNumber",
    "medicalExpiry",
    "nbiDocNumber",
    "nbiExpiry",
    "email",
  ];
  const hasText = textKeys.some((key) => typeof form[key] === "string" && form[key].trim().length > 0);
  const hasCustomDateHired =
    typeof form.dateHired === "string" &&
    form.dateHired.trim().length > 0 &&
    form.dateHired.trim() !== defaultToday;
  const hasCustomPassword =
    (typeof form.password === "string" &&
      form.password.trim().length > 0 &&
      form.password !== DEFAULT_DRIVER_TEMP_PASSWORD) ||
    (typeof form.confirmPassword === "string" &&
      form.confirmPassword.trim().length > 0 &&
      form.confirmPassword !== DEFAULT_DRIVER_TEMP_PASSWORD);
  const hasFiles = Boolean(form.licenseFile || form.medicalFile || form.nbiFile);
  return hasText || hasCustomDateHired || hasCustomPassword || hasFiles;
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

export function validateDriverStep1(form, { todayIso = getManilaTodayIso() } = {}) {
  if (!form?.fullName?.trim() || !form?.contactNumber?.trim()) {
    return "Please fill in Full Name and Contact Number before proceeding.";
  }
  if (form.fullName.trim().length < 2) {
    return "Full Name must be at least 2 characters.";
  }
  const normalizedContact = normalizeDriverPhone(form.contactNumber);
  if (!normalizedContact) {
    return "Enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).";
  }
  if (form?.emergencyContact?.trim()) {
    const normalizedEmergency = normalizeDriverPhone(form.emergencyContact);
    if (!normalizedEmergency) {
      return "Enter a valid Philippine mobile number for the emergency contact (e.g. 0917 123 4567 or +63 917 123 4567).";
    }
    if (normalizedEmergency === normalizedContact) {
      return "Emergency contact number must be different from the driver's primary contact number.";
    }
  }
  if (form?.dateHired?.trim() && todayIso && form.dateHired.trim() > todayIso) {
    return "Date hired cannot be in the future.";
  }
  if (form?.email?.trim()) {
    if (!isValidDriverEmail(form.email)) {
      return "Enter a valid email address for the driver mobile account.";
    }
    const pwd = String(form?.password ?? "");
    const confirmPwd = String(form?.confirmPassword ?? pwd);
    if (!pwd) {
      return "Temporary password is required when an email address is provided.";
    }
    if (pwd.length < 6) {
      return "Temporary password must be at least 6 characters long.";
    }
    if (pwd !== confirmPwd) {
      return "Passwords do not match.";
    }
  }
  // If licenseNumber is already entered on Step 1 (e.g. legacy or pre-filled), validate it; otherwise license is collected in Step 2 (Compliance Documents)
  if ("licenseNumber" in (form || {}) && form.licenseNumber !== undefined && String(form.licenseNumber).trim() !== "") {
    if (!isValidDriverLicenseNumber(form.licenseNumber)) {
      return "Enter a valid LTO license number (e.g. N01-23-456789).";
    }
  }
  return null;
}

export function validateDriverSubmit(form, { todayIso = getManilaTodayIso() } = {}) {
  if (!form?.fullName?.trim() || !form?.contactNumber?.trim()) {
    return "Please provide the driver's full name and contact number.";
  }
  if (form.fullName.trim().length < 2) {
    return "Full Name must be at least 2 characters.";
  }
  const normalizedContact = normalizeDriverPhone(form.contactNumber);
  if (!normalizedContact) {
    return "Enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).";
  }
  if (form?.emergencyContact?.trim()) {
    const normalizedEmergency = normalizeDriverPhone(form.emergencyContact);
    if (!normalizedEmergency) {
      return "Enter a valid Philippine mobile number for the emergency contact (e.g. 0917 123 4567 or +63 917 123 4567).";
    }
    if (normalizedEmergency === normalizedContact) {
      return "Emergency contact number must be different from the driver's primary contact number.";
    }
  }
  if (form?.dateHired?.trim() && todayIso && form.dateHired.trim() > todayIso) {
    return "Date hired cannot be in the future.";
  }
  if (form?.email?.trim()) {
    if (!isValidDriverEmail(form.email)) {
      return "Enter a valid email address for the driver mobile account.";
    }
    const pwd = String(form?.password ?? "");
    const confirmPwd = String(form?.confirmPassword ?? pwd);
    if (!pwd) {
      return "Temporary password is required when an email address is provided.";
    }
    if (pwd.length < 6) {
      return "Temporary password must be at least 6 characters long.";
    }
    if (pwd !== confirmPwd) {
      return "Passwords do not match.";
    }
  }
  if (!form?.licenseNumber?.trim()) {
    return "Please provide the professional license number.";
  }
  if (!isValidDriverLicenseNumber(form.licenseNumber)) {
    return "Enter a valid LTO license number (e.g. N01-23-456789).";
  }
  if (form?.licenseExpiry?.trim() && todayIso && form.licenseExpiry.trim() < todayIso) {
    return "Driver's license expiry date cannot be in the past.";
  }
  if (form?.medicalExpiry?.trim() && todayIso && form.medicalExpiry.trim() < todayIso) {
    return "Medical certificate expiry date cannot be in the past.";
  }
  if (form?.nbiExpiry?.trim() && todayIso && form.nbiExpiry.trim() < todayIso) {
    return "NBI clearance expiry date cannot be in the past.";
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


