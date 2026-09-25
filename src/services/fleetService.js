// fleetService.js
// Data-access layer for the Fleet module. No React here — just Supabase calls.
// Adjust the import path below to wherever your Supabase client actually lives.
import { supabase } from "./supabaseClient";

/* ============================================================
 * KPIs (the 4 metric cards at the top of Fleet.jsx)
 * ============================================================ */

/**
 * Returns { total, available, maintenance, onTrip }.
 * Uses head:true count queries so no row data is transferred.
 */
export async function getFleetKPIs() {
    const [{ count: total, error: totalErr }, { count: available, error: availErr }, { count: maintenance, error: maintErr }, { count: onTrip, error: tripErr }] =
        await Promise.all([
            supabase.from("trucks").select("*", { count: "exact", head: true }),
            supabase.from("trucks").select("*", { count: "exact", head: true }).eq("status", "available"),
            supabase.from("trucks").select("*", { count: "exact", head: true }).eq("status", "maintenance"),
            supabase.from("trucks").select("*", { count: "exact", head: true }).eq("status", "on_trip"),
        ]);

    const error = totalErr || availErr || maintErr || tripErr;
    if (error) throw error;

    return {
        total: total ?? 0,
        available: available ?? 0,
        maintenance: maintenance ?? 0,
        onTrip: onTrip ?? 0,
    };
}

/* ============================================================
 * Trucks / Vehicles
 * ============================================================ */

const TRUCK_SELECT = `
  id,
  fleet_code,
  plate_number,
  model,
  model_year,
  capacity_kg,
  status,
  odometer_km,
  notes,
  created_at,
  updated_at,
  vehicle_types ( id, name ),
  drivers:assigned_driver_id ( id, full_name, contact_number ),
  truck_cargo_categories ( cargo_categories ( id, name ) )
`;

/** Fetch all trucks with vehicle type + assigned driver + cargo categories joined in. */
export async function getTrucks() {
    const { data, error } = await supabase
        .from("trucks")
        .select(TRUCK_SELECT)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((t) => ({
        ...t,
        cargoCategories: t.truck_cargo_categories?.map((tc) => tc.cargo_categories).filter(Boolean) ?? [],
    }));
}

/** Fetch a single truck by id, joined the same way as getTrucks(). */
export async function getTruckById(truckId) {
    const { data, error } = await supabase
        .from("trucks")
        .select(TRUCK_SELECT)
        .eq("id", truckId)
        .single();

    if (error) throw error;
    return {
        ...data,
        cargoCategories: data.truck_cargo_categories?.map((tc) => tc.cargo_categories).filter(Boolean) ?? [],
    };
}

/**
 * Create a truck. `payload` should match the trucks columns, e.g.:
 * { plate_number, model, model_year, vehicle_type_id, capacity_kg, assigned_driver_id }
 * `cargoCategoryIds` is an optional array of cargo_categories UUIDs.
 */
export async function createTruck(payload, cargoCategoryIds = []) {
    const { data, error } = await supabase
        .from("trucks")
        .insert(payload)
        .select(TRUCK_SELECT)
        .single();

    if (error) throw error;

    if (cargoCategoryIds && cargoCategoryIds.length > 0) {
        const rows = cargoCategoryIds.map((catId) => ({
            truck_id: data.id,
            cargo_category_id: catId,
        }));
        const { error: catErr } = await supabase
            .from("truck_cargo_categories")
            .insert(rows);
        if (catErr) console.error("Failed to link cargo categories:", catErr);
    }

    return data;
}

export async function updateTruck(truckId, payload) {
    const { data, error } = await supabase
        .from("trucks")
        .update(payload)
        .eq("id", truckId)
        .select(TRUCK_SELECT)
        .single();

    if (error) throw error;
    return data;
}

/** For the "Assign Vehicle" dropdown in the driver modal: unassigned or available trucks. */
export async function getAssignableTrucks() {
    const { data, error } = await supabase
        .from("trucks")
        .select("id, plate_number, model")
        .is("assigned_driver_id", null)
        .order("plate_number", { ascending: true });

    if (error) throw error;
    return data;
}

/* ============================================================
 * Drivers
 * ============================================================ */

