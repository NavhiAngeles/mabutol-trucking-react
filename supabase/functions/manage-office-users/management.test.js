import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import { normalizeOfficePhone } from '../_shared/officePhone.js';

const { code } = await transformWithOxc(fs.readFileSync(new URL('./index.ts',import.meta.url),'utf8'),'index.ts');
async function invoke(options = {}) {
  const calls = { create: [], reset: [], cleanup: [], finalize: [], customerCleanup: [], listMfa: [], deleteMfa: [], activityLogs: [] }; let handler;
  let createdRole = options.initialRole || 'customer';
  const caller = { auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'caller', user_metadata: { role: 'admin' } } }, error: options.authError }) } };
  const admin = {
    from: table => {
      let id, update, deleting = false;
      const q = { select: () => q, update: payload => {update=payload;return q;}, delete: () => {deleting=true;return q;},
        insert: payload => { calls.activityLogs.push(payload); return Promise.resolve({ error: null }); },
        eq: (key,value) => {
          if(deleting){assert.equal(table,'customers');assert.equal(key,'user_id');assert.equal(value,'created');calls.customerCleanup.push(value);return Promise.resolve({error:options.customerCleanupError});}
          if(key==='id') id=value; else {assert.equal(key,'role');assert.equal(value,'customer');}return q;
        },
        single:async()=>{
          if(update){assert.equal(id,'created');calls.finalize.push({id,...update});if(options.finalizeError)return{error:Error('finalize denied')};createdRole=update.role;}
          return{data:id==='caller'?{role:options.role||'admin',is_active:options.active!==false}:id==='created'?{id,role:createdRole,is_active:true}:{id,email:'target@example.test',full_name:'Target Staff',role:options.targetRole||'staff',is_active:true},error:options.profileError};
        },
      };return q;
    },
    auth: { admin: {
      createUser: async payload => { calls.create.push(payload); return { data: { user: { id: 'created',phone:payload.phone } }, error: options.createError }; },
      getUserById: async id => ({data:{user:{id,phone:options.authPhone || null}},error:options.authPhoneError}),
      updateUserById: async (...args) => { calls.reset.push(args); return { data:{user:{id:args[0],phone:args[1].phone}},error: options.resetError }; },
      deleteUser: async id => { calls.cleanup.push(id); return { error: options.cleanupError }; },
      mfa: {
        listFactors: async ({ userId }) => {
          calls.listMfa.push(userId);
          if (options.mfaListError) return { error: options.mfaListError };
          return { data: { factors: options.mfaFactors !== undefined ? options.mfaFactors : [{ id: 'factor-1', friendly_name: 'Staff TOTP', factor_type: 'totp', status: 'verified' }] } };
        },
        deleteFactor: async ({ userId, id }) => {
          calls.deleteMfa.push({ userId, id });
          if (options.mfaDeleteError) return { error: options.mfaDeleteError };
          return { data: { id } };
        },
      },
    } },
  };
  const scope = vm.createContext({ Response, Request, normalizeOfficePhone, Deno: { env: { get: key => key }, serve: fn => { handler = fn; } }, createClient: (_, key, config) => config ? caller : admin });
  vm.runInContext(code.replace(/^import .*;$/gm,''),scope);
  const body = options.body || { action: 'create', fullName: 'Fixture Staff', email: 'fixture@example.test', phone:'09171234567', role: 'staff', password: ' fixture-password ' };
  const response = await handler(new Request('https://example.test',{method:options.method || 'POST',headers:options.noHeader ? {} : { Authorization:'Bearer fixture','Content-Type':'application/json' },body:['OPTIONS','GET'].includes(options.method) ? undefined : JSON.stringify(body)}));
  return { calls, response, body: response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null };
}
test('creates confirmed office user from trusted app metadata; preserves password bytes',async()=>{
  const {calls,response,body}=await invoke();assert.equal(response.status,200);assert.equal(body.userId,'created');
  assert.equal(calls.create[0].app_metadata.provisioned_role,'staff');assert.equal(calls.create[0].user_metadata.role,undefined);
  assert.equal(calls.create[0].password,' fixture-password ');assert.equal(calls.create[0].email_confirm,true);
  assert.equal(calls.create[0].phone,'+639171234567');assert.equal(calls.create[0].phone_confirm,true);
});
for(const options of [{role:'staff'},{role:'customer'},{active:false},{profileError:Error('denied')},{noUser:true},{noHeader:true}]){
  test('privileged endpoint fails closed '+JSON.stringify(options),async()=>{const {response,calls}=await invoke(options);assert.ok([401,403].includes(response.status));assert.equal(calls.create.length,0);assert.equal(calls.reset.length,0);});
}
test('rejects unknown roles, short passwords and unsupported actions',async()=>{
  for(const body of [{action:'delete',password:'a-long-password'},{action:'create',role:'Super Admin',email:'fixture@example.test',fullName:'Fixture',password:'a-long-password'},{action:'create',password:'short'}]){
    const {calls,response}=await invoke({body});assert.equal(response.status,400);assert.equal(calls.create.length,0);
  }
});
test('failed profile provisioning compensates new account; cleanup failure is explicit',async()=>{
  const result=await invoke({finalizeError:true});assert.equal(result.response.status,400);assert.deepEqual(result.calls.cleanup,['created']);assert.match(result.body.error,/office profile/);
  const failed=await invoke({finalizeError:true,cleanupError:Error('failed')});assert.equal(failed.response.status,500);assert.match(failed.body.error,/Do not retry/);
});

