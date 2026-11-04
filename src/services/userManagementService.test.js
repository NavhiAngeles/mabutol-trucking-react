import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';
function setup(options={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'caller'}}})},
    from(table){assert.equal(table,'users');let id;const q={select:()=>q,eq:(_,value)=>{id=value;return q;},
      single:async()=>({data:id==='new'?(options.savedRow||{id:'new',email:'fixture@example.test',role:'staff',is_active:true}):{role:options.role||'admin',is_active:options.active!==false},error:id==='new'?options.savedReadError:options.profileError}),
      in:(...args)=>{calls.push(['roles',...args]);return q;},order:()=>q,
      range:async(start,end)=>{calls.push(['range',start,end]);return{data:(options.rows||[]).slice(start,end+1),error:options.loadError};},
    };return q;},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:options.noConfirmation?null:args.p_id,error:options.saveError};},
    functions:{invoke:async(name,args)=>{calls.push(['invoke',name,args]);return{data:options.noConfirmation?null:args.body.action==='capabilities'?{officePhoneEnrollment:!options.legacyBackend}:options.functionData||{userId:'new',recoveryPhone:args.body.phone},error:options.functionError};}},
  };
  const scope=vm.createContext({supabase:client,normalizeOfficePhone});
  vm.runInContext(fs.readFileSync(new URL('./userManagementService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.api=userManagementService(supabase);',scope);
  return{api:scope.api,calls};
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
