// ORS waycategory: 1=motorway/motorway_link, 2=tollway, 8=ferry,16=ford.
// A single toll-tagged ramp is insufficient evidence of an expressway journey.
export function expresswayCoverage(route, decode) {
  const points = decode(route.geometry);
  const categories = route.extras?.waycategory?.values;
  if (!Array.isArray(categories) || !categories.length || points.length < 2) return null;
  const rad = value => value * Math.PI / 180;
  const distance = (a, b) => {
    const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };
  if (!points.every(point => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) return null;
  const edges = points.slice(1).map((point, i) => distance(points[i], point));
  const masks = Array(edges.length).fill(null);
  for (const segment of categories) {
    const [start, end, mask] = segment;
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(mask) || mask < 0 ||
        start < 0 || end <= start || end > edges.length || (mask & 8) !== 0) return null;
    for (let i = start; i < end; i++) {
      if (masks[i] !== null) return null;
      masks[i] = mask;
    }
  }
  if (masks.includes(null)) return null;
  const total = edges.reduce((sum, meters) => sum + meters, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  // Polyline lengths are scaled to the provider's road distance, avoiding
  // rounding differences while retaining the actual category proportions.
  const scale = route.summary.distance / total;
  const highwayMeters = edges.reduce((sum, meters, i) => sum + ((masks[i] & 1) ? meters * scale : 0), 0);
  const tollMeters = edges.reduce((sum, meters, i) => sum + ((masks[i] & 3) === 3 ? meters * scale : 0), 0);
  // For long journeys, reject brief ramps/links (less than 5km motorway or
  // 1.5km tolled motorway). Proportional limits retain short expressway trips.
  const verified = highwayMeters >= Math.min(5000, route.summary.distance * 0.4) &&
    tollMeters >= Math.min(1500, route.summary.distance * 0.15);
  const names = (route.segments || []).flatMap(segment => segment.steps || [])
    .filter(step => Array.isArray(step.way_points) && masks.slice(step.way_points[0], step.way_points[1]).some(mask => (mask & 1) !== 0))
    .map(step => String(step.name || '').trim()).filter(name => name && name !== '-');
  return { verified, highwayMeters, tollMeters, share: highwayMeters / route.summary.distance, roadNames: [...new Set(names)].slice(0, 12) };
}

export function chooseExpresswayRoute(routes, decode) {
  const candidates = [];
  for (const route of routes || []) {
    if (!Number.isFinite(route.summary?.distance) || route.summary.distance <= 0 ||
        !Number.isFinite(route.summary?.duration) || route.summary.duration <= 0 || typeof route.geometry !== 'string') continue;
    try {
      const coverage = expresswayCoverage(route, decode);
      if (coverage?.verified) candidates.push({ route, coverage });
    } catch { /* Ignore malformed alternatives rather than accepting a weaker route. */ }
  }
  // Prefer use of expressways over saving a few minutes on ordinary roads.
  // Duration breaks ties between comparably covered expressway routes.
  candidates.sort((a, b) => b.coverage.share - a.coverage.share || a.route.summary.duration - b.route.summary.duration);
  return candidates[0] || null;
}

export function highwayCode(name) {
  if (/nlex.*harbo[u]?r|harbo[u]?r.*link/i.test(name)) return 'NLEX_HARBOR_LINK';
  if (/nlex.*connector|connector.*nlex/i.test(name)) return 'NLEX_CONNECTOR';
  if (/\bnlex\b|north luzon expressway|manila north (?:tollway|expressway)/i.test(name)) return 'NLEX';
  if (/\bsctex\b|subic.clark.tarlac/i.test(name)) return 'SCTEX';
  if (/\btplex\b|tarlac.pangasinan.la union/i.test(name)) return 'TPLEX';
  if (/skyway/i.test(name)) return 'SKYWAY';
  if (/\bslex\b|south luzon expressway/i.test(name)) return 'SLEX';
  if (/\bcalax\b|cavite.laguna expressway/i.test(name)) return 'CALAX';
  if (/\bcavitex\b|manila.cavite expressway/i.test(name)) return 'CAVITEX';
  if (/\bstar\b|southern tagalog arterial/i.test(name)) return 'STAR';
  if (/\bmcx\b|muntinlupa.cavite expressway/i.test(name)) return 'MCX';
  if (/\bnaiax\b|naia expressway/i.test(name)) return 'NAIAX';
  if (/c.?5 southlink/i.test(name)) return 'C5 SOUTHLINK';
  return null;
}

// Match the actual routed edge, not a city/bounding box. Both endpoints and the
// midpoint must follow the same mapped expressway within 25m. ORS categories
// still decide whether this is a motorway, excluding surface roads below it.
export function mappedHighway(a, b, centerlines) {
  const distance = (p, x, y) => {
    const sx = 111320 * Math.cos(p[1] * Math.PI / 180), sy = 111320;
    const dx = (y[0] - x[0]) * sx, dy = (y[1] - x[1]) * sy;
    const px = (p[0] - x[0]) * sx, py = (p[1] - x[1]) * sy;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - t * dx, py - t * dy);
  };
  const samples = [a, b, [(a[0]+b[0])/2, (a[1]+b[1])/2]];
  const matches = new Set(centerlines.filter(road => samples.every(p =>
    road.coordinates.slice(1).some((end, i) => distance(p, road.coordinates[i], end) <= 25)
  )).map(road => road.highway));
  return matches.size === 1 ? [...matches][0] : null;
}

