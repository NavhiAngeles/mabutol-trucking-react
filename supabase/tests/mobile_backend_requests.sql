-- Rollback SQL Test Suite: supabase/tests/mobile_backend_requests.sql
-- Verifies C03, D05, C10, FTL-01, and C11 migrations; every write rolls back.
BEGIN;

DO $fixtures$
DECLARE
  v_office uuid := gen_random_uuid();
  v_cust_user uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_driver_user uuid := gen_random_uuid();
  v_customer uuid;
  v_driver uuid;
  v_vehicle uuid;
  v_vehicle_48h uuid;
  v_truck uuid;
  v_marker text := 'mob-req-' || gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_office, v_marker || '-office@example.invalid', '{}', '{}'),
    (v_cust_user, v_marker || '-cust@example.invalid', '{}', '{}'),
    (v_other_user, v_marker || '-other@example.invalid', '{}', '{}'),
    (v_driver_user, v_marker || '-drv@example.invalid', '{}', '{}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_office;
  UPDATE public.users SET role = 'customer', is_active = true, avatar_url = v_cust_user || '/avatar.jpg' WHERE id = v_cust_user;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id = v_other_user;
  UPDATE public.users SET role = 'driver', is_active = true WHERE id = v_driver_user;

  SELECT id INTO v_customer FROM public.customers WHERE user_id = v_cust_user;

  INSERT INTO public.vehicle_types(name, default_capacity_kg, min_lead_time_hours, loading_buffer_minutes, default_height_m, default_width_m, default_length_m)
  VALUES
    (v_marker || '-6w', 6000, 24, 180, 3.20, 2.20, 7.50),
    (v_marker || '-ref', 4000, 48, 240, 3.10, 2.15, 6.80);

  SELECT id INTO v_vehicle FROM public.vehicle_types WHERE name = v_marker || '-6w';
  SELECT id INTO v_vehicle_48h FROM public.vehicle_types WHERE name = v_marker || '-ref';

  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_driver_user, v_marker || '-driver', v_marker || '-lic', 'available')
  RETURNING id INTO v_driver;

  INSERT INTO public.trucks(plate_number, vehicle_type_id, capacity_kg, assigned_driver_id, height_m, width_m, length_m, tare_weight_kg, gross_weight_kg, axle_count)
  VALUES (v_marker || '-plt', v_vehicle, 6000, v_driver, 3.30, 2.25, 7.80, 4200, 10200, 2)
  RETURNING id INTO v_truck;

  PERFORM set_config('test.office', v_office::text, true);
  PERFORM set_config('test.cust_user', v_cust_user::text, true);
  PERFORM set_config('test.other_user', v_other_user::text, true);
  PERFORM set_config('test.driver_user', v_driver_user::text, true);
  PERFORM set_config('test.customer', v_customer::text, true);
  PERFORM set_config('test.driver', v_driver::text, true);
  PERFORM set_config('test.vehicle', v_vehicle::text, true);
  PERFORM set_config('test.vehicle_48h', v_vehicle_48h::text, true);
  PERFORM set_config('test.truck', v_truck::text, true);
END $fixtures$;

DO $tests$
DECLARE
  v_cust_user uuid := current_setting('test.cust_user')::uuid;
  v_customer uuid := current_setting('test.customer')::uuid;
  v_other_user uuid := current_setting('test.other_user')::uuid;
  v_driver_user uuid := current_setting('test.driver_user')::uuid;
  v_office uuid := current_setting('test.office')::uuid;
  v_vehicle uuid := current_setting('test.vehicle')::uuid;
  v_vehicle_48h uuid := current_setting('test.vehicle_48h')::uuid;
  v_truck uuid := current_setting('test.truck')::uuid;
  v_driver uuid := current_setting('test.driver')::uuid;
  v_marker text := 'mob-extra-' || gen_random_uuid();
  v_ws jsonb;
  v_res jsonb;
  v_shp1 uuid;
  v_shp2 uuid;
  v_shp3 uuid;
  v_shp_quoted uuid;
  v_shp_quoted_at timestamptz;
  v_deliv uuid;
  v_hgv_truck uuid;
  v_req1 uuid := gen_random_uuid();
  v_req2 uuid := gen_random_uuid();
  v_req3 uuid := gen_random_uuid();
  v_req_nocoords uuid := gen_random_uuid();
