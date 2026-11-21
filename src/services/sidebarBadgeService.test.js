import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadSidebarBadgeService(mockSupabase = {}) {
  const source = fs
    .readFileSync(new URL('./sidebarBadgeService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export async function /gm, 'async function ')
    .replace(/^export function /gm, 'function ');
  const context = vm.createContext({
    supabase: mockSupabase,
    Promise,
    Set,
    Object,
    Array,
    Number,
    String,
    Date,
    Math,
    JSON,
  });
  vm.runInContext(
    `${source}
    this.SIDEBAR_BADGE_MODULES = SIDEBAR_BADGE_MODULES;
    this.SIDEBAR_BADGE_TABLES = SIDEBAR_BADGE_TABLES;
    this.ensureBaselineTimestamps = ensureBaselineTimestamps;
    this.getGroupBadgeTotal = getGroupBadgeTotal;
    this.getModuleKeyForPath = getModuleKeyForPath;
    this.getSeenStorageKey = getSeenStorageKey;
    this.loadSidebarBadgeCounts = loadSidebarBadgeCounts;
    this.markModuleSeen = markModuleSeen;
    this.readSeenTimestamps = readSeenTimestamps;`,
    context
  );
  return context;
}

const {
  SIDEBAR_BADGE_MODULES,
  SIDEBAR_BADGE_TABLES,
  ensureBaselineTimestamps,
  getGroupBadgeTotal,
  getModuleKeyForPath,
  getSeenStorageKey,
  loadSidebarBadgeCounts,
  markModuleSeen,
  readSeenTimestamps,
} = loadSidebarBadgeService();

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

function createMockClient(tableCounts, recordedQueries = []) {
  return {
    from(table) {
      const entry = { table, selectArgs: null, gtArgs: null, inArgs: null };
      recordedQueries.push(entry);
      const query = {
        select(...args) {
          entry.selectArgs = args;
          return query;
        },
        gt(...args) {
          entry.gtArgs = args;
          return query;
        },
        in(...args) {
          entry.inArgs = args;
          return query;
        },
        then(onFulfilled, onRejected) {
          const response = tableCounts[table];
          const promise =
            response instanceof Error
              ? Promise.reject(response)
              : Promise.resolve(response ?? { count: 0, error: null });
          return promise.then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
}

test('getModuleKeyForPath resolves table-backed modules case-insensitively and ignores non-table paths', () => {
  assert.equal(getModuleKeyForPath('/shipment'), 'shipments');
  assert.equal(getModuleKeyForPath('/Shipment/'), 'shipments');
  assert.equal(getModuleKeyForPath('/fleet/vehicles'), 'fleet_vehicles');
  assert.equal(getModuleKeyForPath('/Fleet/Drivers'), 'fleet_drivers');
  assert.equal(getModuleKeyForPath('/fleet/maintenance'), 'fleet_maintenance');
  assert.equal(getModuleKeyForPath('/customer'), 'customers');
  assert.equal(getModuleKeyForPath('/compliance'), 'compliance');
  assert.equal(getModuleKeyForPath('/Settings/UserManagement'), 'settings_users');
  assert.equal(getModuleKeyForPath('/dashboard'), null);
  assert.equal(getModuleKeyForPath('/fleet/overview'), null);
  assert.equal(getModuleKeyForPath('/settings/notification'), null);
});

test('first-time load initializes baseline timestamps and returns zero for all modules without querying historical records', async () => {
  const storage = createMemoryStorage();
  const nowIso = '2026-11-21T10:00:00.000Z';
  let queryCalled = false;
  const client = {
    from() {
      queryCalled = true;
      throw new Error('Should not query historical records during baseline initialization');
    },
  };

  const counts = await loadSidebarBadgeCounts('user-1', '/dashboard', client, { nowIso, storage });
  assert.equal(queryCalled, false);
  assert.deepEqual(structuredClone(counts), {
    shipments: 0,
    fleet_vehicles: 0,
    fleet_drivers: 0,
    fleet_maintenance: 0,
    customers: 0,
    compliance: 0,
    settings_users: 0,
  });

  const saved = readSeenTimestamps('user-1', storage);
  for (const mod of Object.values(SIDEBAR_BADGE_MODULES)) {
    assert.equal(saved[mod.key], nowIso);
  }
  assert.deepEqual(structuredClone(SIDEBAR_BADGE_TABLES), [
    'shipments',
    'trucks',
    'drivers',
    'maintenance_records',
    'customers',
    'compliance_documents',
    'users',
  ]);
});

test('loadSidebarBadgeCounts counts new rows after lastSeen across all tracked modules and applies role filter to users', async () => {
  const seenIso = '2026-11-21T10:00:00.000Z';
  const storage = createMemoryStorage();
  ensureBaselineTimestamps('user-1', seenIso, storage);

  const recordedQueries = [];
  const client = createMockClient(
    {
      shipments: { count: 2, error: null },
      trucks: { count: 1, error: null },
      drivers: { count: 3, error: null },
      maintenance_records: { count: 4, error: null },
      customers: { count: 5, error: null },
      compliance_documents: { count: 6, error: null },
      users: { count: 2, error: null },
    },
    recordedQueries
  );

  const counts = await loadSidebarBadgeCounts('user-1', '/dashboard', client, {
    nowIso: '2026-11-21T11:00:00.000Z',
    storage,
  });

  assert.deepEqual(structuredClone(counts), {
    shipments: 2,
    fleet_vehicles: 1,
    fleet_drivers: 3,
    fleet_maintenance: 4,
    customers: 5,
    compliance: 6,
    settings_users: 2,
  });

  assert.equal(recordedQueries.length, 7);
  for (const query of recordedQueries) {
    assert.deepEqual(structuredClone(query.selectArgs), ['id', { count: 'exact', head: true }]);
    assert.deepEqual(structuredClone(query.gtArgs), ['created_at', seenIso]);
  }
  const usersQuery = recordedQueries.find((q) => q.table === 'users');
  assert.deepEqual(structuredClone(usersQuery.inArgs), ['role', ['admin', 'staff']]);
});

test('active module suppresses its own badge and advances its lastSeen timestamp', async () => {
  const seenIso = '2026-11-21T10:00:00.000Z';
  const storage = createMemoryStorage();
  ensureBaselineTimestamps('user-1', seenIso, storage);

  const recordedQueries = [];
  const client = createMockClient(
    {
      shipments: { count: 9, error: null },
      trucks: { count: 2, error: null },
      drivers: { count: 1, error: null },
      maintenance_records: { count: 0, error: null },
      customers: { count: 4, error: null },
      compliance_documents: { count: 1, error: null },
      users: { count: 1, error: null },
    },
    recordedQueries
  );

  const shipmentVisitNow = '2026-11-21T12:00:00.000Z';
  const shipmentViewCounts = await loadSidebarBadgeCounts('user-1', '/shipment', client, {
    nowIso: shipmentVisitNow,
    storage,
  });
  assert.equal(shipmentViewCounts.shipments, 0);
  assert.equal(shipmentViewCounts.customers, 4);
  assert.equal(recordedQueries.some((q) => q.table === 'shipments'), false);
  assert.equal(readSeenTimestamps('user-1', storage).shipments, shipmentVisitNow);

  const fleetVisitNow = '2026-11-21T12:05:00.000Z';
  const vehicleViewCounts = await loadSidebarBadgeCounts('user-1', '/fleet/vehicles', client, {
    nowIso: fleetVisitNow,
    storage,
  });
  assert.equal(vehicleViewCounts.fleet_vehicles, 0);
  assert.equal(vehicleViewCounts.fleet_drivers, 1);
  assert.equal(readSeenTimestamps('user-1', storage).fleet_vehicles, fleetVisitNow);
});

test('markModuleSeen persists updates and getGroupBadgeTotal sums group counts accurately', () => {
  const storage = createMemoryStorage({
    [getSeenStorageKey('user-1')]: JSON.stringify({
      shipments: '2026-11-21T09:00:00.000Z',
    }),
  });
  markModuleSeen('user-1', 'customers', '2026-11-21T13:00:00.000Z', storage);
  const seen = readSeenTimestamps('user-1', storage);
  assert.equal(seen.shipments, '2026-11-21T09:00:00.000Z');
  assert.equal(seen.customers, '2026-11-21T13:00:00.000Z');

  const counts = {
    shipments: 10,
    fleet_vehicles: 2,
    fleet_drivers: 1,
    fleet_maintenance: 3,
    settings_users: 4,
  };
  assert.equal(getGroupBadgeTotal(counts, 'fleet'), 6);
  assert.equal(getGroupBadgeTotal(counts, 'settings'), 4);
  assert.equal(getGroupBadgeTotal(counts, 'unknown'), 0);
});

test('query errors or rejections fall back to zero per module without breaking other counts', async () => {
  const storage = createMemoryStorage();
  ensureBaselineTimestamps('user-1', '2026-11-21T10:00:00.000Z', storage);

  const client = createMockClient({
    shipments: { count: null, error: new Error('RLS denied') },
    trucks: new Error('Network failure'),
    drivers: { count: 2, error: null },
  });

  const counts = await loadSidebarBadgeCounts('user-1', '/dashboard', client, { storage });
  assert.equal(counts.shipments, 0);
  assert.equal(counts.fleet_vehicles, 0);
  assert.equal(counts.fleet_drivers, 2);
});
