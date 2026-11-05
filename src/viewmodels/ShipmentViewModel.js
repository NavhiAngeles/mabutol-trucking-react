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

const SHIPMENT_PAGE_SIZE = 10;
const REVIEW_CLOCK_INTERVAL_MS = 60000;

export function reviewAgeLabel(shipments, now) {
  const ages = shipments.map(shipment => shipment.flaggedAt?.getTime?.())
    .filter(timestamp => Number.isFinite(timestamp))
    .map(timestamp => Math.max(0, now - timestamp));
  if (!ages.length) return 'Unavailable';
  const averageDays = ages.reduce((sum, age) => sum + age, 0) / ages.length / 86400000;
  return `${averageDays.toFixed(1)} days`;
}

const matchesSearch = (s, q) =>
  [s.id, s.cargo, s.origin, s.destination, s.driver, s.fleet, s.customer]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(q));

export function useShipmentViewModel() {
  const [shipments, setShipments] = useState([]);
  const [weeklyTrips, setWeeklyTrips] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [params, setParams] = useSearchParams();
  const currentTab = Object.hasOwn(TAB_CONFIG, params.get('tab')) ? params.get('tab') : 'active';
  const recordFilter = params.get('record');
  const statusFilter = params.get('status');
  const setCurrentTab = tab => setParams(previous => { previous.set('tab', tab); previous.delete('record'); previous.delete('status'); return previous; });
  const [searchQuery, setSearchQuery] = useState(params.get("q") || "");
  const [pagination, setPagination] = useState(() => ({
    filterKey: JSON.stringify([currentTab, searchQuery, recordFilter, statusFilter]), page: 1,
  }));
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

  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    const timer = setInterval(updateClock, REVIEW_CLOCK_INTERVAL_MS);
    window.addEventListener('focus', updateClock);
    return () => { clearInterval(timer); window.removeEventListener('focus', updateClock); };
  }, []);

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

  // Reset for a new filter context; clamp when live updates shrink the result set.
  const filterKey = JSON.stringify([currentTab, searchQuery, recordFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleShipments.length / SHIPMENT_PAGE_SIZE));
  const page = Math.min(pagination.filterKey === filterKey ? pagination.page : 1, pageCount);
  if (pagination.filterKey !== filterKey || pagination.page !== page) {
    setPagination({ filterKey, page });
  }
  const pagedShipments = visibleShipments.slice((page - 1) * SHIPMENT_PAGE_SIZE, page * SHIPMENT_PAGE_SIZE);
  const setPage = nextPage => setPagination({ filterKey, page: Math.max(1, Math.min(nextPage, pageCount)) });

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
    const lateToday = completedToday.filter((s) => s.deliveryStatus === "LATE");
    const timedToday = onTimeToday.length + lateToday.length;

    const avgDelay = delayed.length
      ? delayed.reduce((sum, s) => sum + s.delayMinutes, 0) / delayed.length
      : 0;
    const worst = delayed.reduce((w, s) => (s.delayMinutes > (w?.delayMinutes ?? -1) ? s : w), null);

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
      onTimePct: timedToday
        ? Math.round((onTimeToday.length / timedToday) * 100)
        : null,
      lateToday: lateToday.length,

      avgReviewAgeLabel: reviewAgeLabel(review, clock),

      weeklyTrips: weeklyTrips ?? "—",
    };
  }, [shipments, weeklyTrips, clock]);

  return {
    // data
    visibleShipments,
    pagedShipments,
    page,
    pageCount,
    pageSize: SHIPMENT_PAGE_SIZE,
    setPage,
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
