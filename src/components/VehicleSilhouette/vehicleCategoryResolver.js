/**
 * Pure JavaScript utility for resolving vehicle category names and silhouettes.
 * Can be imported by pure Node.js environments and React components alike.
 */

export function resolveVehicleCategory(input) {
  if (!input) return 'fallback';
  const name = typeof input === 'string' 
    ? input 
    : (input?.name || input?.category || input?.vehicle_type || '');
  
  const normalized = String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'fallback';

  // 10-Wheeler / Wing Van / Heavy Truck
  if (
    normalized.includes('wing van') ||
    normalized.includes('wingvan') ||
    normalized.includes('10w') ||
    normalized.includes('10 wheeler') ||
    normalized.includes('10wheeler') ||
    normalized.includes('heavy truck') ||
    normalized.includes('heavy')
  ) {
    return 'wing_van_10w';
  }

  // 6-Wheeler / 6W Forward / Medium Truck
  if (
    normalized.includes('6w') ||
    normalized.includes('6 wheeler') ||
    normalized.includes('6wheeler') ||
    normalized.includes('forward') ||
    normalized.includes('medium truck') ||
    normalized.includes('medium')
  ) {
    return 'forward_6w';
  }

  // Elf 4W / 4-Wheeler / Light Truck
  if (
    normalized.includes('elf') ||
    normalized.includes('4w') ||
    normalized.includes('4 wheeler') ||
    normalized.includes('4wheeler') ||
    normalized.includes('light truck') ||
    normalized.includes('light')
  ) {
    return 'elf_4w';
  }

  // Dropside / Flatbed
  if (
    normalized.includes('dropside') ||
    normalized.includes('drop side') ||
    normalized.includes('flatbed') ||
    normalized.includes('open bed')
  ) {
    return 'dropside';
  }

  // Closed Van
  if (
    normalized.includes('closed van') ||
    normalized.includes('closed') ||
    normalized.includes('van')
  ) {
    return 'closed_van';
  }

  return 'fallback';
}

export function getVehicleCategoryLabel(categoryKey) {
  switch (categoryKey) {
    case 'closed_van':
      return 'Closed Van';
    case 'dropside':
      return 'Dropside';
    case 'elf_4w':
      return 'Elf 4W';
    case 'forward_6w':
      return '6W Forward';
    case 'wing_van_10w':
      return '10W Wing Van';
    default:
      return 'Commercial Vehicle';
  }
}

