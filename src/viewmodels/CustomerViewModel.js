import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCustomers, fetchBillingCustomers, fetchCustomerBookings, subscribeCustomerBookings } from "../services/customerService";
import { fetchCustomerAppeals, fetchCustomerNoShowStrikes, subscribeCustomerStanding } from "../services/customerStandingService";

export function useCustomerDirectory({ enabled = true, includeBookings = false, includeStanding = false, billingOnly = false } = {}) {
  const [customers, setCustomers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshRef = useRef(null);
  const prevRowsRef = useRef(null);
  const prevShipmentsRef = useRef(null);
  const prevStrikesRef = useRef(null);
  const prevAppealsRef = useRef(null);
  const refresh = useCallback(() => refreshRef.current?.(), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let pending = false;
    let debounce;
    const load = async (silent = false) => {
      if (cancelled) return;
      if (running) { pending = true; return; }
      running = true;
      if (!silent) setLoading(true);
      try {
        const [rows, shipments, strikeRows, appealRows] = await Promise.all([
          billingOnly ? fetchBillingCustomers() : fetchCustomers({ force: !silent }),
          includeBookings ? fetchCustomerBookings({ force: !silent }) : Promise.resolve([]),
          includeStanding ? fetchCustomerNoShowStrikes({ includeShipments: true }) : Promise.resolve([]),
          includeStanding ? fetchCustomerAppeals() : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Skip state updates during silent polls if data hasn't changed to avoid unnecessary re-renders
        const rowsUnchanged = silent && prevRowsRef.current && prevRowsRef.current.length === rows.length &&
          rows.every((r, idx) => {
            const p = prevRowsRef.current[idx];
            return r === p || (
              r.id === p.id &&
              r.updated_at === p.updated_at &&
              r.name === p.name &&
              r.is_active === p.is_active &&
              r.no_show_strike_count === p.no_show_strike_count &&
              r.standing_status === p.standing_status &&
              r.booking_cooldown_until === p.booking_cooldown_until &&
              r.reinstated_at === p.reinstated_at
            );
          });
        const shipmentsUnchanged = silent && prevShipmentsRef.current && prevShipmentsRef.current.length === shipments.length &&
          shipments.every((s, idx) => s === prevShipmentsRef.current[idx] || (s.id === prevShipmentsRef.current[idx].id && s.status === prevShipmentsRef.current[idx].status));
        const strikesUnchanged = !includeStanding || (
          silent && prevStrikesRef.current && prevStrikesRef.current.length === strikeRows.length &&
          strikeRows.every((s, idx) => s.id === prevStrikesRef.current[idx]?.id && s.confirmed_at === prevStrikesRef.current[idx]?.confirmed_at)
        );
        const appealsUnchanged = !includeStanding || (
          silent && prevAppealsRef.current && prevAppealsRef.current.length === appealRows.length &&
          appealRows.every((a, idx) => a.id === prevAppealsRef.current[idx]?.id && a.status === prevAppealsRef.current[idx]?.status && a.updated_at === prevAppealsRef.current[idx]?.updated_at)
        );

        if (!rowsUnchanged) {
          prevRowsRef.current = rows;
          setCustomers(rows);
        }
        if (!shipmentsUnchanged) {
          prevShipmentsRef.current = shipments;
          setBookings(shipments);
        }
        if (includeStanding && !strikesUnchanged) {
          prevStrikesRef.current = strikeRows;
          setStrikes(strikeRows);
        }
        if (includeStanding && !appealsUnchanged) {
          prevAppealsRef.current = appealRows;
          setAppeals(appealRows);
        }
        setError("");
      } catch (err) {
        if (cancelled) return;
        prevRowsRef.current = null;
        prevShipmentsRef.current = null;
        prevStrikesRef.current = null;
        prevAppealsRef.current = null;
        setCustomers([]);
        setBookings([]);
        setStrikes([]);
        setAppeals([]);
        setError(err.message || "Unable to load customers. Check your connection and account permissions.");
      } finally {
        running = false;
        if (!cancelled) {
          setLoading(false);
          if (pending) { pending = false; void load(true); }
        }
      }
    };
    const queue = () => {
      if (cancelled) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => load(true), 250);
    };
    const manualRefresh = () => load(false);
    const initialLoad = () => load(true);
    refreshRef.current = manualRefresh;
    const initial = setTimeout(initialLoad, 0);
    // Customers are not published to Realtime unless migrated: polling remains fallback.
    const polling = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        load(true);
      }
    }, 15000);
    const visible = () => { if (document.visibilityState === "visible") queue(); };
    window.addEventListener("focus", queue);
    document.addEventListener("visibilitychange", visible);
    const unsubscribeBookings = includeBookings ? subscribeCustomerBookings(queue) : () => { };
    const unsubscribeStanding = includeStanding ? subscribeCustomerStanding(queue) : () => { };
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearTimeout(debounce);
      clearInterval(polling);
      window.removeEventListener("focus", queue);
      document.removeEventListener("visibilitychange", visible);
      unsubscribeBookings();
      unsubscribeStanding();
      if (refreshRef.current === manualRefresh) refreshRef.current = null;
    };
  }, [enabled, includeBookings, includeStanding, billingOnly]);
  return { customers, bookings, strikes, appeals, loading, error, refresh };
}

