import { LUZON_BOUNDS } from '../config/mapBound.js';

const STORAGE_PREFIX = 'tanaw:revgeo:';
const reverseCache = new Map();
const inFlightReverse = new Map();

function createAbortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function getMapTilerKey() {
  try {
    return import.meta.env?.VITE_MAPTILER_API_KEY || '';
  } catch {
    return '';
  }
}

export function toPoint(lat, lng) {
  if (lat == null || lng == null) return null;
  if (typeof lat === 'string' && lat.trim() === '') return null;
  if (typeof lng === 'string' && lng.trim() === '') return null;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return null;
  return { lat: latNum, lng: lngNum };
}

export function isInsideLuzonBounds(lat, lng) {
  const point = toPoint(lat, lng);
  if (!point) return false;
  const [[minLng, minLat], [maxLng, maxLat]] = LUZON_BOUNDS;
  return (
    point.lng >= minLng &&
    point.lng <= maxLng &&
    point.lat >= minLat &&
    point.lat <= maxLat
  );
}

export function formatShortPlaceLabel(placeName) {
  const fullAddress = String(placeName || '').trim();
  if (!fullAddress) return '';
  const parts = fullAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && /^philippines$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.slice(0, 2).join(', ') || fullAddress;
}

function readStoredPlace(cacheKey) {
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey);
  }
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.shortLabel === 'string' && typeof parsed.fullAddress === 'string') {
      reverseCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch {
    // Ignore storage quota or serialization errors.
  }
  return null;
}

function writeStoredPlace(cacheKey, place) {
  reverseCache.set(cacheKey, place);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${cacheKey}`, JSON.stringify(place));
  } catch {
    // Ignore storage quota errors.
  }
}

export function clearReverseGeocodeCache() {
  reverseCache.clear();
  inFlightReverse.clear();
}

function awaitWithSignal(promise, signal, onAbort) {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      onAbort?.();
      reject(createAbortError());
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', handleAbort);
        reject(err);
      }
    );
  });
}

export async function reverseGeocodeLuzon(
  lat,
  lng,
  { signal, fetchImpl = fetch, apiKey } = {}
) {
  if (signal?.aborted) {
    throw createAbortError();
  }
  const point = toPoint(lat, lng);
  const key = apiKey !== undefined ? apiKey : getMapTilerKey();
  if (!point || !key || typeof fetchImpl !== 'function') {
    return null;
  }

  const cacheKey = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
  const cached = readStoredPlace(cacheKey);
  if (cached) {
    return cached;
  }

  let entry = inFlightReverse.get(cacheKey);
  if (!entry) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const url =
      `https://api.maptiler.com/geocoding/${point.lng},${point.lat}.json` +
      `?key=${encodeURIComponent(key)}&language=en&limit=1`;

    const promise = (async () => {
      try {
        const response = await fetchImpl(
          url,
          controller ? { signal: controller.signal } : undefined
        );
        if (!response?.ok) return null;
        const data = await response.json();
        const fullAddress =
          typeof data?.features?.[0]?.place_name === 'string'
            ? data.features[0].place_name.trim()
            : '';
        if (!fullAddress) return null;
        const result = {
          shortLabel: formatShortPlaceLabel(fullAddress),
          fullAddress,
        };
        writeStoredPlace(cacheKey, result);
        return result;
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        return null;
      } finally {
        if (inFlightReverse.get(cacheKey)?.promise === promise) {
          inFlightReverse.delete(cacheKey);
        }
      }
    })();

    entry = { promise, controller, activeConsumers: 0 };
    inFlightReverse.set(cacheKey, entry);
  }

  entry.activeConsumers += 1;
  let decremented = false;
  const releaseConsumer = () => {
    if (decremented) return;
    decremented = true;
    entry.activeConsumers -= 1;
    if (entry.activeConsumers <= 0) {
      entry.controller?.abort();
    }
  };

  try {
    const result = await awaitWithSignal(entry.promise, signal, releaseConsumer);
    return result;
  } finally {
    if (!decremented) {
      entry.activeConsumers = Math.max(0, entry.activeConsumers - 1);
    }
  }
}

export async function searchLuzonPlaces(
  query,
  { signal, fetchImpl = fetch, apiKey, limit = 6 } = {}
) {
  if (signal?.aborted) {
    throw createAbortError();
  }
  const trimmed = String(query || '').trim();
  if (trimmed.length < 3) return [];

  const key = apiKey !== undefined ? apiKey : getMapTilerKey();
  if (!key || typeof fetchImpl !== 'function') {
    return [];
  }

  const params = new URLSearchParams({
    key,
    country: 'ph',
    language: 'en',
    limit: String(limit),
    autocomplete: 'true',
    types: 'address,road,poi,place,locality,neighbourhood,municipality',
    fuzzyMatch: 'true',
    bbox: LUZON_BOUNDS.flat().join(','),
  });

  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?${params}`;
  const response = await fetchImpl(url, signal ? { signal } : undefined);
  if (!response?.ok) {
    throw new Error('Address search failed. Try again.');
  }
  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .filter((feature) => {
      const label = typeof feature?.place_name === 'string' ? feature.place_name.trim() : '';
      if (!label || !Array.isArray(feature?.center) || feature.center.length < 2) {
        return false;
      }
      const [lng, lat] = feature.center;
      return isInsideLuzonBounds(lat, lng);
    })
    .map((feature, index) => ({
      id: String(feature.id || `${feature.place_name}-${index}`),
      label: feature.place_name.trim(),
      lat: Number(feature.center[1]),
      lng: Number(feature.center[0]),
    }));
}

export function nudgeCoordinate(lat, lng, direction, stepMeters = 25) {
  const point = toPoint(lat, lng);
  if (!point) return null;
  const meters = Number(stepMeters);
  if (!Number.isFinite(meters) || meters <= 0) return point;

  const dLat = meters / 111320;
  const cosLat = Math.max(0.1, Math.cos((point.lat * Math.PI) / 180));
  const dLng = meters / (111320 * cosLat);

  let nextLat = point.lat;
  let nextLng = point.lng;

  switch (String(direction || '').toLowerCase()) {
    case 'north':
    case 'n':
      nextLat = Math.min(90, point.lat + dLat);
      break;
    case 'south':
    case 's':
      nextLat = Math.max(-90, point.lat - dLat);
      break;
    case 'east':
    case 'e':
      nextLng = Math.min(180, point.lng + dLng);
      break;
    case 'west':
    case 'w':
      nextLng = Math.max(-180, point.lng - dLng);
      break;
    default:
      break;
  }

  return { lat: nextLat, lng: nextLng };
}
