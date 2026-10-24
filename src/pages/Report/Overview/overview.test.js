import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import { reportRange, summarizeOverview } from '../../../services/reportOverview.js';
const find=(node,p)=>!node||typeof node!=='object'?[]:[...(p(node)?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(c=>find(c,p))];
async function screen() {
 const {code}=await transformWithOxc(fs.readFileSync(new URL('./overview.jsx',import.meta.url),'utf8'),'overview.jsx',{jsx:{runtime:'classic'}});
 const states=[],refs=[],events={}; let i=0,r=0, exported;
 const rows={shipments:[{id:'a',created_at:'2026-10-24T00:00:00Z',status:'completed',final_amount:123},{id:'b',created_at:'2026-10-01T00:00:00Z',status:'pending'}],deliveries:[],drivers:[],compliance:[],resources:{},overdue:0};
 const scope=vm.createContext({React:{createElement:(type,props,...children)=>({type,props:props||{},children})},useState(initial){const index=i++;if(!(index in states))states[index]=initial;return[states[index],v=>states[index]=typeof v==='function'?v(states[index]):v];},useRef(v){return refs[r++]||={current:v};},useEffect(fn){fn();},document:{addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}},useLiveData:()=>({data:rows,refresh(){}}),getReportOverview(){},REPORT_TABLES:[],useReportRange:(key,custom)=>key==='custom'?custom:reportRange(key,null,null,Date.parse('2026-10-24T12:00:00+08:00')),reportRange,summarizeOverview,downloadReport:(...args)=>exported=args,ReportSchedule(){},MainLayout(){},OfficeTools(){},OperationsFeed(){},Link(){}});
 vm.runInContext(code.replace(/^import .*;$/gm,'').replace('export default function Overview','function Overview')+'\nthis.render=Overview;',scope);
 const render=()=>{i=r=0;return scope.render();};
 const click=label=>find(render(),n=>n.type==='button'&&n.children.includes(label))[0].props.onClick();
 return{render,click,events,exported:()=>exported,input:(id,value)=>find(render(),n=>n.props.id===id)[0].props.onChange({target:{value}}),apply:()=>find(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})};
}
test('Overview presets update active date pill and actual report cohort',async()=>{
 const ui=await screen(); ui.click('Today');assert.ok(JSON.stringify(ui.render()).includes('2026-10-24'));
 ui.click('Export CSV'); assert.equal(ui.exported()[2].total,1);
 ui.click('This Month'); ui.click('Export CSV'); assert.equal(ui.exported()[2].total,2);
 for(const label of ['This Week','Last 3 Months']){ui.click(label);assert.equal(find(ui.render(),n=>n.type==='button'&&n.children.includes(label))[0].props['aria-pressed'],true);}
});
test('Overview custom dates validate, apply and export exactly the selected cohort',async()=>{
 const ui=await screen();ui.click('Custom Range');ui.input('ov-start','2026-10-25');ui.input('ov-end','2026-10-01');ui.apply();assert.ok(JSON.stringify(ui.render()).includes('Choose a valid'));
 ui.input('ov-start','2026-10-01');ui.input('ov-end','2026-10-01');ui.apply();ui.click('Export CSV');assert.equal(ui.exported()[2].total,1);assert.equal(ui.exported()[1].end,'2026-10-01');
});
test('Overview custom popover closes on Escape',async()=>{
 const ui=await screen();ui.click('Custom Range');assert.equal(find(ui.render(),n=>n.type==='form').length,1);ui.events.keydown({key:'Escape'});assert.equal(find(ui.render(),n=>n.type==='form').length,0);
});
