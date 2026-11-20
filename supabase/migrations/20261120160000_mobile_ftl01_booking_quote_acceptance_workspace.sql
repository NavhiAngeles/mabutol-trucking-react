-- Migration: 20261120160000_mobile_ftl01_booking_quote_acceptance_workspace.sql
-- Completes FTL-01 mobile booking/quote acceptance and unifies mobile_workspace():
-- 1. Updates mobile_workspace_base() and mobile_workspace() with:
--    - C03: customers.barangay and customers.province
--    - C11: users.avatar_url and users.created_at in profile
--    - D05: deliveries.truck_id, driver_trucks array, vehicle_types default dimensions
--    - FTL-01: vehicle_types min_lead_time_hours & loading_buffer_minutes, itemized shipment quote fields (omitting internal deadhead_km)
-- 2. Updates mobile_create_request_base() and mobile_create_request() for FTL scheduling,
--    min_lead_time_hours..14d window, route metrics, estimated_arrival, and estimated_linehaul.
-- 3. Adds mobile_accept_shipment_quote(p_shipment uuid) ('quoted' -> 'booked').

-- 1. Unified mobile_workspace_base() and mobile_workspace()
CREATE OR REPLACE FUNCTION public.mobile_workspace_base()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  me public.users%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', me.id,
      'full_name', me.full_name,
      'email', me.email,
      'phone', me.phone,
      'role', me.role,
      'avatar_url', me.avatar_url,
      'created_at', me.created_at
    ),
    'customer', (
      SELECT to_jsonb(c)
      FROM (
        SELECT id, name, phone, address, barangay, city, province
        FROM public.customers
        WHERE user_id = me.id
        LIMIT 1
      ) c
    ),
    'vehicles', coalesce(
      (
        SELECT jsonb_agg(v ORDER BY v.name)
        FROM (
          SELECT
            id,
            name,
            default_capacity_kg,
            toll_class,
            min_lead_time_hours,
            loading_buffer_minutes,
            default_height_m,
            default_width_m,
            default_length_m
          FROM public.vehicle_types
          WHERE is_active
        ) v
      ),
      '[]'::jsonb
    ),
    'shipments', coalesce(
      (
        SELECT jsonb_agg(s ORDER BY s.created_at DESC)
        FROM (
          SELECT
            id,
            tracking_number,
            status,
            pickup_address,
            dropoff_address,
            cargo_description,
            weight_kg,
            special_handling,
            scheduled_departure,
            estimated_arrival,
            quoted_amount,
            final_amount,
            driver_notes,
            cancelled_reason,
            created_at,
            updated_at
          FROM public.shipments
          ORDER BY created_at DESC
          LIMIT 200
        ) s
      ),
      '[]'::jsonb
    ),
    'deliveries', coalesce(
      (
        SELECT jsonb_agg(d)
        FROM (
          SELECT
            id,
            shipment_id,
            truck_id,
            status,
            assigned_at,
            departed_at,
            arrived_at,
            recipient_name,
            route_started_at,
            pickup_arrived_at,
            customer_showed_at
          FROM public.deliveries
          ORDER BY assigned_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'documents', coalesce(
      (
        SELECT jsonb_agg(d)
        FROM (
          SELECT id, shipment_id, kind, file_name, recipient_name, created_at
          FROM public.delivery_documents
          ORDER BY created_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'notifications', coalesce(
      (
        SELECT jsonb_agg(n ORDER BY n.created_at DESC)
        FROM (
          SELECT id, title, body, shipment_id, read_at, created_at
          FROM public.notifications
          WHERE user_id = me.id
          ORDER BY created_at DESC
          LIMIT 100
        ) n
      ),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_workspace_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace_base() TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  result := public.mobile_workspace_base();
  RETURN result || jsonb_build_object(
    'shipments', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
        FROM (
          SELECT
            id,
            tracking_number,
            status,
            pickup_address,
            dropoff_address,
            pickup_lat,
            pickup_lng,
            dropoff_lat,
            dropoff_lng,
            cargo_description,
            weight_kg,
            special_handling,
            requested_vehicle_type_id,
            scheduled_departure,
            estimated_arrival,
            linehaul_amount,
            toll_amount,
            mobilization_fee,
            quoted_amount,
            override_amount,
            final_amount,
            quote_expires_at,
            driver_notes,
            cancelled_reason,
            created_at,
            updated_at,
            distance_km,
            route_source,
            route_duration_minutes,
            route_geometry
          FROM public.shipments
          ORDER BY created_at DESC
          LIMIT 200
        ) s
      ),
      '[]'::jsonb
    ),
    'deliveries', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(d))
        FROM (
          SELECT
            id,
            shipment_id,
            truck_id,
            status,
            assigned_at,
            updated_at,
            departed_at,
            arrived_at,
            recipient_name,
            route_started_at,
            pickup_arrived_at,
            customer_showed_at,
            grace_ends_at,
            auto_cancel_at,
            proof_attempt,
            proof_review_status,
            proof_review_reason
          FROM public.deliveries
          ORDER BY assigned_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'driver_trucks', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.plate_number, t.id)
        FROM (
          SELECT
            tr.id,
            tr.fleet_code,
            tr.plate_number,
            tr.model,
            tr.model_year,
            tr.vehicle_type_id,
            tr.capacity_kg,
            tr.status,
            tr.assigned_driver_id,
            tr.height_m,
            tr.width_m,
            tr.length_m,
            tr.tare_weight_kg,
            tr.gross_weight_kg,
            tr.axle_count
          FROM public.trucks tr
          WHERE public.get_user_role() = 'driver'
            AND (
              tr.assigned_driver_id = public.my_driver_id()
              OR tr.id IN (
                SELECT d.truck_id
                FROM public.deliveries d
                WHERE d.driver_id = public.my_driver_id()
              )
            )
        ) t
      ),
      '[]'::jsonb
    ),
    'settings', coalesce(
      (
        SELECT jsonb_object_agg(key, value)
        FROM public.system_settings
        WHERE key IN (
          'no_show_arrival_radius_meters',
          'no_show_grace_minutes',
          'no_show_total_wait_minutes',
          'buffered_tracking_window_minutes'
        )
      ),
      '{}'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace() TO authenticated;

-- 2. Update mobile_create_request_base and mobile_create_request for FTL-01
CREATE OR REPLACE FUNCTION public.mobile_create_request_base(
  p_request_id uuid,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer uuid;
  shipment public.shipments%ROWTYPE;
  vehicle public.vehicle_types%ROWTYPE;
  weight numeric;
  departure timestamptz;
  contact text;
  max_capacity numeric;
  lead_hours integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CUSTOMER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO customer
  FROM public.customers
  WHERE user_id = auth.uid() AND is_active;

  IF customer IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED';
  END IF;

  IF p_request_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text, 0)
  );

  departure := coalesce(
    nullif(p_data->>'scheduled_departure', ''),
    nullif(p_data->>'departure', '')
  )::timestamptz;

  SELECT * INTO shipment
  FROM public.shipments
  WHERE customer_id = customer AND client_request_id = p_request_id;

  IF FOUND THEN
    IF shipment.pickup_address IS DISTINCT FROM btrim(p_data->>'pickup')
       OR shipment.dropoff_address IS DISTINCT FROM btrim(p_data->>'dropoff')
       OR shipment.cargo_description IS DISTINCT FROM btrim(p_data->>'cargo')
       OR shipment.weight_kg IS DISTINCT FROM (p_data->>'weight')::numeric
       OR shipment.requested_vehicle_type_id IS DISTINCT FROM (p_data->>'vehicle_id')::uuid
       OR shipment.scheduled_departure IS DISTINCT FROM departure
       OR shipment.driver_notes IS DISTINCT FROM 'Contact: ' || (p_data->>'contact') || E'\n' || coalesce(p_data->>'notes', '') THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
    RETURN jsonb_build_object(
      'id', shipment.id,
      'tracking_number', shipment.tracking_number,
      'status', shipment.status,
      'replayed', true
    );
  END IF;

  IF jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 10000 THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  IF length(btrim(coalesce(p_data->>'pickup', ''))) < 5 OR length(p_data->>'pickup') > 500
     OR length(btrim(coalesce(p_data->>'dropoff', ''))) < 5 OR length(p_data->>'dropoff') > 500
     OR lower(btrim(p_data->>'pickup')) = lower(btrim(p_data->>'dropoff'))
     OR length(btrim(coalesce(p_data->>'cargo', ''))) < 3 OR length(p_data->>'cargo') > 1000
     OR length(coalesce(p_data->>'notes', '')) > 2000 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_DETAILS';
  END IF;

  contact := p_data->>'contact';
  IF contact IS NULL OR contact !~ '^\+639[0-9]{9}$' THEN
    RAISE EXCEPTION 'INVALID_CONTACT';
  END IF;

  weight := (p_data->>'weight')::numeric;
  IF weight IS NULL OR weight <= 0 OR weight::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;

  SELECT * INTO vehicle
  FROM public.vehicle_types
  WHERE id = (p_data->>'vehicle_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_TYPE';
  END IF;

  SELECT max(capacity_kg) INTO max_capacity
  FROM public.trucks
  WHERE vehicle_type_id = vehicle.id;

  IF weight > coalesce(max_capacity, vehicle.default_capacity_kg, 0) THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED';
  END IF;

  lead_hours := coalesce(vehicle.min_lead_time_hours, 24);
  IF departure IS NULL
     OR departure < now() + make_interval(hours => lead_hours)
     OR departure > now() + interval '14 days' THEN
    RAISE EXCEPTION 'INVALID_DEPARTURE';
  END IF;

  INSERT INTO public.shipments (
    customer_id,
    status,
    booking_source,
    cargo_description,
    weight_kg,
    requested_vehicle_type_id,
    pickup_address,
    dropoff_address,
    scheduled_departure,
    driver_notes,
    created_by,
    client_request_id
  )
  VALUES (
    customer,
    'pending',
    'mobile',
    btrim(p_data->>'cargo'),
    weight,
    vehicle.id,
    btrim(p_data->>'pickup'),
    btrim(p_data->>'dropoff'),
    departure,
    'Contact: ' || contact || E'\n' || coalesce(p_data->>'notes', ''),
    auth.uid(),
    p_request_id
  )
  RETURNING * INTO shipment;

  RETURN jsonb_build_object(
    'id', shipment.id,
    'tracking_number', shipment.tracking_number,
    'status', shipment.status,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_create_request_base(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mobile_create_request(
  p_request_id uuid,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  s public.shipments%ROWTYPE;
  lat1 numeric;
  lng1 numeric;
  lat2 numeric;
  lng2 numeric;
  handling text;
  v_distance_km numeric;
  v_duration_mins numeric;
  v_estimated_arrival timestamptz;
  v_estimated_linehaul numeric;
  v_departure timestamptz;
  v_replayed boolean;
BEGIN
  lat1 := (p_data->>'pickup_lat')::numeric;
  lng1 := (p_data->>'pickup_lng')::numeric;
  lat2 := (p_data->>'dropoff_lat')::numeric;
  lng2 := (p_data->>'dropoff_lng')::numeric;

  IF p_data ?| array['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng'] AND (
    lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL
    OR NOT (lat1 BETWEEN -90 AND 90)
    OR NOT (lat2 BETWEEN -90 AND 90)
    OR NOT (lng1 BETWEEN -180 AND 180)
    OR NOT (lng2 BETWEEN -180 AND 180)
    OR (lat1 = lat2 AND lng1 = lng2)
  ) THEN
    RAISE EXCEPTION 'INVALID_COORDINATES';
  END IF;

  handling := coalesce(p_data->>'handling', 'None');
  IF handling NOT IN ('None', 'Fragile', 'Keep Dry', 'Temperature Sensitive', 'Perishable', 'Cold Chain (Refrigerated)') THEN
    RAISE EXCEPTION 'INVALID_HANDLING';
  END IF;

  v_distance_km := coalesce(
    nullif(p_data->>'distance_km', ''),
    nullif(p_data->>'route_distance_km', '')
  )::numeric;
  IF v_distance_km IS NOT NULL AND (
    v_distance_km <= 0 OR v_distance_km > 20000 OR v_distance_km::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'INVALID_ROUTE_METRICS';
  END IF;

  v_duration_mins := nullif(p_data->>'route_duration_minutes', '')::numeric;
  IF v_duration_mins IS NOT NULL AND (
    v_duration_mins <= 0 OR v_duration_mins > 100000 OR v_duration_mins::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'INVALID_ROUTE_METRICS';
  END IF;

  v_departure := coalesce(
    nullif(p_data->>'scheduled_departure', ''),
    nullif(p_data->>'departure', '')
  )::timestamptz;

  v_estimated_arrival := nullif(p_data->>'estimated_arrival', '')::timestamptz;
  IF v_estimated_arrival IS NOT NULL AND v_departure IS NOT NULL AND v_estimated_arrival <= v_departure THEN
    RAISE EXCEPTION 'INVALID_ESTIMATED_ARRIVAL';
  END IF;

  v_estimated_linehaul := nullif(p_data->>'estimated_linehaul', '')::numeric;
  IF v_estimated_linehaul IS NOT NULL AND (
    v_estimated_linehaul < 0 OR v_estimated_linehaul > 1000000000 OR v_estimated_linehaul::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'INVALID_ESTIMATED_LINEHAUL';
  END IF;

  result := public.mobile_create_request_base(p_request_id, p_data);
  v_replayed := coalesce((result->>'replayed')::boolean, false);

  SELECT * INTO s
  FROM public.shipments
  WHERE id = (result->>'id')::uuid
  FOR UPDATE;

  IF v_replayed THEN
    IF s.pickup_lat IS DISTINCT FROM lat1
       OR s.pickup_lng IS DISTINCT FROM lng1
       OR s.dropoff_lat IS DISTINCT FROM lat2
       OR s.dropoff_lng IS DISTINCT FROM lng2
       OR s.special_handling IS DISTINCT FROM handling
       OR s.distance_km IS DISTINCT FROM v_distance_km
       OR s.route_duration_minutes IS DISTINCT FROM v_duration_mins
       OR (v_estimated_arrival IS NOT NULL AND s.estimated_arrival IS DISTINCT FROM v_estimated_arrival)
       OR s.linehaul_amount IS DISTINCT FROM v_estimated_linehaul THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
  ELSIF s.status = 'pending' THEN
    UPDATE public.shipments
    SET
      pickup_lat = lat1,
      pickup_lng = lng1,
      dropoff_lat = lat2,
      dropoff_lng = lng2,
      special_handling = handling,
      distance_km = coalesce(v_distance_km, distance_km),
      route_duration_minutes = coalesce(v_duration_mins, route_duration_minutes),
      estimated_arrival = coalesce(v_estimated_arrival, estimated_arrival),
      linehaul_amount = coalesce(v_estimated_linehaul, linehaul_amount)
    WHERE id = s.id;
  END IF;

  RETURN result - 'replayed';
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_create_request(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_create_request(uuid, jsonb) TO authenticated;

-- 3. Customer quote acceptance RPC: 'quoted' -> 'booked'
CREATE OR REPLACE FUNCTION public.mobile_accept_shipment_quote(p_shipment uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_shipment public.shipments%ROWTYPE;
  v_office record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CUSTOMER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_customer_id := public.my_customer_id();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = p_shipment AND customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND';
  END IF;

  IF v_shipment.status::text <> 'quoted' THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_QUOTED';
  END IF;

  IF v_shipment.quote_expires_at IS NOT NULL AND v_shipment.quote_expires_at <= now() THEN
    RAISE EXCEPTION 'QUOTE_EXPIRED';
  END IF;

  IF coalesce(v_shipment.final_amount, v_shipment.quoted_amount) IS NULL
     OR coalesce(v_shipment.final_amount, v_shipment.quoted_amount) < 0 THEN
    RAISE EXCEPTION 'INVALID_QUOTE_AMOUNT';
  END IF;

  IF v_shipment.scheduled_departure IS NOT NULL AND v_shipment.scheduled_departure <= now() THEN
    RAISE EXCEPTION 'DEPARTURE_PASSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deliveries WHERE shipment_id = v_shipment.id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_EXISTS';
  END IF;

  UPDATE public.shipments
  SET
    status = 'booked',
    updated_at = now()
  WHERE id = v_shipment.id
  RETURNING * INTO v_shipment;

  INSERT INTO public.shipment_events (shipment_id, event_type, actor_id, meta, occurred_at)
  VALUES (
    v_shipment.id,
    'quote_accepted',
    auth.uid(),
    jsonb_build_object(
      'quoted_amount', v_shipment.quoted_amount,
      'final_amount', coalesce(v_shipment.final_amount, v_shipment.quoted_amount),
      'accepted_by', 'customer'
    ),
    now()
  );

  FOR v_office IN
    SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff')
  LOOP
    PERFORM public.notify_user(
      v_office.id,
      'booking_confirmed'::public.notification_type,
      'Customer accepted quotation',
      'Customer accepted the quote for ' || coalesce(v_shipment.tracking_number, 'shipment') || '. Ready for dispatch.',
      v_shipment.id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_shipment.id,
    'status', v_shipment.status,
    'updated_at', v_shipment.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_accept_shipment_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_accept_shipment_quote(uuid) TO authenticated;

-- 4. Allow office cancellation of 'quoted' shipments alongside pending/booked/assigned/delayed
CREATE OR REPLACE FUNCTION public.office_cancel_shipment(
  p_shipment uuid,
  p_expected timestamptz,
  p_expected_delivery uuid,
  p_reason text,
  p_financial_ack boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  s public.shipments%ROWTYPE;
  d public.deliveries%ROWTYPE;
  current_delivery public.deliveries%ROWTYPE;
  delivery_count integer := 0;
  payment_count bigint;
  previous_status text;
  is_overdue_departure boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role::text IN ('admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Only active admin or staff may cancel shipments' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Enter a cancellation reason of 5 to 1000 characters';
  END IF;
  IF p_financial_ack IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Acknowledge that cancellation does not refund payments or change recorded charges';
  END IF;
  SELECT * INTO s FROM public.shipments WHERE id = p_shipment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found or access denied';
  END IF;
  IF p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Shipment changed. Reload before cancelling.' USING ERRCODE = '40001';
  END IF;
  IF s.status NOT IN ('pending', 'quoted', 'booked', 'assigned', 'delayed') THEN
    RAISE EXCEPTION 'Only pending, quoted, booked, unstarted assigned, or departure-delayed shipments can be cancelled here';
  END IF;
  FOR current_delivery IN
    SELECT * FROM public.deliveries
    WHERE shipment_id = s.id AND status <> 'cancelled'
    ORDER BY id FOR UPDATE
  LOOP
    delivery_count := delivery_count + 1;
    d := current_delivery;
  END LOOP;
  IF delivery_count > 1 OR d.id IS DISTINCT FROM p_expected_delivery THEN
    RAISE EXCEPTION 'Assignment changed. Reload before cancelling.' USING ERRCODE = '40001';
  END IF;

  -- After 12 hours of the set departure time and the driver still has not arrived at pickup:
  is_overdue_departure := (
    s.scheduled_departure IS NOT NULL
    AND now() >= (s.scheduled_departure + interval '12 hours')
    AND (d.id IS NULL OR (d.pickup_arrived_at IS NULL AND d.departed_at IS NULL AND d.status NOT IN ('loading', 'in_transit', 'delivered')))
  );

  IF is_overdue_departure THEN
    NULL;
  ELSIF s.status IN ('booked', 'assigned') THEN
    IF delivery_count > 1 OR (delivery_count = 1 AND (d.status <> 'assigned' OR d.departed_at IS NOT NULL
      OR d.route_started_at IS NOT NULL OR d.pickup_arrived_at IS NOT NULL
      OR d.customer_showed_at IS NOT NULL OR d.grace_ends_at IS NOT NULL OR d.auto_cancel_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'Started trips cannot be cancelled here. Use the operational review workflow; no-show requires its separate review.';
    END IF;
  ELSIF delivery_count <> 0 THEN
    RAISE EXCEPTION 'Shipment has an unexpected active delivery. Reload and review its lifecycle.';
  END IF;
  IF d.id IS NOT NULL THEN
    PERFORM 1 FROM public.drivers WHERE id = d.driver_id FOR UPDATE;
    PERFORM 1 FROM public.trucks WHERE id = d.truck_id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.deliveries
      WHERE id <> d.id AND status IN ('assigned', 'loading', 'in_transit')
        AND (driver_id = d.driver_id OR truck_id = d.truck_id)
    ) THEN
      RAISE EXCEPTION 'Resources are shared with another active delivery. Resolve the reservation conflict first.';
    END IF;
    UPDATE public.deliveries SET status = 'cancelled' WHERE id = d.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delivery cancellation denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO payment_count FROM public.payments WHERE shipment_id = s.id;
  previous_status := s.status::text;
  UPDATE public.shipments
  SET status = 'cancelled', cancelled_reason = btrim(p_reason), cancelled_at = now()
  WHERE id = s.id
  RETURNING * INTO s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment cancellation denied' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.shipment_events(shipment_id, delivery_id, event_type, actor_id, meta)
  VALUES (
    s.id,
    d.id,
    'shipment_cancelled',
    auth.uid(),
    jsonb_build_object(
      'reason', btrim(p_reason),
      'previous_status', previous_status,
      'previous_delivery', d.id,
      'financial_policy', 'preserve_charges_and_payments_no_automatic_fee_or_refund',
      'financial_acknowledged', true,
      'payment_count_at_cancellation', payment_count,
      'financial_review_required', payment_count > 0,
      'cancellation_rule', CASE WHEN is_overdue_departure THEN 'scheduled_departure_overdue_12h_no_pickup_arrival' ELSE 'pre_trip_unstarted' END
    )
  );
  RETURN jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'updated_at', s.updated_at,
    'cancelled_at', s.cancelled_at,
    'delivery_id', d.id,
    'financial_review_required', payment_count > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.office_cancel_shipment(uuid, timestamptz, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_cancel_shipment(uuid, timestamptz, uuid, text, boolean) TO authenticated;
