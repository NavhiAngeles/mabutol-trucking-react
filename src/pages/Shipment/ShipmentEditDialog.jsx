import { useEffect, useRef, useState } from 'react';
import { fetchShipmentForEdit, saveShipmentEdit } from '../../services/shipmentEditService';
import { parsePhilippineDeparture, validateDeparture } from './departureSchedule';
import ShipmentDiscardDialog from './ShipmentDiscardDialog';

const civil=value=>value&&Number.isFinite(Date.parse(value))?new Date(Date.parse(value)+8*3600000).toISOString().slice(0,16):'';
const draftOf=row=>{const when=civil(row.scheduled_departure);return{cargo_description:row.cargo_description||'',weight_kg:String(row.weight_kg??''),requested_vehicle_type_id:row.requested_vehicle_type_id||'',special_handling:row.special_handling||'',date:when.slice(0,10),time:when.slice(11,16),driver_notes:row.driver_notes||''};};

export default function ShipmentEditDialog({shipment,onClose,onSaved}){
 const[record,setRecord]=useState(null),[draft,setDraft]=useState(null),[baseline,setBaseline]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[discard,setDiscard]=useState(false),[revision,setRevision]=useState(0);
 const dialog=useRef(null),busy=useRef(false);
 useEffect(()=>{let active=true;fetchShipmentForEdit(shipment.dbId).then(row=>{if(active){const next=draftOf(row);setRecord(row);setDraft(next);setBaseline(JSON.stringify(next));}}).catch(err=>active&&setError(err.message||'Could not load shipment.')).finally(()=>active&&setLoading(false));return()=>{active=false};},[shipment.dbId,revision]);
 useEffect(()=>{dialog.current?.focus();},[]);
 const dirty=draft&&JSON.stringify(draft)!==baseline;
 const close=()=>dirty?setDiscard(true):onClose();
 const reload=()=>{setRecord(null);setDraft(null);setError('');setNotice('');setLoading(true);setRevision(value=>value+1);};
 const set=key=>event=>setDraft(value=>({...value,[key]:event.target.value}));
 const save=async()=>{if(busy.current||!record||!draft||!dirty)return;setError('');setNotice('');const changes={};
  for(const key of record.policy.fields){if(key==='scheduled_departure'){const problem=validateDeparture(draft.date,draft.time);if(problem){setError(problem);return;}changes[key]=parsePhilippineDeparture(draft.date,draft.time).toISOString();}else if(key==='weight_kg')changes[key]=Number(draft[key]);else changes[key]=draft[key];}
  busy.current=true;setSaving(true);try{const result=await saveShipmentEdit(record,changes);setRecord(value=>({...value,updated_at:result.updated_at}));setBaseline(JSON.stringify(draft));setNotice(result.quotation_invalidated?'Saved. The previous quotation was cleared; prepare a new quote before approval.':'Shipment changes saved.');await onSaved(result);}catch(err){setError(err.message||'Could not save. Reload the shipment before retrying.');}finally{busy.current=false;setSaving(false);}};
 return <div className="booking-review-backdrop"><div className="booking-review-dialog shipment-edit-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="shipment-edit-title" aria-busy={loading||saving} onKeyDown={event=>{if(event.key==='Escape'&&!saving){event.preventDefault();close();}}}>
  <h2 id="shipment-edit-title">Edit shipment {record?.tracking_number||shipment.id}</h2>
  {loading&&<p role="status">Loading current shipment…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {record&&!loading&&<>{!record.policy.editable?<p>{record.policy.reason}</p>:<><p>{record.policy.reason}</p><div className="shipment-edit-grid">
   {record.policy.fields.includes('cargo_description')&&<label>Cargo description<input value={draft.cargo_description} maxLength={500} onChange={set('cargo_description')}/></label>}
   {record.policy.fields.includes('weight_kg')&&<label>Weight (kg)<input type="number" min="2000" max="4000" value={draft.weight_kg} onChange={set('weight_kg')}/></label>}
   {record.policy.fields.includes('requested_vehicle_type_id')&&<label>Vehicle type<select value={draft.requested_vehicle_type_id} onChange={set('requested_vehicle_type_id')}>{record.vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {Number(v.default_capacity_kg).toLocaleString()} kg</option>)}</select></label>}
   {record.policy.fields.includes('scheduled_departure')&&<><label>Departure date<input type="date" value={draft.date} onChange={set('date')}/></label><label>Departure time (Philippines)<input type="time" value={draft.time} onChange={set('time')}/></label></>}
   {record.policy.fields.includes('special_handling')&&<label className="shipment-edit-wide">Special handling<textarea value={draft.special_handling} maxLength={1000} onChange={set('special_handling')}/></label>}
   {record.policy.fields.includes('driver_notes')&&<label className="shipment-edit-wide">Driver instructions<textarea value={draft.driver_notes} maxLength={1000} onChange={set('driver_notes')}/></label>}
  </div></>}</>}
  <div className="booking-review-actions"><button type="button" disabled={saving} onClick={close}>Close</button><button type="button" disabled={saving||loading} onClick={reload}>Reload</button><button type="button" className="btn-primary" disabled={saving||loading||!record?.policy.editable||!dirty} onClick={save}>{saving?'Saving…':'Save changes'}</button></div>
  {discard&&<ShipmentDiscardDialog title="Discard shipment changes?" description="Your edits have not been saved. Closing now will discard them." discardLabel="Discard changes" onKeepEditing={()=>setDiscard(false)} onDiscard={onClose}/>}</div></div>;
}
