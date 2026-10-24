import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(options={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'caller'}}})},
    from(table){assert.equal(table,'users');const q={select:()=>q,eq:()=>q,
      single:async()=>({data:{role:options.role||'admin',is_active:options.active!==false},error:options.profileError}),
      in:(...args)=>{calls.push(['roles',...args]);return q;},order:()=>q,
      range:async(start,end)=>{calls.push(['range',start,end]);return{data:(options.rows||[]).slice(start,end+1),error:options.loadError};},
    };return q;},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:options.noConfirmation?null:args.p_id,error:options.saveError};},
    functions:{invoke:async(name,args)=>{calls.push(['invoke',name,args]);return{data:options.noConfirmation?null:{userId:'new'},error:options.functionError};}},
  };
  const scope=vm.createContext({supabase:client});
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
  const {api,calls}=setup();await api.create({fullName:'Fixture',email:'fixture@example.test',role:'staff',password:' password bytes ',confirm:'ignored',permissions:['fake']});
  const call=calls.find(c=>c[0]==='invoke');assert.equal(call[1],'manage-office-users');assert.equal(call[2].body.action,'create');assert.equal(call[2].body.password,' password bytes ');assert.equal(call[2].body.permissions,undefined);
});
test('function-specific failures and missing confirmation never report success',async()=>{
  const api=setup({functionError:{context:{json:async()=>({error:'Admin required'})}}}).api;
  await assert.rejects(api.create({password:'a-long-password'}),/Admin required/);
  await assert.rejects(setup({noConfirmation:true}).api.setPassword({userId:'target',password:'a-long-password'}),/not confirmed/);
});
