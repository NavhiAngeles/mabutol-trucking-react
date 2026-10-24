import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function service({ rpcError = null, uploadError = null, cleanupError = null, signedIn = true } = {}) {
  const uploads = [], removed = [], saves = [];
  const context = { crypto: { randomUUID: () => 'unique-file' }, supabase: {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'office' } : null }, error: null }) },
    storage: { from: () => ({ upload: async path => { uploads.push(path); return { error: uploadError }; }, remove: async paths => { removed.push(...paths); return { error: cleanupError }; } }) },
    rpc: async (name, args) => { saves.push({ name, args }); return { data: rpcError ? null : 'saved-id', error: rpcError }; },
  } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('./fleetWorkspaceService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api={saveFleetRecord,validateComplianceFile,fleetDisplayStatus};', context);
  return { ...context.api, uploads, removed, saves };
}
const file = { type: 'application/pdf', size: 20 };
test('fleet distinguishes reservations and loading from transit without changing stored status', () => {
  const { fleetDisplayStatus } = service();
  const truck = { id: 'truck', status: 'available' };
  const delivery = status => [{ truck_id: truck.id, status }];
  assert.equal(fleetDisplayStatus(truck, delivery('assigned'), []), 'reserved');
  assert.equal(fleetDisplayStatus(truck, delivery('loading'), []), 'loading');
  assert.equal(fleetDisplayStatus(truck, delivery('in_transit'), []), 'on_trip');
  assert.equal(fleetDisplayStatus(truck, delivery('completed'), []), 'available');
  assert.equal(fleetDisplayStatus(truck, delivery('cancelled'), []), 'available');
  assert.equal(fleetDisplayStatus(truck, [{ truck_id: 'other', status: 'in_transit' }], []), 'available');
  assert.equal(fleetDisplayStatus(truck, delivery('assigned'), [{ truck_id: truck.id, status: 'in_progress' }]), 'maintenance');
  assert.equal(fleetDisplayStatus({ ...truck, status: 'on_trip' }, [], []), 'on_trip');
  assert.equal(truck.status, 'available');
});
test('fleet save stages unique private file, atomically links docs and sends optimistic version', async () => {
  const api = service();
  const result = await api.saveFleetRecord('truck', { id: 'truck', updated_at: 'version' }, { model: 'Truck' }, { categories: ['cargo'], documents: [{ doc_type: 'lto_registration', file }] });
  assert.equal(result.id, 'saved-id'); assert.equal(api.uploads.length, 1); assert.equal(api.removed.length, 0);
  assert.equal(api.saves[0].args.p_expected, 'version'); assert.equal(api.saves[0].args.p_documents[0].file_path, 'office/unique-file/document.pdf');
  assert.equal(api.saves[0].args.p_documents[0].file, undefined);
});
test('failed database transaction cleans up only the newly staged uploads and reports failure', async () => {
  const api = service({ rpcError: { message: 'Vehicle is reserved' } });
  await assert.rejects(api.saveFleetRecord('truck', null, {}, { documents: [{ file }] }), /Vehicle is reserved/);
  assert.deepEqual(api.removed, api.uploads);
});
test('prevalidation rejects any invalid file before starting uploads or saving', async () => {
  const api = service();
  await assert.rejects(api.saveFleetRecord('truck', null, {}, { documents: [{ file }, { file: { type: 'text/html', size: 20 } }] }), /Choose a PDF/);
  assert.equal(api.uploads.length, 0); assert.equal(api.saves.length, 0);
});
test('upload failures do not create records; missing session does not upload', async () => {
  const api = service({ uploadError: new Error('denied') });
  await assert.rejects(api.saveFleetRecord('document', null, {}, { documents: [{ file }] }), /upload failed/);
  assert.equal(api.saves.length, 0);
  const loggedOut = service({ signedIn: false });
  await assert.rejects(loggedOut.saveFleetRecord('truck', null, {}), /sign in/);
});
test('file size limits and cleanup failure are visible; missing RPC does not claim success', async () => {
  const api = service({ rpcError: { code: 'PGRST202' }, cleanupError: new Error('denied') });
  assert.throws(() => api.validateComplianceFile({ type: 'application/pdf', size: 10485761 }), /10 MB/);
  await assert.rejects(api.saveFleetRecord('truck', null, {}, { documents: [{ file }] }), /cleanup|cleaned up/);
  await assert.rejects(service({ rpcError: { code: 'PGRST202' } }).saveFleetRecord('truck', null, {}), /setup is pending/);
});
