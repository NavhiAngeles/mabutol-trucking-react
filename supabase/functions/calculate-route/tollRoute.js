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
