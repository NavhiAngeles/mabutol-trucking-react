-- Existing column and ownership policies; fictional fixtures, all rolled back.
BEGIN;
DO $fixture$
DECLARE actor uuid; driver_user uuid:=gen_random_uuid();
BEGIN
  SELECT id INTO actor FROM public.users WHERE is_active AND role::text='admin' LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Active admin required'; END IF;
  INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    VALUES(driver_user,'driver-notes-test-'||driver_user||'@example.invalid','{}','{}');
  UPDATE public.users SET role='driver',is_active=true WHERE id=driver_user;
  PERFORM set_config('test.driver_notes_user',driver_user::text,true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
DO $office$
DECLARE customer uuid; vehicle uuid; driver uuid; booking uuid; other_booking uuid;
  marker text:='driver-notes-test-'||gen_random_uuid();
  instructions text:=E'Call before arrival.\nUse the rear loading gate.';
BEGIN
  INSERT INTO public.customers(name,customer_code) VALUES(marker,marker) RETURNING id INTO customer;
  INSERT INTO public.vehicle_types(name) VALUES(marker) RETURNING id INTO vehicle;
  INSERT INTO public.drivers(full_name,license_number,user_id)
    VALUES(marker,marker,current_setting('test.driver_notes_user')::uuid) RETURNING id INTO driver;
  INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,assigned_driver_id) VALUES(marker,vehicle,1000,driver);
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg,driver_notes,status)
    VALUES(customer,marker,'Test','Test',vehicle,500,instructions,'booked') RETURNING id INTO booking;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=booking AND driver_notes=instructions AND status='assigned')
    THEN RAISE EXCEPTION 'Instructions did not survive insert/assignment'; END IF;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,driver_notes,status)
    VALUES(customer,marker||'-other','Test','Test','Private instructions for another trip','pending') RETURNING id INTO other_booking;
  PERFORM set_config('test.driver_notes_booking',booking::text,true);
  PERFORM set_config('test.driver_notes_other',other_booking::text,true);
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.driver_notes_user'),true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('test.driver_notes_user'),'role','authenticated')::text,true);
END;
$office$;
DO $driver$
BEGIN
  IF (SELECT driver_notes FROM public.shipments WHERE id=current_setting('test.driver_notes_booking')::uuid)
      IS DISTINCT FROM E'Call before arrival.\nUse the rear loading gate.'
    THEN RAISE EXCEPTION 'Assigned driver cannot read saved instructions'; END IF;
  IF EXISTS(SELECT 1 FROM public.shipments WHERE id=current_setting('test.driver_notes_other')::uuid)
    THEN RAISE EXCEPTION 'Driver can read another trip instructions'; END IF;
END;
$driver$;
ROLLBACK;
SELECT 'PASS: saved multiline instructions survive assignment, assigned driver reads own instructions, unrelated trip remains inaccessible; all fixtures rolled back' AS result;
