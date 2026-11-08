import { resolveVehicleCategory } from '../components/VehicleSilhouette/vehicleCategoryResolver.js';

export const OFFICIAL_MODELS_BY_CATEGORY = {
  wing_van_10w: [
    'Isuzu Giga CYH52 Wing Van',
    'Hino 700 Series Profia Wing Van',
    'Mitsubishi Fuso Super Great Wing Van',
  ],
  forward_6w: [
    'Isuzu Forward FRR90 6-Wheeler',
    'Hino 500 Series FC9J 6-Wheeler',
    'Mitsubishi Fuso Fighter FK 6-Wheeler',
  ],
  dropside: [
    'Isuzu Forward FSR34 Dropside',
    'Hino 500 Series Dropside',
    'Mitsubishi Fuso Canter Dropside',
  ],
  elf_4w: [
    'Isuzu Elf NLR55 4-Wheeler',
    'Mitsubishi Fuso Canter FE73 4-Wheeler',
    'Hino 300 Series 414 Light Truck',
  ],
  closed_van: [
    'Isuzu Elf NLR77 Aluminum Van',
    'Mitsubishi Fuso Canter FE71 Aluminum Van',
    'Hino 300 Series 414 Closed Van',
    'Hyundai HD65 Closed Van',
  ],
  fallback: [
    'Isuzu Commercial Cargo Truck',
    'Hino Commercial Logistics Truck',
    'Mitsubishi Fuso Commercial Van',
  ],
};

const DEMO_NAME_REGEX = /\b(?:tanaw[-\s_]*demo|demo[-\s_]*truck|demo[-\s_]*vehicle|demo|fixture|placeholder|test[-\s_]*truck)\b/i;

export function isDemoVehicleName(name) {
  if (!name || typeof name !== 'string') return true;
  return DEMO_NAME_REGEX.test(name.trim());
}

export function getOfficialVehicleModel(truck, index = 0) {
  const currentModel = typeof truck === 'string' ? truck : truck?.model;
  if (currentModel && !isDemoVehicleName(currentModel)) {
    return currentModel.trim();
  }

  // Determine category from vehicle type name or capacity
  const typeName = truck?.vehicle_types?.name || truck?.vehicle_type || truck?.category || '';
  let category = resolveVehicleCategory(typeName);

  // If fallback, check capacity if available
  if (category === 'fallback' && truck?.capacity_kg) {
    const cap = Number(truck.capacity_kg);
    if (cap >= 10000) category = 'wing_van_10w';
    else if (cap >= 4000) category = 'forward_6w';
    else if (cap >= 2500) category = 'closed_van';
    else if (cap > 0) category = 'elf_4w';
  }

  const models = OFFICIAL_MODELS_BY_CATEGORY[category] || OFFICIAL_MODELS_BY_CATEGORY.fallback;
  const selectIndex = Math.abs(index) % models.length;
  return models[selectIndex];
}

const DEMO_PLATE_REGEX = /^DEMO-/i;

export function sanitizePlateNumber(plate, fallbackIndex = 1) {
  if (!plate || typeof plate !== 'string') return `NBC ${String(fallbackIndex).padStart(4, '0')}`;
  const trimmed = plate.trim();
  if (!DEMO_PLATE_REGEX.test(trimmed)) return trimmed;

  const demoMap = {
    'DEMO-VAN-01': 'NBC 1024',
    'DEMO-VAN-02': 'NBC 1025',
    'DEMO-6W-02': 'NDB 5821',
    'DEMO-6W-03': 'NDB 5822',
    'DEMO-ELF-01': 'CAH 7392',
    'DEMO-DROP-01': 'NFP 4190',
    'DEMO-WING-02': 'RFA 2841',
    'DEMO-HV10-01': 'RFA 3912',
    'DEMO-MED4-01': 'NDB 6104',
  };

  const upper = trimmed.toUpperCase();
  if (demoMap[upper]) return demoMap[upper];

  // Generic realistic commercial plate mapping
  const num = String(fallbackIndex).padStart(4, '0');
  return `NBC ${num}`;
}

export function sanitizeFleetCode(code, fallbackIndex = 1) {
  if (!code || typeof code !== 'string' || isDemoVehicleName(code)) {
    return `MAB-TRK-${String(fallbackIndex).padStart(2, '0')}`;
  }
  return code.trim();
}

export function sanitizeTruck(truck, index = 0) {
  if (!truck || typeof truck !== 'object') return truck;
  const officialModel = getOfficialVehicleModel(truck, index);
  const officialPlate = sanitizePlateNumber(truck.plate_number, index + 1);
  const officialFleetCode = sanitizeFleetCode(truck.fleet_code, index + 1);

  return {
    ...truck,
    model: officialModel,
    plate_number: officialPlate,
    fleet_code: officialFleetCode,
  };
}

