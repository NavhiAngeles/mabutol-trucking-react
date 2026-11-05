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
    return { id: rate.id, gate_name: rate.gate_name, highway: rate.highway, vehicle_class: rate.vehicle_class, fee: Number(rate.fee), ...(rate.pricing_scope === 'flat' ? { pricing_scope: 'flat' } : {}) };
  });
  return { total: selected.reduce((sum, row) => sum + Math.round(row.fee * 100), 0) / 100, rates: selected };
}

export function sameTollQuote(previous, current) {
  return previous.total === current.total && previous.vehicleClass === current.vehicleClass && JSON.stringify(previous.rates) === JSON.stringify(current.rates);
}

export function vehicleTollClass(vehicle) {
  return ['Class 1', 'Class 2', 'Class 3'].includes(vehicle?.toll_class) ? vehicle.toll_class : null;
}

const point = (lat, lng) => lat != null && lng != null && String(lat).trim() !== '' && String(lng).trim() !== '' &&
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
const near = (a, b) => {
  const radians = value => value * Math.PI / 180;
  const h = Math.sin(radians(a[1] - b[1]) / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(radians(a[0] - b[0]) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) <= 350;
};
const rateHighway = rate => rate.highway === 'NLEX' && /connector/i.test(rate.gate_name) ? 'NLEX_CONNECTOR' : rate.highway;

export function automaticTollQuote(usesTollRoad, vehicle, geometry, rates) {
  const vehicleClass = vehicleTollClass(vehicle);
  if (!usesTollRoad) return { total: 0, rates: [], vehicleClass, sections: [] };
  if (!vehicleClass) throw new Error('The selected truck type needs a saved toll class in fleet configuration.');
  const sections = geometry?.features?.find(feature => feature.properties?.expressway?.verified)?.properties.expressway.sections;
  if (!Array.isArray(sections) || !sections.length) throw new Error('Recalculate the route to identify its expressways and toll entry–exit points.');
  const selected = [];
  for (const [index, section] of sections.entries()) {
    if (!section.highway || section.highway === 'UNKNOWN' || !Array.isArray(section.entry) || !Array.isArray(section.exit) ||
        !point(section.entry[1], section.entry[0]) || !point(section.exit[1], section.exit[0])) {
      throw new Error('A toll section could not be identified. Recalculate the route before confirming.');
    }
    // Harbor Link shares NLEX's paid open system when entered directly from
    // the mainline. The standalone Harbor Link tariff must not be added again.
    if (section.highway === 'NLEX_HARBOR_LINK' &&
        ((section.connectedToPrevious === true && sections[index-1]?.highway === 'NLEX') ||
         (sections[index+1]?.connectedToPrevious === true && sections[index+1]?.highway === 'NLEX'))) continue;
    const matches = rates.filter(rate => {
      if (rate.vehicle_class !== vehicleClass || rateHighway(rate) !== section.highway) return false;
      if (rate.pricing_scope === 'flat' && ['NLEX_CONNECTOR', 'NLEX_HARBOR_LINK'].includes(section.highway)) return true;
      if (
          !point(rate.entry_lat, rate.entry_lng) || !point(rate.exit_lat, rate.exit_lng)) return false;
      const entry = [Number(rate.entry_lng), Number(rate.entry_lat)], exit = [Number(rate.exit_lng), Number(rate.exit_lat)];
      return (near(section.entry, entry) && near(section.exit, exit)) ||
        (rate.bidirectional === true && near(section.entry, exit) && near(section.exit, entry));
    });
    if (matches.length === 0) throw new Error(`No ${vehicleClass} rate matches the ${section.highway.replaceAll('_', ' ')} toll entry and exit. Configure that exact stretch in Pricing.`);
    if (matches.length > 1) throw new Error(`Multiple rates match the ${section.highway.replaceAll('_', ' ')} toll section. An administrator must resolve the duplicate pricing.`);
    // A flat barrier-system charge applies once even if map tags split it.
    if (matches[0].pricing_scope !== 'flat' || !selected.includes(matches[0].id)) selected.push(matches[0].id);
  }
  return { ...tollQuote(true, vehicleClass, selected, rates), vehicleClass, sections };
}

export function withBookingPricing(geometry, usesTollRoad, quote) {
  return { ...geometry, booking_pricing: {
    version: 1, toll_preference: usesTollRoad ? 'expressway' : 'avoid',
    toll_amount: quote.total, toll_rates: quote.rates,
    toll_class: quote.vehicleClass || null,
  } };
}
