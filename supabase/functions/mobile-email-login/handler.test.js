import test from 'node:test';
import assert from 'node:assert/strict';
import {emailLoginHandler} from './handler.js';
const request=(email='person@example.invalid',password='fixture-password')=>new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({email,password})});
test('session is returned only after password authentication, without phone disclosure',async()=>{
 let resolved,login;
 const handler=emailLoginHandler({resolve:async email=>(resolved=email,{phone:'639999000081',limited:false}),signIn:async(phone,password)=>(login={phone,password},{access_token:'access-fixture',refresh_token:'refresh-fixture'})});
 const result=await handler(request(' PERSON@example.invalid '));
 assert.equal(result.status,200);assert.equal(resolved,'person@example.invalid');
 assert.deepEqual(login,{phone:'639999000081',password:'fixture-password'});
 assert.deepEqual(await result.json(),{access_token:'access-fixture',refresh_token:'refresh-fixture'});
 assert.equal(result.headers.get('cache-control'),'no-store');
});
test('unknown or ambiguous aliases never attempt password login',async()=>{
 const handler=emailLoginHandler({resolve:async()=>({phone:null,limited:false}),signIn:()=>assert.fail()});
 assert.equal((await handler(request())).status,401);
});
test('wrong password returns same fixed response as unknown account',async()=>{
 const unknown=emailLoginHandler({resolve:async()=>({phone:null}),signIn:()=>assert.fail()});
 const wrong=emailLoginHandler({resolve:async()=>({phone:'639999000081'}),signIn:async()=>null});
 assert.equal(await (await unknown(request())).text(),await (await wrong(request())).text());
});
test('rate-limited aliases never reach Auth',async()=>{
 const handler=emailLoginHandler({resolve:async()=>({limited:true}),signIn:()=>assert.fail()});
 assert.equal((await handler(request())).status,429);
});
test('malformed input and oversized payload never resolve an identity',async()=>{
 const handler=emailLoginHandler({resolve:()=>assert.fail(),signIn:()=>assert.fail()});
 assert.equal((await handler(request('invalid'))).status,400);
 assert.equal((await handler(request('person@example.invalid','x'.repeat(9000)))).status,400);
});
test('configuration, lookup and Auth errors never expose private values',async()=>{
 for(const resolve of [async()=>{throw Error('private-email-phone-password')},async()=>({phone:'639999000081'})]){
 const handler=emailLoginHandler({resolve,signIn:async()=>{throw Error('private-email-phone-password')}});
 const response=await handler(request());assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
 }
});