const day = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "";
};
export const customerDay = day;
const dateLabel = (value, options = {}) => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", ...options }) : "—";
};
const text = value => typeof value === "string" ? value.trim() : "";

function resolveStandingSnapshot(customer, strikeHistoryLength = 0, now = Date.now()) {
  const strikeCount = customer?.no_show_strike_count != null
    ? Math.max(0, Number(customer.no_show_strike_count) || 0)
    : Math.max(0, Number(strikeHistoryLength) || 0);
  const raw = String(customer?.standing_status || "good").trim().toLowerCase();
  const normalizedRaw = raw === "active" ? "good" : raw;
  const cooldownUntil = customer?.booking_cooldown_until || null;
  const cooldownMs = cooldownUntil ? Date.parse(cooldownUntil) : NaN;
  const isCooldownActive = Boolean(Number.isFinite(cooldownMs) && cooldownMs > now);
  const isSuspended = normalizedRaw === "suspended" || (normalizedRaw !== "reinstated" && strikeCount >= 3);
  const isReinstated = !isSuspended && normalizedRaw === "reinstated";

  let standingStatus = "good";
  let standingLabel = strikeCount > 0 ? "Good standing" : "Good";
  let standingTone = strikeCount > 0 ? "neutral" : "good";
  let cooldownRemainingLabel = "";

  if (isSuspended) {
    standingStatus = "suspended";
    standingLabel = "Suspended";
    standingTone = "danger";
  } else if (isCooldownActive) {
    standingStatus = "cooldown";
    const totalMinutes = Math.max(1, Math.floor((cooldownMs - now) / 60000));
    const totalHours = Math.floor(totalMinutes / 60);
    cooldownRemainingLabel = totalHours >= 24
      ? `${Math.floor(totalHours / 24)}d ${totalHours % 24}h left`
      : totalHours >= 1
        ? `${totalHours}h ${totalMinutes % 60}m left`
        : `${totalMinutes}m left`;
    standingLabel = `Cooldown (${cooldownRemainingLabel})`;
    standingTone = "warning";
  } else if (isReinstated) {
    standingStatus = "reinstated";
    standingLabel = "Reinstated";
    standingTone = "info";
  }

  return {
    strikeCount,
    standingStatus,
    standingLabel,
    standingTone,
    isCooldownActive,
    isStandingSuspended: isSuspended,
    isReinstated,
    cooldownRemainingLabel,
  };
}

