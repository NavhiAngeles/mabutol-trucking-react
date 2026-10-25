// Persist the same confirmed pins and road geometry used by the booking preview.
export function shipmentRouteFields(pickup, destination, geometry, minutes) {
  const valid = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  if (!valid(pickup) || !valid(destination) || !Number.isFinite(Number(minutes)) || Number(minutes) <= 0 ||
      !geometry?.features?.some(feature => feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length >= 2)) {
    throw new Error('Confirm both map pins and calculate the road route before saving.');
  }
  return {
    pickup_lat: pickup.lat, pickup_lng: pickup.lng,
    dropoff_lat: destination.lat, dropoff_lng: destination.lng,
    route_source: 'provider', route_geometry: geometry, route_duration_minutes: Number(minutes),
  };
}
