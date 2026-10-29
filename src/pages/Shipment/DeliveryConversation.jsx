import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { deliveryConversationService, PendingDeliveryMessage } from '../../services/deliveryConversationService';
import './deliveryConversation.css';

const service = deliveryConversationService(supabase);
const time = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

export default function DeliveryConversation({ delivery, ...props }) {
  const { user } = useAuth();
  return user && <Conversation key={`${user.id}:${delivery.id}:${delivery.driver_id}`} delivery={delivery.id} driver={delivery.driver_id} trackingNumber={delivery.tracking_number} {...props} />;
}

function Conversation({ delivery, driver, trackingNumber, open: controlledOpen, onClose, onRead, hideTrigger = false }) {
  const [localOpen, setOpen] = useState(false), [page, setPage] = useState(null), [before, setBefore] = useState(null);
  const open = controlledOpen ?? localOpen;
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [unread, setUnread] = useState(null), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  const [sender] = useState(() => new PendingDeliveryMessage({ send: (id, request, body) => service.send(id, request, body, driver) }, delivery));
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState('');
  const alive = useRef(true), version = useRef(0), lock = useRef(false);
  const acknowledged = useRef(new Set()), unreadVersion = useRef(0);
  const notifyRead = useRef(onRead);
  const dialog = useRef(null);
  const close = () => { setOpen(false); onClose?.(); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { notifyRead.current = onRead; }, [onRead]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.querySelector('.conversation-inbox-refresh')?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (hideTrigger && !open) return;
    const refresh = () => setRevision(value => value + 1);
    const stop = service.watch(delivery, refresh), timer = setInterval(refresh, 15000);
    return () => { stop(); clearInterval(timer); };
  }, [delivery, hideTrigger, open]);
  useEffect(() => {
    if (hideTrigger && !open) return;
    let active = true;
    const request = ++unreadVersion.current;
    service.unread().then(rows => { if (active && request === unreadVersion.current) setUnread(rows.find(row => row.delivery_id === delivery)?.unread || 0); }).catch(() => { if (active && request === unreadVersion.current) setUnread(null); });
    return () => { active = false; };
  }, [delivery, revision, hideTrigger, open]);
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
  useEffect(() => {
    if (!open || !page || page.driver_id !== driver) return;
    let active = true, reading = false;
    const markDisplayedRead = async () => {
      if (reading || document.visibilityState === 'hidden') return;
      const ids = page.messages.map(message => message.id).filter(id => !acknowledged.current.has(id));
      if (!ids.length) return;
      reading = true;
      try {
        await service.read(delivery, ids);
        if (!active) return;
        ids.forEach(id => acknowledged.current.add(id));
        setReadError('');
        const request = ++unreadVersion.current;
        notifyRead.current?.();
        try {
          const rows = await service.unread();
          if (active && request === unreadVersion.current) setUnread(rows.find(row => row.delivery_id === delivery)?.unread || 0);
        } catch { if (active && request === unreadVersion.current) setUnread(null); }
      } catch {
        if (active) setReadError('Messages loaded, but their read status could not be updated. Retry when connected.');
      } finally { reading = false; }
    };
    void markDisplayedRead();
    document.addEventListener('visibilitychange', markDisplayedRead);
    return () => { active = false; document.removeEventListener('visibilitychange', markDisplayedRead); };
  }, [delivery, driver, open, page, revision]);
  const run = async action => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { if (alive.current) setError(err.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <>
    {!hideTrigger && <button type="button" className="conversation-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span className="conversation-avatar" aria-hidden="true">D</span>
      <span className="conversation-launcher-copy"><strong>Driver conversation</strong><span>Open messages for this delivery</span></span>
      <span className="conversation-unread">{unread === null ? 'Unread unavailable' : `${unread} unread`}</span><span aria-hidden="true">→</span>
    </button>}
    <dialog ref={dialog} className="driver-message-drawer" aria-labelledby={`conversation-title-${delivery}`} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); return; }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const element = event.currentTarget;
      const controls = Array.from(element.querySelectorAll('button:not(:disabled), textarea:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    }} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    {open && <div className="conversation-drawer-layout">
      <header className="conversation-drawer-header">
        <div className="conversation-header-top"><span className="conversation-eyebrow">DRIVER MESSAGES</span><button type="button" className="conversation-icon-button" aria-label="Close conversation" onClick={close}>×</button></div>
        <div className="conversation-heading"><span className="conversation-avatar" aria-hidden="true">D</span><div><h2 id={`conversation-title-${delivery}`}>{trackingNumber || 'Delivery conversation'}</h2><p>Office ↔ Assigned driver</p></div></div>
        <div className="conversation-header-meta"><span className="conversation-unread">{unread === null ? 'Unread unavailable' : `${unread} unread`}</span><span>Delivery messages · Philippine time</span></div>
      </header>
      <div className="conversation-toolbar">
        <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}><span aria-hidden="true">↻</span> Retry / refresh messages</button>
        {before && <button type="button" disabled={busy} onClick={() => { setPage(null); setBefore(null); }}>Latest messages</button>}
      </div>
      <div className="conversation-history">
      <p className="conversation-privacy">Only this delivery’s assigned driver and authorized office staff can access this conversation.</p>
      {error && <p className="conversation-feedback conversation-feedback-error" role="alert">{error}</p>}{notice && <p className="conversation-feedback" role="status">{notice}</p>}
      {!page && !error && <p className="conversation-empty" role="status">Loading messages…</p>}
      {page && <>
        {page.has_more && <button type="button" className="conversation-older" disabled={busy} onClick={() => { setBefore(page.messages[0].id); setPage(null); }}>Older messages</button>}
        {!page.messages.length && <div className="conversation-empty"><strong>No messages yet.</strong><p>Send the driver an update about this delivery.</p></div>}
        <ol className="conversation-message-list" aria-label="Conversation messages">{page.messages.map(message => <li key={message.id} className={`conversation-message ${message.sender_role === 'driver' ? 'from-driver' : 'from-office'}`}>
          <div className="conversation-message-meta"><strong>{message.sender_role === 'driver' ? 'Driver' : 'Office'}</strong><time dateTime={message.created_at}>{time(message.created_at)}</time></div><p>{message.body}</p>
        </li>)}</ol>
      </>}
      </div>
      <footer className="conversation-composer">
        {readError && <div className="conversation-feedback conversation-feedback-error" role="alert">{readError}<button type="button" onClick={() => setRevision(value => value + 1)}>Retry marking messages read</button></div>}
        {page && !page.can_send && <p className="conversation-feedback">This delivery conversation is read-only.</p>}
        <label htmlFor={`conversation-draft-${delivery}`}>Message to driver</label><textarea id={`conversation-draft-${delivery}`} placeholder="Write a delivery update…" rows={3} maxLength={4000} value={draft} disabled={busy || pending || !page?.can_send} onChange={event => setDraft(event.target.value)} />
        {pending && <p className="conversation-feedback conversation-feedback-error">The last send is unconfirmed. Retry the same message to confirm it without creating a duplicate.</p>}
        <div className="conversation-send-row"><span>For urgent help, use your normal emergency contact.</span><button type="button" className="conversation-send" disabled={busy || (!pending && (!draft.trim() || !page?.can_send))} onClick={() => run(async () => {
        try { await sender.send(draft); } finally { if (alive.current) setPending(!!sender.pending); }
        if (alive.current) { setDraft(''); setNotice('Message sent.'); setBefore(null); setRevision(value => value + 1); }
      })}>{busy ? 'Working…' : pending ? 'Retry send' : 'Send message'}</button></div>
      </footer>
    </div>}
    </dialog>
  </>;
}
