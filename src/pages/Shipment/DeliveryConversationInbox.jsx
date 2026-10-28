import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { deliveryConversationService } from '../../services/deliveryConversationService';
import DeliveryConversation from './DeliveryConversation';
import './deliveryWorkflow.css';

const service = deliveryConversationService(supabase);
export default function DeliveryConversationInbox() {
  const { user } = useAuth();
  return user && <Inbox key={user.id} />;
}
function Inbox() {
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const stop = service.watch('', refresh), timer = setInterval(refresh, 15000);
    return () => { stop(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    service.unread().then(result => { if (active) { setRows(result); setError(''); } }).catch(err => { if (active) { setRows(null); setError(err.message); } });
    return () => { active = false; };
  }, [revision]);
  return <section className="delivery-workflow-panel" aria-label="Unread delivery conversations">
    <h3>Driver messages{rows ? ` · ${rows.reduce((total, row) => total + Number(row.unread), 0)} unread` : ''}</h3>
    {error && <p role="alert">{error}</p>}
    {!rows && !error && <p role="status">Loading message inbox…</p>}
    <button type="button" onClick={() => setRevision(value => value + 1)}>Refresh message inbox</button>
    {rows?.length === 0 && <p>No unread driver messages. Open a shipment’s delivery workflow to start a conversation.</p>}
    {rows?.map(row => <button type="button" key={`${row.delivery_id}:${row.driver_id}`} onClick={() => setSelected({ id: row.delivery_id, driver_id: row.driver_id })}>{row.tracking_number} · {row.unread} unread</button>)}
    {selected && <><button type="button" onClick={() => setSelected(null)}>Close selected conversation</button><DeliveryConversation delivery={selected} /></>}
  </section>;
}
