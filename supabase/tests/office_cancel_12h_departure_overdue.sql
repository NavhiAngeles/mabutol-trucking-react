-- Rollback verification for office_cancel_shipment on 12h overdue departure without pickup arrival
BEGIN;
DO $fixtures$
DECLARE
  admin_user uuid := gen_random_uuid();
  customer uuid; vehicle uuid; driver uuid; truck uuid;
  s uuid; d uuid; v timestamptz; result jsonb;
  marker text := 'cancel-12h-test-' || gen_random_uuid();
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

  -- 3. TEST CASE A: Overdue departure (14 hours ago), route_started_at set, pickup_arrived_at IS NULL -> Cancellation SUCCEEDS
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, requested_vehicle_type_id, weight_kg, scheduled_departure, quoted_amount)
  VALUES(customer, 'Fictional pickup A', 'Fictional dropoff A', 'assigned', vehicle, 3000, now() - interval '14 hours', 3500) RETURNING id INTO s;
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status, assigned_by, route_started_at)
  VALUES(s, driver, truck, 'assigned', admin_user, now() - interval '13 hours') RETURNING id INTO d;
  SELECT updated_at INTO v FROM public.shipments WHERE id = s;

  result := public.office_cancel_shipment(s, v, d, '14 hours overdue departure without pickup arrival', true);
  IF result->>'status' <> 'cancelled' OR result->>'cancelled_at' IS NULL THEN
    RAISE EXCEPTION '14h overdue shipment without pickup arrival failed to cancel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE id = d AND status = 'cancelled') THEN
    RAISE EXCEPTION 'Delivery was not cancelled for overdue departure';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipment_events WHERE shipment_id = s AND event_type = 'shipment_cancelled' AND meta->>'cancellation_rule' = 'scheduled_departure_overdue_12h_no_pickup_arrival') THEN
    RAISE EXCEPTION 'Missing overdue departure cancellation audit rule';
  END IF;

  -- 4. TEST CASE B: Overdue departure (14 hours ago), BUT pickup_arrived_at IS NOT NULL -> Cancellation BLOCKED
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, requested_vehicle_type_id, weight_kg, scheduled_departure, quoted_amount)
  VALUES(customer, 'Fictional pickup B', 'Fictional dropoff B', 'assigned', vehicle, 3000, now() - interval '14 hours', 3500) RETURNING id INTO s;
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status, assigned_by, route_started_at, pickup_arrived_at)
  VALUES(s, driver, truck, 'assigned', admin_user, now() - interval '13 hours', now() - interval '12 hours') RETURNING id INTO d;
  SELECT updated_at INTO v FROM public.shipments WHERE id = s;

  BEGIN
    PERFORM public.office_cancel_shipment(s, v, d, 'Should be blocked due to arrival', true);
    RAISE EXCEPTION 'Cancellation should be blocked when driver has arrived at pickup';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Started trips cannot be cancelled here%' THEN
      RAISE;
    END IF;
  END;

  -- 5. TEST CASE C: Under 12 hours (departure 2 hours ago), route_started_at set -> Cancellation BLOCKED
  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, requested_vehicle_type_id, weight_kg, scheduled_departure, quoted_amount)
  VALUES(customer, 'Fictional pickup C', 'Fictional dropoff C', 'assigned', vehicle, 3000, now() - interval '2 hours', 3500) RETURNING id INTO s;
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status, assigned_by, route_started_at)
  VALUES(s, driver, truck, 'assigned', admin_user, now() - interval '1 hour') RETURNING id INTO d;
  SELECT updated_at INTO v FROM public.shipments WHERE id = s;

  BEGIN
    PERFORM public.office_cancel_shipment(s, v, d, 'Should be blocked under 12h', true);
    RAISE EXCEPTION 'Cancellation should be blocked when departure is under 12h';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Started trips cannot be cancelled here%' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'office_cancel_shipment 12h overdue departure tests passed successfully';
END $fixtures$;
ROLLBACK;

