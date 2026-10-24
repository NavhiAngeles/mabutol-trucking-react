export function vehicleCategoryId(truck) {
  return truck.vehicle_types?.id || truck.vehicle_type_id ||
    (truck.vehicle_types?.name ? `name:${truck.vehicle_types.name}` : 'uncategorized');
}

export function vehicleCategories(trucks, types = []) {
  const groups = new Map();
  for (const truck of trucks) {
    const id = vehicleCategoryId(truck);
    const group = groups.get(id) || { id, label: truck.vehicle_types?.name || types.find(type => type.id === id)?.name || 'Uncategorized', count: 0 };
    group.count++;
    groups.set(id, group);
  }
  return [{ id: 'all', label: 'All', count: trucks.length },
    ...Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))];
}
