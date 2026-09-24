import { useCallback, useEffect, useState } from "react";
import {
  getDashboardStats,
  subscribeToDashboardChanges,
} from "../services/dashboardService";

export function useDashboardViewModel() {
  const [stats, setStats] = useState({
    activeShipments: 0,
    delayedShipments: 0,
    availableTrucks: 0,
    pendingDispatch: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      setError(null);

      const data = await getDashboardStats();

      setStats(data);
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    loadStats();

    // Listen for database changes
    const unsubscribe = subscribeToDashboardChanges(() => {
      loadStats();
    });

    // Cleanup when Dashboard unmounts
    return () => {
      unsubscribe();
    };
  }, [loadStats]);

  return {
    stats,
    loading,
    error,
    refresh: loadStats,
  };
}