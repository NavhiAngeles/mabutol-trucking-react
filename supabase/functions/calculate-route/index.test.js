import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { automaticTollQuote } from '../../../src/services/tollPricing.js';
function setup({role='admin',active=true,authError=false,providerStatus=200,preview=false,deliveryId,routeContext,accessError=false,geometry='_qbxA__haV_|Bo}@ozDo}@',routes,providerStatuses}={}) {
 let handler,calls=0,sent;
 const context=vm.createContext({Request,Response,URL,AbortSignal,console:{error(){}},fetch:async(url,options)=>{calls++;sent=JSON.parse(options.body);const status=providerStatuses?.[calls-1] ?? providerStatus;return new Response(JSON.stringify(status===200?{routes:routes || [{summary:{distance:10000,duration:600},geometry,extras:{waycategory:{values:[[0,1,0]]}}}]}:{error:'Provider denied'}),{status});},
  Deno:{env:{get:()=> 'fixture'},serve:callback=>{handler=callback;}},
  createClient:()=>({auth:{getUser:async()=>({data:{user:authError?null:{id:'office'}},error:authError})},rpc:async(name,args)=>({data:routeContext,error:accessError || args.p_delivery!=='own-delivery'}),from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active}})})})});
 vm.runInContext(fs.readFileSync(new URL('./metroManilaRoads.js',import.meta.url),'utf8').replace(/^export /gm,''),context);
 vm.runInContext(fs.readFileSync(new URL('./northLuzonRoads.js',import.meta.url),'utf8').replace(/^export /gm,''),context);
 vm.runInContext(fs.readFileSync(new URL('./southLuzonRoads.js',import.meta.url),'utf8').replace(/^export /gm,''),context);
 vm.runInContext(fs.readFileSync(new URL('./tollRoute.js',import.meta.url),'utf8').replace(/^export /gm,''),context);
 vm.runInContext(fs.readFileSync(new URL('./index.js',import.meta.url),'utf8').replace(/^import .*;$/gm,''),context);
 return {call:(authorization='Bearer fixture',overrides={})=>handler(new Request('https://example.invalid',{method:'POST',headers:{...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify({preview,...(deliveryId?{delivery_id:deliveryId}:{}),pickup:{lat:14.6,lng:120.96},destination:{lat:14.65,lng:120.98},...overrides})})),calls:()=>calls,sent:()=>sent};
}

