import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRouteProfile, routeConfirmation} from './deliveryRouteConfirmation.js';
const context={delivery:{id:'d',updated_at:'delivery-version'},shipment:{updated_at:'shipment-version',weight_kg:6000}};
const form={pickup_lat:'14.6',pickup_lng:'120.96',dropoff_lat:'14.65',dropoff_lng:'120.98',height:'3.5',width:'2.4',length:'10',weight:'20',axleload:'8',hazmat:false,confirmed:true,reason:' Confirmed truck entrances and load '};
test('office confirmation sends exact record versions, verified pins and loaded vehicle profile',()=>{
 const body=routeConfirmation(context,form);assert.equal(body.expected,'delivery-version');assert.equal(body.shipment_expected,'shipment-version');assert.equal(body.profile.weight,20);assert.equal(body.profile.hazmat,false);assert.equal(body.reason,'Confirmed truck entrances and load');assert.equal(body.pickup_lat,14.6);
});
test('blank pins/measurements, guessed cargo-only mass, absent hazmat and unchecked edits cannot be confirmed',()=>{
 for(const patch of [{confirmed:false},{pickup_lat:''},{dropoff_lng:181},{height:''},{weight:6},{axleload:21},{hazmat:''},{reason:'bad'}])assert.throws(()=>routeConfirmation(context,{...form,...patch}));
 assert.throws(()=>routeConfirmation({...context,delivery:{id:'d'}},form));
});
test('initialRouteProfile prefers saved plan over truck defaults',()=>{
 const profile=initialRouteProfile({
  ...context,
  truck:{height_m:3.3,width_m:2.25,length_m:7.8,tare_weight_kg:4200,axle_count:2},
  plan:{profile:{height:3.5,width:2.4,length:10,weight:12,axleload:6}},
 });
 assert.deepEqual(profile,{height:3.5,width:2.4,length:10,weight:12,axleload:6,prefilledFromTruck:false});
});
test('initialRouteProfile pre-fills HGV dimensions and computes loaded gross & axleload from truck tare + cargo',()=>{
 const profile=initialRouteProfile({
  shipment:{weight_kg:6000},
  truck:{height_m:3.3,width_m:2.25,length_m:7.8,tare_weight_kg:4200,axle_count:2},
 });
 assert.deepEqual(profile,{height:3.3,width:2.25,length:7.8,weight:10.2,axleload:5.1,prefilledFromTruck:true});
});
test('initialRouteProfile falls back to gross_weight_kg when tare_weight_kg is absent and handles missing truck safely',()=>{
 const grossFallback=initialRouteProfile({
  shipment:{weight_kg:6000},
  truck:{height_m:3.1,width_m:2.1,length_m:6.8,tare_weight_kg:null,gross_weight_kg:10500,axle_count:3},
 });
 assert.deepEqual(grossFallback,{height:3.1,width:2.1,length:6.8,weight:10.5,axleload:3.5,prefilledFromTruck:true});
 assert.deepEqual(initialRouteProfile(context),{height:'',width:'',length:'',weight:'',axleload:'',prefilledFromTruck:false});
});
