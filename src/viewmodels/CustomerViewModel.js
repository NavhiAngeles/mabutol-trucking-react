import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCustomers, fetchCustomerBookings, subscribeCustomerBookings } from "../services/customerService";

export function useCustomerDirectory({ enabled = true, includeBookings = false } = {}) {
  const [customers, setCustomers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshRef = useRef(null);
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
          fetchCustomers(), includeBookings ? fetchCustomerBookings() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setCustomers(rows);
        setBookings(shipments);
        setError("");
      } catch (err) {
        if (cancelled) return;
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
    const polling = setInterval(() => load(true), 15000);
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
  }, [enabled, includeBookings]);
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
  for (const booking of bookings) {
    if (!grouped.has(booking.customer_id)) grouped.set(booking.customer_id, []);
    grouped.get(booking.customer_id).push(booking);
  }
  return customers.map(customer => {
    const records = (grouped.get(customer.id) || []).sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const summary = { total: records.length, completed: 0, cancelled: 0, activeNow: 0 };
    records.forEach(record => {
      if (record.status === "completed") summary.completed++;
      else if (record.status === "cancelled") summary.cancelled++;
      else if (["pending", "booked", "assigned", "loading", "in_transit", "delayed", "review"].includes(record.status)) summary.activeNow++;
    });
    const recentBookings = records.map(record => ({
      id: record.tracking_number || record.id,
      route: `${record.pickup_address || "—"} → ${record.dropoff_address || "—"}`,
      date: dateLabel(record.created_at), cargo: record.cargo_description || "—",
      status: String(record.status || "unknown").replaceAll("_", " "),
      deliveredAt: record.actual_delivery_at ? dateLabel(record.actual_delivery_at) : null,
    }));
    return {
      ...customer,
      name: text(customer.name) || "Unnamed customer", email: text(customer.email) || "—", phone: text(customer.phone) || "—",
      address: [customer.address, customer.barangay, customer.city, customer.province].filter(Boolean).join(", ") || "—",
      status: customer.is_active === true ? "ACTIVE" : customer.is_active === false ? "SUSPENDED" : "UNKNOWN",
      bookings: `${records.length} ${records.length === 1 ? "booking" : "bookings"}`,
      bookingCount: records.length, lastBookingAt: records[0]?.created_at || null,
      bookingDates: records.map(record => record.created_at),
      lastBooking: records.length ? dateLabel(records[0].created_at) : "No bookings",
      memberSince: dateLabel(customer.created_at),
      profile: { id: customer.customer_code || customer.id, address: [customer.address, customer.barangay, customer.city, customer.province].filter(Boolean).join(", ") || "—", bookingSummary: summary, recentBookings },
    };
  });
}

export function customerStatistics(rows, now = Date.now()) {
  const today = day(now);
  const civil = new Date(`${today}T00:00:00Z`);
  civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() + 6) % 7);
  const monday = civil.toISOString().slice(0, 10);
  return {
    total: rows.length,
    activeThisMonth: rows.filter(row => row.is_active === true && row.bookingDates.some(value => day(value).slice(0, 7) === today.slice(0, 7) && day(value) <= today)).length,
    newThisWeek: rows.filter(row => day(row.created_at) >= monday && day(row.created_at) <= today).length,
    suspended: rows.filter(row => row.is_active === false).length,
  };
}

export function filterCustomerRows(rows, { query = "", status = "ALL", todayOnly = false, sort = "newest", now = Date.now() } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter(row => (status === "ALL" || row.status === status) &&
    (!todayOnly || day(row.lastBookingAt) === day(now)) &&
    (!q || [row.id, row.customer_code, row.name, row.email, row.phone].some(value => String(value || "").toLowerCase().includes(q))))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "bookings" ? b.bookingCount - a.bookingCount : (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}
