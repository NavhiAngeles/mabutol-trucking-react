import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// Keep the loader and table list stable. Reconnect, focus and polling recover missed events.
let sequence = 0;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const namedCache = new Map();
let fnCache = new WeakMap();

function getCacheEntry(cacheKey, loader) {
  if (typeof cacheKey === 'string' && cacheKey.length > 0) {
    return namedCache.get(cacheKey) || null;
  }
  return typeof loader === 'function' ? fnCache.get(loader) || null : null;
}

function setCacheEntry(cacheKey, loader, data, lastUpdated) {
  const entry = { data, lastUpdated };
  if (typeof cacheKey === 'string' && cacheKey.length > 0) {
    namedCache.set(cacheKey, entry);
  }
  if (typeof loader === 'function') {
    fnCache.set(loader, entry);
  }
}

export function clearLiveDataCache(key = null) {
  if (typeof key === 'string' && key.length > 0) {
    namedCache.delete(key);
    return;
  }
  if (typeof key === 'function') {
    fnCache.delete(key);
    return;
  }
  namedCache.clear();
  fnCache = new WeakMap();
}

export function useLiveData(loader, tables, options = {}) {
  const cacheKey = options?.cacheKey ?? null;
  const staleTime = typeof options?.staleTime === 'number'
    ? options.staleTime
    : (typeof cacheKey === 'string' && cacheKey.length > 0 ? 5000 : 0);
  const pollInterval = typeof options?.pollInterval === 'number' ? options.pollInterval : DEFAULT_POLL_INTERVAL_MS;
  const enabled = options?.enabled !== false;

  const existing = getCacheEntry(cacheKey, loader);
  const [state, setState] = useState(
    existing
      ? { data: existing.data, loading: false, error: null, lastUpdated: existing.lastUpdated }
      : { data: null, loading: true, error: null, lastUpdated: null }
  );
  const refreshRef = useRef(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const cached = getCacheEntry(cacheKey, loader);
    if (cached) {
      setState({ data: cached.data, loading: false, error: null, lastUpdated: cached.lastUpdated });
    }
    if (!enabled) {
      refreshRef.current = () => {};
      return undefined;
    }

    let disposed = false, running = false, again = false, timer, subscribedOnce = false;
    async function load() {
      if (disposed) return;
      if (running) { again = true; return; }
      running = true;
      try {
        const data = await loader();
        const now = Date.now();
        setCacheEntry(cacheKey, loader, data, now);
        if (!disposed) setState({ data, loading: false, error: null, lastUpdated: now });
      } catch (error) {
        if (!disposed) setState(previous => ({ ...previous, loading: false, error }));
      } finally {
        running = false;
        if (again && !disposed) { again = false; schedule(); }
      }
    }
    function schedule(delay = 250) {
      clearTimeout(timer);
      timer = setTimeout(load, delay);
    }
    refreshRef.current = load;

    let channel = supabase.channel('live-data-' + ++sequence);
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedule());
    }
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        if (!subscribedOnce) {
          subscribedOnce = true;
          return;
        }
        schedule();
      }
    });

    const isFresh = cached && staleTime > 0 && (Date.now() - cached.lastUpdated < staleTime);
    if (!isFresh) {
      schedule(0);
    }

    const poll = pollInterval > 0 ? setInterval(load, pollInterval) : null;
    const onFocus = () => schedule();
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
      refreshRef.current = () => {};
    };
  }, [loader, tables, cacheKey, staleTime, pollInterval, enabled]);

  return { ...state, refresh };
}
