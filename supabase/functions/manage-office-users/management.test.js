import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

const { code } = await transformWithOxc(fs.readFileSync(new URL('./index.ts',import.meta.url),'utf8'),'index.ts');
async function invoke(options = {}) {
  const calls = { create: [], reset: [], cleanup: [] }; let handler;
  const caller = { auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'caller', user_metadata: { role: 'admin' } } }, error: options.authError }) } };
  const admin = {
    from: () => { let id; const q = { select: () => q, eq: (_, value) => { id = value; return q; }, single: async () => ({
      data: id === 'caller' ? { role: options.role || 'admin', is_active: options.active !== false } : id === 'created' ? { id, role: options.profileMismatch ? 'customer' : 'staff', is_active: true } : { role: options.targetRole || 'staff', is_active: true },
      error: options.profileError,
    }) }; return q; },
    auth: { admin: {
      createUser: async payload => { calls.create.push(payload); return { data: { user: { id: 'created' } }, error: options.createError }; },
      updateUserById: async (...args) => { calls.reset.push(args); return { error: options.resetError }; },
      deleteUser: async id => { calls.cleanup.push(id); return { error: options.cleanupError }; },
    } },
  };
  const scope = vm.createContext({ Response, Request, Deno: { env: { get: key => key }, serve: fn => { handler = fn; } }, createClient: (_, key, config) => config ? caller : admin });
  vm.runInContext(code.replace(/^import .*;$/gm,''),scope);
  const body = options.body || { action: 'create', fullName: 'Fixture Staff', email: 'fixture@example.test', role: 'staff', password: ' fixture-password ' };
  const response = await handler(new Request('https://example.test',{method:options.method || 'POST',headers:options.noHeader ? {} : { Authorization:'Bearer fixture','Content-Type':'application/json' },body:['OPTIONS','GET'].includes(options.method) ? undefined : JSON.stringify(body)}));
  return { calls, response, body: response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null };
}
test('creates confirmed office user from trusted app metadata; preserves password bytes',async()=>{
  const {calls,response,body}=await invoke();assert.equal(response.status,200);assert.equal(body.userId,'created');
  assert.equal(calls.create[0].app_metadata.provisioned_role,'staff');assert.equal(calls.create[0].user_metadata.role,undefined);
  assert.equal(calls.create[0].password,' fixture-password ');assert.equal(calls.create[0].email_confirm,true);
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
  const result=await invoke({profileMismatch:true});assert.equal(result.response.status,400);assert.deepEqual(result.calls.cleanup,['created']);
  const failed=await invoke({profileMismatch:true,cleanupError:Error('failed')});assert.equal(failed.response.status,500);assert.match(failed.body.error,/Do not retry/);
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
