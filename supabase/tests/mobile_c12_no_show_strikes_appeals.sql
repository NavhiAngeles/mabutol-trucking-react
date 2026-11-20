-- Rollback SQL Test Suite: supabase/tests/mobile_c12_no_show_strikes_appeals.sql
-- Verifies Request C12: pickup grace/wait stamping, customer_notify_on_the_way,
-- dual-authority confirm_no_show_cancellation, idempotent 3-strike ladder, booking cooldowns,
-- permanent suspension (preserving users.is_active = true), booking gates, in-app appeals,
-- reinstatement preserving strike counts, 4th strike re-suspension, RLS, Realtime, and anon denial.
BEGIN;

DO $fixtures$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_cust_user uuid := gen_random_uuid();
  v_other_cust_user uuid := gen_random_uuid();
  v_driver_user uuid := gen_random_uuid();
  v_customer uuid;
  v_other_customer uuid;
  v_driver uuid;
  v_vehicle uuid;
  v_truck uuid;
  v_marker text := 'c12-test-' || gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_admin, v_marker || '-admin@example.invalid', '{}', '{}'),
    (v_staff, v_marker || '-staff@example.invalid', '{}', '{}'),
    (v_cust_user, v_marker || '-cust@example.invalid', '{}', '{}'),
    (v_other_cust_user, v_marker || '-othercust@example.invalid', '{}', '{}'),
    (v_driver_user, v_marker || '-drv@example.invalid', '{}', '{}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_admin;
  UPDATE public.users SET role = 'staff', is_active = true WHERE id = v_staff;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id IN (v_cust_user, v_other_cust_user);
  UPDATE public.users SET role = 'driver', is_active = true WHERE id = v_driver_user;

  SELECT id INTO v_customer FROM public.customers WHERE user_id = v_cust_user;
  SELECT id INTO v_other_customer FROM public.customers WHERE user_id = v_other_cust_user;

  INSERT INTO public.vehicle_types(name, default_capacity_kg, min_lead_time_hours, loading_buffer_minutes)
  VALUES (v_marker || '-6w', 6000, 24, 180)
  RETURNING id INTO v_vehicle;

  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_driver_user, v_marker || '-drv', v_marker || '-lic', 'available')
  RETURNING id INTO v_driver;

  INSERT INTO public.trucks(plate_number, vehicle_type_id, capacity_kg, assigned_driver_id, status)
  VALUES (v_marker || '-plt', v_vehicle, 6000, v_driver, 'available')
  RETURNING id INTO v_truck;

  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.staff', v_staff::text, true);
  PERFORM set_config('test.cust_user', v_cust_user::text, true);
  PERFORM set_config('test.other_cust_user', v_other_cust_user::text, true);
  PERFORM set_config('test.driver_user', v_driver_user::text, true);
  PERFORM set_config('test.customer', v_customer::text, true);
  PERFORM set_config('test.other_customer', v_other_customer::text, true);
  PERFORM set_config('test.driver', v_driver::text, true);
  PERFORM set_config('test.vehicle', v_vehicle::text, true);
  PERFORM set_config('test.truck', v_truck::text, true);
END $fixtures$;

DO $tests$
DECLARE
  v_admin uuid := current_setting('test.admin')::uuid;
  v_staff uuid := current_setting('test.staff')::uuid;
  v_cust_user uuid := current_setting('test.cust_user')::uuid;
  v_other_cust_user uuid := current_setting('test.other_cust_user')::uuid;
  v_driver_user uuid := current_setting('test.driver_user')::uuid;
  v_customer uuid := current_setting('test.customer')::uuid;
  v_driver uuid := current_setting('test.driver')::uuid;
  v_vehicle uuid := current_setting('test.vehicle')::uuid;
  v_truck uuid := current_setting('test.truck')::uuid;

  v_shp1 uuid; v_del1 uuid;
  v_shp2 uuid; v_del2 uuid;
  v_shp3 uuid; v_del3 uuid;
  v_shp4 uuid; v_del4 uuid;
  v_res jsonb;
  v_ws jsonb;
  v_appeal1 uuid;
