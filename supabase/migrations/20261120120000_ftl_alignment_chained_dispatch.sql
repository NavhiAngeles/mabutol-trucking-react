-- Migration: 20261120120000_ftl_alignment_chained_dispatch.sql
-- FTL Business Process Realignment: schema columns, indexes, chained availability triggers,
-- PostGIS ranked truck discovery RPC, and extended pricing/booking review support.

-- 0. Add 'quoted' lifecycle state to public.shipment_status (must execute outside a multi-statement BEGIN/COMMIT transaction block)
ALTER TYPE public.shipment_status ADD VALUE IF NOT EXISTS 'quoted';

-- 1. Equipment-specific lead times & loading/unloading dwell buffers
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS min_lead_time_hours integer NOT NULL DEFAULT 24 CHECK (min_lead_time_hours >= 0),
  ADD COLUMN IF NOT EXISTS loading_buffer_minutes integer NOT NULL DEFAULT 180 CHECK (loading_buffer_minutes >= 0);

-- Set 48-hour prep lead time for specialized equipment (Refrigerated & Flatbed)
UPDATE public.vehicle_types
SET min_lead_time_hours = 48
WHERE (name ILIKE '%refrigerated%' OR name ILIKE '%flat%')
  AND min_lead_time_hours < 48;

-- 2. Deadhead thresholds on existing pricing_rates
ALTER TABLE public.pricing_rates
  ADD COLUMN IF NOT EXISTS free_deadhead_km numeric NOT NULL DEFAULT 30 CHECK (free_deadhead_km >= 0),
  ADD COLUMN IF NOT EXISTS deadhead_per_km_rate numeric NOT NULL DEFAULT 0 CHECK (deadhead_per_km_rate >= 0);

-- 3. Price breakdown, internal deadhead metric, and quote expiry on shipments
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS linehaul_amount numeric CHECK (linehaul_amount >= 0),
  ADD COLUMN IF NOT EXISTS toll_amount numeric NOT NULL DEFAULT 0 CHECK (toll_amount >= 0),
  ADD COLUMN IF NOT EXISTS mobilization_fee numeric NOT NULL DEFAULT 0 CHECK (mobilization_fee >= 0),
  ADD COLUMN IF NOT EXISTS deadhead_km numeric NOT NULL DEFAULT 0 CHECK (deadhead_km >= 0),
  ADD COLUMN IF NOT EXISTS quote_expires_at timestamp with time zone;

-- 4. Projected availability & location on trucks for chained dispatching
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS home_base_location_id uuid REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS current_lat numeric CHECK (current_lat IS NULL OR (current_lat >= -90 AND current_lat <= 90)),
  ADD COLUMN IF NOT EXISTS current_lng numeric CHECK (current_lng IS NULL OR (current_lng >= -180 AND current_lng <= 180)),
  ADD COLUMN IF NOT EXISTS last_location_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS next_available_address text,
  ADD COLUMN IF NOT EXISTS next_available_lat numeric CHECK (next_available_lat IS NULL OR (next_available_lat >= -90 AND next_available_lat <= 90)),
  ADD COLUMN IF NOT EXISTS next_available_lng numeric CHECK (next_available_lng IS NULL OR (next_available_lng >= -180 AND next_available_lng <= 180)),
  ADD COLUMN IF NOT EXISTS next_available_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_trucks_next_available_at ON public.trucks (next_available_at);
CREATE INDEX IF NOT EXISTS idx_shipments_scheduled_departure ON public.shipments (scheduled_departure);

-- 5. Automated Chained Availability Triggers (hardened per SYS-28)

-- A. Sync truck projected location & availability when a delivery status changes
CREATE OR REPLACE FUNCTION public.sync_truck_availability_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shipment record;
  v_buffer_mins integer := 180;
  v_unloading_mins integer := 90;
  v_eta timestamp with time zone;
  v_has_other_active boolean;
