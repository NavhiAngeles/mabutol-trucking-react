-- Isolated fictional fixtures only; every write rolls back.
BEGIN;
DO $auth$
DECLARE actor uuid;
BEGIN
  SELECT id INTO actor FROM public.users WHERE is_active AND role::text='admin' LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Active admin required for test'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
END;
$auth$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  customer uuid; vehicle uuid; driver uuid; truck uuid; booking uuid; version timestamptz;
  result jsonb; marker text := 'booking-review-test-'||gen_random_uuid();
BEGIN
  INSERT INTO public.customers(name,customer_code) VALUES(marker,marker) RETURNING id INTO customer;
  INSERT INTO public.vehicle_types(name) VALUES(marker) RETURNING id INTO vehicle;
  INSERT INTO public.drivers(full_name,license_number) VALUES(marker,marker) RETURNING id INTO driver;
  INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,assigned_driver_id)
    VALUES(marker,vehicle,1000,driver) RETURNING id INTO truck;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,cargo_description,
    requested_vehicle_type_id,weight_kg,distance_km,scheduled_departure,quoted_amount,status)
    VALUES(customer,marker,'Test pickup','Test destination','Test cargo',vehicle,500,10,now()+interval '1 day',2500,'pending')
    RETURNING id,updated_at INTO booking,version;
  BEGIN
    PERFORM public.review_booking_request(booking,version-interval '1 second','approve');
    RAISE EXCEPTION 'Stale decision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.review_booking_request(booking,version,'reject',' ');
    RAISE EXCEPTION 'Blank rejection accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Enter a rejection reason%' THEN RAISE; END IF;
  END;
  result := public.review_booking_request(booking,version,'approve');
  IF result->>'status'<>'assigned' OR result->>'delivery_id' IS NULL THEN RAISE EXCEPTION 'Approval did not assign'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=booking AND confirmed_by=auth.uid() AND quoted_amount=2500)
    THEN RAISE EXCEPTION 'Actor/quote not preserved'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipment_status_history WHERE shipment_id=booking AND from_status='pending' AND to_status='booked' AND changed_by=auth.uid())
    THEN RAISE EXCEPTION 'Review history missing'; END IF;
  BEGIN
    PERFORM public.review_booking_request(booking,version,'reject','Too late');
    RAISE EXCEPTION 'Second review accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- Reserved resources must not be assigned again; approval remains booked.
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,cargo_description,
    requested_vehicle_type_id,weight_kg,distance_km,scheduled_departure,quoted_amount,status)
    VALUES(customer,marker||'-waiting','Test','Test','Cargo',vehicle,500,10,now()+interval '1 day',2500,'pending')
    RETURNING id,updated_at INTO booking,version;
  result := public.review_booking_request(booking,version,'approve');
  IF result->>'status'<>'booked' OR result->>'delivery_id' IS NOT NULL THEN RAISE EXCEPTION 'Reservation guard failed'; END IF;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,status)
    VALUES(customer,marker||'-reject','Test','Test','pending') RETURNING id,updated_at INTO booking,version;
  result := public.review_booking_request(booking,version,'reject','  Cannot fulfill  ');
  IF result->>'status'<>'cancelled' OR NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=booking AND cancelled_reason='Cannot fulfill' AND cancelled_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Rejection not persisted'; END IF;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,status)
    VALUES(customer,marker||'-invalid','Test','Test','pending') RETURNING id,updated_at INTO booking,version;
  BEGIN
    PERFORM public.review_booking_request(booking,version,'approve');
    RAISE EXCEPTION 'Incomplete request approved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Request needs valid%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=booking AND status='pending') THEN RAISE EXCEPTION 'Failed approval mutated status'; END IF;
END;
$test$;
RESET ROLE;
-- Test authorization with synthetic Auth/profile rows. No real account changes.
DO $roles$
DECLARE actor uuid; test_role text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  FOREACH test_role IN ARRAY ARRAY['staff','customer','driver','admin'] LOOP
    actor := gen_random_uuid();
    INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
      VALUES(actor,'booking-review-test-'||actor||'@example.invalid','{}','{}');
    UPDATE public.users SET role=test_role::public.user_role,is_active=(test_role<>'admin') WHERE id=actor;
    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.review_booking_request(gen_random_uuid(),now(),'approve');
      RAISE EXCEPTION 'Unexpected review success';
    EXCEPTION WHEN insufficient_privilege THEN
      IF test_role='staff' THEN RAISE EXCEPTION 'Active staff denied'; END IF;
    WHEN raise_exception THEN
      IF test_role<>'staff' OR SQLERRM<>'Booking request not found or access denied' THEN RAISE; END IF;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub','',true);
    PERFORM set_config('request.jwt.claims','{}',true);
  END LOOP;
  IF has_function_privilege('anon','public.review_booking_request(uuid,timestamptz,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Anonymous execution permitted'; END IF;
END;
$roles$;
ROLLBACK;
SELECT 'PASS: approval/assignment, reservation, rejection/reason, history/actor, quote preservation, stale/repeated decisions, invalid rollback, active staff and unauthorized roles; fixtures rolled back' AS result;
