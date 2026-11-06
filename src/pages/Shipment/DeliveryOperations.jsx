import { useCallback, useEffect, useRef, useState } from 'react';
import { deliveryWorkflowService } from '../../services/deliveryWorkflowService';
import './deliveryWorkflow.css';
import DeliveryRouteReview from './DeliveryRouteReview';
import DeliveryConversation from './DeliveryConversation';
const service = deliveryWorkflowService();
const time = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded';
export default function DeliveryOperations({ shipmentId, shipmentStatus, onChanged, shipmentRefreshVersion = 0 }) {
  const [data,setData] = useState(null), [loadError,setLoadError] = useState(''), [actionError,setActionError] = useState(''), [actionNotice,setActionNotice] = useState(''), [refreshing,setRefreshing] = useState(false), [refreshRequired,setRefreshRequired] = useState(false), [reason,setReason] = useState(''), [busy,setBusy] = useState(false), [proof,setProof] = useState(null), [revision,setRevision] = useState(0);
  const lock = useRef(false);
  const loadSequence = useRef(0);
  const refreshRequiredRef = useRef(false);
  const refreshBarrier = useRef(null);
  const lastShipmentRefresh = useRef(shipmentRefreshVersion);
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),10000); return ()=>clearInterval(timer); },[]);
  useEffect(() => service.watch(shipmentId,()=>{if(!lock.current)setRevision(value=>value+1);}),[shipmentId]);
  const completeRefreshBarrier = useCallback(() => {
    if (!refreshBarrier.current?.workflow || !refreshBarrier.current?.shipment) return;
    refreshBarrier.current = null;
    refreshRequiredRef.current = false;
    setRefreshRequired(false);
    setActionNotice('Action completed successfully. Delivery records and shipment details are current.');
  },[]);
  const requireFollowUpRefresh = () => {
    refreshBarrier.current = { workflow: false, shipment: false };
    refreshRequiredRef.current = true;
    setRefreshRequired(true);
  };
  const markShipmentRefreshed = () => {
    if (!refreshBarrier.current) return;
    refreshBarrier.current.shipment = true;
    completeRefreshBarrier();
  };
  useEffect(() => {
    if (shipmentRefreshVersion === lastShipmentRefresh.current) return;
    lastShipmentRefresh.current = shipmentRefreshVersion;
    if (refreshBarrier.current) {
      refreshBarrier.current.shipment = true;
      completeRefreshBarrier();
    }
  },[shipmentRefreshVersion,completeRefreshBarrier]);
  const refresh = useCallback(async () => {
    const request = ++loadSequence.current;
    setRefreshing(true);
    try {
      const result = await service.load(shipmentId);
      if (request !== loadSequence.current) return false;
      setData(result);
      setLoadError('');
      if (refreshBarrier.current) {
        refreshBarrier.current.workflow = true;
        completeRefreshBarrier();
      } else setActionNotice(previous => previous ? 'Action completed successfully. Refresh controls only reload data; they do not repeat the action.' : '');
      return true;
    } catch (err) {
      if (request === loadSequence.current) setLoadError(err.message || 'Could not refresh delivery records.');
      return false;
    } finally {
      if (request === loadSequence.current) setRefreshing(false);
    }
  },[shipmentId,completeRefreshBarrier]);
  useEffect(() => { refresh(); return () => { loadSequence.current++; }; },[refresh,revision]);
  // Signed links expire after five minutes; never retain an apparently working stale viewer.
  useEffect(() => { if(!proof)return; const timer=setTimeout(()=>setProof(null),290000); return ()=>clearTimeout(timer); },[proof]);
  const run = async operation => {
    if(lock.current || refreshRequiredRef.current)return; lock.current=true;setBusy(true);setActionError('');setActionNotice('');
    try {
      try { await operation(); }
      catch(err) { setActionError(err.message || 'Action failed. Refresh the records before trying again.'); await refresh(); return; }
      requireFollowUpRefresh();
      setReason('');setProof(null);setActionNotice('Action completed. Refreshing delivery records and shipment details…');
      const [workflowLoaded, shipmentLoaded] = await Promise.all([
        refresh(),
        Promise.resolve().then(() => onChanged?.({ preserve: true })).then(result => { const succeeded = result !== false; if (succeeded) markShipmentRefreshed(); return succeeded; }).catch(() => false),
      ]);
      if (workflowLoaded && shipmentLoaded && !refreshRequiredRef.current) setActionNotice('Action completed successfully. Delivery records and shipment details are current.');
      else setActionNotice('Action completed successfully, but follow-up data is not fully refreshed. Retry the read-only refreshes before taking another action; this action was not repeated.');
    } finally {lock.current=false;setBusy(false);}
  };
  return <section className="delivery-workflow-panel" aria-label="Delivery workflow">
    <h3>Delivery timeline and review</h3>
    {loadError && <p role="alert">{loadError}{data && ' Showing the last successfully loaded delivery records.'}</p>}
    {actionError && <p role="alert">{actionError}</p>}
    {actionNotice && <p role="status">{actionNotice}</p>}
    <button type="button" disabled={busy || refreshing} onClick={()=>refresh()}>{refreshing ? 'Refreshing delivery workflow…' : loadError ? 'Retry delivery refresh' : 'Refresh delivery workflow'}</button>
    {refreshing && <p role="status">{data ? 'Refreshing delivery records; the last successfully loaded snapshot remains visible.' : 'Loading delivery records…'}</p>}
    {!data && loadError && <p role="status">Delivery records are unavailable until a refresh succeeds.</p>}
    {data && <>
      <ol className="delivery-timeline">{data.events.map(event=><li key={event.id}><strong>{event.event_type.replaceAll('_',' ')}</strong><span>{time(event.occurred_at)}</span>{event.meta?.reason && <p>{event.meta.reason}</p>}</li>)}</ol>
      {data.position && <p>Last GPS: {time(data.position.recorded_at)} · accuracy {data.position.accuracy_m ?? 'unknown'} m · {now-Date.parse(data.position.recorded_at)>300000?'Stale location':'Recent location'}</p>}
      <h4>Recorded proof</h4>
      {!data.documents.length && <p>No proof documents submitted.</p>}
      {data.documents.map(doc=><button type="button" key={doc.id} disabled={busy} onClick={async()=>{try{setProof({url:await service.proofUrl(shipmentId,doc.id),label:`Attempt ${doc.proof_attempt} · ${doc.kind.replaceAll('_',' ')}`});setActionError('');}catch(err){setActionError(err.message || 'Could not open recorded proof.');}}}>View attempt {doc.proof_attempt}: {doc.kind.replaceAll('_',' ')}</button>)}
      {proof && <figure><figcaption>{proof.label}</figcaption><img className="delivery-proof-image" src={proof.url} alt={proof.label} /><button type="button" onClick={()=>setProof(null)}>Close private proof</button></figure>}
      <label>Office review / resolution reason<textarea maxLength={1000} value={reason} disabled={busy || refreshRequired} onChange={event=>setReason(event.target.value)} /></label>
      <h4>Incident evidence</h4>
      {!data.incident_evidence?.length && <p>No incident photos submitted.</p>}
      {data.incident_evidence?.map(photo=><div key={photo.id}>
        <p>{data.incidents.find(incident=>incident.id===photo.incident_id)?.description || 'Incident report'}</p>
        <button type="button" disabled={busy} onClick={async()=>{try{setProof({url:await service.evidenceUrl(shipmentId,'incident',photo.id),label:`Incident photo ${photo.slot}`});setActionError('');}catch(err){setActionError(err.message || 'Could not open incident evidence.');}}}>View private incident photo {photo.slot}</button>
      </div>)}
      <h4>Trip expense review</h4>
      {!data.expenses?.length && <p>No expenses submitted.</p>}
      {data.expenses?.map(expense=><div key={expense.id} className="delivery-workflow-panel">
        <p>{expense.description || expense.category} · {Number(expense.amount).toLocaleString('en-PH',{style:'currency',currency:'PHP'})} · {expense.status}</p>
        <p>Submitted {time(expense.created_at)}{expense.reviewed_at && ` · Reviewed ${time(expense.reviewed_at)}`}</p>
        {expense.review_reason && <p>Office feedback: {expense.review_reason}</p>}
        {expense.receipt_path ? <button type="button" disabled={busy} onClick={async()=>{try{setProof({url:await service.evidenceUrl(shipmentId,'expense',expense.id),label:`Expense receipt · ${expense.description || expense.category}`});setActionError('');}catch(err){setActionError(err.message || 'Could not open the expense receipt.');}}}>View private receipt</button> : <p>No receipt attached.</p>}
        {expense.status==='pending' && <div className="booking-review-actions">
          <button type="button" disabled={busy || refreshRequired || reason.trim().length<5} onClick={()=>run(()=>service.reviewExpense(expense,'approved',reason))}>Approve expense</button>
          <button type="button" disabled={busy || refreshRequired || reason.trim().length<5} onClick={()=>run(()=>service.reviewExpense(expense,'rejected',reason))}>Reject expense</button>
        </div>}
      </div>)}
      {data.deliveries.filter(delivery=>delivery.status==='cancelled').map(delivery=><DeliveryConversation key={delivery.id} delivery={delivery} />)}
      {data.deliveries.filter(delivery=>delivery.status!=='cancelled').map(delivery=><div key={delivery.id} className="delivery-workflow-panel">
        <DeliveryRouteReview delivery={delivery} actionBlocked={refreshRequired} onSaved={async()=>{requireFollowUpRefresh();setActionNotice('Route confirmation completed. Refreshing delivery records and shipment details…');setRevision(value=>value+1);const result=await onChanged?.({preserve:true});if(result!==false)markShipmentRefreshed();if(refreshRequiredRef.current)setActionNotice('Route confirmation succeeded, but follow-up data is not fully refreshed. Retry read-only refreshes before resubmitting the route.');}} />
        <DeliveryConversation delivery={delivery} />
        <p>Delivery: {delivery.status.replaceAll('_',' ')} · Proof: {delivery.proof_review_status.replaceAll('_',' ')}</p>
        {delivery.proof_review_reason && <p>{delivery.proof_review_reason}</p>}
        {delivery.pickup_arrived_at && <p>Pickup arrival {time(delivery.pickup_arrived_at)} · Grace ends {time(delivery.grace_ends_at)} · Wait threshold {time(delivery.auto_cancel_at)}</p>}
        {shipmentStatus==='review' && delivery.proof_review_status==='pending_review' && <div className="booking-review-actions">
          <button type="button" disabled={busy || refreshRequired || reason.trim().length<5} onClick={()=>run(()=>service.action(delivery,'request_correction',reason))}>Request corrected proof</button>
          <button type="button" className="btn-primary" disabled={busy || refreshRequired || data.incidents.some(incident=>!incident.resolved_at)} onClick={()=>run(()=>service.action(delivery,'complete'))}>Confirm delivery completion</button>
        </div>}
        {delivery.status==='assigned' && delivery.pickup_arrived_at && !delivery.customer_showed_at && <button type="button" disabled={busy || refreshRequired || reason.trim().length<5 || !delivery.auto_cancel_at || Date.parse(delivery.auto_cancel_at)>now} onClick={()=>run(()=>service.action(delivery,'cancel_no_show',reason))}>Confirm no-show cancellation</button>}
        {data.incidents.filter(incident=>!incident.resolved_at).map(incident=><div key={incident.id}><p>{incident.category}: {incident.description} · {incident.delay_minutes ?? 0} minutes</p><button type="button" disabled={busy || refreshRequired || reason.trim().length<5} onClick={()=>run(()=>service.resolveIncident(incident,delivery,reason))}>Resolve incident</button></div>)}
      </div>)}
    </>}
  </section>;
}