// drivers has no assigned_truck_id column — the relationship lives on
// trucks.assigned_driver_id, so we reverse-embed trucks from the drivers side.
const DRIVER_SELECT = `
  id,
  user_id,
  full_name,
  contact_number,
  emergency_contact_name,
  emergency_contact_number,
  license_number,
  date_hired,
  status,
  notes,
  created_at,
  updated_at,
  trucks ( id, plate_number, model )
`;

/** Fetch all drivers, each with their assigned truck (if any) embedded. */
export async function getDrivers() {
    const { data, error } = await supabase
        .from("drivers")
        .select(DRIVER_SELECT)
        .order("created_at", { ascending: false });

    if (error) throw error;

    // Supabase returns the reverse relationship as an array (trucks[]).
    // Flatten to a single assignedTruck for the UI, since in practice a
    // driver is assigned to at most one truck.
    return data.map((d) => ({
        ...d,
        assignedTruck: d.trucks?.[0] ?? null,
    }));
}

export async function getDriverById(driverId) {
    const { data, error } = await supabase
        .from("drivers")
        .select(DRIVER_SELECT)
        .eq("id", driverId)
        .single();

    if (error) throw error;
    return { ...data, assignedTruck: data.trucks?.[0] ?? null };
}

/**
 * Creates a Supabase Auth user for a driver via Edge Function.
 * Uses the service_role key server-side so the calling admin's session is unaffected.
 * Returns the new user's UUID for linking to drivers.user_id.
 */
export async function createDriverAuthUser({ email, password, fullName }) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("You must be logged in to create driver accounts.");

    const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-driver-user`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email, password, fullName }),
        }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to create driver auth user");
    return result.userId;
}

/**
 * Create a driver. `payload` should match the drivers columns, e.g.:
 * { full_name, contact_number, license_number, date_hired, emergency_contact_name, emergency_contact_number }
 * Pass `assignVehicleId` separately if the form also assigns a truck —
 * this writes to trucks.assigned_driver_id after the driver is created.
 * Optional `userId` links the driver to their Supabase auth/public user.
 */
export async function createDriver(payload, assignVehicleId, complianceDocs = [], userId = null) {
    const driverPayload = userId ? { ...payload, user_id: userId } : payload;

    const { data: driver, error } = await supabase
        .from("drivers")
        .insert(driverPayload)
        .select(DRIVER_SELECT)
        .single();

    if (error) throw error;

    if (assignVehicleId) {
        const { error: assignErr } = await supabase
            .from("trucks")
            .update({ assigned_driver_id: driver.id })
            .eq("id", assignVehicleId);

        if (assignErr) console.error("Failed to assign vehicle:", assignErr);
    }

    if (complianceDocs && complianceDocs.length > 0) {
        const docRows = complianceDocs
            .filter((d) => d.document_number || d.expiry_date)
            .map((d) => ({
                driver_id: driver.id,
                doc_type: d.doc_type,
                document_number: d.document_number || null,
                expiry_date: d.expiry_date || null,
                issued_date: d.issued_date || null,
                review_status: d.review_status || "valid",
            }));

        if (docRows.length > 0) {
            const { error: docErr } = await supabase
                .from("compliance_documents")
                .insert(docRows);

            if (docErr) console.error("Failed to insert driver compliance documents:", docErr);
        }
    }

    return driver;
}

export async function updateDriver(driverId, payload) {
    const { data, error } = await supabase
        .from("drivers")
        .update(payload)
        .eq("id", driverId)
        .select(DRIVER_SELECT)
        .single();

    if (error) throw error;
    return data;
}

/* ============================================================
 * Maintenance records
 * ============================================================ */

const MAINTENANCE_SELECT = `
  id,
  truck_id,
  kind,
  status,
  description,
  scheduled_date,
  completed_date,
  odometer_km,
  cost,
  vendor,
  next_due_date,
  next_due_km,
  created_at,
  trucks ( id, plate_number, model )
