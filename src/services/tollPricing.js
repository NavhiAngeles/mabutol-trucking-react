// Toll classes depend on the actual truck/axles, not its cargo capacity.
export function tollQuote(usesTollRoad, vehicleClass, selectedIds, rates) {
  if (!usesTollRoad) return { total: 0, rates: [] };
  if (!['Class 1', 'Class 2', 'Class 3'].includes(vehicleClass)) {
    throw new Error('Select the actual truck toll class before confirming toll fees.');
  }
  if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('Select the applicable entry–exit toll rates from Pricing.');
  }
  const selected = selectedIds.map(id => {
    const rate = rates.find(row => row.id === id);
    if (!rate || rate.vehicle_class !== vehicleClass || rate.fee == null || String(rate.fee).trim() === '' ||
        !Number.isFinite(Number(rate.fee)) || Number(rate.fee) < 0) {
      throw new Error('A selected toll rate is unavailable or does not match the truck toll class. Review Pricing.');
    }
    return { id: rate.id, gate_name: rate.gate_name, highway: rate.highway, vehicle_class: rate.vehicle_class, fee: Number(rate.fee) };
  });
  return { total: selected.reduce((sum, row) => sum + Math.round(row.fee * 100), 0) / 100, rates: selected };
}

export function sameTollQuote(previous, current) {
  return previous.total === current.total && JSON.stringify(previous.rates) === JSON.stringify(current.rates);
}

export function withBookingPricing(geometry, usesTollRoad, quote) {
  return { ...geometry, booking_pricing: {
    version: 1, toll_preference: usesTollRoad ? 'expressway' : 'avoid',
    toll_amount: quote.total, toll_rates: quote.rates,
  } };
}
