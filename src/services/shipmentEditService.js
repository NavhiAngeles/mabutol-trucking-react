import { supabase } from './supabaseClient';
const startedKeys=['departed_at','route_started_at','pickup_arrived_at','customer_showed_at','grace_ends_at','auto_cancel_at'];
export const editPolicy=shipment=>{
 if(!shipment)return{editable:false,fields:[],reason:'Shipment unavailable.'};
 if(shipment.status==='pending'&&shipment.booking_source==='mobile')return{editable:false,fields:[],reason:'Customer-submitted requests require customer consent before their terms can change.'};
 if(shipment.status==='pending')return{editable:true,fields:['cargo_description','weight_kg','requested_vehicle_type_id','special_handling','scheduled_departure','driver_notes'],reason:'Changing request terms clears the quotation and requires a new quote before approval.'};
 if(shipment.status==='booked')return{editable:true,fields:['driver_notes'],reason:'Approved customer and quotation terms are locked; only driver instructions may change.'};
 if(shipment.status==='assigned'&&shipment.delivery?.status==='assigned'&&!startedKeys.some(key=>shipment.delivery[key]))return{editable:true,fields:['driver_notes'],reason:'This assignment has not started; only driver instructions may change.'};
 return{editable:false,fields:[],reason:'This shipment state is locked. Use its supported trip or review workflow.'};
};
export async function fetchShipmentForEdit(id){const [shipment,deliveries,vehicles]=await Promise.all([
 supabase.from('shipments').select('id,tracking_number,status,booking_source,updated_at,cargo_description,weight_kg,requested_vehicle_type_id,special_handling,scheduled_departure,driver_notes').eq('id',id).single(),
 supabase.from('deliveries').select('id,status,departed_at,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at').eq('shipment_id',id).neq('status','cancelled'),
 supabase.from('vehicle_types').select('id,name,default_capacity_kg,is_active').eq('is_active',true).order('default_capacity_kg')]);
 if(shipment.error)throw shipment.error;if(deliveries.error)throw deliveries.error;if(vehicles.error)throw vehicles.error;
 const value={...shipment.data,delivery:deliveries.data?.[0]||null,vehicles:vehicles.data||[]};return{...value,policy:editPolicy(value)};}
export async function saveShipmentEdit(shipment,changes){if(!shipment?.id||!shipment.updated_at)throw Error('Reload the shipment before saving.');const{data,error}=await supabase.rpc('office_edit_shipment',{p_shipment:shipment.id,p_expected:shipment.updated_at,p_data:changes});if(error)throw error;if(data?.id!==shipment.id||!data.updated_at)throw Error('The save was not confirmed. Reload before retrying.');return data;}
