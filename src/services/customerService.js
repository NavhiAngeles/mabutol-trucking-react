import { supabase } from "./supabaseClient";

const CUSTOMER_COLUMNS = "id, customer_code, user_id, name, email, phone, address, barangay, city, province, is_active, created_at, updated_at";
const BOOKING_COLUMNS = "id, customer_id, tracking_number, pickup_address, dropoff_address, cargo_description, status, created_at, estimated_arrival, actual_delivery_at";

async function fetchAll(table, columns) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await supabase.from(table).select(columns)
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

export const fetchCustomers = () => fetchAll("customers", CUSTOMER_COLUMNS);
export const fetchCustomerBookings = () => fetchAll("shipments", BOOKING_COLUMNS);

// Only directory details may be changed here; identity, status and bookings stay intact.
export function customerEditValues(customer) {
  return Object.fromEntries(["name", "email", "phone", "address", "barangay", "city", "province"]
    .map(key => [key, typeof customer[key] === "string" ? customer[key] : ""]));
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
  return data;
}

let channelId = 0;
export function subscribeCustomerBookings(onChange) {
  const channel = supabase.channel(`customer-bookings-${++channelId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
