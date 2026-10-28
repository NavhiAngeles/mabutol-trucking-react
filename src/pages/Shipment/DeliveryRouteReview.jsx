import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { routeConfirmation } from '../../services/deliveryRouteConfirmation';

const fields=[['height','Truck height (m)'],['width','Truck width (m)'],['length','Truck length (m)'],['weight','Loaded gross weight (tonnes, including truck)'],['axleload','Maximum loaded axle weight (tonnes)']];
export default function DeliveryRouteReview({delivery,onSaved}) {
  const [context,setContext]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const lock=useRef(false);
  useEffect(()=>{let active=true;supabase.rpc('delivery_routing_context',{p_delivery:delivery.id}).then(({data,error:failure})=>{
    if(!active)return;if(failure){setError('Route records unavailable. Refresh to retry.');return;}
    setContext(data);setForm({...Object.fromEntries(['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'].map(key=>[key,data.shipment[key]??''])),...Object.fromEntries(fields.map(([key])=>[key,data.plan?.profile?.[key]??''])),hazmat:data.plan?.profile?.hazmat??'',reason:'',confirmed:false});
  }).catch(()=>{if(active)setError('Route records unavailable. Refresh to retry.');});return()=>{active=false;};},[delivery.id,revision]);
  const save=async()=>{
    if(lock.current || !form || !context)return;
    lock.current=true;setBusy(true);setError('');
    try {
      const {error:failure}=await supabase.functions.invoke('delivery-routing',{body:routeConfirmation(context,form)});
      if(failure)throw Error('Truck route was not saved. Check measurements and provider availability, then reload before retrying.');
      setRevision(value=>value+1);onSaved?.();
    }catch(failure){setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  return <section aria-label="Confirmed truck route" className="delivery-workflow-panel">
    <h4>Confirmed truck route</h4>
    <p>Use verified truck entrances and loaded vehicle measurements. No legacy pins are changed until you confirm and save. Quoted prices and the scheduled arrival remain unchanged.</p>
    {context?.plan && <p>Last confirmation: {new Date(context.plan.confirmed_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · {context.plan.reason}</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={()=>{setError('');setRevision(value=>value+1);}}>Reload truck route</button>
    {form && ['assigned','loading','in_transit'].includes(delivery.status) && <>
      <div className="delivery-workflow-grid">{[['pickup_lat','Pickup latitude'],['pickup_lng','Pickup longitude'],['dropoff_lat','Destination latitude'],['dropoff_lng','Destination longitude'],...fields].map(([key,label])=><label key={key}>{label}<input type="number" step="any" value={form[key]} disabled={busy} onChange={event=>setForm(previous=>({...previous,[key]:event.target.value,confirmed:false}))}/></label>)}</div>
      <label>Hazardous goods aboard<select value={String(form.hazmat)} disabled={busy} onChange={event=>setForm(previous=>({...previous,hazmat:event.target.value===''?'':event.target.value==='true',confirmed:false}))}><option value="">Choose a declaration</option><option value="false">No hazardous goods</option><option value="true">Hazardous goods aboard</option></select></label>
      <label>Office verification reason<textarea maxLength={1000} value={form.reason} disabled={busy} onChange={event=>setForm(previous=>({...previous,reason:event.target.value}))}/></label>
      <label className="delivery-route-confirmation"><input type="checkbox" checked={form.confirmed} disabled={busy} onChange={event=>setForm(previous=>({...previous,confirmed:event.target.checked}))}/> I verified both entrances, this assigned truck's loaded dimensions, gross/axle weights and hazardous-goods declaration.</label>
      <button type="button" disabled={busy || !form.confirmed || typeof form.hazmat!=='boolean' || form.reason.trim().length<5} onClick={save}>{busy?'Calculating truck route…':'Confirm pins and calculate truck route'}</button>
    </>}
    <p>Tanaw applies the supplied limits using OpenRouteService. Road data may be incomplete; obey road signs. Google Maps guidance may choose a different route and does not enforce this truck profile.</p>
  </section>;
}
