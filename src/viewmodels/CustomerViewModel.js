import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCustomers, fetchBillingCustomers, fetchCustomerBookings, subscribeCustomerBookings } from "../services/customerService";

export function useCustomerDirectory({ enabled = true, includeBookings = false, billingOnly = false } = {}) {
  const [customers, setCustomers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshRef = useRef(null);
  const prevRowsRef = useRef(null);
  const prevShipmentsRef = useRef(null);
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
        const [rows, shipments] = await Promise.all([
          billingOnly ? fetchBillingCustomers() : fetchCustomers({ force: !silent }),
          includeBookings ? fetchCustomerBookings({ force: !silent }) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Skip state updates during silent polls if data hasn't changed to avoid unnecessary re-renders
        const rowsUnchanged = silent && prevRowsRef.current && prevRowsRef.current.length === rows.length &&
          rows.every((r, idx) => r === prevRowsRef.current[idx] || (r.id === prevRowsRef.current[idx].id && r.updated_at === prevRowsRef.current[idx].updated_at && r.name === prevRowsRef.current[idx].name && r.is_active === prevRowsRef.current[idx].is_active));
        const shipmentsUnchanged = silent && prevShipmentsRef.current && prevShipmentsRef.current.length === shipments.length &&
          shipments.every((s, idx) => s === prevShipmentsRef.current[idx] || (s.id === prevShipmentsRef.current[idx].id && s.status === prevShipmentsRef.current[idx].status));

        if (!rowsUnchanged) {
          prevRowsRef.current = rows;
          setCustomers(rows);
        }
        if (!shipmentsUnchanged) {
          prevShipmentsRef.current = shipments;
          setBookings(shipments);
        }
        setError("");
      } catch (err) {
        if (cancelled) return;
        prevRowsRef.current = null;
        prevShipmentsRef.current = null;
        setCustomers([]);
        setBookings([]);
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
    const manualRefresh = () => load();
    refreshRef.current = manualRefresh;
    const initial = setTimeout(manualRefresh, 0);
    // Customers are not published to Realtime: polling is the schema-free fallback.
    const polling = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        load(true);
      }
    }, 15000);
    const visible = () => { if (document.visibilityState === "visible") queue(); };
    window.addEventListener("focus", queue);
    document.addEventListener("visibilitychange", visible);
    const unsubscribe = includeBookings ? subscribeCustomerBookings(queue) : () => {};
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearTimeout(debounce);
      clearInterval(polling);
      window.removeEventListener("focus", queue);
      document.removeEventListener("visibilitychange", visible);
      unsubscribe();
      if (refreshRef.current === manualRefresh) refreshRef.current = null;
    };
  }, [enabled, includeBookings, billingOnly]);
  return { customers, bookings, loading, error, refresh };
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

export function buildCustomerRows(customers, bookings) {
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

  return customers.map(customer => {
    const records = (grouped.get(customer.id) || []).slice().sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
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
    if (row.is_active === false) {
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

export function filterCustomerRows(rows, { query = "", status = "ALL", todayOnly = false, sort = "newest", now = Date.now() } = {}) {
  const q = query.trim().toLowerCase();
  const todayDay = todayOnly ? day(now) : "";

  const filtered = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (status !== "ALL" && row.status !== status) continue;
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
  } else {
    // "newest"
    filtered.sort((a, b) => (b.createdAtMs ?? (Date.parse(b.created_at) || 0)) - (a.createdAtMs ?? (Date.parse(a.created_at) || 0)));
  }

  return filtered;
}
