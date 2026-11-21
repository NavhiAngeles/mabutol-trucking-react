import { supabase } from './supabaseClient.js';

export const SIDEBAR_BADGE_MODULES = {
  shipments: {
    key: 'shipments',
    path: '/shipment',
    table: 'shipments',
    timestampColumn: 'created_at',
  },
  fleet_vehicles: {
    key: 'fleet_vehicles',
    path: '/fleet/vehicles',
    table: 'trucks',
    timestampColumn: 'created_at',
    group: 'fleet',
  },
  fleet_drivers: {
    key: 'fleet_drivers',
    path: '/fleet/drivers',
    table: 'drivers',
    timestampColumn: 'created_at',
    group: 'fleet',
  },
  fleet_maintenance: {
    key: 'fleet_maintenance',
    path: '/fleet/maintenance',
    table: 'maintenance_records',
    timestampColumn: 'created_at',
    group: 'fleet',
  },
  customers: {
    key: 'customers',
    path: '/customer',
    table: 'customers',
    timestampColumn: 'created_at',
  },
  compliance: {
    key: 'compliance',
    path: '/compliance',
    table: 'compliance_documents',
    timestampColumn: 'created_at',
  },
  settings_users: {
    key: 'settings_users',
    path: '/settings/userManagement',
    table: 'users',
    timestampColumn: 'created_at',
    group: 'settings',
    filter: (query) => query.in('role', ['admin', 'staff']),
  },
};

export const SIDEBAR_BADGE_TABLES = [
  ...new Set(Object.values(SIDEBAR_BADGE_MODULES).map((mod) => mod.table)),
];

const MODULE_LIST = Object.values(SIDEBAR_BADGE_MODULES);

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizePath(pathname) {
  const cleaned = String(pathname || '').trim().toLowerCase().replace(/\/+$/, '');
  return cleaned || '/';
}

/**
 * Returns the badge module key matching a route pathname, or null if none.
 */
export function getModuleKeyForPath(pathname) {
  const normalized = normalizePath(pathname);
  const match = MODULE_LIST.find((mod) => mod.path.toLowerCase() === normalized);
  return match ? match.key : null;
}

/**
 * Returns the localStorage key storing per-module last-seen timestamps for a user.
 */
export function getSeenStorageKey(userId) {
  return `mabutol_sidebar_seen_v1_${userId}`;
}

/**
 * Reads persisted per-module last-seen ISO timestamps for a user.
 */
export function readSeenTimestamps(userId, storage) {
  const store = resolveStorage(storage);
  if (!userId || !store || typeof store.getItem !== 'function') return {};
  try {
    const raw = store.getItem(getSeenStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const valid = {};
    for (const mod of MODULE_LIST) {
      const value = parsed[mod.key];
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        valid[mod.key] = value;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

/**
 * Persists per-module last-seen ISO timestamps for a user.
 */
export function writeSeenTimestamps(userId, map, storage) {
  const store = resolveStorage(storage);
  if (!userId || !store || typeof store.setItem !== 'function') return;
  try {
    store.setItem(getSeenStorageKey(userId), JSON.stringify(map || {}));
  } catch {
    // Non-blocking storage persistence
  }
}

/**
 * Ensures every tracked module has a baseline last-seen timestamp so first-time users start at 0.
 */
export function ensureBaselineTimestamps(userId, nowIso = new Date().toISOString(), storage) {
  const seenMap = readSeenTimestamps(userId, storage);
  const initializedKeys = [];
  for (const mod of MODULE_LIST) {
    if (!seenMap[mod.key] || Number.isNaN(Date.parse(seenMap[mod.key]))) {
      seenMap[mod.key] = nowIso;
      initializedKeys.push(mod.key);
    }
  }
  if (initializedKeys.length > 0) {
    writeSeenTimestamps(userId, seenMap, storage);
  }
  return { seenMap, initializedKeys };
}

/**
 * Marks a single module as seen at the provided timestamp.
 */
export function markModuleSeen(userId, moduleKey, nowIso = new Date().toISOString(), storage) {
  if (!userId || !moduleKey || !(moduleKey in SIDEBAR_BADGE_MODULES)) return {};
  const seenMap = readSeenTimestamps(userId, storage);
  seenMap[moduleKey] = nowIso;
  writeSeenTimestamps(userId, seenMap, storage);
  return seenMap;
}

/**
 * Sums badge counts across all modules belonging to a sidebar dropdown group.
 */
export function getGroupBadgeTotal(counts, groupName) {
  if (!counts || !groupName) return 0;
  let total = 0;
  for (const mod of MODULE_LIST) {
    if (mod.group === groupName) {
      const value = Number(counts[mod.key] || 0);
      if (Number.isFinite(value) && value > 0) {
        total += value;
      }
    }
  }
  return total;
}

/**
 * Counts newly created records per tracked module since the user last viewed each module.
 */
export async function loadSidebarBadgeCounts(userId, activePath, client = supabase, options = {}) {
  if (!userId || typeof client?.from !== 'function') return {};

  const nowIso = options.nowIso || new Date().toISOString();
  const storage = options.storage;
  const { seenMap, initializedKeys } = ensureBaselineTimestamps(userId, nowIso, storage);
  const activeKey = getModuleKeyForPath(activePath);

  if (activeKey) {
    seenMap[activeKey] = nowIso;
    markModuleSeen(userId, activeKey, nowIso, storage);
  }

  const counts = Object.fromEntries(MODULE_LIST.map((mod) => [mod.key, 0]));
  const initializedSet = new Set(initializedKeys);
  const modulesToQuery = MODULE_LIST.filter(
    (mod) => mod.key !== activeKey && !initializedSet.has(mod.key)
  );

  if (modulesToQuery.length === 0) {
    return counts;
  }

  const results = await Promise.allSettled(
    modulesToQuery.map(async (mod) => {
      let query = client
        .from(mod.table)
        .select('id', { count: 'exact', head: true })
        .gt(mod.timestampColumn, seenMap[mod.key]);
      if (typeof mod.filter === 'function') {
        query = mod.filter(query);
      }
      const { count, error } = await query;
      if (error || typeof count !== 'number' || !Number.isFinite(count)) {
        return [mod.key, 0];
      }
      return [mod.key, Math.max(0, count)];
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [key, value] = result.value;
      counts[key] = value;
    }
  }

  if (activeKey) {
    counts[activeKey] = 0;
  }

  return counts;
}