test('real Auth ordering starts with customer profile and finalizes only newly created office id',async()=>{
  const result=await invoke();assert.equal(result.response.status,200);assert.deepEqual(result.calls.finalize,[{id:'created',role:'staff'}]);
  assert.deepEqual(result.calls.customerCleanup,['created']);assert.equal(result.calls.cleanup.length,0);
});
test('already-correct profile is retained, unexpected roles and temporary-customer cleanup errors fail safely',async()=>{
  const correct=await invoke({initialRole:'staff'});assert.equal(correct.response.status,200);assert.equal(correct.calls.finalize.length,0);
  const unexpected=await invoke({initialRole:'driver'});assert.equal(unexpected.response.status,400);assert.equal(unexpected.calls.finalize.length,0);
  const failed=await invoke({customerCleanupError:Error('dependent records')});assert.equal(failed.response.status,400);assert.match(failed.body.error,/temporary customer cleanup/);assert.deepEqual(failed.calls.cleanup,['created']);
});
test('duplicate email/create error never claims success or deletes unrelated users',async()=>{
  const {response,calls}=await invoke({createError:Error('duplicate')});assert.equal(response.status,409);assert.equal(calls.cleanup.length,0);
});
test('password replacement targets only another office account; rejects self and nonoffice',async()=>{
  const body={action:'set_password',userId:'target',password:'a-long-password'};
  const ok=await invoke({body});assert.equal(ok.response.status,200);assert.equal(ok.calls.reset[0][0],'target');
  assert.equal((await invoke({body:{...body,userId:'caller'}})).response.status,400);
  assert.equal((await invoke({body,targetRole:'driver'})).response.status,404);
  assert.equal((await invoke({body,resetError:Error('weak')})).response.status,400);
});
test('CORS succeeds; non-POST methods cannot provision',async()=>{
  assert.equal((await invoke({method:'OPTIONS',noHeader:true})).response.status,200);
  assert.equal((await invoke({method:'GET'})).response.status,405);
});

