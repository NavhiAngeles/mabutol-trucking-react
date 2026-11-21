import { supabase } from "./supabaseClient";

const TABLE = "toll_gate_rates";

export async function getCurrentPricingUser() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Please sign in to view pricing.");

  const { data, error } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return {
    ...data,
    isAdmin: data.role === "admin" && data.is_active === true,
  };
}

export async function getTollGates() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, gate_name, highway, vehicle_class, fee, entry_lat, entry_lng, exit_lat, exit_lng, bidirectional, pricing_scope")
    .order("highway")
    .order("gate_name");

  if (error) throw error;
  return data || [];
}

function validateTollGate(toll) {
  const gate_name = String(toll.gate_name || "").trim();
  const highway = String(toll.highway || "").trim().toUpperCase();
  const vehicle_class = String(toll.vehicle_class || "").trim();
  const fee = Number(toll.fee);
  const pricing_scope = toll.pricing_scope || 'entry_exit';
  if (!['entry_exit', 'flat'].includes(pricing_scope) ||
      (pricing_scope === 'flat' && !['NLEX_CONNECTOR', 'NLEX_HARBOR_LINK'].includes(highway))) {
    throw new Error('Flat toll pricing is supported only for the confirmed NLEX Connector and Harbor Link barrier systems.');
  }

  if (!gate_name || !highway || !vehicle_class) {
    throw new Error("Please complete all toll gate fields.");
  }

  if (
    String(toll.fee).trim() === "" ||
    !Number.isFinite(fee) ||
    fee < 0
  ) {
    throw new Error("Enter a valid, non-negative toll fee.");
  }

  const coordinateKeys = ['entry_lat', 'entry_lng', 'exit_lat', 'exit_lng'];
  const provided = coordinateKeys.filter(key => toll[key] != null && String(toll[key]).trim() !== '');
  if (provided.length && (provided.length !== 4 || coordinateKeys.some(key =>
    !Number.isFinite(Number(toll[key])) || Math.abs(Number(toll[key])) > (key.endsWith('lat') ? 90 : 180)))) {
    throw new Error('Enter valid latitude and longitude for both toll entry and exit, or leave all four blank.');
  }
  return { gate_name, highway, vehicle_class, fee, pricing_scope,
    ...Object.fromEntries(coordinateKeys.map(key => [key, provided.length ? Number(toll[key]) : null])),
    bidirectional: toll.bidirectional === true };
}

export async function addTollGate(toll) {
  const payload = validateTollGate(toll);

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTollGate(id, toll) {
  const payload = validateTollGate(toll);

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTollGate(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;

  if (!data?.length) {
    throw new Error("Toll gate could not be deleted.");
  }
}

const normalizeName = (value) =>
  String(value || "")
    .replace(/\s*(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$/gi, "")
    .trim()
    .toLowerCase();

const coordsClose = (a, b) =>
  a.entry_lat != null &&
  b.entry_lat != null &&
  Math.abs(Number(a.entry_lat) - Number(b.entry_lat)) < 0.005 &&
  Math.abs(Number(a.entry_lng) - Number(b.entry_lng)) < 0.005 &&
  Math.abs(Number(a.exit_lat) - Number(b.exit_lat)) < 0.005 &&
  Math.abs(Number(a.exit_lng) - Number(b.exit_lng)) < 0.005;

export async function syncLuzonStandardTollGates(standardRows, existingRows = null, ops = {}) {
  const fetchFn = ops.getTollGates || getTollGates;
  const addFn = ops.addTollGate || addTollGate;
  const updateFn = ops.updateTollGate || updateTollGate;
  const current = Array.isArray(existingRows) ? existingRows : await fetchFn();

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of standardRows) {
    const targetName = normalizeName(row.gate_name);
    const match = current.find(
      (item) =>
        String(item.highway || "").trim().toUpperCase() === row.highway &&
        String(item.vehicle_class || "").trim() === row.vehicle_class &&
        (normalizeName(item.gate_name) === targetName || coordsClose(item, row))
    );

    if (!match) {
      await addFn(row);
      inserted += 1;
      continue;
    }

    const sameFee = Number(match.fee) === Number(row.fee);
    const sameScope = (match.pricing_scope || "entry_exit") === (row.pricing_scope || "entry_exit");
    const sameBidirectional = Boolean(match.bidirectional) === Boolean(row.bidirectional);
    const sameCoords =
      (row.entry_lat == null && match.entry_lat == null) ||
      (row.entry_lat != null &&
        Number(match.entry_lat) === Number(row.entry_lat) &&
        Number(match.entry_lng) === Number(row.entry_lng) &&
        Number(match.exit_lat) === Number(row.exit_lat) &&
        Number(match.exit_lng) === Number(row.exit_lng));

    if (sameFee && sameScope && sameBidirectional && sameCoords) {
      unchanged += 1;
    } else {
      await updateFn(match.id, row);
      updated += 1;
    }
  }

  return { inserted, updated, unchanged, total: standardRows.length };
}
