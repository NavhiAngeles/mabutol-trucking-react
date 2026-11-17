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
export const rateHighway = rate => {
  const raw = typeof rate === 'string' ? rate : (rate?.highway || '');
  const hwy = String(raw).trim().toUpperCase();
  if ((hwy === 'NLEX' || hwy === 'NLEX_CONNECTOR') && /connector|españa|magsaysay/i.test(rate?.gate_name || '')) return 'NLEX_CONNECTOR';
  if (/^STAR(?:[ _-]?TOLLWAY)?$/i.test(hwy)) return 'STAR';
  if (/^CALAX$/i.test(hwy)) return 'CALAX';
  if (/^CAVITEX$/i.test(hwy)) return 'CAVITEX';
  if (/^SLEX$/i.test(hwy)) return 'SLEX';
  if (/^SKYWAY$/i.test(hwy)) return 'SKYWAY';
  if (/^MCX$/i.test(hwy)) return 'MCX';
  return hwy;
};

export const cleanGateName = (name) =>
  String(name || '')
    .replace(/\s*(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$/gi, '')
    .trim();

export const VERIFIED_TOLL_PRESETS = [
  // ── South Luzon Corridors ────────────────────────────────────────────────
  {
    gate_name: "TR1 & TR2: Alabang to Calamba",
    highway: "SLEX",
    class2_fee: 274,
    class3_fee: 411,
    entry_lat: 14.417500,
    entry_lng: 121.042800,
    exit_lat: 14.208500,
    exit_lng: 121.144500,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "SLEX Mainline: Alabang Viaduct to Calamba / Canlubang Toll Plaza",
  },
  {
    gate_name: "TR3: Calamba to Sto. Tomas (Batangas)",
    highway: "SLEX",
    class2_fee: 74,
    class3_fee: 111,
    entry_lat: 14.208500,
    entry_lng: 121.144500,
    exit_lat: 14.113000,
    exit_lng: 121.163500,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "SLEX TR3 Extension: Calamba to Sto. Tomas / STAR Tollway connection",
  },
  {
    gate_name: "TR1-TR3: Alabang to Sto. Tomas (Batangas)",
    highway: "SLEX",
    class2_fee: 348,
    class3_fee: 522,
    entry_lat: 14.417500,
    entry_lng: 121.042800,
    exit_lat: 14.113000,
    exit_lng: 121.163500,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "SLEX Full Mainline: Alabang Viaduct to Sto. Tomas (TR1, TR2 & TR3 combined)",
  },
  {
    gate_name: "Sto. Tomas to Batangas City Port",
    highway: "STAR",
    class2_fee: 242,
    class3_fee: 363,
    entry_lat: 14.113000,
    entry_lng: 121.163500,
    exit_lat: 13.782000,
    exit_lng: 121.077000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "STAR Tollway Mainline: Sto. Tomas to Batangas City Port (Balagtas rotunda)",
  },
  {
    gate_name: "Mamplasan (SLEX) to Silang Interchange",
    highway: "CALAX",
    class2_fee: 234,
    class3_fee: 351,
    entry_lat: 14.305600,
    entry_lng: 121.087200,
    exit_lat: 14.221500,
    exit_lng: 120.984000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "CALAX: Mamplasan SLEX Interchange to Silang Aguinaldo Highway",
  },
  {
    gate_name: "R-1: Paranaque to Kawit",
    highway: "CAVITEX",
    class2_fee: 253,
    class3_fee: 379,
    entry_lat: 14.508500,
    entry_lng: 120.986800,
    exit_lat: 14.438500,
    exit_lng: 120.908000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "CAVITEX R-1 & Extension: Parañaque Coastal Plaza to Kawit Centennial Road",
  },
  {
    gate_name: "R-1: Paranaque to Zapote",
    highway: "CAVITEX",
    class2_fee: 73,
    class3_fee: 110,
    entry_lat: 14.508500,
    entry_lng: 120.986800,
    exit_lat: 14.471000,
    exit_lng: 120.965000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "CAVITEX R-1: Parañaque Coastal Plaza to Zapote / Bacoor Flyover",
  },
  {
    gate_name: "Stage 1 & 2: Alabang to Buendia",
    highway: "SKYWAY",
    class2_fee: 329,
    class3_fee: 493,
    entry_lat: 14.417000,
    entry_lng: 121.043000,
    exit_lat: 14.558500,
    exit_lng: 121.008000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "Skyway Stage 1 & 2: Alabang South Station to Buendia / Makati Ramp",
  },
  {
    gate_name: "Stage 3: Buendia (Makati) to Balintawak (QC)",
    highway: "SKYWAY",
    class2_fee: 528,
    class3_fee: 792,
    entry_lat: 14.558500,
    entry_lng: 121.008000,
    exit_lat: 14.651917,
    exit_lng: 120.997165,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "Skyway Stage 3: Buendia Makati to Balintawak Toll Ramp",
  },
  {
    gate_name: "SLEX Susana Heights to Daang Hari",
    highway: "MCX",
    class2_fee: 92,
    class3_fee: 138,
    entry_lat: 14.379500,
    entry_lng: 121.045000,
    exit_lat: 14.382000,
    exit_lng: 121.011000,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "Muntinlupa-Cavite Expressway: Susana Heights SLEX to Daang Hari",
  },

  // ── North Luzon Corridors ────────────────────────────────────────────────
  {
    gate_name: "Balagtas to Balintawak",
    highway: "NLEX",
    class2_fee: 340,
    class3_fee: 408,
    entry_lat: 14.833861,
    entry_lng: 120.901574,
    exit_lat: 14.660560,
    exit_lng: 121.000110,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "NLEX: Balagtas to Balintawak Toll Plaza",
  },
  {
    gate_name: "Bocaue to Balintawak",
    highway: "NLEX",
    class2_fee: 263,
    class3_fee: 315,
    entry_lat: 14.809017,
    entry_lng: 120.938594,
    exit_lat: 14.660560,
    exit_lng: 121.000110,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "NLEX: Bocaue to Balintawak Toll Plaza",
  },
  {
    gate_name: "Meycauayan to Balintawak",
    highway: "NLEX",
    class2_fee: 211,
    class3_fee: 254,
    entry_lat: 14.743141,
    entry_lng: 120.973984,
    exit_lat: 14.660560,
    exit_lng: 121.000110,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "NLEX: Meycauayan to Balintawak Toll Plaza",
  },
  {
    gate_name: "Pulilan to Mabalacat (Mabiga)",
    highway: "NLEX",
    class2_fee: 595,
    class3_fee: 713,
    entry_lat: 14.862450,
    entry_lng: 120.858766,
    exit_lat: 15.195258,
    exit_lng: 120.597682,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "NLEX: Pulilan to Mabiga / SCTEX transition",
  },
  {
    gate_name: "Mabalacat (Mabiga) to Tarlac (La Paz)",
    highway: "SCTEX",
    class2_fee: 460,
    class3_fee: 689,
    entry_lat: 15.200188,
    entry_lng: 120.575940,
    exit_lat: 15.481536,
    exit_lng: 120.678335,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "SCTEX: Mabalacat Mabiga to Tarlac La Paz",
  },
  {
    gate_name: "Dinalupihan to Tarlac (La Paz)",
    highway: "SCTEX",
    class2_fee: 561,
    class3_fee: 841,
    entry_lat: 14.882000,
    entry_lng: 120.468000,
    exit_lat: 15.481536,
    exit_lng: 120.678335,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "SCTEX: Dinalupihan Bataan to Tarlac La Paz",
  },
  {
    gate_name: "Tarlac (La Paz) to Rosario (Baguio)",
    highway: "TPLEX",
    class2_fee: 778,
    class3_fee: 933,
    entry_lat: 15.481536,
    entry_lng: 120.678335,
    exit_lat: 16.225156,
    exit_lng: 120.498208,
    bidirectional: true,
    pricing_scope: "entry_exit",
    description: "TPLEX: Tarlac La Paz to Rosario La Union",
  },
  {
    gate_name: "Caloocan to España / Magsaysay",
    highway: "NLEX_CONNECTOR",
    class2_fee: 299,
    class3_fee: 418,
    pricing_scope: "flat",
    bidirectional: true,
    description: "NLEX Connector: Caloocan to España / Magsaysay Boulevard",
  },
  {
    gate_name: "Karuhatan to C3 / R10",
    highway: "NLEX_HARBOR_LINK",
    class2_fee: 199,
    class3_fee: 238,
    pricing_scope: "flat",
    bidirectional: true,
    description: "NLEX Harbor Link: Karuhatan to C3 / Navotas R10",
  },
];

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
