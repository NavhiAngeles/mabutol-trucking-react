// OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright
// Road geometry for South Luzon expressway corridors: SLEX, STAR, CALAX, CAVITEX, SKYWAY (Stage 1 & 2 / South)
// Identifies routed expressways only; it does not establish tariffs or truck access.

export const southLuzonRoads = [
  // ── SLEX: South Luzon Expressway (Alabang to Sto. Tomas / Turbina) ────────
  {
    highway: 'SLEX',
    coordinates: [
      [121.042800, 14.417500],
      [121.043250, 14.410200],
      [121.044100, 14.398500],
      [121.044800, 14.387200],
      [121.045000, 14.379500], // Susana Heights / MCX interchange
      [121.047800, 14.368500],
      [121.053500, 14.354000], // San Pedro
      [121.058200, 14.341200],
      [121.064500, 14.322000], // Southwoods
      [121.060000, 14.309000], // Carmona
      [121.087200, 14.305600], // Mamplasan / CALAX interchange
      [121.099500, 14.298000],
      [121.107500, 14.288000], // Santa Rosa
      [121.115000, 14.272000],
      [121.121000, 14.254000], // Eton City / Greenfield
      [121.128500, 14.241000],
      [121.135000, 14.228000], // Silangan
      [121.141000, 14.218000],
      [121.144500, 14.208500], // Calamba / Canlubang Toll Plaza
      [121.148000, 14.195000],
      [121.151500, 14.182000],
      [121.155000, 14.168000], // Turbina
      [121.158500, 14.152000],
      [121.161000, 14.135000],
      [121.163500, 14.113000]  // Sto. Tomas / STAR Tollway connection
    ]
  },

  // ── STAR: Southern Tagalog Arterial Road (Sto. Tomas to Batangas Port) ─────
  {
    highway: 'STAR',
    coordinates: [
      [121.163500, 14.113000], // Sto. Tomas (SLEX connection)
      [121.161000, 14.098000],
      [121.156500, 14.086000],
      [121.152000, 14.075000], // Tanauan Toll Plaza
      [121.153800, 14.056000],
      [121.156000, 14.038000], // Malvar
      [121.160500, 14.015000],
      [121.164500, 13.985000],
      [121.168000, 13.955000], // Lipa City
      [121.162000, 13.925000],
      [121.153000, 13.895000],
      [121.142000, 13.868000],
      [121.132000, 13.845000], // Ibaan
      [121.118000, 13.822000],
      [121.098000, 13.801000],
      [121.077000, 13.782000]  // Batangas City Port / Balagtas
    ]
  },

  // ── CALAX: Cavite-Laguna Expressway (Mamplasan to Silang Interchange) ──────
  {
    highway: 'CALAX',
    coordinates: [
      [121.087200, 14.305600], // Mamplasan / SLEX Interchange
      [121.078000, 14.292000],
      [121.065000, 14.275000], // Laguna Technopark
      [121.052000, 14.261000],
      [121.038000, 14.248000], // Santa Rosa - Tagaytay
      [121.021000, 14.239000],
      [121.005000, 14.232000], // Silang East
      [120.994000, 14.226000],
      [120.984000, 14.221500]  // Silang Interchange (Aguinaldo Hwy)
    ]
  },

  // ── CAVITEX: Manila-Cavite Expressway (Parañaque to Kawit) ─────────────────
  {
    highway: 'CAVITEX',
    coordinates: [
      [120.986800, 14.508500], // Parañaque Toll Plaza / Coastal
      [120.978500, 14.492000],
      [120.971000, 14.481000],
      [120.965000, 14.471000], // Zapote Toll Plaza / Flyover
      [120.954000, 14.461000],
      [120.942000, 14.453000], // Longos / Bacoor
      [120.925000, 14.444500],
      [120.915000, 14.441000],
      [120.908000, 14.438500]  // Kawit Toll Plaza / Centennial Rd
    ]
  },

  // ── SKYWAY: Stage 1 & 2 / South Segment (Buendia Makati to Alabang) ────────
  {
    highway: 'SKYWAY',
    coordinates: [
      [121.008000, 14.558500], // Buendia / Makati Ramp
      [121.013500, 14.547000],
      [121.018000, 14.536000], // Magallanes
      [121.024000, 14.524000],
      [121.028000, 14.515000], // Sales / NAIAX junction
      [121.036000, 14.501000],
      [121.045000, 14.488000], // Bicutan
      [121.046500, 14.471000],
      [121.047000, 14.452000], // Sucat
      [121.046000, 14.435000],
      [121.043000, 14.417000]  // Alabang South Station / Viaduct
    ]
  },

  // ── MCX: Muntinlupa-Cavite Expressway (Susana Heights SLEX to Daang Hari) ──
  {
    highway: 'MCX',
    coordinates: [
      [121.045000, 14.379500], // Susana Heights (SLEX merge)
      [121.038000, 14.380200],
      [121.028000, 14.381000],
      [121.018000, 14.381600],
      [121.011000, 14.382000]  // Daang Hari Toll Plaza
    ]
  }
];

