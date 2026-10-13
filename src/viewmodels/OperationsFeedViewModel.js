import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOperationsPage, subscribeOperationsFeed } from '../services/operationsFeedService';

const EMPTY_HISTORY = { open: false, events: [], loading: false, error: '', page: 1, hasNext: false, snapshot: null };
export function useOperationsFeed() {
  const [feed, setFeed] = useState({ events: [], loading: true, error: '' });
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [now, setNow] = useState(() => Date.now());
  const actions = useRef({});
  const refresh = useCallback(() => actions.current.refresh?.(), []);
  const openHistory = useCallback(() => actions.current.open?.(), []);
  const closeHistory = useCallback(() => actions.current.close?.(), []);
  const nextPage = useCallback(() => actions.current.next?.(), []);
  const previousPage = useCallback(() => actions.current.previous?.(), []);
  const refreshHistory = useCallback(() => actions.current.refreshHistory?.(), []);
  useEffect(() => {
    let disposed = false, running = false, queued = false, timer;
    let pages = [], index = 0, historyRunning = false, historyOpen = false, generation = 0;
    async function loadFeed() {
      if (disposed) return;
      if (running) { queued = true; return; }
      running = true;
      setFeed(old => ({ ...old, loading: true }));
      try {
        const result = await fetchOperationsPage({ size: 3 });
        if (!disposed) setFeed({ events: result.events, loading: false, error: '' });
      } catch (err) {
        if (!disposed) setFeed(old => ({ ...old, loading: false, error: err.message || 'Unable to load activity.' }));
      } finally {
        running = false;
        if (queued && !disposed) { queued = false; schedule(); }
      }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(loadFeed, 300); }
    function showPage(error = '') {
      const page = pages[index];
      setHistory({ open: historyOpen, events: page?.events || [], loading: historyRunning, error,
        page: index + 1, hasNext: Boolean(page?.nextCursor), snapshot: page?.snapshot || null });
    }
    async function loadHistory(reset = false) {
      if (disposed || historyRunning || !historyOpen) return;
      historyRunning = true;
      const version = generation;
      showPage();
      try {
        const current = pages[index];
        const result = await fetchOperationsPage(reset ? { size: 10 } : { size: 10, snapshot: current.snapshot, cursor: current.nextCursor });
        if (disposed || version !== generation) return;
        if (reset) { pages = [result]; index = 0; }
        else { pages.push(result); index++; }
        historyRunning = false;
        showPage();
      } catch (err) {
        if (!disposed && version === generation) { historyRunning = false; showPage(err.message || 'Unable to load history.'); }
      }
    }
    actions.current = {
      refresh: schedule,
      open() { if (historyOpen) return; historyOpen = true; pages = []; index = 0; loadHistory(true); },
      close() { historyOpen = false; historyRunning = false; generation++; setHistory(EMPTY_HISTORY); },
      next() {
        if (historyRunning || !pages[index]?.nextCursor) return;
        if (pages[index + 1]) { index++; showPage(); } else loadHistory();
      },
      previous() { if (!historyRunning && index > 0) { index--; showPage(); } },
      refreshHistory: () => loadHistory(true),
    };
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    schedule();
    const unsubscribe = subscribeOperationsFeed(schedule);
    const poll = setInterval(schedule, 15000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true; generation++; clearTimeout(timer); clearInterval(poll); clearInterval(clock); unsubscribe();
      window.removeEventListener('focus', schedule); document.removeEventListener('visibilitychange', visible);
      actions.current = {};
    };
  }, []);
  return { feed, history, now, refresh, openHistory, closeHistory, nextPage, previousPage, refreshHistory };
}
