import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reportRange } from '../services/reportOverview.js';
test('report preset clock advances on timer/focus and custom range remains fixed',()=>{
 let now=Date.parse('2026-10-24T23:59:59+08:00'),state, timer, focus;
 const scope=vm.createContext({Date:{now:()=>now},reportRange,useState(initial){state??=initial();return[state,v=>state=v];},useEffect(fn){fn();},setInterval(fn){timer=fn;return 1;},clearInterval(){},window:{addEventListener(name,fn){focus=fn;},removeEventListener(){}}});
 vm.runInContext(fs.readFileSync(new URL('./useReportRange.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.range=useReportRange;',scope);
 assert.equal(scope.range('today').end,'2026-10-24');now+=2000;timer();assert.equal(scope.range('today').end,'2026-10-25');now+=86400000;focus();assert.equal(scope.range('today').end,'2026-10-26');
 const custom={start:'2024-01-01',end:'2024-01-02'};assert.equal(scope.range('custom',custom),custom);
});
