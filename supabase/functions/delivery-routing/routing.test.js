import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {point,truckProfile,confirmedPlan,etaContext,decodePolyline,truckRoute} from './routing.js';
const profile={height:3.5,width:2.4,length:10,weight:20,axleload:8,hazmat:false};
const origin={lat:14.6,lng:120.96},destination={lat:14.65,lng:120.98};
function encode(points){let lat=0,lng=0,result='';for(const [x,y] of points){for(const [value,previous] of [[Math.round(y*1e5),lat],[Math.round(x*1e5),lng]]){let n=value-previous;n=n<0?~(n<<1):n<<1;while(n>=32){result+=String.fromCharCode((32|(n&31))+63);n>>=5;}result+=String.fromCharCode(n+63);}lat=Math.round(y*1e5);lng=Math.round(x*1e5);}return result;}
const geometry=encode([[origin.lng,origin.lat],[destination.lng,destination.lat]]);
function context(now=Date.now()){
 const pins={pickup_lat:origin.lat,pickup_lng:origin.lng,dropoff_lat:destination.lat,dropoff_lng:destination.lng};
 return {delivery:{id:'delivery',truck_id:'truck',status:'assigned',route_started_at:new Date(now-60000).toISOString(),updated_at:'delivery-version'},shipment:{id:'shipment',status:'assigned',weight_kg:6000,updated_at:'shipment-version',...pins,route_geometry:{}},plan:{version:'plan-version',truck_id:'truck',cargo_weight_kg:6000,profile,...pins,geometry:{}},position:{latitude:origin.lat,longitude:origin.lng,accuracy_m:10,recorded_at:new Date(now-10000).toISOString()}};
}
test('verified truck profile requires all loaded measurements and explicit hazmat declaration',()=>{
 assert.deepEqual(truckProfile(profile,6000),profile);
 for(const patch of [{height:null},{width:0},{length:Infinity},{weight:6},{axleload:21},{hazmat:undefined}])assert.throws(()=>truckProfile({...profile,...patch},6000));
 assert.equal(point(null,120),null);assert.equal(point(91,120),null);
});
test('ETA follows the current leg and never uses stale, inaccurate, future or missing GPS',()=>{
 const now=Date.now(),c=context(now);assert.equal(etaContext(c,now).leg,'pickup');
 assert.equal(etaContext({...c,delivery:{...c.delivery,status:'in_transit'}},now).leg,'destination');
 for(const patch of [{recorded_at:new Date(now-120000).toISOString()},{recorded_at:new Date(now+1000).toISOString()},{accuracy_m:101},{accuracy_m:'NaN'},{latitude:null}])assert.ok(etaContext({...c,position:{...c.position,...patch}},now).reason);
 assert.ok(etaContext({...c,delivery:{...c.delivery,pickup_arrived_at:new Date().toISOString()}},now).reason);
 assert.ok(etaContext({...c,delivery:{...c.delivery,route_started_at:null}},now).reason);
});
test('route confirmation is invalidated by truck, cargo, pins or road geometry changes',()=>{
 const c=context();assert.equal(confirmedPlan(c),true);
 for(const patch of [{weight_kg:6100},{pickup_lat:null},{dropoff_lng:120.99},{route_geometry:{changed:true}}])assert.equal(confirmedPlan({...c,shipment:{...c.shipment,...patch}}),false);
 assert.equal(confirmedPlan({...c,delivery:{...c.delivery,truck_id:'replacement'}}),false);
});
test('provider receives actual HGV restrictions and no-ferry options; road geometry is retained',async()=>{
 let sent;const result=await truckRoute({origin,destination,profile,key:' https://api.heigit.org/example?api_key=fixture \n',fetcher:async(url,options)=>{sent={url,key:options.headers.Authorization,body:JSON.parse(options.body)};return Response.json({routes:[{summary:{duration:600,distance:10000},geometry,extras:{waycategory:{values:[[0,1,0]]}}}]});}});
 assert.equal(sent.key,'fixture');assert.ok(sent.url.endsWith('/driving-hgv'));assert.deepEqual(sent.body.options.profile_params.restrictions,profile);assert.deepEqual(sent.body.options.avoid_features,['ferries','fords']);assert.equal(result.seconds,600);assert.equal(result.geometry.features[0].geometry.coordinates.length,2);
});
test('provider failure, warnings, water routes and unmatched pins never produce a verified route',async()=>{
 for(const patch of [{warnings:[{code:1}]},{extras:{waycategory:{values:[[0,1,8]]}}},{geometry:encode([[0,0],[0.1,0.1]])}])await assert.rejects(truckRoute({origin,destination,profile,key:'fixture',fetcher:async()=>Response.json({routes:[{summary:{duration:600,distance:10000},geometry,extras:{waycategory:{values:[[0,1,0]]}},...patch}]})}));
 await assert.rejects(truckRoute({origin,destination,profile,key:'fixture',fetcher:async()=>new Response('',{status:429})}));
 assert.throws(()=>decodePolyline('_'));assert.throws(()=>decodePolyline('~~~~~~~~~~~~'));
});
function handler({role='driver',active=true,ctx=context(),rpcError=false}={}){
 let serve;const calls=[];let providerCalls=0;
 const caller={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active}})}),rpc:async()=>({data:ctx,error:rpcError})};
 const service={rpc:async(name,args)=>{calls.push({name,args});return {data:{plan_version:ctx.plan.version,eta_at:new Date(Date.now()+600000).toISOString()}};}};
 const sandbox=vm.createContext({Request,Response,Date,point,truckProfile,confirmedPlan,etaContext,truckRoute:async()=>{providerCalls++;return {seconds:600,meters:10000,geometry:{}};},Deno:{env:{get:key=>key},serve:fn=>{serve=fn;}},createClient:(url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?service:caller});
 vm.runInContext(fs.readFileSync(new URL('./index.js',import.meta.url),'utf8').replace(/^import .*$/gm,''),sandbox);
 return {calls,providers:()=>providerCalls,call:(input,auth=true)=>serve(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(input)}))};
}
test('driver ETA uses server GPS/plan, never caller coordinates; unauthorized callers do not contact provider',async()=>{
 const api=handler();assert.equal((await api.call({mode:'eta',delivery_id:'delivery',pickup_lat:0,profile:{}})).status,200);assert.equal(api.calls[0].args.p_actor,'actor');assert.equal(api.calls[0].args.p_version,'plan-version');
 for(const options of [{role:'customer'},{active:false},{rpcError:true}]){const denied=handler(options);assert.equal((await denied.call({mode:'eta',delivery_id:'delivery'})).status,403);assert.equal(denied.providers(),0);}
 const anonymous=handler();assert.equal((await anonymous.call({},false)).status,401);
});
test('only office may repair pins and stale/unchecked requests cannot reach provider',async()=>{
 const input={mode:'confirm',delivery_id:'delivery',expected:'delivery-version',shipment_expected:'shipment-version',profile,...{pickup_lat:origin.lat,pickup_lng:origin.lng,dropoff_lat:destination.lat,dropoff_lng:destination.lng},confirmed:true,reason:'Verified actual entrances and loaded truck'};
 assert.equal((await handler().call(input)).status,403);
 for(const patch of [{confirmed:false},{expected:'stale'}]){const api=handler({role:'staff'});assert.ok([400,409].includes((await api.call({...input,...patch})).status));assert.equal(api.providers(),0);}
 const api=handler({role:'staff'});assert.equal((await api.call(input)).status,200);assert.equal(api.calls[0].name,'store_confirmed_delivery_route');assert.equal(api.calls[0].args.p_data.truck_id,'truck');
});
test('recent ETA cache is reused and stale GPS never revives cached ETA',async()=>{
 const ctx=context();ctx.eta={plan_version:ctx.plan.version,leg:'pickup',calculated_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()};
 const api=handler({ctx});await api.call({mode:'eta',delivery_id:'delivery'});assert.equal(api.providers(),0);
 ctx.position.recorded_at=new Date(Date.now()-180000).toISOString();const stale=handler({ctx});const reply=await (await stale.call({mode:'eta',delivery_id:'delivery'})).json();assert.ok(reply.reason);assert.equal(reply.eta_at,undefined);
});