const candidate = (category, duration = 600) => ({ summary: { distance: 12000, duration }, geometry: '_qbxA__haV_|Bo}@ozDo}@', extras: { waycategory: { values: [[0, 2, category]] } } });
test('checked option searches distinct alternatives and selects verified expressway coverage, excluding ferries', async () => {
 const api = setup({routes:[candidate(0,100),candidate(3,900),candidate(3,600),candidate(11,200)]});
 const response=await api.call('Bearer fixture',{usesTollRoad:true});assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.tollPreference,'expressway');assert.equal(result.usesTollRoad,true);assert.equal(result.estimatedMinutes,10);
 assert.equal(result.geojson.features[0].properties.expressway.verified,true);
 assert.equal(result.geojson.features[0].properties.expressway.distanceKm,12);
 assert.equal(api.sent().preference,'fastest');assert.equal(api.sent().alternative_routes.target_count,3);
 assert.equal(api.sent().alternative_routes.share_factor,0.6);assert.equal(api.sent().instructions,true);
 assert.deepEqual(api.sent().options.avoid_features,['ferries']);
});
test('unchecked option requests toll avoidance and rejects a provider route that still contains tolls', async () => {
 const api=setup();const response=await api.call('Bearer fixture',{usesTollRoad:false});
 assert.equal(response.status,200);assert.equal((await response.json()).usesTollRoad,false);
 assert.deepEqual(api.sent().options.avoid_features,['ferries','tollways']);
 assert.equal(api.sent().alternative_routes,undefined);
 assert.equal((await setup({routes:[candidate(3)]}).call('Bearer fixture',{usesTollRoad:false})).status,422);
});
test('unchecked option permits ordinary road journeys when minor access links contain tolls without substantial expressway travel', async () => {
 const minorLinkCandidate = {
   summary: { distance: 50000, duration: 3600 },
   geometry: '_qbxA__haV_|Bo}@ozDo}@',
   extras: { waycategory: { values: [[0, 1, 2], [1, 2, 0]] } },
 };
 const api = setup({ routes: [minorLinkCandidate] });
 const response = await api.call('Bearer fixture', { usesTollRoad: false });
 assert.equal(response.status, 200);
 const data = await response.json();
 assert.equal(data.tollPreference, 'avoid');
 assert.equal(data.usesTollRoad, false);
 assert.equal(data.roadOnlyVerified, true);
});
test('long routes rejected by alternatives can use standard fastest routing, still enforcing toll verification', async () => {
 for (const [category,expected] of [[3,200],[0,422]]) {
  const api=setup({routes:[candidate(category)],providerStatuses:[400,200]});
  assert.equal((await api.call('Bearer fixture',{usesTollRoad:true})).status,expected);
  assert.equal(api.calls(),2);assert.equal(api.sent().alternative_routes,undefined);
 }
});
test('no expressway, incomplete categories and malformed preference fail without silent ordinary-road fallback', async () => {
 for (const routes of [[candidate(0)],[candidate(2)],[{...candidate(3),extras:{}}],[candidate(11)]]) {
   assert.equal((await setup({routes}).call('Bearer fixture',{usesTollRoad:true})).status,422);
 }
 const api=setup();assert.equal((await api.call('Bearer fixture',{usesTollRoad:'true'})).status,400);assert.equal(api.calls(),0);
});
test('fords (overflow bridges and spillways) are accepted as valid land routes and not rejected as ferries', async () => {
 const fordCandidate = {
   summary: { distance: 380000, duration: 28800 },
   geometry: '_qbxA__haV_|Bo}@ozDo}@',
   extras: { waycategory: { values: [[0, 1, 16], [1, 2, 0]] } },
 };
 const api = setup({ routes: [fordCandidate] });
 const response = await api.call('Bearer fixture', { usesTollRoad: false });
 assert.equal(response.status, 200);
 const data = await response.json();
 assert.equal(data.roadOnlyVerified, true);
 assert.equal(data.distanceKm, 380);
});
test('routing verifies identity and active office role before contacting provider',async()=>{
 const anonymous=setup();assert.equal((await anonymous.call('')).status,401);assert.equal(anonymous.calls(),0);
 for(const options of [{authError:true},{role:'customer'},{role:'driver'},{active:false}]) {const api=setup(options);assert.ok([401,403].includes((await api.call()).status));assert.equal(api.calls(),0);}
});
test('authenticated routing returns only verified road geometry and preserves provider errors',async()=>{
 const good=await setup().call();assert.equal(good.status,200);const data=await good.json();assert.equal(data.roadOnlyVerified,true);assert.equal(data.distanceKm,10);assert.equal(data.estimatedMinutes,10);
 const bad=await setup({providerStatus:403}).call();assert.equal(bad.status,403);
});

test('active customers may request read-only previews; drivers and inactive customers cannot',async()=>{
 const preview=setup({role:'customer',preview:true});assert.equal((await preview.call()).status,200);assert.equal(preview.calls(),1);
 for(const options of [{role:'customer'},{role:'customer',preview:true,active:false},{role:'driver',preview:true}]) {const denied=setup(options);assert.equal((await denied.call()).status,403);assert.equal(denied.calls(),0);}
});

