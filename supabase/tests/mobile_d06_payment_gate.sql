-- Rollback SQL Test Suite: supabase/tests/mobile_d06_payment_gate.sql
-- Verifies Request D06: driver face-to-face full payment collection, signed receipt storage/RLS,
-- admin/staff verification & rejection, notifications, Realtime publication, and strict departure gate.
BEGIN;

DO $fixtures$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_cust_user uuid := gen_random_uuid();
  v_driver_user uuid := gen_random_uuid();
  v_other_driver_user uuid := gen_random_uuid();
  v_customer uuid;
  v_driver uuid;
  v_other_driver uuid;
  v_vehicle uuid;
  v_truck uuid;
  v_marker text := 'd06-test-' || gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_admin, v_marker || '-admin@example.invalid', '{}', '{}'),
    (v_staff, v_marker || '-staff@example.invalid', '{}', '{}'),
    (v_cust_user, v_marker || '-cust@example.invalid', '{}', '{}'),
    (v_driver_user, v_marker || '-drv@example.invalid', '{}', '{}'),
    (v_other_driver_user, v_marker || '-otherdrv@example.invalid', '{}', '{}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_admin;
  UPDATE public.users SET role = 'staff', is_active = true WHERE id = v_staff;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id = v_cust_user;
  UPDATE public.users SET role = 'driver', is_active = true WHERE id = v_driver_user;
  UPDATE public.users SET role = 'driver', is_active = true WHERE id = v_other_driver_user;

  SELECT id INTO v_customer FROM public.customers WHERE user_id = v_cust_user;
  INSERT INTO public.vehicle_types(name, default_capacity_kg) VALUES (v_marker || '-vt', 6000) RETURNING id INTO v_vehicle;
  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_driver_user, v_marker || '-drv', v_marker || '-lic1', 'available') RETURNING id INTO v_driver;
  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_other_driver_user, v_marker || '-odrv', v_marker || '-lic2', 'available') RETURNING id INTO v_other_driver;
  INSERT INTO public.trucks(plate_number, vehicle_type_id, capacity_kg, assigned_driver_id)
  VALUES (v_marker || '-plt', v_vehicle, 6000, v_driver) RETURNING id INTO v_truck;

  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.staff', v_staff::text, true);
  PERFORM set_config('test.cust_user', v_cust_user::text, true);
  PERFORM set_config('test.driver_user', v_driver_user::text, true);
  PERFORM set_config('test.other_driver_user', v_other_driver_user::text, true);
  PERFORM set_config('test.customer', v_customer::text, true);
  PERFORM set_config('test.driver', v_driver::text, true);
  PERFORM set_config('test.other_driver', v_other_driver::text, true);
  PERFORM set_config('test.vehicle', v_vehicle::text, true);
  PERFORM set_config('test.truck', v_truck::text, true);
END $fixtures$;

DO $tests$
DECLARE
  v_admin uuid := current_setting('test.admin')::uuid;
  v_staff uuid := current_setting('test.staff')::uuid;
  v_cust_user uuid := current_setting('test.cust_user')::uuid;
  v_driver_user uuid := current_setting('test.driver_user')::uuid;
  v_other_driver_user uuid := current_setting('test.other_driver_user')::uuid;
  v_customer uuid := current_setting('test.customer')::uuid;
  v_driver uuid := current_setting('test.driver')::uuid;
  v_vehicle uuid := current_setting('test.vehicle')::uuid;
  v_truck uuid := current_setting('test.truck')::uuid;

  v_shp1 uuid;
  v_del1 uuid;
  v_shp_prepaid uuid;
  v_del_prepaid uuid;
  v_req1 uuid := gen_random_uuid();
  v_req2 uuid := gen_random_uuid();
  v_proof1 text;
  v_proof2 text;
  v_res jsonb;
  v_pay1 uuid;
  v_pay2 uuid;
  v_pay_updated timestamptz;
  v_ws jsonb;
