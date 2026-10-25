import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup({role='admin',active=true,authError=false,providerStatus=200,preview=false}={}) {
 let handler,calls=0;
 const context=vm.createContext({Request,Response,URL,console:{error(){}},fetch:async()=>{calls++;return new Response(JSON.stringify(providerStatus===200?{routes:[{summary:{distance:10000,duration:600},geometry:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',extras:{waycategory:{values:[[0,1,0]]}}}]}:{error:'Provider denied'}),{status:providerStatus});},
  Deno:{env:{get:()=> 'fixture'},serve:callback=>{handler=callback;}},
  createClient:()=>({auth:{getUser:async()=>({data:{user:authError?null:{id:'office'}},error:authError})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active}})})})});
 vm.runInContext(fs.readFileSync(new URL('./index.js',import.meta.url),'utf8').replace(/^import .*;$/gm,''),context);
 return {call:(authorization='Bearer fixture')=>handler(new Request('https://example.invalid',{method:'POST',headers:{...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify({preview,pickup:{lat:14.6,lng:120.96},destination:{lat:14.65,lng:120.98}})})),calls:()=>calls};
}
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
