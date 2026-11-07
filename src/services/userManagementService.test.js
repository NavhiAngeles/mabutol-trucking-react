import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';
function setup(options={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'caller'}}})},
    from(table){
      if(table==='activity_logs'){
        const q={select:()=>q,order:()=>q,limit:async(limit)=>{calls.push(['activity_logs_limit',limit]);return{data:options.activityLogs||[],error:options.activityLogsError};}};
        return q;
      }
      assert.equal(table,'users');let id;const q={select:()=>q,eq:(_,value)=>{id=value;return q;},
      single:async()=>({data:id==='new'?(options.savedRow||{id:'new',email:'fixture@example.test',role:'staff',is_active:true}):{role:options.role||'admin',is_active:options.active!==false},error:id==='new'?options.savedReadError:options.profileError}),
      in:(...args)=>{calls.push(['roles',...args]);if(args[0]==='id'){return{data:options.actorUsers||[{id:'caller',full_name:'Admin User',email:'admin@example.test',role:'admin'}],error:null};}return q;},order:()=>q,
      range:async(start,end)=>{calls.push(['range',start,end]);return{data:(options.rows||[]).slice(start,end+1),error:options.loadError};},
    };return q;},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:options.noConfirmation?null:args.p_id,error:options.saveError};},
    functions:{invoke:async(name,args)=>{calls.push(['invoke',name,args]);return{data:options.noConfirmation?null:args.body.action==='capabilities'?{officePhoneEnrollment:!options.legacyBackend}:options.functionData||{userId:'new',recoveryPhone:args.body.phone},error:options.functionError};}},
  };
  const scope=vm.createContext({supabase:client,normalizeOfficePhone});
  vm.runInContext(fs.readFileSync(new URL('./userManagementService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.api=userManagementService(supabase);this.redactMetadata=redactMetadata;this.formatAuditTimestamp=formatAuditTimestamp;',scope);
  return{api:scope.api,calls,redactMetadata:scope.redactMetadata,formatAuditTimestamp:scope.formatAuditTimestamp};
}
test('office directory paginates beyond500, filters roles, preserves own authenticated caller',async()=>{
  const {api,calls}=setup({rows:Array.from({length:501},(_,i)=>({id:String(i)}))});const result=await api.load();
  assert.equal(result.users.length,501);assert.equal(result.callerId,'caller');assert.equal(calls.filter(c=>c[0]==='range').length,2);
  assert.equal(JSON.stringify(calls.find(c=>c[0]==='roles')[2]),JSON.stringify(['admin','staff']));
});
test('missing auth, staff, inactive and failing profile cannot load or mutate',async()=>{
  for(const options of [{noUser:true},{role:'staff'},{active:false},{profileError:Error('offline')}]){
    const {api,calls}=setup(options);await assert.rejects(api.load());await assert.rejects(api.create({password:'a-long-password'}));
    assert.equal(calls.some(c=>['invoke','rpc'].includes(c[0])),false);
  }
});
test('profile/role/status write whitelists RPC fields with optimistic version',async()=>{
  const {api,calls}=setup();await api.save({id:'target',updated_at:'version'},{fullName:' Fixture ',phone:'123',role:'staff',active:false,email:'ignored',permissions:['fake']});
  const args=calls.find(c=>c[0]==='rpc')[2];assert.equal(args.p_full_name,'Fixture');assert.equal(args.p_expected,'version');assert.equal(args.p_is_active,false);assert.equal(args.email,undefined);assert.equal(args.permissions,undefined);
  await assert.rejects(setup({noConfirmation:true}).api.save({id:'target'},{fullName:'Fixture',role:'staff',active:true}),/not confirmed/);
});
test('provisioning uses dedicated function and explicit fields, never client signup or broad role metadata',async()=>{
  const {api,calls}=setup();await api.create({fullName:'Fixture',email:'fixture@example.test',phone:'09171234567',role:'staff',password:' password bytes ',confirm:'ignored',permissions:['fake']});
  const call=calls.find(c=>c[0]==='invoke');assert.equal(call[1],'manage-office-users');assert.equal(call[2].body.action,'create');assert.equal(call[2].body.password,' password bytes ');assert.equal(call[2].body.permissions,undefined);
});
test('function-specific failures and missing confirmation never report success',async()=>{
  const api=setup({functionError:{context:{json:async()=>({error:'Admin required'})}}}).api;
  await assert.rejects(api.create({fullName:'Fixture',email:'fixture@example.test',role:'staff',password:'a-long-password',phone:'09171234567'}),/Admin required/);
  await assert.rejects(setup({noConfirmation:true}).api.setPassword({userId:'target',password:'a-long-password'}),/not confirmed/);
});

test('create requires normalized phone and server-confirmed enrollment, including old-function mismatch',async()=>{
  await assert.rejects(setup().api.create({fullName:'Fixture',email:'fixture@example.test',role:'staff',password:'a-long-password',phone:'bad'}),/Philippine/);
  await assert.rejects(setup({functionData:{userId:'new'}}).api.create({fullName:'Fixture',email:'fixture@example.test',role:'staff',password:'a-long-password',phone:'09171234567'}),/did not confirm SMS/);
});

test('unavailable legacy provisioning keeps directory readable but explicitly disables creation readiness',async()=>{
  const result=await setup({legacyBackend:true}).api.load();assert.equal(result.provisioningReady,false);assert.match(result.provisioningError,/cannot be created/);
  assert.equal((await setup().api.load()).provisioningReady,true);
});
test('missing or mismatched saved profile never becomes a successful account creation',async()=>{
  const form={fullName:'Fixture',email:'fixture@example.test',role:'staff',phone:'09171234567',password:'fixture-password'};
  for(const options of [{savedReadError:Error('offline')},{savedRow:{id:'new',email:'fixture@example.test',role:'customer',is_active:true}},{savedRow:{id:'new',email:'wrong@example.test',role:'staff',is_active:true}}]){
    await assert.rejects(setup(options).api.create(form),/saved office account could not be verified/);
  }
});
test('recovery enrollment uses admin endpoint and expected Auth number, not public contact RPC',async()=>{
  const {api,calls}=setup({functionData:{userId:'target',phone:'+639171234567'}});
  assert.equal(await api.recoveryPhone({id:'target'}),'+639171234567');
  await api.recoveryPhone({id:'target'},{recoveryPhone:'09171234567',expectedPhone:null});
  const requests=calls.filter(c=>c[0]==='invoke').map(c=>c[2].body);
  assert.equal(requests[0].action,'get_recovery_phone');assert.equal(requests[1].action,'set_recovery_phone');assert.equal(requests[1].expectedPhone,null);
  assert.equal(requests[1].phone,'+639171234567');assert.ok(!calls.some(c=>c[0]==='rpc'));
  await assert.rejects(setup({role:'staff'}).api.recoveryPhone({id:'target'}),/administrators/);
});

test('redactMetadata neutralizes passwords, tokens, auth headers and private payloads recursively', () => {
  const { redactMetadata } = setup();
  assert.equal(redactMetadata(null), null);
  assert.equal(redactMetadata(undefined), null);
  assert.equal(redactMetadata('normal text'), 'normal text');
  assert.equal(redactMetadata('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token'), '[REDACTED]');

  const sensitive = {
    user: 'Juan',
    password: 'plain_password',
    initial_password: 'secret_initial',
    newPassword: 'new_secret_password',
    confirm_password: 'confirm_secret',
    token: 'jwt_token_value',
    access_token: 'access_token_value',
    refresh_token: 'refresh_token_value',
    apiKey: 'sk-1234567890',
    secret: 'api_secret_key',
    sms_code: '123456',
    pin: 4321,
    nested: {
      passwordHash: '$2b$10$abcdefghij',
      bearer: 'Bearer secret_auth_string',
      safeNumber: 42,
      safeRole: 'staff',
    },
    rawJson: JSON.stringify({ password: 'in_string_json', target: 'users' }),
  };

  const cleaned = redactMetadata(sensitive);
  assert.equal(cleaned.user, 'Juan');
  assert.equal(cleaned.password, '[REDACTED]');
  assert.equal(cleaned.initial_password, '[REDACTED]');
  assert.equal(cleaned.newPassword, '[REDACTED]');
  assert.equal(cleaned.confirm_password, '[REDACTED]');
  assert.equal(cleaned.token, '[REDACTED]');
  assert.equal(cleaned.access_token, '[REDACTED]');
  assert.equal(cleaned.refresh_token, '[REDACTED]');
  assert.equal(cleaned.apiKey, '[REDACTED]');
  assert.equal(cleaned.secret, '[REDACTED]');
  assert.equal(cleaned.sms_code, '[REDACTED]');
  assert.equal(cleaned.pin, '[REDACTED]');
  assert.equal(cleaned.nested.passwordHash, '[REDACTED]');
  assert.equal(cleaned.nested.bearer, '[REDACTED]');
  assert.equal(cleaned.nested.safeNumber, 42);
  assert.equal(cleaned.nested.safeRole, 'staff');
  assert.equal(cleaned.rawJson.password, '[REDACTED]');
  assert.equal(cleaned.rawJson.target, 'users');
});

test('formatAuditTimestamp formats dates in Philippine timezone (Asia/Manila)', () => {
  const { formatAuditTimestamp } = setup();
  assert.equal(formatAuditTimestamp(null), 'Unavailable');
  assert.equal(formatAuditTimestamp('invalid-date'), 'Invalid date');
  const formatted = formatAuditTimestamp('2026-10-24T12:00:00Z');
  // 12:00 UTC is 20:00 (8:00 PM) in Philippine time (+08:00)
  assert.match(formatted, /2026/);
  assert.match(formatted, /8:00/);
  assert.match(formatted, /PM/i);
});

test('auditLogs requires active admin and enriches actor and redacted metadata', async () => {
  const stamp = '2026-10-24T12:00:00Z';
  const logs = [
    { id: 101, action: 'SET_PASSWORD', entity_type: 'users', entity_id: 'target-1', user_id: 'caller', created_at: stamp, details: { password: 'secret_pass_123', target: 'u1' } },
    { id: 102, action: 'DELETE', entity_type: 'shipments', entity_id: 'ship-99', user_id: null, created_at: stamp, details: null },
  ];
  const { api, calls } = setup({ activityLogs: logs });
  const result = await api.auditLogs();

  assert.equal(result.length, 2);
  assert.equal(result[0].id, '101');
  assert.equal(result[0].action, 'SET_PASSWORD');
  assert.equal(result[0].target, 'users #target-1');
  assert.equal(result[0].actor.name, 'Admin User');
  assert.equal(result[0].details.password, '[REDACTED]');
  assert.equal(result[0].details.target, 'u1');
  assert.match(result[0].philippineTime, /8:00/);

  assert.equal(result[1].id, '102');
  assert.equal(result[1].actor.name, 'System');
  assert.equal(result[1].target, 'shipments #ship-99');
  assert.equal(result[1].details, null);

  assert.ok(calls.some(c => c[0] === 'activity_logs_limit' && c[1] === 500));
});

test('auditLogs denies staff, inactive caller, and handles query failure', async () => {
  await assert.rejects(setup({ role: 'staff' }).api.auditLogs(), /administrators/);
  await assert.rejects(setup({ active: false }).api.auditLogs(), /administrators/);
  await assert.rejects(setup({ activityLogsError: Error('DB connection failed') }).api.auditLogs(), /DB connection failed/);
});