BEGIN
  -- Verify Realtime publication includes public.payments when supabase_realtime exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments') THEN
    RAISE EXCEPTION 'public.payments missing from supabase_realtime publication';
  END IF;

  -- Create loading shipment 1 (unpaid) and prepaid shipment 2
  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, quoted_amount, final_amount, scheduled_departure, status)
  VALUES
    (v_customer, v_vehicle, 'Pickup 1', 'Dropoff 1', 'Rice', 1500, 14.6, 120.96, 14.65, 120.98, 12000, 12000, now() + interval '2 days', 'loading')
  RETURNING id INTO v_shp1;

  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, pickup_arrived_at, customer_showed_at, assigned_by)
  VALUES (v_shp1, v_truck, v_driver, 'loading', now() - interval '30 minutes', now() - interval '15 minutes', now() - interval '10 minutes', v_admin)
  RETURNING id INTO v_del1;

  v_proof1 := v_del1::text || '/payment-' || v_req1::text || '.jpg';
  v_proof2 := v_del1::text || '/payment-' || v_req2::text || '.jpg';

  -- Driver cannot depart before payment is verified (all entrypoints)
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.driver_confirm_cargo_loaded(v_del1);
    RAISE EXCEPTION 'Unpaid cargo loaded allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_VERIFICATION_REQUIRED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.mobile_driver_action(v_del1, 'loaded');
    RAISE EXCEPTION 'mobile_driver_action bypass allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_VERIFICATION_REQUIRED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.driver_set_delivery_status(v_del1, 'in_transit'::public.delivery_status);
    RAISE EXCEPTION 'driver_set_delivery_status bypass allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_VERIFICATION_REQUIRED' THEN RAISE; END IF;
  END;

  -- Validation checks for driver_record_payment
  BEGIN
    PERFORM public.driver_record_payment(v_del1, v_req1, 'gcash', NULL, v_proof1, NULL);
    RAISE EXCEPTION 'GCash without reference accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_REFERENCE_REQUIRED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.driver_record_payment(v_del1, v_req1, 'cash', NULL, 'wrong/path.jpg', NULL);
    RAISE EXCEPTION 'Mismatched proof path accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_PROOF_REQUIRED' THEN RAISE; END IF;
  END;

  -- Missing storage.objects upload must be rejected even when filename pattern matches
  BEGIN
    PERFORM public.driver_record_payment(v_del1, v_req1, 'cash', NULL, v_proof1, NULL);
    RAISE EXCEPTION 'Payment without uploaded storage object accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_PROOF_REQUIRED' THEN RAISE; END IF;
  END;

  -- Stage valid receipt upload under driver's authenticated session
  INSERT INTO storage.objects(bucket_id, name, owner, metadata)
  VALUES ('delivery-documents', v_proof1, v_driver_user, '{"mimetype":"image/jpeg","size":100}');

  -- Valid driver payment submission (always full balance, status = pending)
  v_res := public.driver_record_payment(v_del1, v_req1, 'gcash', 'GC-11223344', v_proof1, 'Signed by receiver');
  v_pay1 := (v_res->>'id')::uuid;
  IF v_res->>'status' <> 'pending' OR (v_res->>'amount')::numeric <> 12000 THEN
    RAISE EXCEPTION 'driver_record_payment returned unexpected payload: %', v_res;
  END IF;

  -- Idempotent replay succeeds; conflicting replay fails
  IF (public.driver_record_payment(v_del1, v_req1, 'gcash', 'GC-11223344', v_proof1, 'Signed by receiver')->>'id')::uuid <> v_pay1 THEN
    RAISE EXCEPTION 'driver_record_payment replay duplicated row';
  END IF;
  BEGIN
    PERFORM public.driver_record_payment(v_del1, v_req1, 'cash', NULL, v_proof1, NULL);
    RAISE EXCEPTION 'Conflicting replay accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'REQUEST_ALREADY_SAVED_REFRESH' THEN RAISE; END IF;
  END;

  -- Duplicate pending payment blocked
  BEGIN
    PERFORM public.driver_record_payment(v_del1, v_req2, 'cash', NULL, v_proof2, NULL);
    RAISE EXCEPTION 'Second pending payment accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_ALREADY_PENDING' THEN RAISE; END IF;
  END;

  -- Driver can read assigned payment via RLS, storage.objects, mobile_workspace(), and mobile_delivery_evidence_file()
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_pay1) THEN
    RAISE EXCEPTION 'Driver RLS SELECT on payments denied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'delivery-documents' AND name = v_proof1) THEN
    RAISE EXCEPTION 'Assigned driver could not read uploaded payment receipt';
  END IF;
  IF public.mobile_delivery_evidence_file(v_shp1, 'payment', v_pay1) <> v_proof1 THEN
    RAISE EXCEPTION 'mobile_delivery_evidence_file payment lookup failed';
  END IF;
  v_ws := public.mobile_workspace();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_ws->'payments') p WHERE (p->>'id')::uuid = v_pay1) THEN
    RAISE EXCEPTION 'mobile_workspace missing payments';
  END IF;

  -- Other driver cannot see payment or storage receipt
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_other_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS (SELECT 1 FROM public.payments WHERE id = v_pay1) THEN
    RAISE EXCEPTION 'Unassigned driver read another shipment payment';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'delivery-documents' AND name = v_proof1) THEN
    RAISE EXCEPTION 'Unassigned driver read another shipment payment receipt';
  END IF;

  -- Pending payment STILL blocks departure
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.driver_confirm_cargo_loaded(v_del1);
    RAISE EXCEPTION 'Pending payment allowed departure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_VERIFICATION_REQUIRED' THEN RAISE; END IF;
  END;

  -- Admin/Staff notifications created on driver submission
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_admin AND type = 'payment' AND shipment_id = v_shp1)
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_cust_user AND type = 'payment' AND shipment_id = v_shp1) THEN
    RAISE EXCEPTION 'Submission notifications missing';
  END IF;

  -- Staff rejects first payment via office_review_payment; rejection_reason stored & driver notified
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO v_pay_updated FROM public.payments WHERE id = v_pay1;
  v_res := public.office_review_payment(v_pay1, v_pay_updated, 'reject', 'Receipt signature missing');
  IF v_res->>'status' <> 'rejected' OR v_res->>'rejection_reason' <> 'Receipt signature missing' THEN
    RAISE EXCEPTION 'office_review_payment reject did not store rejection_reason';
  END IF;

  -- Driver resubmits second payment with cash + signed receipt, then Admin verifies via review_shipment_payment
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects(bucket_id, name, owner, metadata)
  VALUES ('delivery-documents', v_proof2, v_driver_user, '{"mimetype":"image/jpeg","size":100}');
  v_res := public.driver_record_payment(v_del1, v_req2, 'cash', 'OR-4455', v_proof2, 'Customer re-signed receipt');
  v_pay2 := (v_res->>'id')::uuid;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'delivery-documents' AND name = v_proof1) THEN
    RAISE EXCEPTION 'Admin could not read recorded payment receipt';
  END IF;
  v_res := public.review_shipment_payment(v_pay2, 'verify');
  IF v_res->>'status' <> 'verified' THEN
    RAISE EXCEPTION 'review_shipment_payment verify failed';
  END IF;

  -- Now driver can depart (loading -> in_transit)
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mobile_driver_action(v_del1, 'loaded');
  IF (SELECT status FROM public.deliveries WHERE id = v_del1) <> 'in_transit' THEN
    RAISE EXCEPTION 'Verified payment did not unlock departure';
  END IF;

  -- Prepaid shipment at office: driver cannot double-bill, and departure is immediately allowed
  EXECUTE 'RESET ROLE';
  INSERT INTO public.shipments(customer_id, requested_vehicle_type_id, pickup_address, dropoff_address, cargo_description, weight_kg, quoted_amount, final_amount, scheduled_departure, status)
  VALUES (v_customer, v_vehicle, 'Pickup 2', 'Dropoff 2', 'Sugar', 1000, 8000, 8000, now() + interval '2 days', 'loading')
  RETURNING id INTO v_shp_prepaid;
  INSERT INTO public.deliveries(shipment_id, truck_id, driver_id, status, route_started_at, pickup_arrived_at, customer_showed_at, assigned_by)
  VALUES (v_shp_prepaid, v_truck, v_driver, 'loading', now() - interval '30 minutes', now() - interval '15 minutes', now() - interval '10 minutes', v_admin)
  RETURNING id INTO v_del_prepaid;
  INSERT INTO public.payments(shipment_id, amount, method, status, paid_at, created_by, verified_by, verified_at)
  VALUES (v_shp_prepaid, 8000, 'bank_transfer', 'verified', now(), v_admin, v_admin, now());

  PERFORM set_config('request.jwt.claim.sub', v_driver_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_driver_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.driver_record_payment(v_del_prepaid, gen_random_uuid(), 'cash', NULL, v_del_prepaid::text || '/payment-' || gen_random_uuid()::text || '.jpg', NULL);
    RAISE EXCEPTION 'Double billing allowed on prepaid shipment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAYMENT_ALREADY_PAID' THEN RAISE; END IF;
  END;

  PERFORM public.driver_confirm_cargo_loaded(v_del_prepaid);
  IF (SELECT status FROM public.deliveries WHERE id = v_del_prepaid) <> 'in_transit' THEN
    RAISE EXCEPTION 'Prepaid shipment departure blocked';
  END IF;
  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon', 'public.driver_record_payment(uuid,uuid,public.payment_method,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.review_shipment_payment(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anon execution permitted on D06 RPCs';
  END IF;
END $tests$;

ROLLBACK;
SELECT 'PASS: D06 driver payment collection, signed receipt RLS, verification/rejection, notifications, and strict departure gate passed' AS result;
