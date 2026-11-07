-- Rollback verification for office_cancel_shipment on unstarted assigned and booked shipments
BEGIN;
DO $fixtures$
DECLARE
  admin_user uuid := gen_random_uuid();
  customer uuid; vehicle uuid; driver uuid; truck uuid;
  s uuid; d uuid; v timestamptz; result jsonb;
  marker text := 'cancel-assigned-test-' || gen_random_uuid();
BEGIN
  -- 1. Setup admin fixture
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (admin_user, marker || '@example.invalid', '{"role":"admin"}', '{}');
  UPDATE public.users SET role = 'admin', is_active = true WHERE id = admin_user;

  PERFORM set_config('request.jwt.claim.sub', admin_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', admin_user, 'role', 'authenticated')::text, true);

  -- 2. Setup business entities
  INSERT INTO public.customers(name, customer_code) VALUES(marker, marker) RETURNING id INTO customer;
  INSERT INTO public.vehicle_types(name, default_capacity_kg) VALUES(marker, 4000) RETURNING id INTO vehicle;
  INSERT INTO public.drivers(full_name, license_number) VALUES(marker, marker) RETURNING id INTO driver;
  INSERT INTO public.trucks(plate_number, vehicle_type_id, capacity_kg, assigned_driver_id)
  VALUES(marker, vehicle, 4000, driver) RETURNING id INTO truck;

  -- 3. TEST CASE A: Unstarted assigned shipment WITHOUT active deliveries (delivery_count = 0)
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, booking_source, quoted_amount)
  VALUES(customer, 'Fictional pickup A', 'Fictional dropoff A', 'pending', 'web', 3000) RETURNING id INTO s;
  UPDATE public.shipments SET status = 'assigned' WHERE id = s RETURNING updated_at INTO v;

  result := public.office_cancel_shipment(s, v, NULL, 'Unstarted cancellation without delivery', true);
  IF result->>'status' <> 'cancelled' OR result->>'cancelled_at' IS NULL THEN
    RAISE EXCEPTION 'Unstarted assigned shipment without delivery failed to cancel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipment_events WHERE shipment_id = s AND event_type = 'shipment_cancelled') THEN
    RAISE EXCEPTION 'Missing cancellation event audit for assigned shipment without delivery';
  END IF;

  -- 4. TEST CASE B: Unstarted assigned shipment WITH active delivery (delivery_count = 1)
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, requested_vehicle_type_id, weight_kg, quoted_amount)
  VALUES(customer, 'Fictional pickup B', 'Fictional dropoff B', 'pending', vehicle, 3000, 3500) RETURNING id INTO s;
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status, assigned_by)
  VALUES(s, driver, truck, 'assigned', admin_user) RETURNING id INTO d;
  UPDATE public.shipments SET status = 'assigned' WHERE id = s RETURNING updated_at INTO v;

  result := public.office_cancel_shipment(s, v, d, 'Unstarted cancellation with delivery', true);
  IF result->>'status' <> 'cancelled' THEN
    RAISE EXCEPTION 'Unstarted assigned shipment with delivery failed to cancel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE id = d AND status = 'cancelled') THEN
    RAISE EXCEPTION 'Active delivery was not cancelled';
  END IF;

  -- 5. TEST CASE C: Guard remains intact when trip has actually started (route_started_at set)
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, requested_vehicle_type_id, weight_kg, quoted_amount)
  VALUES(customer, 'Fictional pickup C', 'Fictional dropoff C', 'pending', vehicle, 3000, 3500) RETURNING id INTO s;
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status, assigned_by, route_started_at)
  VALUES(s, driver, truck, 'assigned', admin_user, now()) RETURNING id INTO d;
  UPDATE public.shipments SET status = 'assigned' WHERE id = s RETURNING updated_at INTO v;

  BEGIN
    PERFORM public.office_cancel_shipment(s, v, d, 'Should be blocked', true);
    RAISE EXCEPTION 'Started trip cancellation was unexpectedly permitted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Started trips cannot be cancelled here%' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'office_cancel_shipment unstarted assigned tests passed successfully';
END $fixtures$;
ROLLBACK;

