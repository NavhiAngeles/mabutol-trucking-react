import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.114.0';
import { point,truckProfile,confirmedPlan,etaContext,truckRoute } from './routing.js';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  try {
    const authorization=request.headers.get('Authorization');if(!authorization)return json({error:'Sign in to access routing.'},401);
    const caller=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}}});
    const {data:identity,error:authError}=await caller.auth.getUser();if(authError || !identity?.user)return json({error:'Sign in to access routing.'},401);
    const input=await request.json();if(!['confirm','eta'].includes(input.mode) || typeof input.delivery_id!=='string')return json({error:'Invalid routing request.'},400);
    const {data:context,error}=await caller.rpc('delivery_routing_context',{p_delivery:input.delivery_id});
    if(error || !context)return json({error:'This delivery is unavailable to your account.'},403);
    const {data:profile}=await caller.from('users').select('role,is_active').eq('id',identity.user.id).single();
    if(!profile?.is_active || !['admin','staff','driver'].includes(profile.role))return json({error:'An active driver or office account is required.'},403);
    const service=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if(input.mode==='confirm') {
      if(!['admin','staff'].includes(profile.role))return json({error:'Only the office can confirm route pins and truck specifications.'},403);
      if(input.expected!==context.delivery.updated_at || input.shipment_expected!==context.shipment.updated_at || !['assigned','loading','in_transit'].includes(context.delivery.status) || ['completed','cancelled'].includes(context.shipment.status))return json({error:'Assignment changed. Reload before confirming its route.'},409);
      if(input.confirmed!==true || typeof input.reason!=='string' || input.reason.trim().length<5 || input.reason.trim().length>1000)return json({error:'Confirm the pins, truck measurements and verification reason.'},400);
      const restrictions=truckProfile(input.profile,context.shipment.weight_kg);
      const origin=point(input.pickup_lat,input.pickup_lng),destination=point(input.dropoff_lat,input.dropoff_lng);
      if(!origin || !destination || (origin.lat===destination.lat && origin.lng===destination.lng))return json({error:'Confirm two distinct valid pins.'},400);
      const road=await truckRoute({origin,destination,profile:restrictions,key:Deno.env.get('ORS_API_KEY')});
      if(road.seconds<=0 || road.meters<=0)return json({error:'A nonzero truck route is required.'},422);
      const result=await service.rpc('store_confirmed_delivery_route',{p_actor:identity.user.id,p_delivery:input.delivery_id,p_expected:input.expected,p_shipment_expected:input.shipment_expected,p_data:{...input,truck_id:context.delivery.truck_id,profile:restrictions,geometry:road.geometry,distance_km:road.meters/1000,duration_minutes:road.seconds/60}});
      if(result.error)return json({error:'Route was not saved. Reload the assignment; its version or measurements may have changed.'},409);
      return json({plan:result.data});
    }
    const status=etaContext(context),base={route_verified:confirmedPlan(context),plan:context.plan,source:'OpenRouteService driving-hgv · truck limits applied · no live traffic'};
    if(status.reason)return json({...base,reason:status.reason});
    truckProfile(context.plan.profile,context.shipment.weight_kg);
    const cached=context.eta;
    if(cached && cached.plan_version===context.plan.version && cached.leg===status.leg && Date.now()-Date.parse(cached.calculated_at)<60000 && Date.parse(cached.expires_at)>Date.now())return json({...base,...cached});
    const road=await truckRoute({...status,profile:context.plan.profile,key:Deno.env.get('ORS_API_KEY')});
    const result=await service.rpc('store_delivery_route_eta',{p_actor:identity.user.id,p_delivery:input.delivery_id,p_version:context.plan.version,p_leg:status.leg,p_position:context.position.recorded_at,p_seconds:road.seconds,p_distance:road.meters});
    if(result.error)return json({...base,reason:'GPS, assignment or route changed. Refresh to recalculate.'});
    return json({...base,...result.data});
  }catch{return json({error:'Truck route or ETA unavailable. Verify the measurements and connection, then retry.'},502);}
});
