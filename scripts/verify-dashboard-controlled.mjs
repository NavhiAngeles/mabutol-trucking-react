import fs from 'node:fs';
import vm from 'node:vm';
import { calculateOperationalStats, dispatchReadyIds, pendingDeparture, ACTIVE_STATUSES } from '../src/services/operationalStats.js';
import { calculateDashboardAnalytics, latestTracking } from '../src/services/dashboardAnalytics.js';
import { transformWithOxc } from 'vite';

const now = Date.parse('2026-11-05T04:00:00Z');
const iso = offset => new Date(now + offset).toISOString();
const shipments = ['assigned','loading','in_transit','delayed','completed','completed','completed','booked','cancelled','pending'].map((status, i) => ({ id: `s${i}`, status, created_at: iso(-3600000), estimated_arrival: iso(-600000) }));
shipments[4].actual_delivery_at = iso(-1200000);
shipments[5].actual_delivery_at = iso(-300000);
const trucks = Array.from({length: 8}, (_, i) => ({id: `t${i}`, status: i === 6 ? 'maintenance' : i === 7 ? 'inactive' : 'available'}));
const deliveries = ['assigned','loading','in_transit','in_transit','delivered','cancelled'].map((status,i) => ({ id:`d${i}`, shipment_id:`s${i}`, truck_id:`t${i}`, driver_id:`driver${i}`, status, departed_at: i > 0 && i < 5 ? iso(-3600000) : null, arrived_at: i === 4 ? iso(-1200000) : null }));
const maintenance = [{truck_id:'t4',status:'in_progress'}, {truck_id:'t5',status:'scheduled',scheduled_date:'2026-11-04'}];
const checks = [];
function check(name, expected, actual, classification='baseline') {
  checks.push({name,classification,expected,actual,pass:JSON.stringify(expected)===JSON.stringify(actual)});
}
const stats = calculateOperationalStats(shipments,trucks,deliveries,maintenance,null,now);
check('Dashboard totals',[3,1,1,2,1,1],[stats.activeShipments,stats.delayedShipments,stats.availableTrucks,stats.pendingDispatch,stats.awaitingAssignment,stats.awaitingDispatch]);
check('Dispatch-ready excludes reservations, active trips, maintenance and inactive trucks',['t5'],dispatchReadyIds(trucks,deliveries,maintenance));
const analytics=calculateDashboardAnalytics(shipments,trucks,deliveries,maintenance,[],now);
check('Resource partition',{available:1,inUse:4,maintenance:2,other:1,total:8},analytics.resources);
check('Completed today / comparable trips / on-time rate',[2,2,50],[analytics.completedToday,analytics.timedDeliveries,analytics.onTimeRate]);
check('Overdue scheduled maintenance alert',true,analytics.alerts.some(a=>a.id==='maintenance'));
const scope=vm.createContext({pendingDeparture,console:{log(){},error(){}},fetchOperationalRows:async table=>table==='shipments'?shipments:deliveries});
const source=fs.readFileSync(new URL('../src/services/shipmentService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
vm.runInContext(source+'\nthis.api={fetchShipments,mapShipmentRow};',scope);
const mapped=await scope.api.fetchShipments();
const configSource=fs.readFileSync(new URL('../src/viewmodels/ShipmentViewModel.js',import.meta.url),'utf8');
const tabScope=vm.createContext({ACTIVE_STATUSES});
vm.runInContext(configSource.slice(configSource.indexOf('export const TAB_CONFIG'),configSource.indexOf('const SHIPMENT_PAGE_SIZE')).replace('export ','')+'\nthis.tabs=TAB_CONFIG;',tabScope);
for(const [tab, expected] of Object.entries({active:['s0','s1','s2'],delayed:['s3'],dispatch:['s0','s7'],completed:['s4','s5','s6']})) {
  check(`${tab} drill-down exact IDs`,expected,Array.from(mapped.filter(tabScope.tabs[tab].filter),s=>s.id).sort());
}
check('Completed trip with missing arrival must not assert ON TIME','UNKNOWN',mapped.find(s=>s.id==='s6').deliveryStatus);
const fixes=[
  {id:1,delivery_id:'d0',truck_id:'t0',latitude:15,longitude:121,recorded_at:iso(-400000)},
  {id:2,delivery_id:'d0',truck_id:'t0',latitude:15.1,longitude:121.1,recorded_at:iso(-100000)},
  {id:3,delivery_id:'d3',truck_id:'t3',latitude:15,longitude:121,recorded_at:iso(-300001)},
  {id:4,delivery_id:'d4',truck_id:'t4',latitude:15,longitude:121,recorded_at:iso(-1)},
  {id:5,delivery_id:'d1',truck_id:'t1',latitude:91,longitude:121,recorded_at:iso(-1)},
  {id:6,delivery_id:'d2',truck_id:'t2',latitude:15,longitude:121,recorded_at:iso(1)},
];
check('GPS latest valid active fixes; completed,invalid,future excluded',[[2,false],[3,true]],latestTracking(fixes,deliveries,now).map(r=>[r.id,r.stale]));
check('GPS assignment integrity rejects fix belonging to another truck',0,latestTracking([{...fixes[1],truck_id:'t7'}],deliveries,now).length,'defensive mismatch; inconsistent fixture');

// Run the real map initialization effect with a provider error; avoid external requests.
const mapSource=fs.readFileSync(new URL('../src/pages/Dashboard/DashboardTrackingMap.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(mapSource,'map.jsx',{jsx:{runtime:'classic'}});
const effects=[],refs=[],states=[],events={}; let si=0;
const mapScope=vm.createContext({React:{createElement(){return null;}},
  useState:v=>{const i=si++;states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=v];},
  useRef:v=>{const r={current:v};refs.push(r);return r;},useEffect:fn=>effects.push(fn),
  useLiveData:()=>({data:null,loading:false,error:null}),getLiveTracking(){},DASHBOARD_TABLES:[],snapshotStatus:()=>'',
  maplibregl:{setWorkerUrl(){},Map:class{on(name,fn){events[name]=fn;}resize(){}remove(){}}},maplibreWorkerUrl:'fixture',
  LUZON_CENTER:[],LUZON_BOUNDS:[],LUZON_MIN_ZOOM:5,LUZON_MAX_ZOOM:18,
  ResizeObserver:class{observe(){}disconnect(){}},console:{error(){}},setTimeout,clearTimeout,
});
vm.runInContext(code.replace(/import[\s\S]*?from\s*["'][^"']+["'];?/g,'').replace(/import\s*["'][^"']+["'];?/g,'').replace(/export\s+default\s+/g,'').replace(/import\.meta\.env\.VITE_MAPTILER_API_KEY/g,"'fixture'")+'\nthis.MapComponent=DashboardTrackingMap;',mapScope);
mapScope.MapComponent();refs[0].current={};const cleanup=effects[0]();
events.error({error:new Error('Provider unavailable')});check('Map provider failure feedback','Provider unavailable',states[1]);
events.load();check('Map provider recovery clears error','',states[1]);cleanup();
const result={scope:'isolated synthetic records; actual calculations, shipment service/mapping/tab filters and map provider callback; no live DB or signed-in browser verification',fixedClock:new Date(now).toISOString(),checks};
fs.mkdirSync('../outputs',{recursive:true});fs.writeFileSync('../outputs/dash-04-controlled-results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(checks.some(c=>!c.pass && c.classification==='baseline'))process.exitCode=1;