export function buildCustomerRows(customers, bookings, strikes = [], appeals = [], now = Date.now()) {
  const grouped = new Map();
  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i];
    let list = grouped.get(booking.customer_id);
    if (!list) {
      list = [];
      grouped.set(booking.customer_id, list);
    }
    list.push(booking);
  }

  const strikesByCustomer = new Map();
  for (let i = 0; i < strikes.length; i++) {
    const strike = strikes[i];
    if (!strike?.customer_id) continue;
    let list = strikesByCustomer.get(strike.customer_id);
    if (!list) {
      list = [];
      strikesByCustomer.set(strike.customer_id, list);
    }
    list.push(strike);
  }

  const appealsByCustomer = new Map();
  for (let i = 0; i < appeals.length; i++) {
    const appeal = appeals[i];
    if (!appeal?.customer_id) continue;
    let list = appealsByCustomer.get(appeal.customer_id);
    if (!list) {
      list = [];
      appealsByCustomer.set(appeal.customer_id, list);
    }
    list.push(appeal);
  }

  return customers.map(customer => {
    const records = (grouped.get(customer.id) || []).toSorted((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const strikeHistory = (strikesByCustomer.get(customer.id) || []).toSorted((a, b) => (Date.parse(a.confirmed_at) || 0) - (Date.parse(b.confirmed_at) || 0));
    const customerAppeals = (appealsByCustomer.get(customer.id) || []).toSorted((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const pendingAppeal = customerAppeals.find(a => a.status === "pending") || null;
    const standing = resolveStandingSnapshot(customer, strikeHistory.length, now);

    const totalBookings = records.length;
    const bookingDates = new Array(totalBookings);
    for (let i = 0; i < totalBookings; i++) {
      bookingDates[i] = records[i].created_at;
    }

    const firstCreatedAt = records[0]?.created_at || null;
    const formattedAddress = [customer.address, customer.barangay, customer.city, customer.province].filter(Boolean).join(", ") || "—";
    const status = customer.is_active === true ? "ACTIVE" : customer.is_active === false ? "SUSPENDED" : "UNKNOWN";
    const name = text(customer.name) || "Unnamed customer";
    const email = text(customer.email) || "—";
    const phone = text(customer.phone) || "—";
    const createdAtMs = Date.parse(customer.created_at) || 0;

    let cachedProfile = null;

    const row = {
      ...customer,
      name,
      email,
      phone,
      address: formattedAddress,
      status,
      noShowStrikeCount: standing.strikeCount,
      standingStatus: standing.standingStatus,
      standingLabel: standing.standingLabel,
      standingTone: standing.standingTone,
      isCooldownActive: standing.isCooldownActive,
      isStandingSuspended: standing.isStandingSuspended,
      isReinstated: standing.isReinstated,
      cooldownRemainingLabel: standing.cooldownRemainingLabel,
      strikeHistory,
      appeals: customerAppeals,
      pendingAppeal,
      bookings: `${totalBookings} ${totalBookings === 1 ? "booking" : "bookings"}`,
      bookingCount: totalBookings,
      lastBookingAt: firstCreatedAt,
      bookingDates,
      lastBooking: totalBookings ? dateLabel(firstCreatedAt) : "No bookings",
      memberSince: dateLabel(customer.created_at),
      createdAtMs,
    };

    Object.defineProperty(row, "profile", {
      enumerable: true,
      configurable: true,
      get() {
        if (cachedProfile) return cachedProfile;
        const summary = { total: records.length, completed: 0, cancelled: 0, activeNow: 0 };
        for (let i = 0; i < records.length; i++) {
          const s = records[i].status;
          if (s === "completed") summary.completed++;
          else if (s === "cancelled") summary.cancelled++;
          else if (s === "pending" || s === "booked" || s === "assigned" || s === "loading" || s === "in_transit" || s === "delayed" || s === "review") {
            summary.activeNow++;
          }
        }
        const recentBookings = records.map(record => ({
          id: record.tracking_number || record.id,
          route: `${record.pickup_address || "—"} → ${record.dropoff_address || "—"}`,
          date: dateLabel(record.created_at),
          cargo: record.cargo_description || "—",
          status: String(record.status || "unknown").replaceAll("_", " "),
          deliveredAt: record.actual_delivery_at ? dateLabel(record.actual_delivery_at) : null,
        }));
        cachedProfile = {
          id: customer.customer_code || customer.id,
          address: formattedAddress,
          bookingSummary: summary,
          recentBookings,
        };
        return cachedProfile;
      },
    });

    return row;
  });
}

export function customerStatistics(rows, now = Date.now()) {
  const today = day(now);
  const thisMonth = today.slice(0, 7);
  const civil = new Date(`${today}T00:00:00Z`);
  civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() + 6) % 7);
  const monday = civil.toISOString().slice(0, 10);

  let activeThisMonth = 0;
  let newThisWeek = 0;
  let suspended = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.is_active === false || row.standingStatus === "suspended") {
      suspended++;
    }
    const createdAtDay = day(row.created_at);
    if (createdAtDay >= monday && createdAtDay <= today) {
      newThisWeek++;
    }
    if (row.is_active === true && row.bookingDates) {
      const dates = row.bookingDates;
      for (let j = 0; j < dates.length; j++) {
        const d = day(dates[j]);
        if (d.slice(0, 7) === thisMonth && d <= today) {
          activeThisMonth++;
          break;
        }
      }
    }
  }

  return {
    total: rows.length,
    activeThisMonth,
    newThisWeek,
    suspended,
  };
}