export function tollSections(route, decode, centerlines = []) {
  const coordinates = decode(route.geometry), masks = Array(coordinates.length - 1).fill(0);
  const roads = Array(masks.length).fill(null);
  for (const [start, end, mask] of route.extras.waycategory.values) for (let i = start; i < end; i++) masks[i] = mask;
  for (const step of (route.segments || []).flatMap(segment => segment.steps || [])) {
    const code = highwayCode(step.name || '');
    if (!code || !Array.isArray(step.way_points)) continue;
    const [start, end] = step.way_points;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > masks.length) continue;
    for (let i = start; i < end; i++) if (masks[i] & 3) roads[i] = code;
  }
  const explicitlyNamed = [...roads];
  for (let i = 0; i < masks.length; i++) {
    if (!roads[i] && (masks[i] & 1)) roads[i] = mappedHighway(coordinates[i], coordinates[i+1], centerlines);
  }
  // At stacked interchanges an unnamed ramp can shadow another expressway.
  // A short overlap is not enough to identify a second chargeable corridor.
  // Require 600m of actual centerline support per continuous motorway run;
  // explicit provider names are unaffected by this fallback threshold.
  for (let start = 0; start < masks.length;) {
    if (!(masks[start] & 3)) { start++; continue; }
    let end = start;
    const support = new Map();
    while (end < masks.length && (masks[end] & 3)) {
      if (roads[end] && !explicitlyNamed[end]) {
        const a=coordinates[end],b=coordinates[end+1];
        const meters=Math.hypot((b[0]-a[0])*111320*Math.cos(a[1]*Math.PI/180),(b[1]-a[1])*111320);
        support.set(roads[end],(support.get(roads[end]) || 0)+meters);
      }
      end++;
    }
    for (let i=start;i<end;i++) if (!explicitlyNamed[i] && (support.get(roads[i]) || 0)<600) roads[i]=null;
    start=end;
  }
  const identified = [...roads];
  // Resolve unnamed plaza/ramp edges only inside a continuous toll run. Never
  // carry a highway identity across a toll-free connecting road.
  for (let start = 0; start < masks.length;) {
    if (!(masks[start] & 3)) { start++; continue; }
    let end = start;
    while (end < masks.length && (masks[end] & 3)) end++;
    let previous = null;
    for (let i = start; i < end; i++) { if (roads[i]) previous = roads[i]; else if (previous) roads[i] = previous; }
    let next = null;
    for (let i = end - 1; i >= start; i--) { if (roads[i]) next = roads[i]; else if (next) roads[i] = next; }
    start = end;
  }
  const sections = [];
  let previousEnd = -1;
  for (let i = 0; i < masks.length;) {
    if (!(masks[i] & 3)) { i++; continue; }
    const start = i, highway = roads[i] || 'UNKNOWN';
    while (i < masks.length && (masks[i] & 3) && (roads[i] || 'UNKNOWN') === highway) i++;
    if (masks.slice(start,i).some(mask => (mask & 2) !== 0)) {
      const known = Array.from({length:i-start}, (_, offset) => start+offset).filter(index => identified[index] === highway);
      // Canonical motorway access points exclude unnamed approach ramps, whose
      // category boundaries can be hundreds of meters before the merge/plaza.
      sections.push({ highway, entry: coordinates[known[0] ?? start], exit: coordinates[known.length ? known.at(-1)+1 : i],
        ...(previousEnd === start ? { connectedToPrevious: true } : {}) });
      previousEnd = i;
    }
  }
  return sections;
}

