import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotReport } from './reportSnapshots.js';
import { buildShipmentReport } from './shipmentReport.js';
import { buildDriverReport } from './driverReport.js';
import { buildRevenueReport } from './revenueReport.js';
const range={start:'2026-10-01',end:'2026-10-24'};
const source=()=>({shipments:[{id:'s',status:'completed',created_at:'2026-10-24T00:00:00Z',final_amount:123}],deliveries:[],drivers:[],customers:[],payments:[],expenses:[],fuel:[],maintenance:[],incidents:[],trucks:[],documents:[],settings:[]});
const snapshot=(type,data=source())=>({report_type:type,period_start:range.start,period_end:range.end,generated_at:'2026-10-24T08:00:00Z',model_version:1,status:'ready',data});
test('saved report models use the same shipment/driver/revenue calculations as live reports',()=>{
 const data=source();
 for(const [type,expected] of [['Shipments',buildShipmentReport(data.shipments,data.deliveries,range)],['Drivers',buildDriverReport(data,range)],['Revenue',buildRevenueReport(data,range)]]) assert.deepEqual(snapshotReport(snapshot(type,data)),expected);
});
test('saved Overview freezes compliance at generation time rather than download time',()=>{
 const data=source();data.trucks=[{id:'t',status:'available'}];data.documents=['lto_registration','franchise_permit','emission_test'].map((doc_type,i)=>({id:String(i),truck_id:'t',doc_type,review_status:'approved',expiry_date:'2027-01-01',created_at:'2026-01-01'}));
 const result=snapshotReport(snapshot('Overview',data));assert.equal(result.total,1);assert.equal(result.compliance.verified,1);assert.equal(result.fleet.available,1);
});
test('failed, unknown and newer-version reports cannot be presented as ready data',()=>{
 for(const value of [{...snapshot('Overview'),status:'failed'},{...snapshot('Overview'),model_version:2},snapshot('Unknown')]) assert.throws(()=>snapshotReport(value));
});