test('new office users require a valid recovery phone without creating orphan accounts',async()=>{
  for(const phone of [undefined,'','123','+12025550123']){
    const {response,calls}=await invoke({body:{action:'create',fullName:'Fixture',email:'fixture@example.test',role:'staff',password:'fixture-password',phone}});
    assert.equal(response.status,400);assert.equal(calls.create.length,0);
  }
});
test('capability check requires active admin and never creates/resets an account',async()=>{
  const result=await invoke({body:{action:'capabilities'}});assert.equal(result.response.status,200);assert.equal(result.body.officePhoneEnrollment,true);
  assert.equal(result.calls.create.length,0);assert.equal(result.calls.reset.length,0);
  assert.equal((await invoke({role:'staff',body:{action:'capabilities'}})).response.status,403);
});
test('admin loads actual recovery phone separately from public contact field',async()=>{
  const result=await invoke({authPhone:'639171234567',body:{action:'get_recovery_phone',userId:'target'}});
  assert.equal(result.response.status,200);assert.equal(result.body.phone,'+639171234567');assert.equal(result.calls.reset.length,0);
  assert.equal((await invoke({role:'staff',body:{action:'get_recovery_phone',userId:'target'}})).response.status,403);
  assert.equal((await invoke({targetRole:'customer',body:{action:'get_recovery_phone',userId:'target'}})).response.status,404);
});
test('admin recovery enrollment allows own office account, normalizes phone and enforces expected value',async()=>{
  const body={action:'set_recovery_phone',userId:'caller',phone:'09171234567',expectedPhone:null};
  const result=await invoke({body});assert.equal(result.response.status,200);
  assert.equal(result.calls.reset[0][1].phone,'+639171234567');assert.equal(result.calls.reset[0][1].phone_confirm,true);
  const stale=await invoke({body,authPhone:'639181234567'});assert.equal(stale.response.status,409);assert.equal(stale.calls.reset.length,0);
  const duplicate=await invoke({body,resetError:Error('duplicate phone')});assert.equal(duplicate.response.status,409);assert.equal(duplicate.calls.cleanup.length,0);
  assert.equal((await invoke({body:{...body,phone:'bad'}})).response.status,400);
});

test('capability check reports mfaReset capability', async () => {
  const result = await invoke({ body: { action: 'capabilities' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.mfaReset, true);
});

test('admin can inspect enrolled MFA factors for another office user', async () => {
  const result = await invoke({ body: { action: 'get_mfa_factors', userId: 'target' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.userId, 'target');
  assert.equal(result.body.factors.length, 1);
  assert.equal(result.body.factors[0].friendlyName, 'Staff TOTP');

  // Fails closed for non-admin
  assert.equal((await invoke({ role: 'staff', body: { action: 'get_mfa_factors', userId: 'target' } })).response.status, 403);
  // Fails for non-office target
  assert.equal((await invoke({ targetRole: 'customer', body: { action: 'get_mfa_factors', userId: 'target' } })).response.status, 404);
  // Fails if target missing
  assert.equal((await invoke({ body: { action: 'get_mfa_factors' } })).response.status, 400);
});

test('admin resets TOTP MFA for another office user with reason and audit log', async () => {
  const body = { action: 'reset_mfa', userId: 'target', reason: 'Staff member lost their mobile device.' };
  const result = await invoke({ body });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.userId, 'target');
  assert.deepEqual(result.body.removedFactors, ['factor-1']);
  assert.equal(result.calls.deleteMfa.length, 1);
  assert.equal(result.calls.deleteMfa[0].userId, 'target');
  assert.equal(result.calls.deleteMfa[0].id, 'factor-1');

  // Audit log recorded
  assert.equal(result.calls.activityLogs.length, 1);
  assert.equal(result.calls.activityLogs[0].action, 'RESET_MFA');
  assert.equal(result.calls.activityLogs[0].entity_id, 'target');
  assert.equal(result.calls.activityLogs[0].details.reason, 'Staff member lost their mobile device.');
  assert.equal(result.calls.activityLogs[0].details.factors_count, 1);
});

test('admin cannot reset own MFA, requires valid reason and enrolled factors', async () => {
  // Self reset blocked
  assert.equal((await invoke({ body: { action: 'reset_mfa', userId: 'caller', reason: 'Lost my phone' } })).response.status, 400);

  // Missing or short reason blocked
  assert.equal((await invoke({ body: { action: 'reset_mfa', userId: 'target', reason: 'tiny' } })).response.status, 400);
  assert.equal((await invoke({ body: { action: 'reset_mfa', userId: 'target' } })).response.status, 400);

  // Target with zero enrolled factors blocked
  const zeroFactors = await invoke({ mfaFactors: [], body: { action: 'reset_mfa', userId: 'target', reason: 'Lost authenticator' } });
  assert.equal(zeroFactors.response.status, 400);
  assert.match(zeroFactors.body.error, /no enrolled authenticator factors/);
});
