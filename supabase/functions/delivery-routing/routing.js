export function point(lat,lng) {
  return typeof lat==='number' && typeof lng==='number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? {lat,lng}:null;
}
export function truckProfile(value,cargoKg=0) {
  const limits={height:10,width:10,length:50,weight:200,axleload:100};
  if(!value || Object.entries(limits).some(([key,max])=>typeof value[key]!=='number' || !Number.isFinite(value[key]) || value[key]<=0 || value[key]>max) || typeof value.hazmat!=='boolean' || value.axleload>value.weight || value.weight*1000<=Number(cargoKg))throw Error('Verified height, width, length, loaded gross weight, axle load and hazardous-goods declaration are required.');
  return Object.fromEntries([...Object.keys(limits),'hazmat'].map(key=>[key,value[key]]));
}
export function confirmedPlan(context) {
  const {delivery:d,shipment:s,plan:p}=context;
  return !!(p && d && s && p.truck_id===d.truck_id && Number(p.cargo_weight_kg)===Number(s.weight_kg) && ['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'].every(key=>s[key]!=null && Number(s[key])===Number(p[key])) && JSON.stringify(s.route_geometry)===JSON.stringify(p.geometry));
}
export function etaContext(context,now=Date.now()) {
  const {delivery:d,shipment:s,position:p}=context;
  if(!confirmedPlan(context))return {reason:'Office must confirm the pins and loaded truck specifications.'};
  if(!['assigned','loading','in_transit'].includes(d.status) || ['completed','cancelled'].includes(s.status))return {reason:'This delivery is closed.'};
  if(!d.route_started_at)return {reason:'Start the route to enable GPS-based ETA.'};
  if(d.status==='loading' || (d.status==='assigned' && d.pickup_arrived_at))return {reason:'At pickup — departure time is not yet known.'};
  const age=now-Date.parse(p?.recorded_at);
  const origin=point(Number(p?.latitude),Number(p?.longitude));
  if(!p || p.latitude==null || p.longitude==null || !origin || !Number.isFinite(age) || age<0 || age>=120000 || p.accuracy_m==null || !Number.isFinite(Number(p.accuracy_m)) || Number(p.accuracy_m)>100 || Number(p.accuracy_m)<0)return {reason:'A GPS fix under two minutes old with accuracy within 100 m is required.'};
  const leg=d.status==='in_transit'?'destination':'pickup';
  const destination=point(Number(s[leg==='pickup'?'pickup_lat':'dropoff_lat']),Number(s[leg==='pickup'?'pickup_lng':'dropoff_lng']));
  return {leg,origin,destination};
}
export function decodePolyline(encoded) {
  if(typeof encoded!=='string' || encoded.length>200000)throw Error('Invalid road geometry.');
  let index=0,lat=0,lng=0;const coordinates=[];
  while(index<encoded.length) {
    const values=[];
    for(let dimension=0;dimension<2;dimension++) {
      let result=0,shift=0,byte;
      do {if(index>=encoded.length || shift>30)throw Error('Invalid road geometry.');byte=encoded.charCodeAt(index++)-63;if(byte<0 || byte>63)throw Error('Invalid road geometry.');result+=(byte&31)*2**shift;shift+=5;}while(byte>=32);
      values.push(result&1?~(result>>1):result>>1);
    }
    lat+=values[0];lng+=values[1];if(!point(lat/1e5,lng/1e5))throw Error('Invalid road coordinates.');coordinates.push([lng/1e5,lat/1e5]);
  }
  if(coordinates.length<2)throw Error('Road geometry is missing.');return coordinates;
}
export async function truckRoute({origin,destination,profile,key,fetcher=fetch}) {
  if(!origin || !destination)throw Error('Office-confirmed pins are required.');
  const restrictions=truckProfile(profile);
  key=key?.trim();
  if(key?.startsWith('https://')) {const url=new URL(key);if(!['api.heigit.org','api.openrouteservice.org'].includes(url.hostname))throw Error('Routing provider is not configured.');key=url.searchParams.get('api_key')?.trim();}
  if(!key)throw Error('Routing provider is not configured.');
  const response=await fetcher('https://api.heigit.org/openrouteservice/v2/directions/driving-hgv',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:key,'Content-Type':'application/json'},body:JSON.stringify({coordinates:[[origin.lng,origin.lat],[destination.lng,destination.lat]],instructions:false,geometry:true,extra_info:['waycategory'],options:{avoid_features:['ferries','fords'],vehicle_type:'hgv',profile_params:{restrictions}}})});
  if(!response.ok)throw Error('Truck routing provider unavailable. Retry without changing the confirmed route.');
  const data=await response.json();const route=data.routes?.[0],summary=route?.summary,categories=route?.extras?.waycategory?.values;
  if(!summary || !Number.isFinite(summary.duration) || !Number.isFinite(summary.distance) || summary.duration<0 || summary.distance<0 || !Array.isArray(categories) || !categories.length || categories.some(row=>!Array.isArray(row) || !Number.isInteger(row[2]) || (row[2]&24)!==0) || route.warnings?.length)throw Error('Provider could not verify a road-only truck route without warnings.');
  const coordinates=decodePolyline(route.geometry);
  const near=(coordinate,p)=>Math.hypot((coordinate[0]-p.lng)*Math.cos(p.lat*Math.PI/180),coordinate[1]-p.lat)*111320<=1000;
  if(!near(coordinates[0],origin)||!near(coordinates.at(-1),destination))throw Error('The provider could not match the confirmed pins within 1 km. Confirm the truck entrances with the office.');
  return {seconds:summary.duration,meters:summary.distance,geometry:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}]}};
}
