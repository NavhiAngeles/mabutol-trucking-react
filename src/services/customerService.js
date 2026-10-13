import { supabase } from "./supabaseClient";

const CUSTOMER_COLUMNS = "id, customer_code, user_id, name, email, phone, address, city, province, is_active, created_at, updated_at";
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

let channelId = 0;
export function subscribeCustomerBookings(onChange) {
  const channel = supabase.channel(`customer-bookings-${++channelId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
