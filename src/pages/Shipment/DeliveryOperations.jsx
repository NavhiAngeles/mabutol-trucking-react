import { useEffect, useRef, useState } from 'react';
import { deliveryWorkflowService } from '../../services/deliveryWorkflowService';
import './deliveryWorkflow.css';
import DeliveryRouteReview from './DeliveryRouteReview';
import DeliveryConversation from './DeliveryConversation';
const service = deliveryWorkflowService();
const time = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded';
export default function DeliveryOperations({ shipmentId, shipmentStatus, onChanged }) {
  const [data,setData] = useState(null), [error,setError] = useState(''), [reason,setReason] = useState(''), [busy,setBusy] = useState(false), [proof,setProof] = useState(null), [revision,setRevision] = useState(0);
  const lock = useRef(false);
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),10000); return ()=>clearInterval(timer); },[]);
  useEffect(() => service.watch(shipmentId,()=>setRevision(value=>value+1)),[shipmentId]);
  useEffect(() => { let active=true; service.load(shipmentId).then(result => { if(active)setData(result); }).catch(err => {if(active)setError(err.message);}); return () => { active=false; }; },[shipmentId,revision]);
  // Signed links expire after five minutes; never retain an apparently working stale viewer.
  useEffect(() => { if(!proof)return; const timer=setTimeout(()=>setProof(null),290000); return ()=>clearTimeout(timer); },[proof]);
  const run = async operation => {
    if(lock.current)return; lock.current=true;setBusy(true);setError('');
    try { await operation();setReason('');setProof(null);setRevision(value=>value+1);onChanged?.(); }
    catch(err){setError(err.message || 'Action failed. Refresh before retrying.');setRevision(value=>value+1);}
    finally {lock.current=false;setBusy(false);}
  };
  return <section className="delivery-workflow-panel" aria-label="Delivery workflow">
    <h3>Delivery timeline and review</h3>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={()=>{setError('');setRevision(value=>value+1);}}>Refresh delivery workflow</button>
    {!data && !error && <p role="status">Loading delivery records…</p>}
    {data && <>
      <ol className="delivery-timeline">{data.events.map(event=><li key={event.id}><strong>{event.event_type.replaceAll('_',' ')}</strong><span>{time(event.occurred_at)}</span>{event.meta?.reason && <p>{event.meta.reason}</p>}</li>)}</ol>
      {data.position && <p>Last GPS: {time(data.position.recorded_at)} · accuracy {data.position.accuracy_m ?? 'unknown'} m · {now-Date.parse(data.position.recorded_at)>300000?'Stale location':'Recent location'}</p>}
      <h4>Recorded proof</h4>
      {!data.documents.length && <p>No proof documents submitted.</p>}
      {data.documents.map(doc=><button type="button" key={doc.id} disabled={busy} onClick={async()=>{try{setProof({url:await service.proofUrl(shipmentId,doc.id),label:`Attempt ${doc.proof_attempt} · ${doc.kind.replaceAll('_',' ')}`});}catch(err){setError(err.message);}}}>View attempt {doc.proof_attempt}: {doc.kind.replaceAll('_',' ')}</button>)}
      {proof && <figure><figcaption>{proof.label}</figcaption><img className="delivery-proof-image" src={proof.url} alt={proof.label} /><button type="button" onClick={()=>setProof(null)}>Close private proof</button></figure>}
      <label>Office review / resolution reason<textarea maxLength={1000} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} /></label>
      <h4>Incident evidence</h4>
      {!data.incident_evidence?.length && <p>No incident photos submitted.</p>}
      {data.incident_evidence?.map(photo=><div key={photo.id}>
        <p>{data.incidents.find(incident=>incident.id===photo.incident_id)?.description || 'Incident report'}</p>
        <button type="button" disabled={busy} onClick={async()=>{try{setProof({url:await service.evidenceUrl(shipmentId,'incident',photo.id),label:`Incident photo ${photo.slot}`});}catch(err){setError(err.message);}}}>View private incident photo {photo.slot}</button>
      </div>)}
      <h4>Trip expense review</h4>
      {!data.expenses?.length && <p>No expenses submitted.</p>}
      {data.expenses?.map(expense=><div key={expense.id} className="delivery-workflow-panel">
        <p>{expense.description || expense.category} · {Number(expense.amount).toLocaleString('en-PH',{style:'currency',currency:'PHP'})} · {expense.status}</p>
        <p>Submitted {time(expense.created_at)}{expense.reviewed_at && ` · Reviewed ${time(expense.reviewed_at)}`}</p>
        {expense.review_reason && <p>Office feedback: {expense.review_reason}</p>}
        {expense.receipt_path ? <button type="button" disabled={busy} onClick={async()=>{try{setProof({url:await service.evidenceUrl(shipmentId,'expense',expense.id),label:`Expense receipt · ${expense.description || expense.category}`});}catch(err){setError(err.message);}}}>View private receipt</button> : <p>No receipt attached.</p>}
        {expense.status==='pending' && <div className="booking-review-actions">
          <button type="button" disabled={busy || reason.trim().length<5} onClick={()=>run(()=>service.reviewExpense(expense,'approved',reason))}>Approve expense</button>
          <button type="button" disabled={busy || reason.trim().length<5} onClick={()=>run(()=>service.reviewExpense(expense,'rejected',reason))}>Reject expense</button>
        </div>}
      </div>)}
      {data.deliveries.filter(delivery=>delivery.status==='cancelled').map(delivery=><DeliveryConversation key={delivery.id} delivery={delivery} />)}
      {data.deliveries.filter(delivery=>delivery.status!=='cancelled').map(delivery=><div key={delivery.id} className="delivery-workflow-panel">
        <DeliveryRouteReview delivery={delivery} onSaved={()=>{setRevision(value=>value+1);onChanged?.();}} />
        <DeliveryConversation delivery={delivery} />
        <p>Delivery: {delivery.status.replaceAll('_',' ')} · Proof: {delivery.proof_review_status.replaceAll('_',' ')}</p>
        {delivery.proof_review_reason && <p>{delivery.proof_review_reason}</p>}
        {delivery.pickup_arrived_at && <p>Pickup arrival {time(delivery.pickup_arrived_at)} · Grace ends {time(delivery.grace_ends_at)} · Wait threshold {time(delivery.auto_cancel_at)}</p>}
        {shipmentStatus==='review' && delivery.proof_review_status==='pending_review' && <div className="booking-review-actions">
          <button type="button" disabled={busy || reason.trim().length<5} onClick={()=>run(()=>service.action(delivery,'request_correction',reason))}>Request corrected proof</button>
          <button type="button" className="btn-primary" disabled={busy || data.incidents.some(incident=>!incident.resolved_at)} onClick={()=>run(()=>service.action(delivery,'complete'))}>Confirm delivery completion</button>
        </div>}
        {delivery.status==='assigned' && delivery.pickup_arrived_at && !delivery.customer_showed_at && <button type="button" disabled={busy || reason.trim().length<5 || !delivery.auto_cancel_at || Date.parse(delivery.auto_cancel_at)>now} onClick={()=>run(()=>service.action(delivery,'cancel_no_show',reason))}>Confirm no-show cancellation</button>}
        {data.incidents.filter(incident=>!incident.resolved_at).map(incident=><div key={incident.id}><p>{incident.category}: {incident.description} · {incident.delay_minutes ?? 0} minutes</p><button type="button" disabled={busy || reason.trim().length<5} onClick={()=>run(()=>service.resolveIncident(incident,delivery,reason))}>Resolve incident</button></div>)}
      </div>)}
    </>}
  </section>;
}
