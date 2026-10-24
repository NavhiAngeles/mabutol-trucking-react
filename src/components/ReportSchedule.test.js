import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
const find=(node,p)=>!node||typeof node!=='object'?[]:[...(p(node)?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(c=>find(c,p))];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function panel(api={}) {
 const {code}=await transformWithOxc(fs.readFileSync(new URL('./ReportSchedule.jsx',import.meta.url),'utf8'),'ReportSchedule.jsx',{jsx:{runtime:'classic'}});
 const states=[],refs=[];let i=0,r=0,effect,download;
 const scope=vm.createContext({React:{createElement:(type,props,...children)=>({type,props:props||{},children})},useState(initial){const index=i++;if(!(index in states))states[index]=initial;return[states[index],v=>states[index]=typeof v==='function'?v(states[index]):v];},useRef(v){return refs[r++]||={current:v};},useEffect(fn){effect=fn;},reportSchedules:{load:async()=>({schedules:[],reports:[]}),...api},snapshotReport:s=>s.model,downloadReport:(...args)=>download=args});
 vm.runInContext(code.replace(/^import .*;$/gm,'').replace(/export default function/g,'function')+'\nthis.component=SchedulePanel;',scope);
 const render=()=>{i=r=0;return scope.component({type:'Overview'});};
 const click=label=>find(render(),n=>n.type==='button'&&n.children.includes(label))[0].props.onClick();
 click('Schedule Report');render();effect();await tick();
 return{render,click,submit:()=>find(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}}),download:()=>download};
}
test('schedule setup displays period semantics, only confirms after save, and deduplicates',async()=>{
 let calls=0,resolve;
 const ui=await panel({create:()=>{calls++;return new Promise(yes=>resolve=yes);}});
 assert.ok(JSON.stringify(ui.render()).includes('previous calendar month'));
 ui.submit();ui.submit();assert.equal(calls,1);assert.ok(!JSON.stringify(ui.render()).includes('Schedule saved.'));
 resolve();await tick();assert.ok(JSON.stringify(ui.render()).includes('Schedule saved.'));
});
test('failed schedule save leaves form retryable and no success',async()=>{
 const ui=await panel({create:async()=>{throw Error('Save denied');}});ui.submit();await tick();assert.ok(JSON.stringify(ui.render()).includes('Save denied'));assert.equal(find(ui.render(),n=>n.type==='fieldset')[0].props.disabled,false);
});
test('saved history download reads the selected immutable snapshot and frozen period',async()=>{
 const ui=await panel({load:async()=>({schedules:[],reports:[{id:'saved',status:'ready',period_start:'2026-01-01',period_end:'2026-01-31',generated_at:'2026-02-01'}]}),read:async id=>{assert.equal(id,'saved');return{period_start:'2026-01-01',period_end:'2026-01-31',generated_at:'2026-02-01',model:{total:5}};}});
 ui.click('Download CSV');await tick();assert.equal(ui.download()[1].start,'2026-01-01');assert.equal(ui.download()[2].total,5);
});
test('failed generated reports cannot download',async()=>{
 const ui=await panel({load:async()=>({schedules:[],reports:[{id:'a',status:'failed',error_message:'Generation failed'}]})});assert.equal(find(ui.render(),n=>n.type==='button'&&n.children.includes('Download CSV'))[0].props.disabled,true);assert.ok(JSON.stringify(ui.render()).includes('Generation failed'));
});
