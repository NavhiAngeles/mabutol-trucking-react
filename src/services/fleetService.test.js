import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createFleetServiceContext({
  rpcResult = null,
  rpcError = null,
  insertTruckResult = null,
  insertTruckError = null,
  cargoCatError = null,
  insertDriverResult = null,
  insertDriverError = null,
  truckAssignError = null,
  docInsertError = null,
} = {}) {
  const rpcCalls = [];
  const truckInserts = [];
  const truckDeletes = [];
  const cargoInserts = [];
  const driverInserts = [];
  const driverDeletes = [];
  const truckUpdates = [];
  const docInserts = [];
  const storageRemovals = [];

  const supabaseMock = {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: rpcResult, error: rpcError };
    },
    from: (table) => {
      if (table === 'trucks') {
        return {
          insert: (payload) => {
            truckInserts.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: insertTruckResult || { id: 'trk-fallback-1', ...payload },
                  error: insertTruckError,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (col, val) => {
              truckDeletes.push({ col, val });
              return { error: null };
            },
          }),
          update: (payload) => ({
            eq: async (col, val) => {
              truckUpdates.push({ payload, col, val });
              return { error: truckAssignError };
            },
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'trk-fetched-1', plate_number: 'ABC-1234' },
                error: null,
              }),
            }),
            is: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'truck_cargo_categories') {
        return {
          insert: async (rows) => {
            cargoInserts.push(rows);
            return { error: cargoCatError };
          },
        };
      }
      if (table === 'drivers') {
        return {
          insert: (payload) => {
            driverInserts.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: insertDriverResult || { id: 'drv-fallback-1', ...payload },
                  error: insertDriverError,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (col, val) => {
              driverDeletes.push({ col, val });
              return { error: null };
            },
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'drv-fetched-1', full_name: 'Driver One' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'compliance_documents') {
        return {
          insert: async (rows) => {
            docInserts.push(rows);
            return { error: docInsertError };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({
        remove: async (paths) => {
          storageRemovals.push(...paths);
          return { error: null };
        },
      }),
    },
  };

  const context = {
    supabase: supabaseMock,
    sanitizeTruck: (t) => t,
    allRows: async () => [],
    getComplianceConfiguration: () => ({}),
    thresholdState: {},
    normalizeManilaDate: (d) => d,
    MANILA_TIMEZONE: 'Asia/Manila',
    console: { error: () => {}, log: () => {} },
  };

  vm.createContext(context);
  const source = fs.readFileSync(new URL('./fleetService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '')
    .replace(/import\.meta\.env\.\w+/g, '""');

  vm.runInContext(source + '\nthis.api = { createTruck, createDriver, deleteTruck, deleteDriver };', context);

  return {
    ...context.api,
    rpcCalls,
    truckInserts,
    truckDeletes,
    cargoInserts,
    driverInserts,
    driverDeletes,
    truckUpdates,
    docInserts,
    storageRemovals,
  };
}

test('createTruck executes atomically via fleet_save RPC with cargo categories', async () => {
  const service = createFleetServiceContext({ rpcResult: 'trk-rpc-100' });
  const result = await service.createTruck(
    { plate_number: 'XYZ-999', model: 'Isuzu Elf', capacity_kg: 3000 },
    ['cat-1', 'cat-2']
  );

  assert.equal(service.rpcCalls.length, 1);
  assert.equal(service.rpcCalls[0].name, 'fleet_save');
  assert.equal(service.rpcCalls[0].args.p_kind, 'truck');
  assert.equal(service.rpcCalls[0].args.p_data.plate_number, 'XYZ-999');
  assert.deepEqual(service.rpcCalls[0].args.p_categories, ['cat-1', 'cat-2']);
  assert.equal(result.id, 'trk-fetched-1');
  assert.equal(service.truckInserts.length, 0); // Didn't need fallback
});

test('createTruck propagates business errors from fleet_save without inserting fallback rows', async () => {
  const service = createFleetServiceContext({
    rpcError: { code: '23505', message: 'Plate number already registered' },
  });

  await assert.rejects(
    service.createTruck({ plate_number: 'XYZ-999' }, ['cat-1']),
    /Plate number already registered/
  );
  assert.equal(service.truckInserts.length, 0);
});

test('createTruck fallback rolls back newly created truck if cargo category linking fails', async () => {
  const service = createFleetServiceContext({
    rpcError: { code: 'PGRST202', message: 'Could not find function' },
    cargoCatError: { code: '42501', message: 'Permission denied on truck_cargo_categories' },
  });

  await assert.rejects(
    service.createTruck({ plate_number: 'XYZ-999' }, ['cat-1']),
    /Failed to link cargo categories/
  );
  assert.equal(service.truckInserts.length, 1);
  assert.equal(service.cargoInserts.length, 1);
  // Compensated: truck was deleted on category link error
  assert.equal(service.truckDeletes.length, 1);
  assert.equal(service.truckDeletes[0].val, 'trk-fallback-1');
});

test('createDriver executes atomically via fleet_save RPC with truck assignment and compliance docs', async () => {
  const service = createFleetServiceContext({ rpcResult: 'drv-rpc-200' });
  const result = await service.createDriver(
    { full_name: 'Juan Tamad', license_number: 'N01-11-22222' },
    'trk-assigned-1',
    [{ doc_type: 'drivers_license', document_number: 'N01-11-22222' }],
    'user-auth-uuid'
  );

  assert.equal(service.rpcCalls.length, 1);
  assert.equal(service.rpcCalls[0].name, 'fleet_save');
  assert.equal(service.rpcCalls[0].args.p_kind, 'driver');
  assert.equal(service.rpcCalls[0].args.p_data.full_name, 'Juan Tamad');
  assert.equal(service.rpcCalls[0].args.p_data.assigned_truck_id, 'trk-assigned-1');
  assert.equal(service.rpcCalls[0].args.p_data.user_id, 'user-auth-uuid');
  assert.equal(service.rpcCalls[0].args.p_documents.length, 1);
  assert.equal(result.id, 'drv-fetched-1');
  assert.equal(service.driverInserts.length, 0);
});

test('createDriver cleans up staged storage uploads if fleet_save RPC fails', async () => {
  const service = createFleetServiceContext({
    rpcError: { code: '23505', message: 'Duplicate license' },
  });

  await assert.rejects(
    service.createDriver(
      { full_name: 'Juan Tamad', license_number: 'DUP-1' },
      null,
      [{ doc_type: 'drivers_license', file_path: 'office/driver/license.pdf' }]
    ),
    /Duplicate license/
  );

  assert.deepEqual(service.storageRemovals, ['office/driver/license.pdf']);
});

test('createDriver fallback unassigns truck, deletes driver, and cleans up staged uploads if doc insert fails', async () => {
  const service = createFleetServiceContext({
    rpcError: { code: 'PGRST202', message: 'Could not find function' },
    docInsertError: { message: 'Storage quota exceeded' },
  });

  await assert.rejects(
    service.createDriver(
      { full_name: 'Fallback Driver', license_number: 'LIC-FB' },
      'trk-assigned-99',
      [{ doc_type: 'drivers_license', document_number: 'LIC-FB', file_path: 'office/driver/staged.pdf' }]
    ),
    /Failed to insert driver compliance documents/
  );

  assert.equal(service.driverInserts.length, 1);
  // Unassigned truck
  assert.ok(service.truckUpdates.some((u) => u.payload.assigned_driver_id === null));
  // Deleted created driver
  assert.equal(service.driverDeletes.length, 1);
  assert.equal(service.driverDeletes[0].val, 'drv-fallback-1');
  // Staged files cleaned up
  assert.deepEqual(service.storageRemovals, ['office/driver/staged.pdf']);
});

test('createDriver fallback deletes driver and cleans up staged uploads if truck assignment fails', async () => {
  const service = createFleetServiceContext({
    rpcError: { code: 'PGRST202', message: 'Could not find function' },
    truckAssignError: { message: 'Truck already assigned to another driver' },
  });

  await assert.rejects(
    service.createDriver(
      { full_name: 'Fallback Driver 2', license_number: 'LIC-FB2' },
      'trk-conflict-1',
      [{ doc_type: 'drivers_license', document_number: 'LIC-FB2', file_path: 'office/driver/staged2.pdf' }]
    ),
    /Failed to assign vehicle/
  );

  assert.equal(service.driverInserts.length, 1);
  assert.equal(service.driverDeletes.length, 1);
  assert.deepEqual(service.storageRemovals, ['office/driver/staged2.pdf']);
});

test('deleteTruck validates id and invokes fleet_delete RPC', async () => {
  const service = createFleetServiceContext();
  await assert.rejects(service.deleteTruck(''), /A valid truck ID is required/);

  const res = await service.deleteTruck('trk-uuid-1');
  assert.equal(res.success, true);
  assert.equal(res.id, 'trk-uuid-1');
  assert.equal(service.rpcCalls.length, 1);
  assert.equal(service.rpcCalls[0].name, 'fleet_delete');
  assert.equal(service.rpcCalls[0].args.p_kind, 'truck');
  assert.equal(service.rpcCalls[0].args.p_id, 'trk-uuid-1');
});

test('deleteDriver validates id and invokes fleet_delete RPC', async () => {
  const service = createFleetServiceContext();
  await assert.rejects(service.deleteDriver(''), /A valid driver ID is required/);

  const res = await service.deleteDriver('drv-uuid-1');
  assert.equal(res.success, true);
  assert.equal(res.id, 'drv-uuid-1');
  assert.equal(service.rpcCalls.length, 1);
  assert.equal(service.rpcCalls[0].name, 'fleet_delete');
  assert.equal(service.rpcCalls[0].args.p_kind, 'driver');
  assert.equal(service.rpcCalls[0].args.p_id, 'drv-uuid-1');
});

test('deleteTruck and deleteDriver throw informative errors if deletion is blocked', async () => {
  const service = createFleetServiceContext({
    rpcError: { message: 'Vehicle has an active delivery and cannot be removed.' },
  });
  await assert.rejects(service.deleteTruck('trk-uuid-active'), /Vehicle has an active delivery/);

  const driverService = createFleetServiceContext({
    rpcError: { message: 'Driver has an active delivery and cannot be removed.' },
  });
  await assert.rejects(driverService.deleteDriver('drv-uuid-active'), /Driver has an active delivery/);
});
