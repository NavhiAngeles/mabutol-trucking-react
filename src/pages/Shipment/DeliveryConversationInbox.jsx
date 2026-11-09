import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { deliveryConversationService } from '../../services/deliveryConversationService';
import DeliveryConversation from './DeliveryConversation';
import './deliveryWorkflow.css';
import './deliveryConversation.css';

const service = deliveryConversationService(supabase);

function avatarInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'D';
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatThreadTime(value) {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(parsed));
  } catch {
    return '';
  }
}

function formatMessagePreview(row, isUnread) {
  const raw = String(row?.last_message_body || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return isUnread ? 'View driver conversation' : 'Read · Click to view conversation';
  }
  const clipped = raw.length > 96 ? `${raw.slice(0, 93)}…` : raw;
  const prefix = row?.last_sender_role === 'driver' ? 'Driver: ' : 'Office: ';
  return `${prefix}${clipped}`;
}

export default function DeliveryConversationInbox(props = {}) {
  const { user } = useAuth();
  return user && <Inbox key={user.id} {...(props || {})} />;
}

function Inbox(props = {}) {
  const { defaultOpen = false } = props || {};
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null), [opened, setOpened] = useState([]), [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  const triggerRefresh = () => {
    setRefreshing(true);
    setRevision(value => value + 1);
  };

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (containerRef.current && typeof containerRef.current.contains === 'function') {
        if (!containerRef.current.contains(event.target)) {
          setOpen(false);
        }
      }
    };
    const escape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape);
    }
    return () => {
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('pointerdown', outside);
        document.removeEventListener('keydown', escape);
      }
    };
  }, [open]);

  useEffect(() => {
    const refresh = () => {
      setRefreshing(true);
      setRevision(value => value + 1);
    };
    const stop = service.watch('', refresh), timer = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      clearInterval(timer);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', onFocus);
      }
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchThreads = typeof service.threads === 'function' ? service.threads() : service.unread();
    fetchThreads
      .then(result => {
        if (active) {
          setRows(Array.isArray(result) ? result : []);
          setError('');
        }
      })
      .catch(err => {
        if (active) {
          setRows(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => { active = false; };
  }, [revision]);

  const unread = rows?.reduce((total, row) => total + Number(row.unread || 0), 0) || 0;
  const isRefreshing = refreshing || (!rows && !error);
  // Keep any session-opened threads accessible alongside persisted read & unread threads.
  const visibleThreads = rows
    ? [
        ...rows,
        ...opened
          .filter(thread => !rows.some(row => `${row.delivery_id}:${row.driver_id}` === thread.key))
          .map(thread => ({ ...thread, unread: 0 })),
      ]
    : [];

  return (
    <div className="office-messages-tool" ref={containerRef}>
      <button
        type="button"
        className="icon-btn conversation-inbox-trigger"
        ref={triggerRef}
        title="Driver messages"
        aria-label={`Driver messages${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-controls="office-messages-panel"
        onClick={() => setOpen(value => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/>
          <path d="M7 9h10M7 13h6"/>
        </svg>
        {unread > 0 && <span className="office-unread-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <section id="office-messages-panel" className="office-messages-panel" aria-label="Driver message conversations">
          <div className="office-messages-header">
            <div className="office-messages-header-main">
              <div className="office-messages-header-title">
                <h2>Driver messages</h2>
                {rows && (
                  <span className={`conversation-unread ${unread === 0 ? 'is-zero' : ''}`}>
                    {unread === 0 ? '0 unread' : `${unread} unread`}
                  </span>
                )}
              </div>
              <p>Delivery updates from your assigned drivers</p>
            </div>
            <div className="office-messages-header-actions">
              <button
                type="button"
                className="office-messages-tool-btn conversation-inbox-refresh"
                data-refreshing={isRefreshing ? 'true' : 'false'}
                title="Refresh message inbox"
                aria-label="Refresh message inbox"
                onClick={triggerRefresh}
              >
                <svg className="conversation-refresh-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="office-messages-close"
                aria-label="Close driver messages"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="office-messages-list">
            {error && (
              <p className="office-message-error conversation-feedback conversation-feedback-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={triggerRefresh}>Retry</button>
              </p>
            )}
            {!rows && !error && <p className="office-message-state conversation-empty" role="status">Loading driver messages…</p>}
            {rows && visibleThreads.length === 0 && (
              <div className="office-message-state office-message-empty conversation-inbox-empty">
                <svg className="empty-check-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
                <strong>You’re all caught up</strong>
                <p>Open a shipment’s delivery workflow to start a conversation.</p>
              </div>
            )}
            {visibleThreads.map(row => {
              const key = `${row.delivery_id}:${row.driver_id}`;
              const unreadCount = Number(row.unread || 0);
              const isUnread = unreadCount > 0;
              const timeLabel = formatThreadTime(row.last_message_at);
              return (
                <button
                  type="button"
                  className="conversation-thread"
                  data-state={isUnread ? 'unread' : 'read'}
                  key={key}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setOpened(threads => threads.some(thread => thread.key === key) ? threads : [...threads, { ...row, key }]);
                    setSelected(key);
                  }}
                >
                  <span className="conversation-avatar" aria-hidden="true">{avatarInitials(row.driver_name)}</span>
                  <span className="conversation-thread-copy">
                    <span className="conversation-thread-heading">
                      <strong>{row.tracking_number}</strong>
                      {row.driver_name && <span className="conversation-thread-driver">{row.driver_name}</span>}
                    </span>
                    <span className="conversation-thread-preview">{formatMessagePreview(row, isUnread)}</span>
                  </span>
                  <span className="conversation-thread-meta">
                    {timeLabel && <span className="conversation-thread-time">{timeLabel}</span>}
                    <span className={`conversation-unread ${isUnread ? '' : 'is-zero'}`}>
                      {isUnread ? `${unreadCount} unread` : 'Read'}
                    </span>
                    <span className="conversation-thread-arrow" aria-hidden="true">→</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="office-messages-footer">
            <span>Latest driver conversations · Philippine time</span>
          </div>
        </section>
      )}

      {opened.map(thread => (
        <DeliveryConversation
          key={thread.key}
          delivery={{ id: thread.delivery_id, driver_id: thread.driver_id, tracking_number: thread.tracking_number }}
          open={selected === thread.key}
          onClose={() => setSelected(null)}
          onRead={triggerRefresh}
          hideTrigger
        />
      ))}
    </div>
  );
}
