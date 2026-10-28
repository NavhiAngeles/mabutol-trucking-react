import test from 'node:test';
import assert from 'node:assert/strict';
import {routeConfirmation} from './deliveryRouteConfirmation.js';
const context={delivery:{id:'d',updated_at:'delivery-version'},shipment:{updated_at:'shipment-version',weight_kg:6000}};
const form={pickup_lat:'14.6',pickup_lng:'120.96',dropoff_lat:'14.65',dropoff_lng:'120.98',height:'3.5',width:'2.4',length:'10',weight:'20',axleload:'8',hazmat:false,confirmed:true,reason:' Confirmed truck entrances and load '};
test('office confirmation sends exact record versions, verified pins and loaded vehicle profile',()=>{
 const body=routeConfirmation(context,form);assert.equal(body.expected,'delivery-version');assert.equal(body.shipment_expected,'shipment-version');assert.equal(body.profile.weight,20);assert.equal(body.profile.hazmat,false);assert.equal(body.reason,'Confirmed truck entrances and load');assert.equal(body.pickup_lat,14.6);
});
test('blank pins/measurements, guessed cargo-only mass, absent hazmat and unchecked edits cannot be confirmed',()=>{
 for(const patch of [{confirmed:false},{pickup_lat:''},{dropoff_lng:181},{height:''},{weight:6},{axleload:21},{hazmat:''},{reason:'bad'}])assert.throws(()=>routeConfirmation(context,{...form,...patch}));
 assert.throws(()=>routeConfirmation({...context,delivery:{id:'d'}},form));
});
