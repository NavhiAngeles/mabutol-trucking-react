export const HANDLING_OPTIONS = [
  { id: "none", label: "None", appliedAs: "Per trip (flat fee)" },
  { id: "fragile", label: "Fragile", appliedAs: "Per trip (flat fee)" },
  { id: "keepdry", label: "Keep Dry", appliedAs: "Per trip (flat fee)" },
  { id: "temp", label: "Temperature Sensitive", appliedAs: "Per trip (flat fee)", multiline: true },
  { id: "perishable", label: "Perishable", appliedAs: "Per trip (flat fee)" },
  { id: "cold", label: "Cold Chain (Refrigerated)", appliedAs: "Per km additional", perKm: true, multiline: true, strong: true },
];

export function handlingCost(rates, label, distanceKm) {
  const option = HANDLING_OPTIONS.find(item => item.label === label);
  const rate = rates?.[option?.id];
  if (!option || rate == null || String(rate).trim() === "" || !Number.isFinite(Number(rate)) || Number(rate) < 0) return null;
  if (option.perKm && (distanceKm === "" || distanceKm == null || !Number.isFinite(Number(distanceKm)) || Number(distanceKm) < 0)) return null;
  return Math.round(Number(rate) * (option.perKm ? Number(distanceKm) : 1) * 100) / 100;
}
