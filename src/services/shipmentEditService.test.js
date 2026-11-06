import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./shipmentEditService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const context=vm.createContext({supabase:{rpc:async()=>({data:null,error:null})},Error});
vm.runInContext(source+'\nthis.api={editPolicy,saveShipmentEdit};',context);
const policy=value=>JSON.parse(JSON.stringify(context.api.editPolicy(value)));

test('edit policy preserves customer consent, approved quotation and active-trip locks',()=>{
 assert.equal(policy({status:'pending',booking_source:'mobile'}).editable,false);
 const pending=policy({status:'pending',booking_source:'web'});assert.equal(pending.editable,true);assert.ok(pending.fields.includes('weight_kg'));
 const booked=policy({status:'booked'});assert.deepEqual(booked.fields,['driver_notes']);
 assert.equal(policy({status:'assigned',delivery:{status:'assigned'}}).editable,true);
 assert.equal(policy({status:'assigned',delivery:{status:'assigned',route_started_at:'now'}}).editable,false);
 for(const status of ['loading','in_transit','delayed','review','completed','cancelled'])assert.equal(policy({status}).editable,false);
});

test('save sends optimistic version and requires confirmed updated row',async()=>{
 const calls=[];context.supabase.rpc=async(name,args)=>{calls.push({name,args});return{data:{id:'s',updated_at:'new'},error:null};};
 assert.equal((await context.api.saveShipmentEdit({id:'s',updated_at:'old'},{driver_notes:'Call first'})).updated_at,'new');
 assert.equal(calls[0].name,'office_edit_shipment');assert.equal(calls[0].args.p_expected,'old');
 context.supabase.rpc=async()=>({data:{id:'s'},error:null});
 await assert.rejects(context.api.saveShipmentEdit({id:'s',updated_at:'old'},{driver_notes:'x'}),/not confirmed/i);
});