export function encodePolyline(coordinates, precision = 5) {
  const factor = Math.pow(10, precision);
  let prevLat = 0;
  let prevLng = 0;
  let output = "";
  const encodeValue = (value) => {
    let num = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (num >= 0x20) {
      chunk += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
      num >>= 5;
    }
    chunk += String.fromCharCode(num + 63);
    return chunk;
  };
  for (const [lng, lat] of coordinates || []) {
    const rLat = Math.round(lat * factor);
    const rLng = Math.round(lng * factor);
    output += encodeValue(rLat - prevLat) + encodeValue(rLng - prevLng);
    prevLat = rLat;
    prevLng = rLng;
  }
  return output;
}

export function valhallaTripToOrsRoute(trip, decode, centerlines = []) {
  const leg = trip?.legs?.[0];
  if (!leg || typeof leg.shape !== "string") return null;
  const coordinates = decode(leg.shape, 6);
  const edgeCount = coordinates.length - 1;
  if (edgeCount < 1) return null;

  const edgeMasks = new Array(edgeCount).fill(0);
  const steps = [];

  for (const maneuver of leg.maneuvers || []) {
    const start = Math.max(
      0,
      Math.min(edgeCount, Number(maneuver.begin_shape_index) || 0)
    );
    const end = Math.max(
      start,
      Math.min(edgeCount, Number(maneuver.end_shape_index) || start)
    );
    if (end <= start) continue;

    const names = [
      ...(maneuver.street_names || []),
      ...(maneuver.begin_street_names || []),
    ].filter(Boolean);
    const stepName = names.join(" / ");
    const code = highwayCode(stepName);
    const isHighway = Boolean(maneuver.highway || maneuver.toll || code);
    const isToll = Boolean(maneuver.toll || code);
    const mask =
      (maneuver.ferry ? 8 : 0) | (isHighway ? 1 : 0) | (isToll ? 2 : 0);

    for (let i = start; i < end; i += 1) {
      edgeMasks[i] = mask;
    }
    steps.push({ name: stepName || "-", way_points: [start, end] });
  }

  if (centerlines.length > 0) {
    for (let i = 0; i < edgeCount; i += 1) {
      if ((edgeMasks[i] & 1) !== 0 && (edgeMasks[i] & 2) === 0) {
        if (mappedHighway(coordinates[i], coordinates[i + 1], centerlines)) {
          edgeMasks[i] |= 2;
        }
      }
    }
  }

  if (leg.summary?.has_ferry && !edgeMasks.some((mask) => (mask & 8) !== 0)) {
    edgeMasks[0] |= 8;
  }

  const values = [];
  for (let i = 0; i < edgeCount; ) {
    const mask = edgeMasks[i];
    let j = i + 1;
    while (j < edgeCount && edgeMasks[j] === mask) j += 1;
    values.push([i, j, mask]);
    i = j;
  }

  return {
    summary: {
      distance: Number(leg.summary?.length || 0) * 1000,
      duration: Number(leg.summary?.time || 0),
    },
    geometry: encodePolyline(coordinates, 5),
    extras: { waycategory: { values } },
    segments: [{ steps }],
  };
}

export function valhallaResponseToOrsResult(valhallaJson, decode, centerlines = []) {
  const trips = [
    valhallaJson?.trip,
    ...(valhallaJson?.alternates || []).map((alt) => alt?.trip),
  ].filter(Boolean);
  const routes = trips
    .map((trip) => valhallaTripToOrsRoute(trip, decode, centerlines))
    .filter(Boolean);
  return { routes };
}
