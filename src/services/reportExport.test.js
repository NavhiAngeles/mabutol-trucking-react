import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCsv } from './reportExport.js';
import { buildShipmentReport } from './shipmentReport.js';
import { buildDriverReport } from './driverReport.js';
import { buildRevenueReport } from './revenueReport.js';
import { summarizeOverview } from './reportOverview.js';
const range = { start: '2026-10-01', end: '2026-10-24' };
test('report CSV includes selected dates, complete model, filters and unknown values', () => {
 const csv = reportCsv('Drivers', range, { total: 12, rows: Array.from({length:12}, (_,i)=>({name:'Driver '+i, rate:i?90:null})) }, {search:'Driver',status:'available'});
 assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('2026-10-24')); assert.ok(csv.includes('Driver 11')); assert.ok(csv.includes('Unavailable')); assert.ok(csv.includes('available'));
});
test('CSV quotes delimiters/newlines, neutralizes formulas, preserves numeric negatives and nested identity', () => {
 const csv = reportCsv('Fixture', range, {rows:[{name:'=HYPERLINK("bad")',amount:-10,notes:'comma,quote"\nline',incidents:[{category:'A'}]},{name:'  +SUM(1,2)'}]});
 assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'  +SUM")); assert.ok(csv.includes('"-10"')); assert.ok(csv.includes('comma,quote""\nline')); assert.ok(csv.includes('"1.1","incidents.category","A"'));
});

// Independent CSV reader verifies quoting and rectangular row widths, including embedded newlines.
function parse(csv) {
 const rows=[];let row=[],cell='',quoted=false;
 const text=csv.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\r'&&!quoted&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
  else cell+=c;
 }
 assert.equal(quoted,false);return rows;
}

test('Overview exports readable metrics/units, explicit bucket boundaries and correct zero vs unknown values',()=>{
 const model={total:1,completed:0,delayed:0,onTime:null,timed:0,revenue:0,missingAmounts:0,
  buckets:[{date:'2026-10-01',completed:0,delayed:0,revenue:0},{date:'2026-10-03',completed:0,delayed:0,revenue:0}],
  compliance:{verified:0,expiring:0,attention:28,pending:0},complianceTotal:28,fleet:{total:23,available:22,inUse:1,maintenance:0,other:0},overdueServiceRecords:0};
 const csv=reportCsv('Overview',range,model),rows=parse(csv);
 assert.equal(new Set(rows.map(row=>row.length)).size,1);
 assert.deepEqual(rows.find(row=>row[0]==='Completed charges').slice(0,3),['Completed charges','0.00','PHP']);
 assert.equal(rows.find(row=>row[0]==='On-time rate')[1],'Unavailable');
 assert.equal(rows.find(row=>row[0]==='Current compliance rate')[1],'0.0%');
 assert.equal(rows.find(row=>row[0]==='2026-10-01')[1],'2026-10-02');
 assert.equal(rows.find(row=>row[0]==='2026-10-03')[1],range.end);
 assert.ok(!csv.includes('"buckets"'));assert.ok(!csv.includes('"Section","Record","Field","Value"'));
 assert.ok(rows.find(row=>row[0]==='Generated at (Philippine time)')[1].endsWith('+08:00'));
});

test('all four real report models have tables and exports retain all filtered rows without raw/internal fields',()=>{
 const shipments=Array.from({length:25},(_,i)=>({id:'s'+i,tracking_number:'SHIP-'+i,status:'completed',created_at:'2026-10-10T00:00:00Z',estimated_arrival:'2026-10-11T00:00:00Z',actual_delivery_at:'2026-10-11T00:00:00Z',final_amount:12.34,customer:{name:i?'Customer':'=SUM(1,2)'},driver_notes:'DO NOT EXPORT RAW NOTES'}));
 const data={shipments,deliveries:[],drivers:[],incidents:[],customers:[],payments:[],expenses:[],maintenance:[],fuel:[],compliance:[]};
 for(const [title,model,heading]of [
  ['Overview',summarizeOverview(data,range),'Shipment volume by creation period'],
  ['Shipments',buildShipmentReport(shipments,[],range),'Shipment ledger'],
  ['Drivers',buildDriverReport(data,range),'Driver performance'],
  ['Revenue',buildRevenueReport(data,range),'Charges by route'],
 ]){
  const csv=reportCsv(title,range,model),rows=parse(csv);assert.ok(rows.some(row=>row[0]===heading));
  assert.equal(new Set(rows.map(row=>row.length)).size,1);assert.ok(!csv.includes('DO NOT EXPORT RAW NOTES'));assert.ok(!csv.includes('"cents"'));
  if(title==='Shipments'){assert.equal(rows.filter(row=>row[0].startsWith('SHIP-')).length,25);assert.ok(csv.includes("'=SUM(1,2)"));assert.ok(csv.includes('2026-10-10 08:00:00 +08:00'));}
 }
});

test('Revenue numeric amounts keep two decimals including negatives and quote customer/route text safely',()=>{
 const csv=reportCsv('Revenue',range,{charges:{amount:-12.5,count:1,missing:0},routes:[{route:'Pickup, "Gate A"\nDestination',shipments:1,priced:1,revenue:-12.5,expenses:0}]});
 const rows=parse(csv);assert.equal(rows.find(row=>row[0]==='Completed charges')[1],'-12.50');
 assert.ok(rows.some(row=>row[0]==='Pickup, "Gate A"\nDestination'&&row[3]==='-12.50'&&row[4]==='0.00'));
});

test('driver incident export uses the real loaded fields and preserves zero delay',()=>{
 const rows=parse(reportCsv('Drivers',range,{rows:[{name:'Driver One',incidents:[{category:'traffic',delay_minutes:0,created_at:'2026-10-12T00:00:00Z'}]}]}));
 assert.ok(rows.some(row=>row[0]==='Driver One'&&row[1]==='2026-10-12 08:00:00 +08:00'&&row[2]==='Traffic'&&row[3]==='0'));
});
