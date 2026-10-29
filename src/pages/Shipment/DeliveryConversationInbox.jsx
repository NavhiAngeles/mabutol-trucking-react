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
  const [selected, setSelected] = useState(null), [opened, setOpened] = useState([]);
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
  const unread = rows?.reduce((total, row) => total + Number(row.unread), 0);
  // Read acknowledgments remove rows from the unread RPC. Keep opened threads accessible.
  const visibleThreads = rows ? [...rows, ...opened.filter(thread => !rows.some(row => `${row.delivery_id}:${row.driver_id}` === thread.key)).map(thread => ({ ...thread, unread: 0 }))] : [];
  return <section className="driver-messages-inbox" aria-label="Unread delivery conversations">
    <div className="driver-messages-inbox-header"><div className="driver-messages-inbox-title"><span className="conversation-inbox-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/></svg></span><div><h3>Driver messages {rows && <span className="conversation-unread">{unread} unread</span>}</h3><p>Delivery updates from your assigned drivers</p></div></div>
      <button type="button" className="conversation-inbox-refresh" onClick={() => setRevision(value => value + 1)}><span aria-hidden="true">↻</span> Refresh message inbox</button>
    </div>
    {error && <p className="conversation-feedback conversation-feedback-error" role="alert">{error}</p>}
    {!rows && !error && <p className="conversation-empty" role="status">Loading message inbox…</p>}
    {rows && visibleThreads.length === 0 && <p className="conversation-inbox-empty">You’re all caught up. Open a shipment’s delivery workflow to start a conversation.</p>}
    <div className="conversation-thread-list">{visibleThreads.map(row => {
      const key = `${row.delivery_id}:${row.driver_id}`;
      return <button type="button" className="conversation-thread" key={key} aria-haspopup="dialog" onClick={() => {
        setOpened(threads => threads.some(thread => thread.key === key) ? threads : [...threads, { ...row, key }]);
        setSelected(key);
      }}><span className="conversation-avatar" aria-hidden="true">D</span><span className="conversation-thread-copy"><strong>{row.tracking_number}</strong><span>{Number(row.unread) > 0 ? 'View driver conversation' : 'Continue conversation'}</span></span><span className="conversation-unread">{row.unread} unread</span><span className="conversation-thread-arrow" aria-hidden="true">→</span></button>;
    })}</div>
    {opened.map(thread => <DeliveryConversation key={thread.key} delivery={{ id: thread.delivery_id, driver_id: thread.driver_id, tracking_number: thread.tracking_number }} open={selected === thread.key} onClose={() => setSelected(null)} onRead={() => setRevision(value => value + 1)} hideTrigger />)}
  </section>;
}
