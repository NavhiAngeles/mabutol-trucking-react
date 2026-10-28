import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { deliveryConversationService, PendingDeliveryMessage } from '../../services/deliveryConversationService';

const service = deliveryConversationService(supabase);
const time = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

export default function DeliveryConversation({ delivery }) {
  const { user } = useAuth();
  return user && <Conversation key={`${user.id}:${delivery.id}:${delivery.driver_id}`} delivery={delivery.id} driver={delivery.driver_id} />;
}

function Conversation({ delivery, driver }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(null), [before, setBefore] = useState(null);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [unread, setUnread] = useState(null), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  const [sender] = useState(() => new PendingDeliveryMessage({ send: (id, request, body) => service.send(id, request, body, driver) }, delivery));
  const [pending, setPending] = useState(false);
  const alive = useRef(true), version = useRef(0), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const stop = service.watch(delivery, refresh), timer = setInterval(refresh, 15000);
    return () => { stop(); clearInterval(timer); };
  }, [delivery]);
  useEffect(() => {
    let active = true;
    service.unread().then(rows => { if (active) setUnread(rows.find(row => row.delivery_id === delivery)?.unread || 0); }).catch(() => { if (active) setUnread(null); });
    return () => { active = false; };
  }, [delivery, revision]);
  useEffect(() => {
    if (!open) return;
    let active = true; const request = ++version.current;
    service.load(delivery, before).then(result => {
      if (result.driver_id !== driver) throw Error('Driver assignment changed. Close this conversation and refresh the shipment before sending.');
      if (active && request === version.current) { setPage(result); setError(''); }
    })
      .catch(err => { if (active) { setPage(null); setError(err.message); } });
    return () => { active = false; };
  }, [delivery, driver, open, before, revision]);
  const run = async action => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { if (alive.current) setError(err.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="delivery-workflow-panel" aria-label="Delivery conversation">
    <button type="button" onClick={() => setOpen(value => !value)}>{open ? 'Close' : 'Open'} dispatcher–driver conversation · {unread === null ? 'Unread unavailable' : `${unread} unread`}</button>
    {open && <>
      <p>Messages are shared with this delivery’s current driver and authorized office staff. Use your normal emergency contact for urgent help.</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Retry / refresh messages</button>
      {before && <button type="button" disabled={busy} onClick={() => { setPage(null); setBefore(null); }}>Latest messages</button>}
      {!page && !error && <p role="status">Loading messages…</p>}
      {page && <>
        {page.has_more && <button type="button" disabled={busy} onClick={() => { setBefore(page.messages[0].id); setPage(null); }}>Older messages</button>}
        {!page.messages.length && <p>No messages yet.</p>}
        <ol className="delivery-conversation-messages">{page.messages.map(message => <li key={message.id}><strong>{message.sender_role === 'driver' ? 'Driver' : 'Office'}</strong> · <time>{time(message.created_at)}</time><p>{message.body}</p></li>)}</ol>
        <button type="button" disabled={busy || !page.messages.length} onClick={() => run(async () => {
          await service.read(delivery, page.messages.map(message => message.id));
          if (alive.current) { setNotice('Displayed messages marked read.'); setRevision(value => value + 1); }
        })}>Mark displayed messages read</button>
        {!page.can_send && <p>This delivery conversation is read-only.</p>}
      </>}
      <label>Message to driver<textarea maxLength={4000} value={draft} disabled={busy || pending || !page?.can_send} onChange={event => setDraft(event.target.value)} /></label>
      {pending && <p>The last send is unconfirmed. Retry the same message to confirm it without creating a duplicate.</p>}
      <button type="button" disabled={busy || (!pending && (!draft.trim() || !page?.can_send))} onClick={() => run(async () => {
        try { await sender.send(draft); } finally { if (alive.current) setPending(!!sender.pending); }
        if (alive.current) { setDraft(''); setNotice('Message sent.'); setBefore(null); setRevision(value => value + 1); }
      })}>{busy ? 'Working…' : pending ? 'Retry send' : 'Send message'}</button>
    </>}
  </section>;
}