BEGIN
  -- 1. C03 + C11: Customer profile save & workspace
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.mobile_save_profile('Juan Dela Cruz', '+639171234567', '123 Rizal St', 'Cabanatuan City', 'Sumacab Este', 'Nueva Ecija');
  IF v_res->>'success' <> 'true' THEN RAISE EXCEPTION 'mobile_save_profile failed'; END IF;

  -- Legacy 4-arg call compatibility
  PERFORM public.mobile_save_profile('Juan Dela Cruz', '+639171234567', '123 Rizal St', 'Cabanatuan City');

  -- Push token register/unregister
  PERFORM public.mobile_register_push_token('fcm_test_token_1234567890abcdef', 'android', 'pixel-8');
  IF NOT EXISTS (SELECT 1 FROM public.user_push_tokens WHERE user_id = v_cust_user AND is_active) THEN
    RAISE EXCEPTION 'Push token not saved';
  END IF;

  v_ws := public.mobile_workspace();
  IF v_ws->'profile'->>'avatar_url' IS NULL THEN RAISE EXCEPTION 'C11 avatar_url missing in mobile_workspace'; END IF;
  IF v_ws->'customer'->>'barangay' <> 'Sumacab Este' OR v_ws->'customer'->>'province' <> 'Nueva Ecija' THEN
    RAISE EXCEPTION 'C03 barangay/province missing or overwritten in mobile_workspace';
  END IF;

  -- 2. FTL-01: Lead time enforcement (48h vehicle rejects 30h departure; >14d rejected)
  BEGIN
    PERFORM public.mobile_create_request(gen_random_uuid(), jsonb_build_object(
      'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Port Dropoff', 'cargo', 'Rice',
      'weight', 1000, 'vehicle_id', v_vehicle_48h,
      'scheduled_departure', now() + interval '30 hours', 'contact', '+639171234567',
      'pickup_lat', 15.48, 'pickup_lng', 120.96, 'dropoff_lat', 14.59, 'dropoff_lng', 120.98
    ));
    RAISE EXCEPTION 'Lead time 48h violation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INVALID_DEPARTURE' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.mobile_create_request(gen_random_uuid(), jsonb_build_object(
      'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Port Dropoff', 'cargo', 'Rice',
      'weight', 1000, 'vehicle_id', v_vehicle,
      'scheduled_departure', now() + interval '15 days', 'contact', '+639171234567',
      'pickup_lat', 15.48, 'pickup_lng', 120.96, 'dropoff_lat', 14.59, 'dropoff_lng', 120.98
    ));
    RAISE EXCEPTION '>14d departure accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INVALID_DEPARTURE' THEN RAISE; END IF;
  END;

  -- Valid FTL request with route metrics + estimated_linehaul
  v_res := public.mobile_create_request(v_req1, jsonb_build_object(
    'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Port Dropoff', 'cargo', 'Rice Sacks',
    'weight', 1000, 'vehicle_id', v_vehicle,
    'scheduled_departure', now() + interval '3 days', 'contact', '+639171234567',
    'pickup_lat', 15.48, 'pickup_lng', 120.96, 'dropoff_lat', 14.59, 'dropoff_lng', 120.98,
    'route_distance_km', 112.5, 'route_duration_minutes', 150, 'estimated_linehaul', 8500
  ));
  v_shp1 := (v_res->>'id')::uuid;
  IF (SELECT estimated_arrival IS NULL OR distance_km <> 112.5 OR linehaul_amount <> 8500 FROM public.shipments WHERE id = v_shp1) THEN
    RAISE EXCEPTION 'FTL booking fields/estimated_arrival not persisted';
  END IF;

  -- Ensure deadhead_km is NEVER exposed in mobile_workspace shipments
  v_ws := public.mobile_workspace();
  IF (v_ws->'shipments'->0) ? 'deadhead_km' THEN
    RAISE EXCEPTION 'Internal deadhead_km leaked in mobile_workspace';
  END IF;

  -- Replay without coordinates must reject changed handling
  v_res := public.mobile_create_request(v_req_nocoords, jsonb_build_object(
    'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Port Dropoff', 'cargo', 'Rice',
    'weight', 1000, 'vehicle_id', v_vehicle,
    'scheduled_departure', now() + interval '3 days', 'contact', '+639171234567',
    'handling', 'None'
  ));
  BEGIN
    PERFORM public.mobile_create_request(v_req_nocoords, jsonb_build_object(
      'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Port Dropoff', 'cargo', 'Rice',
      'weight', 1000, 'vehicle_id', v_vehicle,
      'scheduled_departure', now() + interval '3 days', 'contact', '+639171234567',
      'handling', 'Fragile'
    ));
    RAISE EXCEPTION 'Coordinate-less replay allowed changed handling';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'REQUEST_ALREADY_SAVED_REFRESH' THEN RAISE; END IF;
  END;

  -- 3. C10 Option A: Direct customer cancellation + column tamper protection
  BEGIN
    UPDATE public.shipments SET status = 'cancelled', cancelled_reason = 'Changed plan', quoted_amount = 1 WHERE id = v_shp1;
    RAISE EXCEPTION 'Customer tampered with quoted_amount';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMERS_MAY_ONLY_UPDATE_CANCELLATION_FIELDS' THEN RAISE; END IF;
  END;

  UPDATE public.shipments SET status = 'cancelled', cancelled_reason = 'Customer direct cancel' WHERE id = v_shp1;
  IF (SELECT status FROM public.shipments WHERE id = v_shp1) <> 'cancelled' THEN
    RAISE EXCEPTION 'Direct RLS customer cancellation failed';
  END IF;
  IF (SELECT count(*) FROM public.shipment_events WHERE shipment_id = v_shp1 AND event_type = 'shipment_cancelled') <> 1 THEN
    RAISE EXCEPTION 'Option A direct customer cancellation did not log shipment_cancelled event';
  END IF;

  -- 4. FTL-01 Quote Acceptance + C10 Option B RPC Cancellation on assigned shipment
  v_res := public.mobile_create_request(v_req2, jsonb_build_object(
    'pickup', 'Cabanatuan Pickup', 'dropoff', 'Subic Port Dropoff', 'cargo', 'Corn',
    'weight', 1500, 'vehicle_id', v_vehicle,
    'scheduled_departure', now() + interval '4 days', 'contact', '+639171234567',
    'pickup_lat', 15.48, 'pickup_lng', 120.96, 'dropoff_lat', 14.82, 'dropoff_lng', 120.28
  ));
  v_shp2 := (v_res->>'id')::uuid;

  EXECUTE 'RESET ROLE';
  UPDATE public.shipments
  SET status = 'quoted', quoted_amount = 12000, final_amount = 12000, quote_expires_at = now() + interval '12 hours'
  WHERE id = v_shp2;

  -- Other customer cannot accept or cancel
  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.mobile_accept_shipment_quote(v_shp2);
    RAISE EXCEPTION 'Other customer accepted quote';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SHIPMENT_NOT_FOUND' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mobile_cancel_shipment(v_shp2, 'Not mine');
    RAISE EXCEPTION 'Other customer cancelled shipment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SHIPMENT_NOT_FOUND' THEN RAISE; END IF;
  END;

  -- Owner accepts quote -> booked
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.mobile_accept_shipment_quote(v_shp2);
  IF v_res->>'status' <> 'booked' THEN RAISE EXCEPTION 'Quote acceptance did not transition to booked'; END IF;

  -- Assign unstarted delivery and verify mobile_cancel_shipment releases it
  EXECUTE 'RESET ROLE';
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, assigned_by)
  VALUES (v_shp2, v_truck, v_driver, 'assigned', v_office)
  RETURNING id INTO v_deliv;

  -- Driver checks D05 workspace fields (deliveries.truck_id + driver_trucks)
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ws := public.mobile_workspace();
  IF (v_ws->'deliveries'->0->>'truck_id')::uuid <> v_truck THEN
    RAISE EXCEPTION 'D05 truck_id missing in mobile_workspace deliveries';
  END IF;
  IF jsonb_array_length(v_ws->'driver_trucks') < 1 OR (v_ws->'driver_trucks'->0->>'height_m')::numeric <> 3.30 THEN
    RAISE EXCEPTION 'D05 driver_trucks or HGV dimensions missing in mobile_workspace';
  END IF;

  -- Customer cancels unstarted assigned shipment via RPC
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.mobile_cancel_shipment(v_shp2, 'Warehouse closed');
  IF v_res->>'status' <> 'cancelled' OR (SELECT status FROM public.deliveries WHERE id = v_deliv) <> 'cancelled' THEN
    RAISE EXCEPTION 'mobile_cancel_shipment did not cancel shipment and delivery';
  END IF;
  IF (SELECT count(*) FROM public.shipment_events WHERE shipment_id = v_shp2 AND event_type = 'shipment_cancelled') <> 1 THEN
    RAISE EXCEPTION 'mobile_cancel_shipment produced duplicate or missing shipment_cancelled event';
  END IF;

  -- Started delivery cannot be cancelled by customer
  v_res := public.mobile_create_request(v_req3, jsonb_build_object(
    'pickup', 'Cabanatuan Pickup', 'dropoff', 'Tarlac Dropoff', 'cargo', 'Fertilizer',
    'weight', 1000, 'vehicle_id', v_vehicle,
    'scheduled_departure', now() + interval '4 days', 'contact', '+639171234567',
    'pickup_lat', 15.48, 'pickup_lng', 120.96, 'dropoff_lat', 15.48, 'dropoff_lng', 120.59
  ));
  v_shp3 := (v_res->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.shipments SET status = 'assigned' WHERE id = v_shp3;
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, assigned_by)
  VALUES (v_shp3, v_truck, v_driver, 'assigned', now(), v_office);

  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.mobile_cancel_shipment(v_shp3, 'Too late');
    RAISE EXCEPTION 'Customer cancelled started delivery';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DRIVER_ALREADY_EN_ROUTE' THEN RAISE; END IF;
  END;

  PERFORM public.mobile_unregister_push_token('fcm_test_token_1234567890abcdef');
  EXECUTE 'RESET ROLE';

  -- D05 fleet_save & delivery_routing_context + FTL-01 office_cancel_shipment on 'quoted'
  PERFORM set_config('request.jwt.claim.sub', v_office::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_office, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_hgv_truck := public.fleet_save('truck', NULL, jsonb_build_object(
    'plate_number', v_marker || '-HGV1', 'model', 'Isuzu Giga', 'vehicle_type_id', v_vehicle,
    'capacity_kg', 6000, 'height_m', 3.45, 'width_m', 2.30, 'length_m', 8.10,
    'tare_weight_kg', 4500, 'gross_weight_kg', 12500, 'axle_count', 3
  ));
  IF (SELECT height_m FROM public.trucks WHERE id = v_hgv_truck) <> 3.45
     OR (SELECT axle_count FROM public.trucks WHERE id = v_hgv_truck) <> 3 THEN
    RAISE EXCEPTION 'fleet_save did not persist D05 HGV dimensions';
  END IF;

  IF (public.delivery_routing_context(v_deliv)->'truck'->>'height_m')::numeric <> 3.30
     OR (public.delivery_routing_context(v_deliv)->'truck'->>'axle_count')::int <> 2 THEN
    RAISE EXCEPTION 'delivery_routing_context missing D05 truck dimensions';
  END IF;

  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, quoted_amount, final_amount, status)
  VALUES (v_customer, v_vehicle, 'Quote Cancel Pickup', 'Quote Cancel Dropoff', 'Gravel', 2000, 9500, 9500, 'quoted')
  RETURNING id, updated_at INTO v_shp_quoted, v_shp_quoted_at;

  v_res := public.office_cancel_shipment(v_shp_quoted, v_shp_quoted_at, NULL, 'Customer declined quoted schedule', true);
  IF v_res->>'status' <> 'cancelled' THEN
    RAISE EXCEPTION 'office_cancel_shipment failed on quoted shipment';
  END IF;
  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon', 'public.mobile_cancel_shipment(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mobile_accept_shipment_quote(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mobile_save_profile(text,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anon execution permitted on mobile RPCs';
  END IF;
END $tests$;

ROLLBACK;
SELECT 'PASS: C03, D05, C10, FTL-01, C11 migrations verified; fixtures rolled back' AS result;
