/**
 * Normalizes assigned truck route geometry into a valid GeoJSON FeatureCollection.
 * Supports FeatureCollection, single Feature, LineString geometry, coordinates array,
 * or direct endpoint fallback from pickup to destination.
 */
export function buildRouteGeoJSON(truck) {
  if (!truck) return null;
  const geom = truck.route_geometry;
  if (geom) {
    if (geom.type === 'FeatureCollection' && Array.isArray(geom.features) && geom.features.length) {
      return geom;
    }
    if (geom.type === 'Feature') {
      return { type: 'FeatureCollection', features: [geom] };
    }
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geom, properties: {} }],
      };
    }
    if (Array.isArray(geom.coordinates)) {
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: geom.coordinates },
            properties: {},
          },
        ],
      };
    }
  }

  if (truck.pickup_coordinates && truck.dropoff_coordinates) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [truck.pickup_coordinates, truck.dropoff_coordinates],
          },
          properties: { name: 'Assigned Route' },
        },
      ],
    };
  }

  return null;
}

/**
 * Detects overlapping or near-identical coordinates and applies a small
 * radial offset so every truck marker is distinct, visible, and clickable.
 */
export function disperseTruckCoordinates(trucks, thresholdDegrees = 0.002, offsetDegrees = 0.0018) {
  if (!Array.isArray(trucks) || trucks.length <= 1) {
    return (trucks || []).map(t => ({
      ...t,
      displayLatitude: t?.latitude,
      displayLongitude: t?.longitude,
    }));
  }

  // Group trucks by coordinate proximity
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < trucks.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    assigned.add(i);

    const latA = trucks[i].latitude;
    const lngA = trucks[i].longitude;

    if (latA == null || lngA == null) continue;

    for (let j = i + 1; j < trucks.length; j++) {
      if (assigned.has(j)) continue;
      const latB = trucks[j].latitude;
      const lngB = trucks[j].longitude;
      if (latB == null || lngB == null) continue;

      const dLat = Math.abs(latA - latB);
      const dLng = Math.abs(lngA - lngB);
      if (dLat < thresholdDegrees && dLng < thresholdDegrees) {
        cluster.push(j);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  const result = [...trucks];

  for (const cluster of clusters) {
    if (cluster.length <= 1) continue;

    const count = cluster.length;
    cluster.forEach((index, pos) => {
      const truck = trucks[index];
      // Angle offset: distributes markers around the shared point
      const angle = (2 * Math.PI * pos) / count + Math.PI / 2;
      const latOffset = offsetDegrees * Math.sin(angle);
      const cosLat = Math.cos(((truck.latitude || 15) * Math.PI) / 180) || 1;
      const lngOffset = (offsetDegrees / cosLat) * Math.cos(angle);

      result[index] = {
        ...truck,
        displayLatitude: Number((truck.latitude + latOffset).toFixed(6)),
        displayLongitude: Number((truck.longitude + lngOffset).toFixed(6)),
      };
    });
  }

  return result.map(t => ({
    ...t,
    displayLatitude: t.displayLatitude ?? t.latitude,
    displayLongitude: t.displayLongitude ?? t.longitude,
  }));
}
