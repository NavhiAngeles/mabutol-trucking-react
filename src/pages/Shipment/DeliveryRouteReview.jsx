import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { initialRouteProfile, routeConfirmation } from '../../services/deliveryRouteConfirmation';
import VisualRoutePinPicker from '../../components/LocationPicker/VisualRoutePinPicker';

const fields=[['height','Truck height (m)'],['width','Truck width (m)'],['length','Truck length (m)'],['weight','Loaded gross weight (tonnes, including truck)'],['axleload','Maximum loaded axle weight (tonnes)']];
export default function DeliveryRouteReview({delivery,onSaved,actionBlocked=false}) {
  const [context,setContext]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saveNeedsRefresh,setSaveNeedsRefresh]=useState(false),[revision,setRevision]=useState(0);
  const lock=useRef(false);
  useEffect(()=>{let active=true;supabase.rpc('delivery_routing_context',{p_delivery:delivery.id}).then(({data,error:failure})=>{
    if(!active)return;if(failure){setError('Route records unavailable. Refresh to retry.');return;}
    setError('');setSaveNeedsRefresh(false);
    const profile=initialRouteProfile(data);
    setContext(data);setForm({...Object.fromEntries(['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'].map(key=>[key,data.shipment[key]??''])),height:profile.height,width:profile.width,length:profile.length,weight:profile.weight,axleload:profile.axleload,prefilledFromTruck:profile.prefilledFromTruck,hazmat:data.plan?.profile?.hazmat??'',reason:'',confirmed:false});
  }).catch(()=>{if(active)setError('Route records unavailable. Refresh to retry.');});return()=>{active=false;};},[delivery.id,revision]);
  const save=async()=>{
    if(lock.current || actionBlocked || !form || !context)return;
    lock.current=true;setBusy(true);setError('');
    try {
      const {error:failure}=await supabase.functions.invoke('delivery-routing',{body:routeConfirmation(context,form)});
      if(failure)throw Error('Truck route was not saved. Check measurements and provider availability, then reload before retrying.');
      setSaveNeedsRefresh(true);
      setRevision(value=>value+1);onSaved?.();
    }catch(failure){setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  return <section aria-label="Confirmed truck route" className="delivery-workflow-panel">
    <h4>Confirmed truck route</h4>
    <p>Use verified truck entrances and loaded vehicle measurements. No legacy pins are changed until you confirm and save. Quoted prices and the scheduled arrival remain unchanged.</p>
    {context?.plan && <p>Last confirmation: {new Date(context.plan.confirmed_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · {context.plan.reason}</p>}
    {!context?.plan && form?.prefilledFromTruck && <p className="delivery-route-prefill-note">Pre-filled from {context?.truck?.plate_number ? `truck ${context.truck.plate_number}` : 'assigned truck specifications'}. Verify actual loaded dimensions and weights before confirming.</p>}
    {actionBlocked && <p role="status">Route updates are paused until delivery records and shipment details refresh successfully.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={()=>{setError('');setRevision(value=>value+1);}}>Reload truck route</button>
    {form && ['assigned','loading','in_transit'].includes(delivery.status) && <>
      <h5 className="delivery-route-subheading">Verified truck entrances</h5>
      <VisualRoutePinPicker
        idPrefix={`route-${delivery.id}`}
        defaultMapStyle="satellite"
        origin={{
          lat: form.pickup_lat,
          lng: form.pickup_lng,
          label: 'Pickup entrance',
          badge: 'P',
          addressHint: context?.shipment?.pickup_address || '',
        }}
        destination={{
          lat: form.dropoff_lat,
          lng: form.dropoff_lng,
          label: 'Delivery entrance',
          badge: 'D',
          addressHint: context?.shipment?.dropoff_address || '',
        }}
        routeGeometry={context?.shipment?.route_geometry || context?.plan?.geometry || null}
        disabled={busy}
        onChangePoint={(slot, point) =>
          setForm(previous => ({
            ...previous,
            ...(slot === 'origin'
              ? { pickup_lat: point.lat, pickup_lng: point.lng }
              : { dropoff_lat: point.lat, dropoff_lng: point.lng }),
            confirmed: false,
          }))
        }
      />
      <h5 className="delivery-route-subheading">Loaded vehicle measurements</h5>
      <div className="delivery-workflow-grid">{fields.map(([key,label])=><label key={key} htmlFor={`route-${delivery.id}-${key}`}>{label}<input id={`route-${delivery.id}-${key}`} type="number" step="any" value={form[key]} disabled={busy} onChange={event=>setForm(previous=>({...previous,[key]:event.target.value,confirmed:false}))}/></label>)}</div>
      <label htmlFor={`route-${delivery.id}-hazmat`}>Hazardous goods aboard<select id={`route-${delivery.id}-hazmat`} value={String(form.hazmat)} disabled={busy} onChange={event=>setForm(previous=>({...previous,hazmat:event.target.value===''?'':event.target.value==='true',confirmed:false}))}><option value="">Choose a declaration</option><option value="false">No hazardous goods</option><option value="true">Hazardous goods aboard</option></select></label>
      <label htmlFor={`route-${delivery.id}-reason`}>Office verification reason<textarea id={`route-${delivery.id}-reason`} maxLength={1000} value={form.reason} disabled={busy} onChange={event=>setForm(previous=>({...previous,reason:event.target.value}))}/></label>
      <label className="delivery-route-confirmation" htmlFor={`route-${delivery.id}-confirmed`}><input id={`route-${delivery.id}-confirmed`} type="checkbox" checked={form.confirmed} disabled={busy} onChange={event=>setForm(previous=>({...previous,confirmed:event.target.checked}))}/> I verified both entrances, this assigned truck's loaded dimensions, gross/axle weights and hazardous-goods declaration.</label>
      <button type="button" disabled={busy || actionBlocked || saveNeedsRefresh || !form.confirmed || typeof form.hazmat!=='boolean' || form.reason.trim().length<5} onClick={save}>{busy?'Calculating truck route…':actionBlocked || saveNeedsRefresh?'Refresh records before route update':'Confirm pins and calculate truck route'}</button>
    </>}
    <p>Tanaw applies the supplied limits using OpenRouteService. Road data may be incomplete; obey road signs. Google Maps guidance may choose a different route and does not enforce this truck profile.</p>
  </section>;
}
