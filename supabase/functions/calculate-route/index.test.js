import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup({role='admin',active=true,authError=false,providerStatus=200,preview=false,deliveryId,routeContext,accessError=false,geometry='_qbxA__haV_|Bo}@ozDo}@',routes,providerStatuses}={}) {
 let handler,calls=0,sent;
 const context=vm.createContext({Request,Response,URL,AbortSignal,console:{error(){}},fetch:async(url,options)=>{calls++;sent=JSON.parse(options.body);const status=providerStatuses?.[calls-1] ?? providerStatus;return new Response(JSON.stringify(status===200?{routes:routes || [{summary:{distance:10000,duration:600},geometry,extras:{waycategory:{values:[[0,1,0]]}}}]}:{error:'Provider denied'}),{status});},
  Deno:{env:{get:()=> 'fixture'},serve:callback=>{handler=callback;}},
  createClient:()=>({auth:{getUser:async()=>({data:{user:authError?null:{id:'office'}},error:authError})},rpc:async(name,args)=>({data:routeContext,error:accessError || args.p_delivery!=='own-delivery'}),from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active}})})})});
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
 assert.deepEqual(api.sent().options.avoid_features,['ferries','fords']);
});
test('unchecked option requests toll avoidance and rejects a provider route that still contains tolls', async () => {
 const api=setup();const response=await api.call('Bearer fixture',{usesTollRoad:false});
 assert.equal(response.status,200);assert.equal((await response.json()).usesTollRoad,false);
 assert.deepEqual(api.sent().options.avoid_features,['ferries','fords','tollways']);
 assert.equal(api.sent().alternative_routes,undefined);
 assert.equal((await setup({routes:[candidate(3)]}).call('Bearer fixture',{usesTollRoad:false})).status,422);
});
test('long routes rejected by alternatives can use standard fastest routing, still enforcing toll verification', async () => {
 for (const [category,expected] of [[3,200],[0,422]]) {
  const api=setup({routes:[candidate(category)],providerStatuses:[400,200]});
  assert.equal((await api.call('Bearer fixture',{usesTollRoad:true})).status,expected);
  assert.equal(api.calls(),2);assert.equal(api.sent().alternative_routes,undefined);
 }
});
test('no expressway, incomplete categories and malformed preference fail without silent ordinary-road fallback', async () => {
 for (const routes of [[candidate(0)],[candidate(2)],[{...candidate(3),extras:{}}],[candidate(19)]]) {
   assert.equal((await setup({routes}).call('Bearer fixture',{usesTollRoad:true})).status,422);
 }
 const api=setup();assert.equal((await api.call('Bearer fixture',{usesTollRoad:'true'})).status,400);assert.equal(api.calls(),0);
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
