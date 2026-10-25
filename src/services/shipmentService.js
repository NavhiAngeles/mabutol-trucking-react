
import { supabase } from "./supabaseClient";
import { fetchOperationalRows } from './dashboardService';
import { pendingDeparture } from './operationalStats';

const ASSIGNMENT_COLUMNS = 'id,shipment_id,truck_id,driver_id,status,departed_at,driver:drivers(full_name),truck:trucks(plate_number)';

export const fetchShipmentAssignments = () => fetchOperationalRows('deliveries', ASSIGNMENT_COLUMNS);

export async function fetchShipmentDetails(id) {
  const [shipmentResult, deliveryResult] = await Promise.all([
    supabase.from('shipments')
      .select('id,tracking_number,status,booking_source,cargo_description,weight_kg,special_handling,pickup_address,dropoff_address,distance_km,scheduled_departure,estimated_arrival,actual_delivery_at,quoted_amount,override_amount,override_reason,final_amount,driver_notes,cancelled_reason,cancelled_at,created_at,updated_at,customer:customers!customer_id(name),vehicle:vehicle_types(name)')
      .eq('id', id).single(),
    supabase.from('deliveries').select(ASSIGNMENT_COLUMNS).eq('shipment_id', id),
  ]);
  if (shipmentResult.error) throw shipmentResult.error;
  if (deliveryResult.error) throw deliveryResult.error;
  if (!shipmentResult.data?.id) throw new Error('Shipment not found or access denied.');
  return { ...shipmentResult.data, deliveries: deliveryResult.data || [] };
}

export async function fetchBookingRequest(id) {
  const { data, error } = await supabase.from('shipments')
    .select('id,tracking_number,status,updated_at,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,route_source,route_reason,route_geometry,route_duration_minutes,customer:customers!customer_id(name),cargo_description,weight_kg,distance_km,scheduled_departure,quoted_amount,override_amount,override_reason,special_handling,driver_notes,vehicle:vehicle_types(name)')
    .eq('id', id).single();
  if (error) throw error;
  if (data?.status !== 'pending') throw new Error('This request is no longer pending. Close and refresh the list.');
  return data;
}

export async function reviewBookingRequest(request, decision, reason = '') {
  if (!request?.id || !request.updated_at || !['approve', 'reject'].includes(decision)) throw new Error('Reload the request before deciding.');
  if (decision === 'reject' && (!reason.trim() || reason.trim().length > 1000)) throw new Error('Enter a rejection reason of 1 to 1000 characters.');
  const { data, error } = await supabase.rpc('review_booking_request', {
    p_shipment: request.id, p_expected_updated_at: request.updated_at,
    p_decision: decision, p_reason: decision === 'reject' ? reason.trim() : null,
  });
  if (error) throw error;
  if (data?.id !== request.id || !(decision === 'reject' ? ['cancelled'] : ['booked', 'assigned']).includes(data.status)) {
    throw new Error('Decision was not confirmed. Reload the request before retrying.');
  }
  return data;
}

export async function assignShipmentResources(shipmentId) {
  const { data, error } = await supabase.rpc('assign_shipment_resources', { p_shipment: shipmentId });
  if (error) throw error;
  return data;
}

// A read failure after a successful insert must never invite a duplicate booking.
export async function createShipment(payload) {
  const { data, error } = await supabase.from('shipments').insert(payload).select().single();
  if (error) throw error;
  try {
    const result = await supabase.from('deliveries').select(ASSIGNMENT_COLUMNS)
      .eq('shipment_id', data.id).neq('status', 'cancelled').maybeSingle();
    if (result.error) return { ...data, assignmentLookupFailed: true };
    return { ...data, assignment: result.data };
  } catch {
    return { ...data, assignmentLookupFailed: true };
  }
}

/*
  MABUTOL TRUCKING
  SHIPMENT SERVICE

  Connects the Shipment page to the existing
  Supabase public.shipments table.

  No additional Supabase connection is required.
*/

// ============================================
// SHIPMENT STATUS MAPPING
// ============================================

const STATUS_MAP = {
  pending: "pending",
  booked: "booked",
  confirmed: "loading",
  assigned: "assigned",
  loading: "loading",
  preparing: "loading",
  ready_for_pickup: "loading",

  in_transit: "transit",
  transit: "transit",
  ongoing: "transit",

  delayed: "delayed",

  under_review: "review",
  review: "review",

  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const pad = (number) =>
  String(number).padStart(2, "0");

const toDate = (value) => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
};