BEGIN
  -- 1. Verify Realtime publication includes customers, customer_no_show_strikes, customer_appeals
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers')
       OR NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_no_show_strikes')
       OR NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_appeals') THEN
      RAISE EXCEPTION 'C12 tables missing from supabase_realtime publication';
    END IF;
  END IF;

  -- 2. Shipment 1: Driver arrives at pickup -> stamps 15m grace + 30m auto_cancel_at; customer notifies on the way
  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, scheduled_departure, status)
  VALUES (v_customer, v_vehicle, 'Pickup 1', 'Dropoff 1', 'Rice', 1500, 14.60, 120.96, 14.65, 120.98, now() + interval '2 days', 'assigned')
  RETURNING id INTO v_shp1;

  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, assigned_by)
  VALUES (v_shp1, v_truck, v_driver, 'assigned', now() - interval '20 minutes', v_admin)
  RETURNING id INTO v_del1;

  -- Not yet arrived: customer_notify_on_the_way must raise NOT_IN_GRACE_WINDOW
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.customer_notify_on_the_way(v_del1);
    RAISE EXCEPTION 'On-the-way allowed before pickup arrival';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'NOT_IN_GRACE_WINDOW' THEN RAISE; END IF;
  END;

  -- Non-suspended customer cannot submit appeal
  BEGIN
    PERFORM public.customer_submit_suspension_appeal('Please reinstate my account now');
    RAISE EXCEPTION 'Non-suspended customer submitted appeal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ACCOUNT_NOT_SUSPENDED' THEN RAISE; END IF;
  END;

  -- Driver marks pickup arrived
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.mobile_driver_action(v_del1, 'arrived_pickup', jsonb_build_object('lat', 14.60, 'lng', 120.96));
  IF (SELECT grace_ends_at IS NULL OR auto_cancel_at IS NULL OR grace_ends_at <> pickup_arrived_at + interval '15 minutes' OR auto_cancel_at <> pickup_arrived_at + interval '30 minutes' FROM public.deliveries WHERE id = v_del1) THEN
    RAISE EXCEPTION 'Pickup arrival did not stamp 15m grace and 30m auto_cancel_at';
  END IF;

  -- Early driver no-show must fail
  BEGIN
    PERFORM public.confirm_no_show_cancellation(v_del1);
    RAISE EXCEPTION 'Early driver no-show allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WAIT_PERIOD_NOT_FINISHED' THEN RAISE; END IF;
  END;

  -- Customer taps "I'm On My Way"
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.customer_notify_on_the_way(v_del1);
  IF v_res->>'customer_on_way_at' IS NULL OR (v_res->>'already_notified')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'customer_notify_on_the_way did not record timestamp';
  END IF;
  v_res := public.customer_notify_on_the_way(v_del1);
  IF (v_res->>'already_notified')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'customer_notify_on_the_way not idempotent';
  END IF;

  -- Advance wait past 30m; driver confirms Strike 1 (idempotent across repeat calls)
  EXECUTE 'RESET ROLE';
  UPDATE public.deliveries
  SET pickup_arrived_at = now() - interval '35 minutes',
      grace_ends_at = now() - interval '20 minutes',
      auto_cancel_at = now() - interval '5 minutes'
  WHERE id = v_del1;

  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.confirm_no_show_cancellation(v_del1, 'Waited 35 minutes, phone unanswered');
  IF (v_res->>'strike_number')::int <> 1 OR v_res->>'standing_status' <> 'cooldown' THEN
    RAISE EXCEPTION 'Strike 1 did not set cooldown: %', v_res;
  END IF;
  -- Replay via mobile_driver_action('no_show') must be idempotent without double-striking
  PERFORM public.mobile_driver_action(v_del1, 'no_show');
  IF (SELECT no_show_strike_count FROM public.customers WHERE id = v_customer) <> 1 THEN
    RAISE EXCEPTION 'Idempotent replay incremented strike count';
  END IF;

  -- Cooldown blocks booking via mobile_create_request
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.mobile_create_request(gen_random_uuid(), jsonb_build_object(
      'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Dropoff', 'cargo', 'Corn',
      'weight', 1000, 'vehicle_id', v_vehicle,
      'scheduled_departure', now() + interval '2 days', 'contact', '+639171234567'
    ));
    RAISE EXCEPTION 'Cooldown customer allowed to book';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'BOOKING_COOLDOWN_ACTIVE' THEN RAISE; END IF;
  END;

  -- 3. Shipment 2: Office confirms Strike 2 (72h cooldown)
  EXECUTE 'RESET ROLE';
  UPDATE public.customers SET booking_cooldown_until = NULL, blocked_until = NULL WHERE id = v_customer;

  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, scheduled_departure, status)
  VALUES (v_customer, v_vehicle, 'Pickup 2', 'Dropoff 2', 'Rice', 1000, now() + interval '2 days', 'assigned')
  RETURNING id INTO v_shp2;
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, pickup_arrived_at, grace_ends_at, auto_cancel_at, assigned_by)
  VALUES (v_shp2, v_truck, v_driver, 'assigned', now() - interval '25 minutes', now() - interval '20 minutes', now() - interval '5 minutes', now() + interval '10 minutes', v_admin)
  RETURNING id INTO v_del2;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.confirm_no_show_cancellation(v_del2, 'Confirmed by dispatcher with customer phone unreachable');
  IF (v_res->>'strike_number')::int <> 2 OR v_res->>'standing_status' <> 'cooldown' THEN
    RAISE EXCEPTION 'Strike 2 did not set cooldown: %', v_res;
  END IF;

  -- 4. Shipment 3: Strike 3 -> permanent suspension while keeping public.users.is_active = true
  EXECUTE 'RESET ROLE';
  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, scheduled_departure, status)
  VALUES (v_customer, v_vehicle, 'Pickup 3', 'Dropoff 3', 'Rice', 1000, now() + interval '2 days', 'assigned')
  RETURNING id INTO v_shp3;
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, pickup_arrived_at, grace_ends_at, auto_cancel_at, assigned_by)
  VALUES (v_shp3, v_truck, v_driver, 'assigned', now() - interval '40 minutes', now() - interval '35 minutes', now() - interval '20 minutes', now() - interval '5 minutes', v_admin)
  RETURNING id INTO v_del3;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.confirm_no_show_cancellation(v_del3, '3rd strike');
  IF (v_res->>'strike_number')::int <> 3 OR v_res->>'standing_status' <> 'suspended' THEN
    RAISE EXCEPTION 'Strike 3 did not suspend customer: %', v_res;
  END IF;

  EXECUTE 'RESET ROLE';
  IF (SELECT is_active FROM public.users WHERE id = v_cust_user) IS NOT TRUE THEN
    RAISE EXCEPTION 'public.users.is_active was incorrectly deactivated on no-show suspension';
  END IF;

  -- Suspended customer can still load mobile_workspace(), is blocked in mobile_create_request, and can appeal
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_ws := public.mobile_workspace();
  IF v_ws->'customer'->>'standing_status' <> 'suspended'
     OR (v_ws->'customer'->>'no_show_strike_count')::int <> 3
     OR jsonb_array_length(v_ws->'customer_strikes') <> 3 THEN
    RAISE EXCEPTION 'mobile_workspace missing suspended standing or 3 strikes: %', v_ws->'customer';
  END IF;

  BEGIN
    PERFORM public.mobile_create_request(gen_random_uuid(), jsonb_build_object(
      'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Dropoff', 'cargo', 'Corn',
      'weight', 1000, 'vehicle_id', v_vehicle,
      'scheduled_departure', now() + interval '2 days', 'contact', '+639171234567'
    ));
    RAISE EXCEPTION 'Suspended customer allowed to book';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ACCOUNT_SUSPENDED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.customer_submit_suspension_appeal('Too short');
    RAISE EXCEPTION 'Short appeal reason accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'APPEAL_REASON_REQUIRED' THEN RAISE; END IF;
  END;

  v_res := public.customer_submit_suspension_appeal('Warehouse road was flooded during pickup window.', '+639179998888');
  v_appeal1 := (v_res->>'id')::uuid;
  IF v_res->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'Appeal creation failed';
  END IF;

  BEGIN
    PERFORM public.customer_submit_suspension_appeal('Second appeal while first is pending.');
    RAISE EXCEPTION 'Duplicate pending appeal allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'APPEAL_ALREADY_PENDING' THEN RAISE; END IF;
  END;

  -- Other customer cannot read v_cust_user's strikes or appeals via RLS
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_other_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS (SELECT 1 FROM public.customer_no_show_strikes WHERE customer_id = v_customer)
     OR EXISTS (SELECT 1 FROM public.customer_appeals WHERE customer_id = v_customer) THEN
    RAISE EXCEPTION 'Cross-customer RLS leak on strikes or appeals';
  END IF;

  -- 5. Admin approves appeal -> reinstated, strikes preserved at 3
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.office_review_customer_appeal(v_appeal1, 'approved', 'Verified flood report with driver.');
  IF v_res->>'status' <> 'approved' OR v_res->>'standing_status' <> 'reinstated' OR (v_res->>'no_show_strike_count')::int <> 3 THEN
    RAISE EXCEPTION 'Reinstatement failed or reset strike count: %', v_res;
  END IF;

  -- Reinstated customer can book again, and a 4th no-show re-suspends with count 4
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_cust_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_cust_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.mobile_create_request(gen_random_uuid(), jsonb_build_object(
    'pickup', 'Cabanatuan Pickup', 'dropoff', 'Manila Dropoff', 'cargo', 'Corn',
    'weight', 1000, 'vehicle_id', v_vehicle,
    'scheduled_departure', now() + interval '2 days', 'contact', '+639171234567'
  ));
  v_shp4 := (v_res->>'id')::uuid;

  EXECUTE 'RESET ROLE';
  UPDATE public.shipments SET status = 'assigned' WHERE id = v_shp4;
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, pickup_arrived_at, grace_ends_at, auto_cancel_at, assigned_by)
  VALUES (v_shp4, v_truck, v_driver, 'assigned', now() - interval '40 minutes', now() - interval '35 minutes', now() - interval '20 minutes', now() - interval '5 minutes', v_admin)
  RETURNING id INTO v_del4;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.confirm_no_show_cancellation(v_del4, '4th post-reinstatement no-show');
  IF (v_res->>'strike_number')::int <> 4 OR v_res->>'standing_status' <> 'suspended' THEN
    RAISE EXCEPTION '4th post-reinstatement no-show did not re-suspend: %', v_res;
  END IF;

  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon', 'public.customer_notify_on_the_way(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.confirm_no_show_cancellation(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.customer_submit_suspension_appeal(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.office_review_customer_appeal(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anon execution permitted on C12 RPCs';
  END IF;
END $tests$;

ROLLBACK;
SELECT 'PASS: C12 no-show strikes, cooldowns, permanent suspension, appeals, reinstatement, RLS, Realtime, and anon denial passed' AS result;
