import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(options={}){
 const calls=[];const client={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'own'}}})},from(table){calls.push(['table',table]);const q={select:(...a)=>{calls.push(['select',...a]);return q;},eq:(...a)=>{calls.push(['eq',...a]);return q;},order:()=>q,range:(...a)=>{calls.push(['range',...a]);return q;},insert:value=>{calls.push(['insert',value]);return q;},update:value=>{calls.push(['update',value]);return q;},single:async()=>({data:options.noRow?null:{id:'row'},error:options.error}),then(resolve){resolve({data:[],error:options.error});}};return q;}};
 const scope=vm.createContext({supabase:client});vm.runInContext(fs.readFileSync(new URL('./reportScheduleService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.api=reportScheduleService(supabase);',scope);return{api:scope.api,calls};
}
test('schedule/history reads bind to owner and report type with ten-row history pages',async()=>{
 const {api,calls}=setup();await api.load('Overview',2);assert.equal(calls.filter(c=>c[0]==='eq'&&c[1]==='owner_id'&&c[2]==='own').length,2);assert.ok(calls.some(c=>c[0]==='range'&&c[1]===20&&c[2]===29));
});
test('schedule creation sends only allowed fields; invalid frequencies/time never write',async()=>{
 const {api,calls}=setup();for(const args of [['Overview','hourly','08:00'],['Overview','daily','25:00']])await assert.rejects(api.create(...args));assert.equal(calls.length,0);
 await api.create('Overview','weekly','08:00');const row=calls.find(c=>c[0]==='insert')[1];assert.deepEqual(Object.keys(row),['report_type','frequency','local_time']);
});
test('schedule toggle scopes owner, ID and expected current state and requires confirmed row',async()=>{
 const {api,calls}=setup();await api.toggle({id:'a',enabled:true});assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='enabled'&&c[2]===true));assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='owner_id'));
 await assert.rejects(setup({noRow:true}).api.toggle({id:'a',enabled:true}));
});
test('no session and provider errors never yield a saved/downloaded report',async()=>{
 const {api,calls}=setup({noUser:true});await assert.rejects(api.load('Overview'));await assert.rejects(api.read('a'));assert.equal(calls.length,0);
 await assert.rejects(setup({error:Error('Denied')}).api.load('Overview'));await assert.rejects(setup({error:Error('Denied')}).api.create('Overview','daily','08:00'));await assert.rejects(setup({noRow:true}).api.read('a'));
});
