import { supabase } from "./supabaseClient";

const CUSTOMER_COLUMNS = "id, customer_code, user_id, name, email, phone, address, barangay, city, province, is_active, created_at, updated_at";
const BOOKING_COLUMNS = "id, customer_id, tracking_number, pickup_address, dropoff_address, cargo_description, status, created_at, estimated_arrival, actual_delivery_at";

async function fetchAll(table, columns, filter = query => query) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await filter(supabase.from(table).select(columns))
      .order("created_at", { ascending: false }).order("id").range(offset, offset + size - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Invalid ${table} response.`);
    if (data.some(row => !row || typeof row.id !== "string" || !row.id.trim())) {
      throw new Error(`Invalid ${table} record returned from the database.`);
    }
    rows.push(...data);
    if (data.length < size) return [...new Map(rows.map(row => [row.id, row])).values()];
  }
}

let customerInFlight = null;
let bookingInFlight = null;
let customerCachedData = null;
let bookingCachedData = null;
let customerCacheExpiry = 0;
let bookingCacheExpiry = 0;
const CACHE_TTL_MS = 2500;

export function clearCustomerCache() {
  customerInFlight = null;
  bookingInFlight = null;
  customerCachedData = null;
  bookingCachedData = null;
  customerCacheExpiry = 0;
  bookingCacheExpiry = 0;
}

export function fetchCustomers({ force = false } = {}) {
  const now = Date.now();
  if (!force && customerCachedData && now < customerCacheExpiry) {
    return Promise.resolve(customerCachedData);
  }
  if (!force && customerInFlight) {
    return customerInFlight;
  }
  customerInFlight = (async () => {
    try {
      const data = await fetchAll("customers", CUSTOMER_COLUMNS);
      customerCachedData = data;
      customerCacheExpiry = Date.now() + CACHE_TTL_MS;
      return data;
    } finally {
      customerInFlight = null;
    }
  })();
  return customerInFlight;
}

export function fetchCustomerBookings({ force = false } = {}) {
  const now = Date.now();
  if (!force && bookingCachedData && now < bookingCacheExpiry) {
    return Promise.resolve(bookingCachedData);
  }
  if (!force && bookingInFlight) {
    return bookingInFlight;
  }
  bookingInFlight = (async () => {
    try {
      const data = await fetchAll("shipments", BOOKING_COLUMNS);
      bookingCachedData = data;
      bookingCacheExpiry = Date.now() + CACHE_TTL_MS;
      return data;
    } finally {
      bookingInFlight = null;
    }
  })();
  return bookingInFlight;
}

// Historical customer records survive role conversions. Billing must use the
// linked account's current role, while retaining staff-managed business rows.
export async function fetchBillingCustomers() {
  const [customers, accounts] = await Promise.all([
    fetchCustomers(),
    fetchAll('users', 'id,role,is_active,created_at', query => query.eq('role', 'customer').eq('is_active', true)),
  ]);
  const eligible = new Set(accounts.filter(account => account.role === 'customer' && account.is_active === true).map(account => account.id));
  return customers.filter(customer => customer.is_active === true &&
    (customer.user_id == null || eligible.has(customer.user_id)));
}

// Only directory details may be changed here; identity, status and bookings stay intact.
export function customerEditValues(customer) {
  return Object.fromEntries(["name", "email", "phone", "address", "barangay", "city", "province"]
    .map(key => [key, typeof customer[key] === "string" ? customer[key] : ""]));
}

export const AUTHORIZED_OFFICE_ROLES = ["admin", "staff"];

export async function setCustomerActiveStatus(customer, isActive, reason, { callerRole } = {}) {
  if (!callerRole || !AUTHORIZED_OFFICE_ROLES.includes(callerRole)) {
    throw new Error("Unauthorized: Only office staff and administrators can change customer account status.");
  }
  if (!customer?.id || !customer.updated_at) {
    throw new Error("Refresh the customer directory before changing account status.");
  }
  if (typeof isActive !== "boolean") {
    throw new Error("A valid target status (active or suspended) must be specified.");
  }
  if (customer.is_active === isActive) {
    throw new Error(isActive ? "Customer account is already active." : "Customer account is already suspended.");
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason || trimmedReason.length < 3) {
    throw new Error("A valid reason (at least 3 characters) is required to change account status.");
  }

  const { data, error } = await supabase.from("customers").update({ is_active: isActive })
    .eq("id", customer.id).eq("updated_at", customer.updated_at).select(CUSTOMER_COLUMNS).maybeSingle();
  if (error) throw new Error("Unable to update customer status. Check your connection and account permissions, then refresh before retrying.");
  if (!data) throw new Error("This customer changed or is no longer editable. Close this form and refresh before retrying.");

  if (customer.user_id) {
    await supabase.from("users").update({ is_active: isActive }).eq("id", customer.user_id);
  }

  clearCustomerCache();
  return data;
}

export async function updateCustomer(customer, values) {
  if (!customer?.id || !customer.updated_at) throw new Error("Refresh the customer directory before editing.");
  const fields = customerEditValues(values);
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  if (!fields.name) throw new Error("Customer name is required.");
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new Error("Enter a valid email address.");
  if (fields.phone && (!/^[+\d\s().-]+$/.test(fields.phone) || fields.phone.replace(/\D/g, "").length < 7 || fields.phone.replace(/\D/g, "").length > 15)) {
    throw new Error("Enter a valid contact number (7–15 digits).");
  }
  const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null]));
  const { data, error } = await supabase.from("customers").update(payload)
    .eq("id", customer.id).eq("updated_at", customer.updated_at).select(CUSTOMER_COLUMNS).maybeSingle();
  if (error) throw new Error("Unable to save customer details. Check your connection and account permissions, then refresh before retrying.");
  if (!data) throw new Error("This customer changed or is no longer editable. Close this form and refresh before editing again.");
  clearCustomerCache();
  return data;
}

let channelId = 0;
export function subscribeCustomerBookings(onChange) {
  const channel = supabase.channel(`customer-bookings-${++channelId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