export function filterCustomerRows(rows, { query = "", status = "ALL", strikeFilter = "ALL", todayOnly = false, sort = "newest", now = Date.now() } = {}) {
  const q = query.trim().toLowerCase();
  const todayDay = todayOnly ? day(now) : "";

  const filtered = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (status === "ACTIVE" && row.status !== "ACTIVE") continue;
    if (status === "SUSPENDED" && row.status !== "SUSPENDED" && row.standingStatus !== "suspended") continue;
    if (status === "COOLDOWN" && row.standingStatus !== "cooldown") continue;
    if (status === "REINSTATED" && row.standingStatus !== "reinstated") continue;
    if (status === "GOOD" && row.standingStatus !== "good") continue;
    if (!["ALL", "ACTIVE", "SUSPENDED", "COOLDOWN", "REINSTATED", "GOOD"].includes(status) && row.status !== status) continue;

    const strikeCount = row.noShowStrikeCount ?? (Number(row.no_show_strike_count) || 0);
    if (strikeFilter === "HAS_STRIKES" && strikeCount < 1) continue;
    if (strikeFilter === "COOLDOWN" && row.standingStatus !== "cooldown") continue;
    if (strikeFilter === "SUSPENDED" && row.standingStatus !== "suspended" && row.status !== "SUSPENDED") continue;
    if (strikeFilter === "REINSTATED" && row.standingStatus !== "reinstated") continue;

    if (todayOnly && day(row.lastBookingAt) !== todayDay) continue;
    if (q) {
      const matches =
        (row.name && row.name.toLowerCase().includes(q)) ||
        (row.email && row.email.toLowerCase().includes(q)) ||
        (row.phone && row.phone.toLowerCase().includes(q)) ||
        (row.customer_code && row.customer_code.toLowerCase().includes(q)) ||
        (row.id && row.id.toLowerCase().includes(q));
      if (!matches) continue;
    }
    filtered.push(row);
  }

  if (sort === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "bookings") {
    filtered.sort((a, b) => b.bookingCount - a.bookingCount);
  } else if (sort === "strikes") {
    filtered.sort((a, b) => (b.noShowStrikeCount ?? 0) - (a.noShowStrikeCount ?? 0) || (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  } else {
    // "newest"
    filtered.sort((a, b) => (b.createdAtMs ?? (Date.parse(b.created_at) || 0)) - (a.createdAtMs ?? (Date.parse(a.created_at) || 0)));
  }

  return filtered;
}
