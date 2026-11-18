import { UAParser } from 'ua-parser-js';

const DEVICE_ID_STORAGE_KEY = 'tanaw.deviceId';
const LOCATION_CACHE_KEY = 'tanaw.approxLocation';
const DEFAULT_GEO_TIMEOUT_MS = 2500;

function normalizeDeviceType(parsedType, isMobileHint) {
  if (parsedType === 'tablet') return 'tablet';
  if (parsedType === 'mobile') return 'mobile';
  if (isMobileHint === true) return 'mobile';
  return 'desktop';
}

function resolveOsLabel(parsedOs, highEntropy = {}) {
  const rawName = parsedOs?.name || '';
  const rawVersion = parsedOs?.version || '';
  const platform = highEntropy.platform || rawName;
  const platformVersion = typeof highEntropy.platformVersion === 'string' ? highEntropy.platformVersion : '';

  if (platform === 'Windows' || rawName === 'Windows') {
    if (platformVersion) {
      const major = Number.parseInt(platformVersion.split('.')[0], 10);
      if (Number.isFinite(major)) {
        if (major >= 13) return 'Windows 11';
        if (major >= 1) return 'Windows 10';
      }
    }
    if (rawVersion === '11') return 'Windows 11';
    if (rawVersion === '10') return 'Windows 10';
    return rawVersion ? `Windows ${rawVersion}` : 'Windows';
  }

  if (platform === 'macOS' || rawName === 'macOS' || rawName === 'Mac OS') {
    const ver = (platformVersion || rawVersion).split('.')[0];
    return ver ? `macOS ${ver}` : 'macOS';
  }

  if (rawName === 'Android' && (platformVersion || rawVersion)) {
    const major = (platformVersion || rawVersion).split('.')[0];
    return major ? `Android ${major}` : 'Android';
  }

  if (rawName === 'iOS' && rawVersion) {
    const major = rawVersion.split('.')[0];
    return major ? `iOS ${major}` : 'iOS';
  }

  if (rawName) {
    return rawVersion ? `${rawName} ${rawVersion.split('.')[0]}` : rawName;
  }

  return 'Unknown OS';
}

function resolveDeviceName(deviceType, deviceModel, os) {
  if (deviceModel) {
    return deviceType === 'desktop' ? deviceModel : `${deviceModel} (${os})`;
  }
  if (os.startsWith('Windows')) return `${os} PC`;
  if (os.startsWith('macOS')) return 'Mac';
  if (os.startsWith('iOS')) return deviceType === 'tablet' ? 'iPad' : 'iPhone';
  if (os.startsWith('Android')) return deviceType === 'tablet' ? 'Android Tablet' : 'Android Phone';
  if (os.startsWith('Linux') || os.startsWith('Ubuntu') || os.startsWith('Fedora')) return 'Linux PC';
  if (os.startsWith('Chrome')) return 'Chromebook';
  return deviceType === 'desktop' ? 'Desktop Browser' : 'Mobile Device';
}

/**
 * Pure parser combining UAParser output with Chromium high-entropy UA hints.
 */
export function parseDeviceSnapshot(userAgent = '', highEntropy = {}) {
  const parser = new UAParser(userAgent);
  const parsed = parser.getResult();

  const os = resolveOsLabel(parsed.os, highEntropy);
  const deviceType = normalizeDeviceType(parsed.device?.type, highEntropy.mobile);

  const hintModel = typeof highEntropy.model === 'string' ? highEntropy.model.trim() : '';
  const uaModel = [parsed.device?.vendor, parsed.device?.model].filter(Boolean).join(' ').trim();
  const deviceModel = hintModel || uaModel || null;

  const browserName = parsed.browser?.name || 'Unknown Browser';
  const browserVersion = parsed.browser?.major || (parsed.browser?.version ? parsed.browser.version.split('.')[0] : '');
  const browser = browserVersion ? `${browserName} ${browserVersion}` : browserName;

  return {
    os,
    deviceType,
    deviceModel,
    deviceName: resolveDeviceName(deviceType, deviceModel, os),
    browserName,
    browserVersion,
    browser,
  };
}

/**
 * Detects OS (including Windows 11 via UA-CH), device model, device type, and browser.
 */
export async function getDeviceInfo() {
  if (typeof navigator === 'undefined') {
    return parseDeviceSnapshot('');
  }

  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;
  let highEntropy = {};

  if (uaData) {
    highEntropy = {
      platform: uaData.platform,
      mobile: uaData.mobile,
    };
    if (typeof uaData.getHighEntropyValues === 'function') {
      try {
        const values = await uaData.getHighEntropyValues(['model', 'platformVersion']);
        highEntropy = { ...highEntropy, ...values };
      } catch {
        // Fallback to UA string when high-entropy hints are blocked or unsupported.
      }
    }
  }

  return parseDeviceSnapshot(ua, highEntropy);
}

/**
 * Stable per-browser identifier used to distinguish the current device session.
 */
export function getOrCreateDeviceId() {
  if (typeof localStorage === 'undefined') return 'server-session';
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'browser-session';
  }
}

/**
 * Formats IP geolocation payloads into a concise city/region string (e.g. "Central Luzon, PH").
 */
export function formatGeoLocation(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const city = typeof payload.city === 'string' ? payload.city.trim() : '';
  const region = typeof payload.region === 'string' ? payload.region.trim() : '';
  const countryCode = typeof payload.country_code === 'string'
    ? payload.country_code.trim().toUpperCase()
    : (typeof payload.countryCode === 'string' ? payload.countryCode.trim().toUpperCase() : '');

  const primary = region || city;
  if (primary && countryCode) {
    if (city && region && city.toLowerCase() !== region.toLowerCase()) {
      return `${region}, ${countryCode}`;
    }
    return `${primary}, ${countryCode}`;
  }
  if (city && region && city.toLowerCase() !== region.toLowerCase()) {
    return `${city}, ${region}`;
  }
  return primary || countryCode || null;
}

async function fetchJsonWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      signal: controller?.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Best-effort approximate IP geolocation lookup with session caching and graceful fallback.
 */
export async function getApproxLocation({
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  timeoutMs = DEFAULT_GEO_TIMEOUT_MS,
  forceRefresh = false,
} = {}) {
  if (!forceRefresh && typeof sessionStorage !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(LOCATION_CACHE_KEY);
      if (cached) return cached;
    } catch {
      // Ignore storage access errors
    }
  }

  if (!fetchImpl) return null;

  const providers = [
    'https://ipapi.co/json/',
    'https://ipwho.is/',
  ];

  for (const url of providers) {
    const data = await fetchJsonWithTimeout(url, fetchImpl, timeoutMs);
    if (!data || data.error === true || data.success === false) continue;
    const formatted = formatGeoLocation(data);
    if (formatted) {
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(LOCATION_CACHE_KEY, formatted);
        } catch {
          // Ignore storage access errors
        }
      }
      return formatted;
    }
  }

  return null;
}
