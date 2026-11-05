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
        start < 0 || end <= start || end > edges.length || (mask & 24) !== 0) return null;
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

function highwayCode(name) {
  if (/nlex.*connector|connector.*nlex/i.test(name)) return 'NLEX_CONNECTOR';
  if (/\bnlex\b|north luzon expressway/i.test(name)) return 'NLEX';
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

export function tollSections(route, decode) {
  const coordinates = decode(route.geometry), masks = Array(coordinates.length - 1).fill(0);
  const roads = Array(masks.length).fill(null);
  for (const [start, end, mask] of route.extras.waycategory.values) for (let i = start; i < end; i++) masks[i] = mask;
  for (const step of (route.segments || []).flatMap(segment => segment.steps || [])) {
    const code = highwayCode(step.name || '');
    if (!code || !Array.isArray(step.way_points)) continue;
    const [start, end] = step.way_points;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > masks.length) continue;
    for (let i = start; i < end; i++) if (masks[i] & 2) roads[i] = code;
  }
  // Resolve unnamed plaza/ramp edges only inside a continuous toll run. Never
  // carry a highway identity across a toll-free connecting road.
  for (let start = 0; start < masks.length;) {
    if (!(masks[start] & 2)) { start++; continue; }
    let end = start;
    while (end < masks.length && (masks[end] & 2)) end++;
    let previous = null;
    for (let i = start; i < end; i++) { if (roads[i]) previous = roads[i]; else if (previous) roads[i] = previous; }
    let next = null;
    for (let i = end - 1; i >= start; i--) { if (roads[i]) next = roads[i]; else if (next) roads[i] = next; }
    start = end;
  }
  const sections = [];
  for (let i = 0; i < masks.length;) {
    if (!(masks[i] & 2)) { i++; continue; }
    const start = i, highway = roads[i] || 'UNKNOWN';
    while (i < masks.length && (masks[i] & 2) && (roads[i] || 'UNKNOWN') === highway) i++;
    sections.push({ highway, entry: coordinates[start], exit: coordinates[i] });
  }
  return sections;
}
