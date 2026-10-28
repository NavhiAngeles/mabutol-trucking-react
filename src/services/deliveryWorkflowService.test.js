import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(options = {}) {
  const calls = [];
  const client = { rpc: async (name,args) => { calls.push({name,args}); return options.rpcError ? {error:Error('denied')} : {data:options.data || {id:'s'}}; },
    from:()=>({select:()=>({eq:()=>({order:async()=>({data:options.deliveries || []})})})}),
    functions: { invoke:async()=>({data:options.route,error:options.routeError}) },
    storage: {from:bucket=>({createSignedUrl:async(path,seconds)=>{calls.push({bucket,path,seconds});return options.storageError?{error:Error('private access denied')}:{data:{signedUrl:'private-test-url'}};}})} };
  const context=vm.createContext({supabase:client});
  vm.runInContext(fs.readFileSync(new URL('./deliveryWorkflowService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.service=deliveryWorkflowService();',context);
  return {service:context.service,calls};
}
const form={pickup_lat:14.6,pickup_lng:120.96,dropoff_lat:14.65,dropoff_lng:120.98,distance_km:10,duration_minutes:30,source:'manual',reason:'Verified road route',quoted_amount:1};
test('office quotation sends version and route inputs but never accepts a caller price',async()=>{
  const {service,calls}=setup(); await service.prepareQuote({id:'s',updated_at:'version'},form);
  assert.equal(calls[0].name,'office_prepare_quote');assert.equal(calls[0].args.p_expected,'version');assert.equal('quoted_amount' in calls[0].args.p_data,false);
});

test('expense review preserves expected version, decision, reason and server denial',async()=>{
  const {service,calls}=setup();await service.reviewExpense({id:'expense',updated_at:'version'},'rejected',' Receipt unreadable ');
  assert.equal(calls[0].name,'office_review_expense');assert.equal(calls[0].args.p_expected,'version');assert.equal(calls[0].args.p_reason,'Receipt unreadable');assert.equal(calls[0].args.p_status,'rejected');
  await assert.rejects(setup({rpcError:true}).service.reviewExpense({id:'e'},'approved','reason'),/denied/);
});

test('unassigned office shipments retain their timeline without requesting driver-only evidence',async()=>{
  const {service,calls}=setup({data:{shipment_id:'s',events:[],documents:[]}});
  const result=await service.load('s');
  assert.equal(result.expenses.length,0);assert.equal(result.incident_evidence.length,0);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'mobile_shipment_details');
});

test('private evidence link reauthorizes record id before signing the returned path for five minutes',async()=>{
  const {service,calls}=setup({data:'delivery/receipt-e.jpg'});
  assert.equal(await service.evidenceUrl('shipment','expense','record'),'private-test-url');
  assert.equal(calls[0].name,'mobile_delivery_evidence_file');assert.equal(calls[0].args.p_record,'record');assert.equal(calls[0].args.p_shipment,'shipment');
  assert.equal(calls[1].bucket,'delivery-documents');assert.equal(calls[1].seconds,300);
  assert.equal(calls[1].path,'delivery/receipt-e.jpg');
});

test('private evidence refuses unauthorized, unsafe paths and storage denial',async()=>{
  for(const data of ['/absolute','delivery/../secret',{}])await assert.rejects(setup({data}).service.evidenceUrl('s','incident','i'),/not found/);
  await assert.rejects(setup({rpcError:true}).service.evidenceUrl('s','expense','e'),/denied/);
  await assert.rejects(setup({data:'d/receipt-e.jpg',storageError:true}).service.evidenceUrl('s','expense','e'),/private access denied/);
});
test('manual quote requires finite coordinates, measured distance and verification reason',()=>{
  const {service}=setup();
  for(const patch of [{pickup_lat:''},{pickup_lat:NaN},{dropoff_lng:181},{distance_km:0},{duration_minutes:Infinity},{reason:' '}])assert.throws(()=>service.routeData({...form,...patch}));
});
test('provider failure never silently becomes a verified route',async()=>{
  await assert.rejects(setup({route:{error:'Provider denied'}}).service.calculateRoute(form),/Provider denied/);
  await assert.rejects(setup({route:{roadOnlyVerified:false}}).service.calculateRoute(form),/unavailable/);
  const result=await setup({route:{roadOnlyVerified:true,distanceKm:12,estimatedMinutes:35,geojson:{type:'FeatureCollection',features:[]}}}).service.calculateRoute(form);
  assert.equal(result.source,'provider');assert.equal(result.distance_km,12);
});
test('office completion and incident resolution preserve optimistic versions and errors',async()=>{
  const {service,calls}=setup();await service.action({id:'d',updated_at:'v'},'request_correction',' Clearer photo ');
  assert.equal(calls[0].args.p_reason,'Clearer photo');assert.equal(calls[0].args.p_expected,'v');
  await service.resolveIncident({id:'i'},{id:'d',updated_at:'v2'},'Resolved');assert.equal(calls[1].args.p_expected,'v2');
  await assert.rejects(setup({rpcError:true}).service.action({id:'d',updated_at:'v'},'complete'),/denied/);
});