const startOfDay = (date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

export function isToday(date) {
  if (!date) return false;

  const parsedDate = toDate(date);

  if (!parsedDate) return false;

  return (
    startOfDay(parsedDate).getTime() ===
    startOfDay(new Date()).getTime()
  );
}

export function formatDayTime(value) {
  const date = toDate(value);

  if (!date) return "—";

  const time = `${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;

  const today = startOfDay(new Date());
  const target = startOfDay(date);

  const difference = Math.round(
    (today.getTime() - target.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (difference === 0) {
    return `Today, ${time}`;
  }

  if (difference === 1) {
    return `Yesterday, ${time}`;
  }

  if (difference > 1 && difference <= 6) {
    return `${difference} days ago, ${time}`;
  }

  return `${date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

export function formatDuration(totalMinutes) {
  const minutes = Math.max(
    0,
    Math.round(Number(totalMinutes) || 0)
  );

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours === 0) {
    return `${remaining}m`;
  }

  if (remaining === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remaining}m`;
}

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

// ============================================
// MAP SUPABASE DATA TO REACT TABLE
// ============================================

export function mapShipmentRow(row) {
  const rawStatus = String(
    row.status ?? "pending"
  ).toLowerCase();

  const status = STATUS_MAP[rawStatus] ?? "review";

  const scheduledAt = toDate(
    row.estimated_arrival
  );

  const actualAt = toDate(
    row.actual_delivery_at
  );

  const updatedAt = toDate(
    row.updated_at ?? row.created_at
  );

  const departAt = toDate(
    row.scheduled_departure
  );

  const customerName =
    row.customer_name ??
    row.customer?.company_name ??
    row.customer?.business_name ??
    row.customer?.name ??
    "—";

  const delayMinutes =
    status === "delayed" && scheduledAt
      ? Math.max(
          0,
          (Date.now() - scheduledAt.getTime()) /
            60000
        )
      : 0;

  const baseShipment = {
    rawStatus,
    pendingDispatch: row.pendingDispatch ?? false,
    dbId: row.id,

    id:
      row.tracking_number ??
      String(row.id ?? "—"),

    cargo:
      row.cargo_description ??
      "General Cargo",

    origin:
      row.pickup_address ??
      "Not specified",

    originSub: "",

    destination:
      row.dropoff_address ??
      "Not specified",

    destinationSub: "",

    status,

    assignmentId: row.assignment?.id ?? null,
    driver: row.assignment?.driver?.full_name ?? "Unassigned",

    fleet: row.assignment?.truck?.plate_number ?? "—",

    customer: customerName,

    customerInitials: getInitials(
      customerName
    ),

    weightKg: row.weight_kg ?? 0,
    driverNotes: row.driver_notes ?? '',

    bookingSource:
      row.booking_source ?? "—",

    finalAmount:
      row.final_amount ?? 0,

    scheduledAt,

    actualAt,

    flaggedAt:
      updatedAt ?? new Date(),

    delayMinutes,
  };

  // ==========================================
  // COMPLETED SHIPMENTS
  // ==========================================

  if (status === "completed") {
    const onTime =
      actualAt && scheduledAt
        ? actualAt <= scheduledAt
        : true;

    return {
      ...baseShipment,

      targetDelivery:
        formatDayTime(scheduledAt),

      actualDelivery:
        formatDayTime(actualAt),

      deliveryStatus:
        onTime ? "ON TIME" : "LATE",
    };
  }

  // ==========================================
  // ACTIVE / DELAYED / REVIEW SHIPMENTS
  // ==========================================

  let eta = formatDayTime(scheduledAt);

  let etaNote = "";

  let etaNoteClass = "text-muted-gray";

  if (status === "transit") {
    etaNote = "In Transit";
    etaNoteClass = "text-success-green";
  }

  if (status === "loading") {
    etaNote = departAt
      ? `Est. Depart ${formatDayTime(departAt)}`
      : "Awaiting Dispatch";
  }

  if (status === "delayed") {
    etaNote = `Delayed ${formatDuration(
      delayMinutes
    )}`;

    etaNoteClass = "text-danger-accent";
  }

  if (status === "review") {
    eta = formatDayTime(
      actualAt ?? updatedAt
    );

    etaNote = "Needs Review";
    etaNoteClass = "text-danger-accent";
  }

  return {
    ...baseShipment,
    eta,
    etaNote,
    etaNoteClass,
  };
}

// ============================================
// FETCH ALL SHIPMENTS FROM SUPABASE
// ============================================

export async function fetchShipments() {
  try {
    console.log(
      "Fetching shipments from Supabase..."
    );

    const [data, deliveries] = await Promise.all([
      fetchOperationalRows('shipments', '*'), fetchShipmentAssignments(),
    ]);
    const error = null;

    if (error) {
      console.error(
        "Supabase shipment error:",
        error
      );

      throw error;
    }

    console.log(
      "Raw shipment data:",
      data
    );

    const mappedShipments = (
      (data ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    ).map(row => mapShipmentRow({ ...row,
      assignment: deliveries.find(d => d.shipment_id === row.id && d.status !== 'cancelled'),
      pendingDispatch: pendingDeparture(row, deliveries) }));

    console.log(
      "Mapped shipments:",
      mappedShipments
    );

    return mappedShipments;
  } catch (error) {
    console.error(
      "Failed to fetch shipments:",
      error
    );

    throw error;
  }
}

// ============================================
// FETCH THIS WEEK'S TRIP COUNT
// ============================================

export async function fetchWeeklyTripCount() {
  try {
    const monday = startOfDay(
      new Date()
    );

    const day = monday.getDay();

    const daysSinceMonday =
      (day + 6) % 7;

    monday.setDate(
      monday.getDate() - daysSinceMonday
    );

    const { count, error } = await supabase
      .from("shipments")
      .select("id", {
        count: "exact",
        head: true,
      })
      .gte(
        "created_at",
        monday.toISOString()
      );

    if (error) {
      console.error(
        "Weekly trip count error:",
        error
      );

      // Do not prevent the shipment table
      // from loading if this count fails.
      return null;
    }

    return Number.isInteger(count) && count >= 0 ? count : null;
  } catch (error) {
    console.error(
      "Failed to fetch weekly trips:",
      error
    );

    return null;
  }
}

// ============================================
// REALTIME SHIPMENT UPDATES
// ============================================

export function subscribeToShipments(onChange) {
  const channel = supabase
    .channel("shipments-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shipments",
      },
      () => {
        console.log(
          "Shipment database changed."
        );

        if (typeof onChange === "function") {
          onChange();
        }
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, onChange)
    .subscribe();

  // Cleanup when the component unmounts
  return () => {
    supabase.removeChannel(channel);
  };
}
