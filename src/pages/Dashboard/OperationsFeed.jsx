import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOperationsFeed } from '../../viewmodels/OperationsFeedViewModel';
import { absoluteEventTime, relativeEventTime } from '../../services/operationsFeed';

function EventList({ events, now, full = false }) {
  const navigate = useNavigate();
  return <div className={`feed-list${full ? ' operations-history-list' : ''}`}>{events.map(event => <div className="feed-item" key={event.key}>
    <span className={`feed-dot ${event.color}`} />
    <div className="feed-event-content">
      <div className="feed-event-heading">
      {event.href ? <button className="feed-title feed-event-link" onClick={() => navigate(event.href)}>{event.title}</button>
        : <p className="feed-title">{event.title}</p>}
      {full && <span className={`operations-event-badge ${event.color}`}>{event.label}</span>}
      </div>
      <p className="feed-desc">{event.customer}</p>
      <p className="feed-desc">{event.description}</p>
      <p className="feed-time" title={`${absoluteEventTime(event.created_at)} Philippine time`}>
        {full ? `${absoluteEventTime(event.created_at)} PHT · ` : ''}{relativeEventTime(event.created_at, now)}
      </p>
      {!event.href && <p className="feed-time">Related record unavailable</p>}
    </div>
  </div>)}</div>;
}

export default function OperationsFeed() {
  const { feed, history, now, refresh, openHistory, closeHistory, nextPage, previousPage, refreshHistory } = useOperationsFeed();
  const dialog = useRef(null);
  const historyButton = useRef(null);
  useEffect(() => {
    if (!history.open) return;
    const target = dialog.current;
    const previous = document.activeElement;
    target?.querySelector('button')?.focus();
    function onKey(event) {
      if (event.key === 'Escape') closeHistory();
      if (event.key !== 'Tab') return;
      const buttons = [...target.querySelectorAll('button:not(:disabled),a[href]')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [history.open, closeHistory]);
  return <>
    <div className="ops-feed card">
      <div className="ops-feed-header">
        <h3>Operations Feed</h3>
        <button className="ops-feed-refresh" aria-label="Refresh feed" onClick={refresh} disabled={feed.loading}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4v6h6M3 10a9 9 0 1 1 0 5" /></svg>
        </button>
      </div>
      {feed.loading && <p className="feed-desc" role="status">Refreshing activity…</p>}
      {feed.error && <p className="feed-error" role="alert">{feed.events.length ? 'Showing previously loaded activity. ' : ''}{feed.error} <button onClick={refresh} disabled={feed.loading}>Retry</button></p>}
      {!feed.loading && !feed.error && !feed.events.length && <p className="feed-desc">No operational activity yet.</p>}
      <EventList events={feed.events} now={now} />
      <button ref={historyButton} className="view-all-link" onClick={openHistory}>View All Activity →</button>
    </div>
    {history.open && <div className="operations-history-backdrop" onClick={event => { if (event.target === event.currentTarget) closeHistory(); }}>
      <section ref={dialog} className="operations-history-dialog" role="dialog" aria-modal="true" aria-labelledby="operations-history-title">
        <header className="operations-history-header">
          <div><h3 id="operations-history-title">Operations Activity History</h3><p>Recent shipment updates and operational events</p></div>
          <button className="operations-history-close" onClick={closeHistory} aria-label="Close activity history">×</button>
        </header>
        <div className="operations-history-toolbar">
          <span>Newest first <span aria-hidden="true">·</span> Philippine time</span>
          <button className="operations-history-button" onClick={refreshHistory} disabled={history.loading} title="Load the latest activity and return to page 1">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4v6h6M3 10a9 9 0 1 1 0 5" /></svg>
            {history.loading ? 'Refreshing…' : 'Refresh history'}
          </button>
        </div>
        <div className="operations-history-body" aria-busy={history.loading}>
        {history.loading && <p role="status">Loading activity…</p>}
        {history.error && <p className="feed-error" role="alert">{history.events.length ? 'Showing previously loaded activity. ' : ''}{history.error} <button onClick={refreshHistory} disabled={history.loading}>Retry from latest</button></p>}
        {!history.loading && !history.error && !history.events.length && <p>No activity found.</p>}
        <EventList events={history.events} now={now} full />
        </div>
        <nav className="operations-history-pagination" aria-label="Activity pages">
          <button className="operations-history-button" disabled={history.loading || history.page === 1} onClick={previousPage}>Previous</button>
          <span aria-live="polite">Page <strong>{history.page}</strong></span>
          <button className="operations-history-button" disabled={history.loading || !history.hasNext} onClick={nextPage}>Next</button>
        </nav>
      </section>
    </div>}
  </>;
}