BEGIN
  IF NEW.truck_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    s.dropoff_address,
    s.dropoff_lat,
    s.dropoff_lng,
    s.scheduled_departure,
    s.estimated_arrival,
    s.route_duration_minutes,
    vt.loading_buffer_minutes
  INTO v_shipment
  FROM public.shipments s
  LEFT JOIN public.vehicle_types vt ON vt.id = s.requested_vehicle_type_id
  WHERE s.id = NEW.shipment_id;

  v_buffer_mins := COALESCE(v_shipment.loading_buffer_minutes, 180);
  v_unloading_mins := GREATEST(v_buffer_mins / 2, 60);

  -- 1. Delivery Completed / Delivered -> Truck is at drop-off & immediately available
  IF NEW.status::text IN ('completed', 'delivered') THEN
    UPDATE public.trucks
    SET
      current_lat = COALESCE(v_shipment.dropoff_lat, current_lat),
      current_lng = COALESCE(v_shipment.dropoff_lng, current_lng),
      last_location_at = now(),
      next_available_address = v_shipment.dropoff_address,
      next_available_lat = COALESCE(v_shipment.dropoff_lat, current_lat),
      next_available_lng = COALESCE(v_shipment.dropoff_lng, current_lng),
      next_available_at = now(),
      updated_at = now()
    WHERE id = NEW.truck_id;

  -- 2. Delivery Cancelled -> Fallback to home base or current position if no other active deliveries exist
  ELSIF NEW.status::text = 'cancelled' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.truck_id = NEW.truck_id
        AND d.id <> NEW.id
        AND d.status::text NOT IN ('completed', 'delivered', 'cancelled')
    ) INTO v_has_other_active;

    IF NOT v_has_other_active THEN
      UPDATE public.trucks t
      SET
        next_available_address = COALESCE(l.address, l.name),
        next_available_lat = COALESCE(t.current_lat, l.latitude),
        next_available_lng = COALESCE(t.current_lng, l.longitude),
        next_available_at = now(),
        updated_at = now()
      FROM public.locations l
      WHERE t.id = NEW.truck_id
        AND l.id = t.home_base_location_id;

      UPDATE public.trucks
      SET
        next_available_address = CASE WHEN current_lat IS NOT NULL THEN 'Last Recorded GPS Position' ELSE NULL END,
        next_available_lat = current_lat,
        next_available_lng = current_lng,
        next_available_at = now(),
        updated_at = now()
      WHERE id = NEW.truck_id
        AND home_base_location_id IS NULL;
    END IF;

  -- 3. Active Delivery -> Project availability at destination + unloading buffer
  ELSE
    v_eta := COALESCE(
      v_shipment.estimated_arrival,
      COALESCE(v_shipment.scheduled_departure, now())
        + make_interval(mins => ROUND(COALESCE(v_shipment.route_duration_minutes, 120))::int + v_buffer_mins)
    );

    UPDATE public.trucks
    SET
      next_available_address = v_shipment.dropoff_address,
      next_available_lat = v_shipment.dropoff_lat,
      next_available_lng = v_shipment.dropoff_lng,
      next_available_at = v_eta + make_interval(mins => v_unloading_mins),
      updated_at = now()
    WHERE id = NEW.truck_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_truck_availability_on_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_truck_availability_on_delivery ON public.deliveries;
CREATE TRIGGER trg_sync_truck_availability_on_delivery
  AFTER INSERT OR UPDATE OF status, truck_id
  ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_truck_availability_on_delivery();

-- B. Sync truck's next_available_at when live route ETA updates occur
CREATE OR REPLACE FUNCTION public.sync_truck_eta_from_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_truck_id uuid;
  v_unloading_mins integer := 90;
BEGIN
  IF NEW.leg = 'destination' THEN
    SELECT
      d.truck_id,
      GREATEST(COALESCE(vt.loading_buffer_minutes, 180) / 2, 60)
    INTO v_truck_id, v_unloading_mins
    FROM public.deliveries d
    JOIN public.shipments s ON s.id = d.shipment_id
    LEFT JOIN public.vehicle_types vt ON vt.id = s.requested_vehicle_type_id
    WHERE d.id = NEW.delivery_id;

    IF v_truck_id IS NOT NULL THEN
      UPDATE public.trucks
      SET
        next_available_at = NEW.eta_at + make_interval(mins => v_unloading_mins),
        updated_at = now()
      WHERE id = v_truck_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_truck_eta_from_route() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_truck_eta_from_route ON public.delivery_route_eta;
CREATE TRIGGER trg_sync_truck_eta_from_route
  AFTER INSERT OR UPDATE OF eta_at, leg
  ON public.delivery_route_eta
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_truck_eta_from_route();

