import { supabase } from "./supabaseClient";

const SHIPMENT_SELECT = `
  id,
  tracking_number,
  status,
  cargo_description,
  weight_kg,
  booking_source,
  final_amount,
  pickup_address,
  dropoff_address,
  scheduled_departure,
  estimated_arrival,
  actual_delivery_at,
  created_at,
  updated_at,
  customer:customers!shipments_customer_id_fkey ( * ),
  cargo_category:cargo_categories ( * )
`;

/* Unmapped statuses (e.g. cancelled) become "other" and appear in no tab. */
const STATUS_MAP = {
  booked: "loading",
  confirmed: "loading",
  assigned: "loading",
  loading: "loading",
  in_transit: "transit",
  delayed: "delayed",
  under_review: "review",
  delivered: "completed",
  completed: "completed",
};

/* ------------------------------ formatting ------------------------------ */

const pad = (n) => String(n).padStart(2, "0");
const formatTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const isToday = (date) =>
  !!date && startOfDay(date).getTime() === startOfDay(new Date()).getTime();

/* "Today, 14:30" / "Yesterday, 17:40" / "2 days ago, 09:20" / "Sep 12, 09:20" */
export function formatDayTime(date) {
  if (!date) return "—";
  const dayDiff = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / (1000 * 60 * 60 * 24)
  );
  const time = formatTime(date);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  if (dayDiff > 1 && dayDiff <= 6) return `${dayDiff} days ago, ${time}`;
  const label = date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return `${label}, ${time}`;
}

/* 100 -> "1h 40m", 55 -> "55m" */
export function formatDuration(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

const toInitials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const toDate = (value) => (value ? new Date(value) : null);

/* ------------------------------- mapping -------------------------------- */

/* Joined tables use select("*"), so this tolerates whatever the name column is called. */
const pickName = (rec) =>
  rec?.company_name ?? rec?.business_name ?? rec?.name ?? rec?.full_name ?? null;

export function mapShipmentRow(row) {
  const status = STATUS_MAP[row.status] ?? "other";
  const scheduledAt = toDate(row.estimated_arrival);
  const actualAt = toDate(row.actual_delivery_at);
  const updatedAt = toDate(row.updated_at);
  const departAt = toDate(row.scheduled_departure);

  const delayMinutes =
    status === "delayed" && scheduledAt
      ? Math.max(0, (Date.now() - scheduledAt.getTime()) / 60000)
      : 0;

  const customerName = pickName(row.customer) ?? "—";

  const base = {
    id: row.tracking_number,
    dbId: row.id,
    cargo: row.cargo_description ?? pickName(row.cargo_category) ?? "General cargo",
    origin: row.pickup_address,
    originSub: "",
    destination: row.dropoff_address,
    destinationSub: "",
    status,
    driver: "Unassigned",   // TODO: wire up once deliveries/assignments table is ready
    fleet: "—",             // TODO
    weightKg: row.weight_kg,
    bookingSource: row.booking_source,
    finalAmount: row.final_amount,
    delayMinutes,
    scheduledAt,
    actualAt,
    flaggedAt: updatedAt,
  };

  if (status === "completed") {
    const onTime = actualAt && scheduledAt ? actualAt <= scheduledAt : true;
    return {
      ...base,
      customer: customerName,
      customerInitials: toInitials(customerName),
      targetDelivery: formatDayTime(scheduledAt),
      actualDelivery: formatDayTime(actualAt),
      deliveryStatus: onTime ? "ON TIME" : "LATE",
    };
  }

  let eta = formatDayTime(scheduledAt);
  let etaNote = "";
  let etaNoteClass = "text-muted-gray";

  if (status === "transit") {
    etaNote = "On Time";
    etaNoteClass = "text-success-green";
  } else if (status === "loading") {
    etaNote = departAt ? `Est. Depart ${formatTime(departAt)}` : "Awaiting dispatch";
  } else if (status === "delayed") {
    etaNote = `Delayed ${formatDuration(delayMinutes)}`;
    etaNoteClass = "text-danger-accent";
  } else if (status === "review") {
    eta = formatDayTime(actualAt ?? updatedAt);
    etaNote = "Flagged for review";   // no flag-reason column on shipments
    etaNoteClass = "text-danger-accent";
  }

  return { ...base, eta, etaNote, etaNoteClass };
}

/* -------------------------------- queries ------------------------------- */

/* Fine for a capstone-sized dataset. When the table grows, switch to
   server-side filtering (.eq("status", ...)) + .range() pagination. */
export async function fetchShipments() {
  const { data, error } = await supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map(mapShipmentRow);
}

/* "This Week's Trips" card: shipments created since Monday 00:00. */
export async function fetchWeeklyTripCount() {
  const now = new Date();
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const { count, error } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monday.toISOString());

  if (error) throw error;
  return count ?? 0;
}

/* Calls onChange whenever a shipment row is inserted/updated/deleted.
   Needs Realtime enabled for the `shipments` table in Supabase.
   Returns an unsubscribe function. */
export function subscribeToShipments(onChange) {
  const channel = supabase
    .channel("shipments-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}