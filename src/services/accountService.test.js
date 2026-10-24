import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
  const calls = [];
  const user = { id: 'own', email: 'fixture@example.test' };
  const row = { id: 'own', full_name: 'Fixture', role: 'staff', updated_at: 'version' };
  const storage = {
    upload: async (...args) => { calls.push(['upload', ...args]); return { error: options.uploadError }; },
    remove: async paths => { calls.push(['remove', paths]); return {}; },
    createSignedUrl: async path => { calls.push(['sign', path]); return { data: { signedUrl: 'signed-photo' }, error: options.photoError }; },
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.noUser ? null : user } }),
      updateUser: async payload => { calls.push(['password', payload]); return { error: options.passwordError }; },
      signOut: async payload => { calls.push(['revoke', payload]); return { error: options.revokeError }; },
    },
    storage: { from: bucket => { assert.equal(bucket, 'account-avatars'); return storage; } },
    from: table => {
      assert.equal(table, 'users');
      const query = {
        update: payload => { calls.push(['update', payload]); return query; },
        select: () => query,
        eq: (...args) => { calls.push(['eq', ...args]); return query; },
        single: async () => ({ data: options.noRow ? null : { ...row, avatar_url: options.path }, error: options.saveError }),
      };
      return query;
    },
  };
  const verifier = { auth: {
    signInWithPassword: async payload => { calls.push(['verify', payload]); return { data: { user }, error: options.verifyError }; },
    signOut: async payload => { calls.push(['cleanupVerifier', payload]); return {}; },
  } };
  const context = vm.createContext({ supabase: client, crypto: { randomUUID: () => 'unique' } });
  const source = fs.readFileSync(new URL('./accountService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.factory=accountService;', context);
  return { api: context.factory(client, () => verifier), calls };
}
const form = { fullName: '  Real Name  ', contact: '  123  ', role: 'admin', email: 'attacker@example.test' };
const photo = { type: 'image/png', size: 12 };

test('loads authenticated identity, authoritative role and own signed photo', async () => {
  const { api, calls } = setup({ path: 'own/photo.png' });
  const result = await api.load();
  assert.equal(result.role, 'staff'); assert.equal(result.email, 'fixture@example.test'); assert.equal(result.photo, 'signed-photo');
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'own'));
});
test('does not sign foreign or legacy external avatar URLs', async () => {
  for (const path of ['other/photo.png', 'https://example.test/photo']) {
    const { api, calls } = setup({ path }); assert.equal((await api.load()).photo, null);
    assert.equal(calls.some(call => call[0] === 'sign'), false);
  }
});
test('profile write whitelists fields and checks identity plus optimistic version', async () => {
  const { api, calls } = setup(); await api.save(form, null, 'version');
  assert.equal(JSON.stringify(calls.find(call => call[0] === 'update')[1]), JSON.stringify({ full_name: 'Real Name', phone: '123' }));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === 'version'));
});
test('invalid file fails before any upload or profile write', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.save(form, { type: 'image/svg+xml', size: 10 }), /JPG or PNG/);
  await assert.rejects(api.save(form, { type: 'image/png', size: 2097153 }), /2MB/);
  assert.equal(calls.length, 0);
});
test('upload denial prevents profile write', async () => {
  const { api, calls } = setup({ uploadError: Error('denied') });
  await assert.rejects(api.save(form, photo), /upload failed/);
  assert.equal(calls.some(call => call[0] === 'update'), false);
});
test('failed or zero-row save cleans newly staged photo and never returns success', async () => {
  const { api, calls } = setup({ noRow: true });
  await assert.rejects(api.save(form, photo, 'old-version'), /not saved/);
  assert.equal(calls.find(call => call[0] === 'upload')[1], 'own/unique.png');
  assert.equal(calls.find(call => call[0] === 'remove')[1][0], 'own/unique.png');
});
test('photo read failure after commit still returns confirmed saved row', async () => {
  const { api } = setup({ path: 'own/photo.png', photoError: Error('offline') });
  assert.equal((await api.save(form)).id, 'own');
});
test('wrong current password prevents password update and cleans isolated verifier', async () => {
  const { api, calls } = setup({ verifyError: Error('invalid') });
  await assert.rejects(api.changePassword(' wrong ', 'NewPassword123!'), /could not be verified/);
  assert.equal(calls.some(call => call[0] === 'password'), false);
  assert.equal(calls.find(call => call[0] === 'cleanupVerifier')[1].scope, 'local');
});
test('password bytes preserved; update waits for verification and propagates rejection', async () => {
  const { api, calls } = setup(); await api.changePassword(' old password ', ' New password ');
  assert.equal(calls.find(call => call[0] === 'verify')[1].password, ' old password ');
  assert.equal(calls.find(call => call[0] === 'password')[1].password, ' New password ');
  const failed = setup({ passwordError: Error('reauthentication required') });
  await assert.rejects(failed.api.changePassword('old', 'NewPassword123!'), /reauthentication required/);
});
test('revocation uses others scope and propagates failure; missing auth fails closed', async () => {
  const { api, calls } = setup(); await api.revokeOthers();
  assert.equal(calls.find(call => call[0] === 'revoke')[1].scope, 'others');
  await assert.rejects(setup({ revokeError: Error('offline') }).api.revokeOthers(), /Unable to sign out/);
  await assert.rejects(setup({ noUser: true }).api.save(form), /sign in again/);
});
