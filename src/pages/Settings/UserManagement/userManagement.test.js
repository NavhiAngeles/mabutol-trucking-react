import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate} from 'node:timers';
import {transformWithOxc} from 'vite';
import {normalizeOfficePhone} from '../../../../supabase/functions/_shared/officePhone.js';
const validationScope=vm.createContext({supabase:{},normalizeOfficePhone});
vm.runInContext(fs.readFileSync(new URL('../../../services/userManagementService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.validate=validateOfficeCreation;',validationScope);
const row={id:'caller',full_name:'Fixture Admin',email:'fixture@example.test',phone:'',role:'admin',is_active:true,updated_at:'version'};
const find=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(child=>find(child,predicate))];
async function screen(api={}){
 const {code}=await transformWithOxc(fs.readFileSync(new URL('./userManagement.jsx',import.meta.url),'utf8'),'userManagement.jsx',{jsx:{runtime:'classic'}});
 const states=[],refs=[],effects=[];let si=0,ri=0;
 const scope=vm.createContext({React:{createElement:(type,props,...children)=>({type,props:props||{},children})},
  useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(value){return refs[ri++]||={current:value};},useEffect(fn){effects.push(fn);},
  validateOfficeCreation:validationScope.validate,
  userManagementApi:{load:async()=>({callerId:'caller',users:[row],provisioningReady:true}),...api},
 });
 vm.runInContext(code.replace(/^import .*;$/gm,'').replace(/export default function/g,'function')+'\nthis.Component=OfficeUsers;',scope);
 const render=()=>{si=ri=0;return scope.Component();};render();effects.slice(0,2).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
 return{render,button:label=>find(render(),n=>n.type==='button'&&n.children.includes(label))[0],submit:()=>find(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})};
}
test('uses real directory data; self activation/password and permanent delete are unavailable',async()=>{
 const ui=await screen();assert.ok(JSON.stringify(ui.render()).includes('Fixture Admin'));assert.equal(ui.button('Deactivate').props.disabled,true);assert.equal(ui.button('Set Password').props.disabled,true);assert.equal(ui.button('Delete unavailable').props.disabled,true);
});
test('self role/status controls are disabled but profile edits remain available',async()=>{
 const ui=await screen();ui.button('Edit / Role').props.onClick();const selects=find(ui.render(),n=>n.type==='select');assert.equal(selects.filter(n=>n.props.disabled).length,2);
});
test('mutation waits/deduplicates, failures preserve dialog and never claim saved',async()=>{
 let reject,calls=0;const pending=new Promise((_,no)=>{reject=no;});
 const ui=await screen({save:()=>{calls++;return pending;}});ui.button('Edit / Role').props.onClick();const work=ui.submit();await ui.submit();assert.equal(calls,1);assert.equal(find(ui.render(),n=>n.type==='fieldset')[0].props.disabled,true);
 reject(Error('Account changed'));await work;assert.ok(JSON.stringify(ui.render()).includes('Account changed'));assert.ok(!JSON.stringify(ui.render()).includes('Account updated.'));
});
test('create defaults to Staff; password mismatch prevents account provisioning',async()=>{
 let calls=0;const ui=await screen({create:async()=>{calls++;}});ui.button('Add Office User').props.onClick();
 const password=find(ui.render(),n=>n.type==='input'&&n.props.type==='password')[0];password.props.onChange({target:{value:'NewPassword123!'}});await ui.submit();assert.equal(calls,0);assert.ok(JSON.stringify(ui.render()).includes('Passwords do not match'));
 const roles=find(ui.render(),n=>n.type==='select'&&n.props.value==='staff');assert.equal(roles.length,1);
});
test('load failure offers retry without fake initial users',async()=>{
 const ui=await screen({load:async()=>{throw Error('Directory unavailable');}});assert.ok(ui.button('Retry loading'));assert.ok(!JSON.stringify(ui.render()).includes('Fixture Admin'));
});

test('new user form requires recovery mobile and distinguishes contact-only editing',async()=>{
 const ui=await screen();ui.button('Add Office User').props.onClick();
 const phone=find(ui.render(),n=>n.type==='input'&&n.props.type==='tel')[0];assert.equal(phone.props.required,true);
 assert.match(JSON.stringify(ui.render()),/Recovery Mobile Number/);
 ui.button('Close').props.onClick();ui.button('Edit / Role').props.onClick();
 assert.match(JSON.stringify(ui.render()),/Contact edits do not change/);
});
test('existing user recovery phone loads from Auth, not the profile contact, and saves expected value',async()=>{
 const calls=[];const ui=await screen({recoveryPhone:async(target,form)=>{calls.push(form);return '+639171234567';}});
 await ui.button('Recovery Phone').props.onClick();
 assert.match(JSON.stringify(ui.render()),/SMS Recovery Phone/);
 const input=find(ui.render(),n=>n.type==='input'&&n.props.type==='tel')[0];assert.equal(input.props.value,'+639171234567');
 await ui.submit();assert.equal(calls.length,2);assert.equal(calls[1].expectedPhone,'+639171234567');
 assert.match(JSON.stringify(ui.render()),/Recovery phone registered/);
});

test('unready backend clearly blocks Add Office User instead of allowing a failed creation attempt',async()=>{
 const ui=await screen({load:async()=>({callerId:'caller',users:[row],provisioningReady:false,provisioningError:'New office accounts cannot be created yet. Backend deployment required.'})});
 assert.equal(ui.button('Add Office User').props.disabled,true);assert.match(JSON.stringify(ui.render()),/Backend deployment required/);
});
test('short initial password produces an explicit not-created error; backend errors retain entered data',async()=>{
 let calls=0;const ui=await screen({create:async()=>{calls++;throw Error('Backend unavailable. Account was not created.');}});
 ui.button('Add Office User').props.onClick();
 const values=['Fixture Staff','fixture@example.test','09171234567','short','short'];
 for(let i=0;i<values.length;i++){const form=find(ui.render(),n=>n.type==='form')[0];find(form,n=>n.type==='input')[i].props.onChange({target:{value:values[i]}});}
 await ui.submit();assert.equal(calls,0);assert.match(JSON.stringify(ui.render()),/initial password must be between 12 and 128/);
 for(const i of [3,4]){find(find(ui.render(),n=>n.type==='form')[0],n=>n.type==='input')[i].props.onChange({target:{value:'fixture-password'}});}
 await ui.submit();assert.equal(calls,1);assert.match(JSON.stringify(ui.render()),/Account was not created/);
 assert.ok(!JSON.stringify(ui.render()).includes('Office account created with'));assert.ok(find(ui.render(),n=>n.type==='input'&&n.props.value==='fixture@example.test').length);
});
