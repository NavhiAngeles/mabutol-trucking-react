import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDashboardStats,
  subscribeToDashboardChanges,
} from "../services/dashboardService";

export function useDashboardViewModel() {
  const [stats, setStats] = useState(null);
  const refreshRef = useRef(() => {});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let disposed = false, running = false, again = false, timer;
    const loadStats = async () => {
    if (disposed) return;
    if (running) { again = true; return; }
    running = true;
    try {
      setError(null);

      const data = await getDashboardStats();

      if (!disposed) { setStats(data); setError(null); }
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
      if (!disposed) { setError(error.message); setStats(null); }
    } finally {
      running = false;
      if (!disposed) setLoading(false);
      if (again && !disposed) { again = false; schedule(); }
    }
    };
    function schedule() { clearTimeout(timer); timer = setTimeout(loadStats, 250); }
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
    refreshRef.current = schedule;
    // Initial fetch
    schedule();

    // Listen for database changes
    const unsubscribe = subscribeToDashboardChanges(() => {
      schedule();
    });

    // Cleanup when Dashboard unmounts
    const poll = setInterval(schedule, 15000);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(poll);
      unsubscribe();
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', onVisible);
      refreshRef.current = () => {};
    };
  }, []);

  return {
    stats,
    loading,
    error,
    refresh,
  };
}
