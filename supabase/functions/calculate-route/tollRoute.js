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