const ownContext=()=>({delivery:{status:'assigned'},shipment:{status:'assigned',pickup_lat:14.6,pickup_lng:120.96,dropoff_lat:14.65,dropoff_lng:120.98}});
test('active drivers get an explicitly unverified preview only for their own active delivery',async()=>{
 const api=setup({role:'driver',preview:true,deliveryId:'own-delivery',routeContext:ownContext()});
 const response=await api.call();assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.preview,true);assert.equal(body.truckRestrictionsVerified,false);assert.equal(body.roadOnlyVerified,true);assert.equal(api.calls(),1);
 for(const options of [{deliveryId:'other-delivery'},{accessError:true},{active:false},{preview:false}]) {
  const denied=setup({role:'driver',preview:true,deliveryId:'own-delivery',routeContext:ownContext(),...options});
  assert.equal((await denied.call()).status,403);assert.equal(denied.calls(),0);
 }
});
test('driver cannot route arbitrary coordinates, missing pins, or a closed assignment',async()=>{
 const args={role:'driver',preview:true,deliveryId:'own-delivery',routeContext:ownContext()};
 const changed=setup(args);assert.equal((await changed.call('Bearer fixture',{pickup:{lat:0,lng:0}})).status,409);assert.equal(changed.calls(),0);
 const missing=ownContext();missing.shipment.pickup_lat=null;
 const noPins=setup({...args,routeContext:missing});assert.equal((await noPins.call()).status,422);assert.equal(noPins.calls(),0);
 for(const status of ['delivered','cancelled']) {
  const closed=ownContext();closed.delivery.status=status;
  const api=setup({...args,routeContext:closed});assert.equal((await api.call()).status,403);assert.equal(api.calls(),0);
 }
});
test('driver preview rejects mismatched provider geometry and redacts provider errors',async()=>{
 const args={role:'driver',preview:true,deliveryId:'own-delivery',routeContext:ownContext()};
 assert.equal((await setup({...args,geometry:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'}).call()).status,422);
 const failed=await setup({...args,providerStatus:403}).call();assert.equal(failed.status,502);
 assert.doesNotMatch(JSON.stringify(await failed.json()),/Provider denied|details|upstreamStatus/);
});

test('real Balagtas–Star City HGV response identifies unnamed NLEX and prices its actual Balintawak exit',async()=>{
 const route=JSON.parse(fs.readFileSync(new URL('./fixtures/balagtas-star-city.json',import.meta.url),'utf8'));
 const response=await setup({routes:[route]}).call('Bearer fixture',{usesTollRoad:true});
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.geojson.features[0].properties.expressway.sections[0].highway,'NLEX');
 const rate={id:'real-stretch',gate_name:'Meycauayan to Balintawak',highway:'NLEX',vehicle_class:'Class 2',fee:211,
   entry_lat:14.743141,entry_lng:120.973984,exit_lat:14.66056,exit_lng:121.00011,bidirectional:true};
 // The old cloverleaf pin lay ~422m beyond the routed exit and caused Fee pending.
 assert.throws(()=>automaticTollQuote(true,{toll_class:'Class 2'},body.geojson,[{...rate,exit_lat:14.656763,exit_lng:121.000032}]),/entry and exit/);
 assert.equal(automaticTollQuote(true,{toll_class:'Class 2'},body.geojson,[rate]).total,211);
 assert.equal(automaticTollQuote(true,{toll_class:'Class 3'},body.geojson,[{...rate,vehicle_class:'Class 3',fee:254}]).total,254);
});

test('real Harbor Link alternative does not add Connector fees from a short stacked-ramp overlap',async()=>{
 const route=JSON.parse(fs.readFileSync(new URL('./fixtures/balagtas-harbor-link.json',import.meta.url),'utf8'));
 const response=await setup({routes:[route]}).call('Bearer fixture',{usesTollRoad:true});
 const body=await response.json();
 assert.deepEqual(body.geojson.features[0].properties.expressway.sections.map(row=>row.highway),['NLEX_HARBOR_LINK']);
 const rates=[{id:'harbor',gate_name:'Standalone Harbor Link',highway:'NLEX_HARBOR_LINK',vehicle_class:'Class 2',fee:199,pricing_scope:'flat'}];
 assert.equal(automaticTollQuote(true,{toll_class:'Class 2'},body.geojson,rates).total,199);
});

test('real SLEX–STAR Batangas route identifies SLEX and STAR corridors and quotes exact Class 2 and Class 3 tariffs', async () => {
 const route = JSON.parse(fs.readFileSync(new URL('./fixtures/slex-star-batangas.json', import.meta.url), 'utf8'));
 const response = await setup({ routes: [route] }).call('Bearer fixture', { usesTollRoad: true });
 assert.equal(response.status, 200);
 const body = await response.json();
 const sections = body.geojson.features[0].properties.expressway.sections;
 assert.deepEqual(sections.map(s => s.highway), ['SLEX', 'STAR']);
 assert.equal(sections[1].connectedToPrevious, true);

 const rates = [
   { id: 'slex-full-2', highway: 'SLEX', gate_name: 'TR1-TR3: Alabang to Sto. Tomas (Batangas)', vehicle_class: 'Class 2', fee: 348, entry_lat: 14.4175, entry_lng: 121.0428, exit_lat: 14.1130, exit_lng: 121.1635, bidirectional: true },
   { id: 'slex-full-3', highway: 'SLEX', gate_name: 'TR1-TR3: Alabang to Sto. Tomas (Batangas)', vehicle_class: 'Class 3', fee: 522, entry_lat: 14.4175, entry_lng: 121.0428, exit_lat: 14.1130, exit_lng: 121.1635, bidirectional: true },
   { id: 'star-main-2', highway: 'STAR', gate_name: 'Sto. Tomas to Batangas City Port', vehicle_class: 'Class 2', fee: 242, entry_lat: 14.1130, entry_lng: 121.1635, exit_lat: 13.7820, exit_lng: 121.0770, bidirectional: true },
   { id: 'star-main-3', highway: 'STAR', gate_name: 'Sto. Tomas to Batangas City Port', vehicle_class: 'Class 3', fee: 363, entry_lat: 14.1130, entry_lng: 121.1635, exit_lat: 13.7820, exit_lng: 121.0770, bidirectional: true },
 ];

 const quote2 = automaticTollQuote(true, { toll_class: 'Class 2' }, body.geojson, rates);
 assert.equal(quote2.total, 590);
 assert.deepEqual(quote2.rates.map(r => r.id), ['slex-full-2', 'star-main-2']);

 const quote3 = automaticTollQuote(true, { toll_class: 'Class 3' }, body.geojson, rates);
 assert.equal(quote3.total, 885);
 assert.deepEqual(quote3.rates.map(r => r.id), ['slex-full-3', 'star-main-3']);

 // Fail closed if STAR rate exit is off-corridor (>350m)
 const badRates = rates.map(r => r.highway === 'STAR' ? { ...r, exit_lat: 13.7000 } : r);
 assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, body.geojson, badRates), /entry and exit/);
});

test('real CAVITEX Kawit and CALAX Silang routes identify South Luzon corridors and tariffs', async () => {
 const cavitexRoute = JSON.parse(fs.readFileSync(new URL('./fixtures/cavitex-kawit.json', import.meta.url), 'utf8'));
 const cavResponse = await setup({ routes: [cavitexRoute] }).call('Bearer fixture', { usesTollRoad: true });
 assert.equal(cavResponse.status, 200);
 const cavBody = await cavResponse.json();
 assert.deepEqual(cavBody.geojson.features[0].properties.expressway.sections.map(s => s.highway), ['CAVITEX']);

 const cavRates = [
   { id: 'cav-2', highway: 'CAVITEX', gate_name: 'R-1: Paranaque to Kawit', vehicle_class: 'Class 2', fee: 253, entry_lat: 14.5085, entry_lng: 120.9868, exit_lat: 14.4385, exit_lng: 120.9080, bidirectional: true },
   { id: 'cav-3', highway: 'CAVITEX', gate_name: 'R-1: Paranaque to Kawit', vehicle_class: 'Class 3', fee: 379, entry_lat: 14.5085, entry_lng: 120.9868, exit_lat: 14.4385, exit_lng: 120.9080, bidirectional: true },
 ];
 assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, cavBody.geojson, cavRates).total, 253);
 assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, cavBody.geojson, cavRates).total, 379);

 const calaxRoute = JSON.parse(fs.readFileSync(new URL('./fixtures/calax-silang.json', import.meta.url), 'utf8'));
 const calaxResponse = await setup({ routes: [calaxRoute] }).call('Bearer fixture', { usesTollRoad: true });
 assert.equal(calaxResponse.status, 200);
 const calaxBody = await calaxResponse.json();
 assert.deepEqual(calaxBody.geojson.features[0].properties.expressway.sections.map(s => s.highway), ['CALAX']);

 const calaxRates = [
   { id: 'cal-2', highway: 'CALAX', gate_name: 'Mamplasan to Silang', vehicle_class: 'Class 2', fee: 234, entry_lat: 14.3056, entry_lng: 121.0872, exit_lat: 14.2215, exit_lng: 120.9840, bidirectional: true },
   { id: 'cal-3', highway: 'CALAX', gate_name: 'Mamplasan to Silang', vehicle_class: 'Class 3', fee: 351, entry_lat: 14.3056, entry_lng: 121.0872, exit_lat: 14.2215, exit_lng: 120.9840, bidirectional: true },
 ];
 assert.equal(automaticTollQuote(true, { toll_class: 'Class 2' }, calaxBody.geojson, calaxRates).total, 234);
 assert.equal(automaticTollQuote(true, { toll_class: 'Class 3' }, calaxBody.geojson, calaxRates).total, 351);

 // Ambiguous duplicate rate fails closed
 assert.throws(() => automaticTollQuote(true, { toll_class: 'Class 2' }, calaxBody.geojson, [...calaxRates, { ...calaxRates[0], id: 'cal-dup' }]), /Multiple rates/);
});
