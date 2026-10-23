import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from 'react-router-dom';
import { ACTIVE_STATUSES } from '../services/operationalStats';
import {
  fetchShipments,
  fetchWeeklyTripCount,
  subscribeToShipments,
  formatDuration,
  isToday,
} from "../services/shipmentService";

/* =============================================================================
   SHIPMENT VIEWMODEL
   Owns everything the Shipment page needs: loading/error state, the active tab,
   search text, the filtered list, tab badge counts, and the stat cards.
   The component only renders what this hook returns.
============================================================================= */

export const TAB_CONFIG = {
  all: {
    label: 'All', title: 'All Shipments', description: 'All accessible shipments, including pending and cancelled records.',
    filter: () => true,
  },
  active: {
    label: "Active",
    title: "Active Operations",
    description:
      "Real-time view of all ongoing shipments currently in transit, loading, or preparing for departure.",
    filter: (s) => ACTIVE_STATUSES.includes(s.rawStatus),
  },
  delayed: {
    label: "Delayed",
    title: "Delayed Shipments",
    description: "Shipments currently behind schedule and requiring routing review.",
    filter: (s) => s.status === "delayed",
    badgeClass: "badge-danger",
  },
  dispatch: {
    label: 'Pending Dispatch', title: 'Pending Dispatch',
    description: 'Booked and assigned shipments that have not started loading or departed.',
    filter: s => s.pendingDispatch,
  },
  completed: {
    label: "Completed",
    title: "Completed Operations",
    description:
      "Historical record of safely fulfilled regional freight movements across the Nueva Ecija network.",
    filter: (s) => s.status === "completed",
    hideBadge: true,
  },
  review: {
    label: "Review",
    title: "Shipments Needing Review",
    description: "Completed or in-progress shipments flagged for manual review before closing out.",
    filter: (s) => s.status === "review",
    badgeClass: "badge-warning",
  },
};

const matchesSearch = (s, q) =>
  [s.id, s.cargo, s.origin, s.destination, s.driver, s.fleet, s.customer]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(q));

export function useShipmentViewModel() {
  const [shipments, setShipments] = useState([]);
  const [weeklyTrips, setWeeklyTrips] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [params, setParams] = useSearchParams();
  const currentTab = Object.hasOwn(TAB_CONFIG, params.get('tab')) ? params.get('tab') : 'active';
  const recordFilter = params.get('record');
  const statusFilter = params.get('status');
  const setCurrentTab = tab => setParams(previous => { previous.set('tab', tab); previous.delete('record'); previous.delete('status'); return previous; });
  const [searchQuery, setSearchQuery] = useState(params.get("q") || "");
  const loadVersion = useRef(0);
  const invalidateLoads = useCallback(() => { loadVersion.current += 1; }, []);

  /* ------------------------------- loading ------------------------------- */
  const load = useCallback(async ({ silent = false } = {}) => {
    const version = ++loadVersion.current;
    if (!silent) setIsLoading(true);
    try {
      const [rows, trips] = await Promise.all([fetchShipments(), fetchWeeklyTripCount()]);
      if (version !== loadVersion.current) return;
      setShipments(rows);
      setWeeklyTrips(trips);
      setError(null);
    } catch (err) {
      console.error("Failed to load shipments:", err);
      if (version === loadVersion.current) setError(err.message ?? "Failed to load shipments");
    } finally {
      if (version === loadVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    // Live updates: quietly refetch whenever a shipment row changes
    const unsubscribe = subscribeToShipments(() => load({ silent: true }));
    const poll = setInterval(() => load({ silent: true }), 15000);
    return () => { invalidateLoads(); clearTimeout(initial); clearInterval(poll); unsubscribe(); };
  }, [load, invalidateLoads]);

  /* ----------------------------- derived data ---------------------------- */
  const activeConfig = useMemo(() => statusFilter === 'pending' ? { ...TAB_CONFIG[currentTab], title: 'Pending Booking Requests', description: 'Customer booking requests awaiting review. Select a tab to clear this filter.' } : TAB_CONFIG[currentTab], [statusFilter, currentTab]);

  const visibleShipments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shipments
      .filter(activeConfig.filter)
      .filter(s => !recordFilter || s.dbId === recordFilter)
      .filter(s => !statusFilter || s.rawStatus === statusFilter)
      .filter((s) => !q || matchesSearch(s, q));
  }, [shipments, activeConfig, searchQuery, recordFilter, statusFilter]);

  const tabs = useMemo(
    () =>
      Object.entries(TAB_CONFIG).map(([key, cfg]) => ({
        key,
        label: cfg.label,
        badge: cfg.hideBadge ? null : shipments.filter(cfg.filter).length,
        badgeClass: cfg.badgeClass,
      })),
    [shipments]
  );

  const stats = useMemo(() => {
    const withStatus = (status) => shipments.filter((s) => s.status === status);

    const delayed = withStatus("delayed");
    const review = withStatus("review");
    const completedToday = withStatus("completed").filter((s) => isToday(s.actualAt));
    const onTimeToday = completedToday.filter((s) => s.deliveryStatus === "ON TIME");

    const avgDelay = delayed.length
      ? delayed.reduce((sum, s) => sum + s.delayMinutes, 0) / delayed.length
      : 0;
    const worst = delayed.reduce((w, s) => (s.delayMinutes > (w?.delayMinutes ?? -1) ? s : w), null);

    const avgReviewDays = review.length
      ? review.reduce((sum, s) => sum + (Date.now() - s.flaggedAt.getTime()), 0) /
      review.length /
      (1000 * 60 * 60 * 24)
      : 0;

    return {
      transitCount: withStatus("transit").length,
      loadingCount: withStatus("loading").length + withStatus("assigned").length,
      delayedCount: delayed.length,

      avgDelayLabel: formatDuration(avgDelay),
      worstDelay: {
        id: worst?.id ?? "—",
        label: worst ? formatDuration(worst.delayMinutes) : "0m",
      },

      completedToday: completedToday.length,
      onTimeToday: onTimeToday.length,
      onTimePct: completedToday.length
        ? Math.round((onTimeToday.length / completedToday.length) * 100)
        : 0,
      lateToday: completedToday.length - onTimeToday.length,

      avgReviewAgeLabel: `${avgReviewDays.toFixed(1)} days`,

      weeklyTrips: weeklyTrips ?? "—",
    };
  }, [shipments, weeklyTrips]);

  return {
    // data
    visibleShipments,
    tabs,
    stats,
    activeConfig,
    // ui state
    currentTab,
    setCurrentTab,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    // actions
    refresh: load,
    recordFilter,
  };
}
