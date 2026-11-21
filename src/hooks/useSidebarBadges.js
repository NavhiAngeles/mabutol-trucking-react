import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';
import {
  SIDEBAR_BADGE_TABLES,
  getModuleKeyForPath,
  loadSidebarBadgeCounts,
  markModuleSeen,
} from '../services/sidebarBadgeService.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
let badgeChannelSequence = 0;

/**
 * Tracks live per-module new-record counts for the sidebar and clears the active module's badge.
 */
export function useSidebarBadges({ userId, pathname, client = supabase } = {}) {
  const [counts, setCounts] = useState({});
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (!userId) return undefined;
    const activeKey = getModuleKeyForPath(pathname);
    if (!activeKey) return undefined;

    markModuleSeen(userId, activeKey);
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setCounts((prev) => (prev[activeKey] ? { ...prev, [activeKey]: 0 } : prev));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  useEffect(() => {
    if (!userId) return undefined;

    let disposed = false;
    let running = false;
    let again = false;
    let timer = null;

    async function load() {
      if (disposed) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const nextCounts = await loadSidebarBadgeCounts(userId, pathnameRef.current, client);
        if (!disposed) {
          setCounts(nextCounts);
        }
      } catch {
        // Non-blocking badge refresh
      } finally {
        running = false;
        if (again && !disposed) {
          again = false;
          schedule(250);
        }
      }
    }

    function schedule(delay = 250) {
      clearTimeout(timer);
      timer = setTimeout(load, delay);
    }

    schedule(0);

    let channel = null;
    if (typeof client?.channel === 'function') {
      channel = client.channel(`sidebar-badges-${++badgeChannelSequence}`);
      for (const table of SIDEBAR_BADGE_TABLES) {
        channel = channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table },
          () => schedule(250)
        );
      }
      channel.subscribe();
    }

    const poll = setInterval(load, DEFAULT_POLL_INTERVAL_MS);
    const onFocus = () => schedule(250);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', onFocus);
    }

    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', onFocus);
      }
      if (channel && typeof client?.removeChannel === 'function') {
        client.removeChannel(channel);
      }
    };
  }, [userId, client]);

  if (!userId) return {};
  const activeKey = getModuleKeyForPath(pathname);
  if (activeKey && counts[activeKey]) {
    return { ...counts, [activeKey]: 0 };
  }
  return counts;
}
