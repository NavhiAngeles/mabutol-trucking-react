import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
import { THRESHOLD_FIELDS, DEFAULT_THRESHOLDS, validateThresholds } from '../../../services/complianceThresholds.js';

const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
async function screen(api = {}, role = 'admin') {
  const source=fs.readFileSync(new URL('./complianceThreshold.jsx',import.meta.url),'utf8');
  const {code}=await transformWithOxc(source,'complianceThreshold.jsx',{jsx:{runtime:'classic'}});
  const states=[],refs=[],effects=[];let si=0,ri=0;
  const scope=vm.createContext({
    React:{createElement:(type,props,...children)=>({type,props:props||{},children})},
    useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
    useRef(value){return refs[ri++]||={current:value};}, useEffect(fn){effects.push(fn);},
    complianceThresholdApi:{load:async()=>({thresholds:null,legacyDays:30,updatedAt:null}),...api},
    THRESHOLD_FIELDS,DEFAULT_THRESHOLDS,validateThresholds,
  });
  vm.runInContext(code.replace(/^import .*;$/gm,'').replace(/export default function/g,'function')+'\nthis.Component=ThresholdForm;',scope);
  const render=()=>{si=ri=0;return scope.Component({role});};render();effects.slice(0,2).forEach(fn=>fn());
  await new Promise(resolve=>setImmediate(resolve));
  return{render,submit:()=>find(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})};
}
test('initial suggested thresholds are labelled unapplied; staff controls remain read-only',async()=>{
  const ui=await screen({},'staff');assert.ok(JSON.stringify(ui.render()).includes('suggested settings'));
  assert.equal(find(ui.render(),n=>n.type==='fieldset')[0].props.disabled,true);
  assert.equal(find(ui.render(),n=>n.type==='input').length,16);
});
test('invalid rule prevents submission and preserves edits',async()=>{
  let calls=0;const ui=await screen({save:()=>{calls++;}});
  find(ui.render(),n=>n.props.id==='drivers_license-first')[0].props.onChange({target:{value:'10'}});
  await ui.submit();assert.equal(calls,0);assert.ok(JSON.stringify(ui.render()).includes('First Alert greater'));
});
test('save waits/deduplicates and only confirms after backend response',async()=>{
  let resolve,calls=0;const pending=new Promise(yes=>{resolve=yes;});
  const ui=await screen({save:()=>{calls++;return pending;}});
  const work=ui.submit();await ui.submit();assert.equal(calls,1);
  assert.equal(find(ui.render(),n=>n.type==='fieldset')[0].props.disabled,true);
  assert.ok(!JSON.stringify(ui.render()).includes('Compliance thresholds saved.'));
  resolve({thresholds:DEFAULT_THRESHOLDS,legacyDays:30,updatedAt:'new'});await work;
  assert.ok(JSON.stringify(ui.render()).includes('Compliance thresholds saved.'));
  assert.ok(!JSON.stringify(ui.render()).includes('suggested settings'));
});
test('save failure keeps values and exposes error/reload; load failure offers retry',async()=>{
  const ui=await screen({save:async()=>{throw Error('Conflict: reload');}});await ui.submit();
  assert.ok(JSON.stringify(ui.render()).includes('Conflict: reload'));
  assert.equal(find(ui.render(),n=>n.props.id==='drivers_license-first')[0].props.value,60);
  const failed=await screen({load:async()=>{throw Error('Unavailable');}});
  assert.ok(find(failed.render(),n=>n.type==='button'&&n.children.includes('Retry loading')).length);
});