`;

/** Fetch maintenance records, most recently scheduled first. */
export async function getMaintenanceRecords() {
    const { data, error } = await supabase
        .from("maintenance_records")
        .select(MAINTENANCE_SELECT)
        .order("scheduled_date", { ascending: false });

    if (error) throw error;
    return data;
}

/** Fetch maintenance records for a single truck (e.g. a vehicle detail view). */
export async function getMaintenanceRecordsForTruck(truckId) {
    const { data, error } = await supabase
        .from("maintenance_records")
        .select(MAINTENANCE_SELECT)
        .eq("truck_id", truckId)
        .order("scheduled_date", { ascending: false });

    if (error) throw error;
    return data;
}

export async function createMaintenanceRecord(payload) {
    const { data, error } = await supabase
        .from("maintenance_records")
        .insert(payload)
        .select(MAINTENANCE_SELECT)
        .single();

    if (error) throw error;
    return data;
}

export async function updateMaintenanceRecord(recordId, payload) {
    const { data, error } = await supabase
        .from("maintenance_records")
        .update(payload)
        .eq("id", recordId)
        .select(MAINTENANCE_SELECT)
        .single();

    if (error) throw error;
    return data;
}

/* ============================================================
 * Vehicle types (for the "VEHICLE TYPE" dropdown)
 * ASSUMPTION: vehicle_types has at least (id, name). Adjust the
 * select() below if your columns differ.
 * ============================================================ */

export async function getVehicleTypes() {
    const { data, error } = await supabase
        .from("vehicle_types")
        .select("id, name")
        .order("name", { ascending: true });

    if (error) throw error;
    return data;
}

export async function getCargoCategories() {
    const { data, error } = await supabase
        .from("cargo_categories")
        .select("id, name, requires_special_handling")
        .eq("is_active", true)
        .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/* ============================================================
 * Compliance documents
 * ============================================================
 * The compliance_documents table is polymorphic: exactly one of
 * driver_id / truck_id is set (enforced by a DB check constraint).
 * doc_type is the compliance_doc_type enum:
 *   drivers_license, medical_certificate, nbi_clearance,
 *   lto_registration, insurance, emission_test,
 *   roadworthiness_inspection, franchise_permit, other
 *
 * The Vehicles > Compliance tab shows OR/CR Registration, LTFRB
 * Permit, and Emission Test — mapped below to lto_registration,
 * franchise_permit, and emission_test respectively (there's no
 * enum value that splits OR from CR, so lto_registration stands
 * in for both). The Drivers > Compliance tab maps 1:1 to
 * drivers_license, medical_certificate, nbi_clearance.
 */

export const TRUCK_COMPLIANCE_DOC_TYPES = [
    { docType: "lto_registration", label: "OR/CR Registration" },
    { docType: "franchise_permit", label: "LTFRB Permit" },
    { docType: "emission_test", label: "Emission Test" },
];

export const DRIVER_COMPLIANCE_DOC_TYPES = [
    { docType: "drivers_license", label: "Driver's License" },
    { docType: "medical_certificate", label: "Medical Certificate" },
    { docType: "nbi_clearance", label: "NBI Clearance" },
];

/**
 * Turns a compliance_documents row (or undefined, if none exists yet)
 * into a UI-friendly badge state. Pure function — safe to reuse in the
 * viewmodel or directly in a component.
 */
export function getComplianceDocBadge(doc, { expiringSoonDays = 30 } = {}) {
    if (!doc) return { state: "missing", label: "Missing" };

    if (doc.review_status === "rejected") return { state: "rejected", label: "Rejected" };

    if (doc.expiry_date) {
        const today = new Date();
        const expiry = new Date(doc.expiry_date);
        const daysLeft = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) return { state: "expired", label: "Expired" };
        if (daysLeft <= expiringSoonDays) return { state: "expiring_soon", label: "Expiring Soon" };
    }

    if (doc.review_status === "pending_review") return { state: "pending_review", label: "Pending Review" };

    return { state: "valid", label: doc.expiry_date ? `Valid (${doc.expiry_date})` : "Valid" };
}

/** Fetch all compliance documents for a single truck. */
export async function getComplianceDocumentsForTruck(truckId) {
    const { data, error } = await supabase
        .from("compliance_documents")
        .select("*")
        .eq("truck_id", truckId)
        .order("doc_type", { ascending: true });

    if (error) throw error;
    return data;
}

/** Fetch all compliance documents for a single driver. */
export async function getComplianceDocumentsForDriver(driverId) {
    const { data, error } = await supabase
        .from("compliance_documents")
        .select("*")
        .eq("driver_id", driverId)
        .order("doc_type", { ascending: true });

    if (error) throw error;
    return data;
}

/**
 * Builds the rows for the Vehicles > Compliance table: one row per
 * truck, each with its OR/CR, LTFRB, and emission-test docs resolved
 * (or `null` if that document hasn't been uploaded yet) plus an
 * overall status.
 */
export async function getTruckComplianceRows() {
    const [{ data: trucks, error: trucksErr }, { data: docs, error: docsErr }] = await Promise.all([
        supabase.from("trucks").select("id, plate_number, model, model_year"),
        supabase
            .from("compliance_documents")
            .select("*")
            .not("truck_id", "is", null)
            .in(
                "doc_type",
                TRUCK_COMPLIANCE_DOC_TYPES.map((d) => d.docType)
            ),
    ]);

    if (trucksErr) throw trucksErr;
    if (docsErr) throw docsErr;

    // For each truck+docType, keep only the most recently created doc.
    const latestByTruckAndType = new Map();
    for (const doc of docs) {
        const key = `${doc.truck_id}:${doc.doc_type}`;
        const existing = latestByTruckAndType.get(key);
        if (!existing || new Date(doc.created_at) > new Date(existing.created_at)) {
            latestByTruckAndType.set(key, doc);
        }
    }

    return trucks.map((truck) => {
        const docsForTruck = TRUCK_COMPLIANCE_DOC_TYPES.map(({ docType, label }) => {
            const doc = latestByTruckAndType.get(`${truck.id}:${docType}`);
            return { docType, label, doc, badge: getComplianceDocBadge(doc) };
        });

        const overall =
            docsForTruck.every((d) => d.badge.state === "valid") ? "verified" : "attention";

        return { truck, docs: docsForTruck, overallStatus: overall };
    });
}

/**
 * Builds the rows for the Drivers > Compliance table, same shape as
 * getTruckComplianceRows() but for license/medical/NBI.
 */
export async function getDriverComplianceRows() {
    const [{ data: drivers, error: driversErr }, { data: docs, error: docsErr }] = await Promise.all([
        supabase.from("drivers").select("id, full_name"),
        supabase
            .from("compliance_documents")
            .select("*")
            .not("driver_id", "is", null)
            .in(
                "doc_type",
                DRIVER_COMPLIANCE_DOC_TYPES.map((d) => d.docType)
            ),
    ]);

    if (driversErr) throw driversErr;
    if (docsErr) throw docsErr;

    const latestByDriverAndType = new Map();
    for (const doc of docs) {
        const key = `${doc.driver_id}:${doc.doc_type}`;
        const existing = latestByDriverAndType.get(key);
        if (!existing || new Date(doc.created_at) > new Date(existing.created_at)) {
            latestByDriverAndType.set(key, doc);
        }
    }

    return drivers.map((driver) => {
        const docsForDriver = DRIVER_COMPLIANCE_DOC_TYPES.map(({ docType, label }) => {
            const doc = latestByDriverAndType.get(`${driver.id}:${docType}`);
            return { docType, label, doc, badge: getComplianceDocBadge(doc) };
        });

        const overall =
            docsForDriver.every((d) => d.badge.state === "valid") ? "verified" : "attention";

        return { driver, docs: docsForDriver, overallStatus: overall };
    });
}

/**
 * Upload/record a compliance document. `payload` must set exactly one
 * of driver_id / truck_id (DB constraint enforces this), plus doc_type.
 * `file_path` is wherever you store the uploaded file (e.g. a Supabase
 * Storage path) — this function doesn't handle the file upload itself.
 */
export async function createComplianceDocument(payload) {
    const { data, error } = await supabase
        .from("compliance_documents")
        .insert(payload)
        .select("*")
        .single();

    if (error) throw error;
    return data;
}

/** Approve/reject a document, or update its extracted fields (e.g. after OCR). */
export async function updateComplianceDocument(docId, payload) {
    const { data, error } = await supabase
        .from("compliance_documents")
        .update(payload)
        .eq("id", docId)
        .select("*")
        .single();

    if (error) throw error;
    return data;
}