-- C. Keep current_lat and current_lng updated from driver tracking logs
CREATE OR REPLACE FUNCTION public.sync_truck_gps_from_tracking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.truck_id IS NOT NULL THEN
    UPDATE public.trucks
    SET
      current_lat = NEW.latitude,
      current_lng = NEW.longitude,
      last_location_at = NEW.recorded_at
    WHERE id = NEW.truck_id
      AND (last_location_at IS NULL OR NEW.recorded_at >= last_location_at);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_truck_gps_from_tracking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_truck_gps_from_tracking ON public.tracking_logs;
CREATE TRIGGER trg_sync_truck_gps_from_tracking
  AFTER INSERT ON public.tracking_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_truck_gps_from_tracking();

-- 6. Smart Dispatch & Truck Ranking RPC Function (PostGIS in extensions schema, office-guarded)
CREATE OR REPLACE FUNCTION public.get_ranked_trucks_for_shipment(p_shipment_id uuid)
RETURNS TABLE (
  truck_id uuid,
  fleet_code text,
  plate_number text,
  vehicle_type_id uuid,
  vehicle_type_name text,
  truck_status text,
  assigned_driver_id uuid,
  driver_name text,
  projected_location_label text,
  projected_lat numeric,
  projected_lng numeric,
  available_at timestamp with time zone,
  estimated_deadhead_km numeric,
  can_make_pickup boolean,
  schedule_gap_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shipment record;
BEGIN
  PERFORM public.require_active_office();

  SELECT
    s.requested_vehicle_type_id,
    s.pickup_lat,
    s.pickup_lng,
    COALESCE(s.scheduled_departure, now()) AS target_pickup
  INTO v_shipment
  FROM public.shipments s
  WHERE s.id = p_shipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH truck_positions AS (
    SELECT
      t.id,
      t.fleet_code,
      t.plate_number,
      t.vehicle_type_id,
      vt.name AS vehicle_type_name,
      t.status::text AS truck_status,
      t.assigned_driver_id,
      d.full_name AS driver_name,
      COALESCE(
        t.next_available_address,
        CASE WHEN t.current_lat IS NOT NULL THEN 'Current GPS Position' END,
        l.address,
        l.name,
        'Home Base'
      ) AS loc_label,
      COALESCE(t.next_available_lat, t.current_lat, l.latitude) AS ref_lat,
      COALESCE(t.next_available_lng, t.current_lng, l.longitude) AS ref_lng,
      COALESCE(t.next_available_at, now()) AS avail_at
    FROM public.trucks t
    LEFT JOIN public.vehicle_types vt ON vt.id = t.vehicle_type_id
    LEFT JOIN public.drivers d ON d.id = t.assigned_driver_id
    LEFT JOIN public.locations l ON l.id = t.home_base_location_id
    WHERE t.status::text NOT IN ('maintenance', 'inactive', 'retired')
      AND (
        v_shipment.requested_vehicle_type_id IS NULL
        OR t.vehicle_type_id = v_shipment.requested_vehicle_type_id
      )
  ),
  computed AS (
    SELECT
      tp.*,
      CASE
        WHEN tp.ref_lat IS NOT NULL
          AND tp.ref_lng IS NOT NULL
          AND v_shipment.pickup_lat IS NOT NULL
          AND v_shipment.pickup_lng IS NOT NULL
        THEN ROUND(
          (
            extensions.ST_Distance(
              extensions.ST_SetSRID(extensions.ST_MakePoint(tp.ref_lng::double precision, tp.ref_lat::double precision), 4326)::extensions.geography,
              extensions.ST_SetSRID(extensions.ST_MakePoint(v_shipment.pickup_lng::double precision, v_shipment.pickup_lat::double precision), 4326)::extensions.geography
            ) / 1000.0 * 1.25
          )::numeric,
          2
        )
        ELSE 0::numeric
      END AS deadhead_km
    FROM truck_positions tp
  )
  SELECT
    c.id AS truck_id,
    c.fleet_code,
    c.plate_number,
    c.vehicle_type_id,
    c.vehicle_type_name,
    c.truck_status,
    c.assigned_driver_id,
    c.driver_name,
    c.loc_label AS projected_location_label,
    c.ref_lat AS projected_lat,
    c.ref_lng AS projected_lng,
    c.avail_at AS available_at,
    c.deadhead_km AS estimated_deadhead_km,
    (
      c.avail_at + make_interval(mins => ROUND((c.deadhead_km / 40.0) * 60 + 30)::int)
      <= v_shipment.target_pickup
    ) AS can_make_pickup,
    (
      EXTRACT(
        EPOCH FROM (
          v_shipment.target_pickup - (c.avail_at + make_interval(mins => ROUND((c.deadhead_km / 40.0) * 60)::int))
        )
      ) / 60
    )::integer AS schedule_gap_minutes
  FROM computed c
  ORDER BY
    can_make_pickup DESC,
    c.deadhead_km ASC,
    c.avail_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ranked_trucks_for_shipment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranked_trucks_for_shipment(uuid) TO authenticated;

-- 7. Update estimated arrival trigger to add vehicle_types.loading_buffer_minutes to route duration
CREATE OR REPLACE FUNCTION public.stamp_shipment_estimated_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_avg_speed numeric := 30.0;
  v_loading_buffer_minutes integer := 180;
  v_route_minutes numeric;
BEGIN
  IF NEW.estimated_arrival IS NULL AND NEW.scheduled_departure IS NOT NULL THEN
    IF NEW.requested_vehicle_type_id IS NOT NULL THEN
      SELECT vt.loading_buffer_minutes
      INTO v_loading_buffer_minutes
      FROM public.vehicle_types vt
      WHERE vt.id = NEW.requested_vehicle_type_id;
    END IF;
    v_loading_buffer_minutes := COALESCE(v_loading_buffer_minutes, 180);

    IF NEW.route_duration_minutes IS NOT NULL AND NEW.route_duration_minutes > 0 THEN
      v_route_minutes := NEW.route_duration_minutes;
    ELSIF NEW.distance_km IS NOT NULL AND NEW.distance_km > 0 THEN
      SELECT (value #>> '{}')::numeric INTO v_avg_speed FROM public.system_settings WHERE key = 'average_speed_kph';
      IF v_avg_speed IS NULL OR v_avg_speed <= 0 THEN v_avg_speed := 30.0; END IF;
      v_route_minutes := (NEW.distance_km / v_avg_speed) * 60.0;
    END IF;

    IF v_route_minutes IS NOT NULL AND v_route_minutes > 0 THEN
      NEW.estimated_arrival := NEW.scheduled_departure + make_interval(mins => ROUND(v_route_minutes)::int + v_loading_buffer_minutes);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_shipment_estimated_arrival() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_shipment_estimated_arrival ON public.shipments;
CREATE TRIGGER trg_stamp_shipment_estimated_arrival
  BEFORE INSERT OR UPDATE OF scheduled_departure, distance_km, route_duration_minutes, requested_vehicle_type_id
  ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_shipment_estimated_arrival();

-- 8. Extend pricing save RPCs to persist free_deadhead_km, deadhead_per_km_rate, and vehicle_types rules atomically
CREATE OR REPLACE FUNCTION public.save_pricing(p_rates jsonb, p_settings jsonb, p_vehicle_types jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  setting_key text;
  rate public.pricing_rates%ROWTYPE;
  vt public.vehicle_types%ROWTYPE;
  changed integer := 0;
  changed_vt integer := 0;
  affected integer;
  v_free_deadhead_km numeric;
  v_deadhead_rate numeric;
  v_lead_time_hours integer;
  v_buffer_minutes integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only active administrators can save pricing.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
     OR jsonb_typeof(coalesce(p_vehicle_types, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_object_keys(p_settings)) <> 3
     OR NOT (p_settings ?& ARRAY['minimum_booking_fee', 'driver_allowance', 'handling_surcharges']) THEN
    RAISE EXCEPTION 'Invalid pricing payload.';
  END IF;
  FOREACH setting_key IN ARRAY ARRAY['minimum_booking_fee', 'driver_allowance'] LOOP
    IF jsonb_typeof(p_settings->setting_key) IS DISTINCT FROM 'number'
       OR (p_settings->>setting_key)::numeric < 0 THEN
      RAISE EXCEPTION 'Invalid pricing amount: %', setting_key;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_settings->'handling_surcharges') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_settings->'handling_surcharges')) <> 6
     OR NOT ((p_settings->'handling_surcharges') ?& ARRAY['none', 'fragile', 'keepdry', 'temp', 'perishable', 'cold']) THEN
    RAISE EXCEPTION 'Invalid handling surcharge configuration.';
  END IF;
  FOR setting_key, item IN SELECT key, value FROM jsonb_each(p_settings->'handling_surcharges') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'number' OR item::text::numeric < 0 THEN
      RAISE EXCEPTION 'Invalid handling surcharge: %', setting_key;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rates)) <>
     (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_rates)) THEN
    RAISE EXCEPTION 'Duplicate or missing pricing rate IDs.';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb))) <>
     (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb))) THEN
    RAISE EXCEPTION 'Duplicate or missing vehicle type IDs.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rates) ORDER BY value->>'id' LOOP
    IF jsonb_typeof(item->'per_km_rate') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'expected_rate') IS DISTINCT FROM 'number'
       OR (item->>'per_km_rate')::numeric < 0 THEN
      RAISE EXCEPTION 'Invalid vehicle rate.';
    END IF;

    IF item ? 'free_deadhead_km' THEN
      IF jsonb_typeof(item->'free_deadhead_km') IS DISTINCT FROM 'number'
         OR (item->>'free_deadhead_km')::numeric < 0 THEN
        RAISE EXCEPTION 'Invalid free deadhead threshold.';
      END IF;
    END IF;
    IF item ? 'deadhead_per_km_rate' THEN
      IF jsonb_typeof(item->'deadhead_per_km_rate') IS DISTINCT FROM 'number'
         OR (item->>'deadhead_per_km_rate')::numeric < 0 THEN
        RAISE EXCEPTION 'Invalid deadhead mobilization rate.';
      END IF;
    END IF;

    SELECT * INTO rate FROM public.pricing_rates WHERE id = (item->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR NOT rate.is_active
       OR rate.vehicle_type_id IS DISTINCT FROM (item->>'vehicle_type_id')::uuid
       OR rate.per_km_rate IS DISTINCT FROM (item->>'expected_rate')::numeric
       OR (item ? 'expected_free_deadhead_km' AND rate.free_deadhead_km IS DISTINCT FROM (item->>'expected_free_deadhead_km')::numeric)
       OR (item ? 'expected_deadhead_per_km_rate' AND rate.deadhead_per_km_rate IS DISTINCT FROM (item->>'expected_deadhead_per_km_rate')::numeric) THEN
      RAISE EXCEPTION 'Vehicle pricing changed or is unavailable. Reload and retry.';
    END IF;

    v_free_deadhead_km := CASE WHEN item ? 'free_deadhead_km' THEN (item->>'free_deadhead_km')::numeric ELSE rate.free_deadhead_km END;
    v_deadhead_rate := CASE WHEN item ? 'deadhead_per_km_rate' THEN (item->>'deadhead_per_km_rate')::numeric ELSE rate.deadhead_per_km_rate END;

    UPDATE public.pricing_rates
    SET
      per_km_rate = (item->>'per_km_rate')::numeric,
      free_deadhead_km = v_free_deadhead_km,
      deadhead_per_km_rate = v_deadhead_rate
    WHERE id = rate.id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Vehicle pricing update was denied.'; END IF;
    changed := changed + 1;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb)) ORDER BY value->>'id' LOOP
    IF jsonb_typeof(item->'min_lead_time_hours') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'loading_buffer_minutes') IS DISTINCT FROM 'number'
       OR (item->>'min_lead_time_hours')::numeric < 0
       OR (item->>'min_lead_time_hours')::numeric <> trunc((item->>'min_lead_time_hours')::numeric)
       OR (item->>'loading_buffer_minutes')::numeric < 0
       OR (item->>'loading_buffer_minutes')::numeric <> trunc((item->>'loading_buffer_minutes')::numeric) THEN
      RAISE EXCEPTION 'Invalid vehicle scheduling rule.';
    END IF;

    v_lead_time_hours := (item->>'min_lead_time_hours')::integer;
    v_buffer_minutes := (item->>'loading_buffer_minutes')::integer;

    SELECT * INTO vt FROM public.vehicle_types WHERE id = (item->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR NOT vt.is_active
       OR (item ? 'expected_min_lead_time_hours' AND vt.min_lead_time_hours IS DISTINCT FROM (item->>'expected_min_lead_time_hours')::integer)
       OR (item ? 'expected_loading_buffer_minutes' AND vt.loading_buffer_minutes IS DISTINCT FROM (item->>'expected_loading_buffer_minutes')::integer) THEN
      RAISE EXCEPTION 'Vehicle rules changed or are unavailable. Reload and retry.';
    END IF;

    UPDATE public.vehicle_types
    SET
      min_lead_time_hours = v_lead_time_hours,
      loading_buffer_minutes = v_buffer_minutes
    WHERE id = vt.id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Vehicle rules update was denied.'; END IF;
    changed_vt := changed_vt + 1;
  END LOOP;

  FOR setting_key, item IN SELECT key, value FROM jsonb_each(p_settings) ORDER BY key LOOP
    INSERT INTO public.system_settings(key, value, updated_by)
    VALUES (setting_key, item, auth.uid())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Pricing setting update was denied.'; END IF;
  END LOOP;

  RETURN jsonb_build_object('saved', true, 'rates', changed, 'settings', 3, 'vehicle_types', changed_vt);
END;
$$;

REVOKE ALL ON FUNCTION public.save_pricing(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pricing(jsonb, jsonb, jsonb) TO authenticated;

-- Preserve 2-arg save_pricing signature for backward compatibility with existing callers & tests
CREATE OR REPLACE FUNCTION public.save_pricing(p_rates jsonb, p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.save_pricing(p_rates, p_settings, '[]'::jsonb);
  RETURN jsonb_build_object(
    'saved', (v_result->'saved')::boolean,
    'rates', (v_result->>'rates')::integer,
    'settings', (v_result->>'settings')::integer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_pricing(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pricing(jsonb, jsonb) TO authenticated;

-- 9. Update review_booking_request so office approval/rejection works for both 'pending' and 'quoted' requests
CREATE OR REPLACE FUNCTION public.review_booking_request(
  p_shipment uuid, p_expected_updated_at timestamptz,
  p_decision text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  request public.shipments%ROWTYPE;
  delivery_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role::text IN ('admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Only active admin or staff may review booking requests' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Choose approve or reject';
  END IF;
  SELECT * INTO request FROM public.shipments WHERE id = p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking request not found or access denied'; END IF;
  IF request.status::text NOT IN ('pending', 'quoted') OR p_expected_updated_at IS NULL
     OR request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Request changed or was already reviewed. Reload before deciding.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE shipment_id = request.id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Request already has a delivery. Reload before deciding.';
  END IF;
  IF p_decision = 'reject' THEN
    IF nullif(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) > 1000 THEN
      RAISE EXCEPTION 'Enter a rejection reason of 1 to 1000 characters';
    END IF;
    UPDATE public.shipments SET status = 'cancelled', cancelled_reason = btrim(p_reason)
    WHERE id = request.id RETURNING * INTO request;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE = '42501'; END IF;
  ELSE
    IF nullif(btrim(request.pickup_address), '') IS NULL
       OR nullif(btrim(request.dropoff_address), '') IS NULL
       OR nullif(btrim(request.cargo_description), '') IS NULL
       OR request.scheduled_departure IS NULL OR request.scheduled_departure <= now()
       OR request.distance_km IS NULL OR request.distance_km <= 0 OR request.distance_km::text IN ('NaN', 'Infinity', '-Infinity')
       OR request.weight_kg IS NULL OR request.weight_kg <= 0 OR request.weight_kg::text IN ('NaN', 'Infinity', '-Infinity')
       OR request.quoted_amount IS NULL OR request.quoted_amount < 0 OR request.quoted_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR (request.override_amount IS NOT NULL AND (request.override_amount < 0 OR request.override_amount::text IN ('NaN', 'Infinity', '-Infinity')))
       OR NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE id = request.requested_vehicle_type_id AND is_active)
       OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = request.customer_id AND is_active)
    THEN RAISE EXCEPTION 'Request needs valid cargo, route, future departure, active customer/vehicle type and quoted price before approval';
    END IF;
    UPDATE public.shipments SET status = 'booked', confirmed_by = auth.uid()
    WHERE id = request.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE = '42501'; END IF;
    delivery_id := public.assign_shipment_resources(request.id);
    SELECT * INTO request FROM public.shipments WHERE id = p_shipment;
  END IF;
  RETURN jsonb_build_object('id', request.id, 'status', request.status, 'delivery_id', delivery_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_booking_request(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_booking_request(uuid, timestamptz, text, text) TO authenticated;
