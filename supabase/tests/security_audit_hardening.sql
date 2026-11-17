-- Rollback SQL Test Suite: supabase/tests/security_audit_hardening.sql
-- Verifies SYS-07, SYS-08, and SYS-28 security audit hardening:
-- 1. Legacy messages UPDATE policy & immutable field tamper protection
-- 2. Delivery documents shipment_id consistency enforcement
-- 3. driver_set_delivery_status transition lockdown, row locking, and active-driver guards
-- 4. Explicit empty search_path and revoked PUBLIC/anon execution on SECURITY DEFINER functions

BEGIN;

DO $fixtures$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_sender uuid := gen_random_uuid();
  v_recipient uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_driver_user uuid := gen_random_uuid();
  v_other_driver_user uuid := gen_random_uuid();
  v_inactive_driver_user uuid := gen_random_uuid();

  v_customer_id uuid;
  v_vehicle_id uuid;
  v_driver_id uuid;
  v_other_driver_id uuid;
  v_inactive_driver_id uuid;
  v_truck_id uuid;

  v_shipment_1 uuid;
  v_shipment_2 uuid;
  v_delivery_1 uuid;
  v_delivery_2 uuid;
  v_message_id uuid;

  v_marker text := 'sec-audit-' || gen_random_uuid();
BEGIN
  -- 1. Create test auth users
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_admin, v_marker || '-admin@example.invalid', '{"role":"admin"}', '{"full_name":"Test Admin"}'),
    (v_sender, v_marker || '-sender@example.invalid', '{"role":"customer"}', '{"full_name":"Test Sender"}'),
    (v_recipient, v_marker || '-recipient@example.invalid', '{"role":"customer"}', '{"full_name":"Test Recipient"}'),
    (v_other_user, v_marker || '-other@example.invalid', '{"role":"customer"}', '{"full_name":"Test Other"}'),
    (v_driver_user, v_marker || '-driver@example.invalid', '{"role":"driver"}', '{"full_name":"Test Driver"}'),
    (v_other_driver_user, v_marker || '-otherdriver@example.invalid', '{"role":"driver"}', '{"full_name":"Other Driver"}'),
    (v_inactive_driver_user, v_marker || '-inactivedriver@example.invalid', '{"role":"driver"}', '{"full_name":"Inactive Driver"}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_admin;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id IN (v_sender, v_recipient, v_other_user);
  UPDATE public.users SET role = 'driver', is_active = true WHERE id IN (v_driver_user, v_other_driver_user);
  UPDATE public.users SET role = 'driver', is_active = false WHERE id = v_inactive_driver_user;

  -- 2. Create customer and fleet fixtures
  INSERT INTO public.customers(user_id, name, customer_code)
  VALUES (v_sender, v_marker || '-cust', v_marker)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.vehicle_types(name, default_capacity_kg)
  VALUES (v_marker || '-type', 8000)
  RETURNING id INTO v_vehicle_id;

  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_driver_user, v_marker || '-drv1', v_marker || '-lic1', 'available')
  RETURNING id INTO v_driver_id;

  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_other_driver_user, v_marker || '-drv2', v_marker || '-lic2', 'available')
  RETURNING id INTO v_other_driver_id;

  INSERT INTO public.drivers(user_id, full_name, license_number, status)
  VALUES (v_inactive_driver_user, v_marker || '-drvinact', v_marker || '-licinact', 'inactive')
  RETURNING id INTO v_inactive_driver_id;

  INSERT INTO public.trucks(plate_number, vehicle_type_id, capacity_kg, assigned_driver_id, status)
  VALUES (v_marker || '-trk', v_vehicle_id, 8000, v_driver_id, 'available')
  RETURNING id INTO v_truck_id;

  -- 3. Create test shipments
  INSERT INTO public.shipments(customer_id, tracking_number, pickup_address, dropoff_address, weight_kg, status)
  VALUES (v_customer_id, v_marker || '-shp1', 'Origin 1', 'Dest 1', 1000, 'assigned')
  RETURNING id INTO v_shipment_1;

  INSERT INTO public.shipments(customer_id, tracking_number, pickup_address, dropoff_address, weight_kg, status)
  VALUES (v_customer_id, v_marker || '-shp2', 'Origin 2', 'Dest 2', 1500, 'assigned')
  RETURNING id INTO v_shipment_2;

  -- 4. Create deliveries
  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status)
  VALUES (v_shipment_1, v_driver_id, v_truck_id, 'assigned')
  RETURNING id INTO v_delivery_1;

  INSERT INTO public.deliveries(shipment_id, driver_id, truck_id, status)
  VALUES (v_shipment_2, v_other_driver_id, v_truck_id, 'assigned')
  RETURNING id INTO v_delivery_2;

  -- 5. Create test legacy message
  INSERT INTO public.messages(sender_id, recipient_id, shipment_id, body, is_read)
  VALUES (v_sender, v_recipient, v_shipment_1, 'Initial legitimate message', false)
  RETURNING id INTO v_message_id;

  -- Store fixture keys in session config
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.sender', v_sender::text, true);
  PERFORM set_config('test.recipient', v_recipient::text, true);
  PERFORM set_config('test.other_user', v_other_user::text, true);
  PERFORM set_config('test.driver_user', v_driver_user::text, true);
  PERFORM set_config('test.other_driver_user', v_other_driver_user::text, true);
  PERFORM set_config('test.inactive_driver_user', v_inactive_driver_user::text, true);
  PERFORM set_config('test.shipment_1', v_shipment_1::text, true);
  PERFORM set_config('test.shipment_2', v_shipment_2::text, true);
  PERFORM set_config('test.delivery_1', v_delivery_1::text, true);
  PERFORM set_config('test.delivery_2', v_delivery_2::text, true);
  PERFORM set_config('test.message_id', v_message_id::text, true);
END $fixtures$;

-- ============================================================================
-- TEST PART 1: SYS-08 Legacy messages UPDATE restrictions
-- ============================================================================
DO $test_part_1$
DECLARE
  v_recipient uuid := current_setting('test.recipient')::uuid;
  v_other uuid := current_setting('test.other_user')::uuid;
  v_msg uuid := current_setting('test.message_id')::uuid;
  v_shp2 uuid := current_setting('test.shipment_2')::uuid;
  v_updated boolean;
BEGIN
  -- Authenticate as recipient
  PERFORM set_config('request.jwt.claim.sub', v_recipient::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_recipient, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1a. Recipient updating only is_read must SUCCEED
  UPDATE public.messages SET is_read = true WHERE id = v_msg;
  SELECT is_read INTO v_updated FROM public.messages WHERE id = v_msg;
  IF v_updated IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_FAIL: Recipient valid read state update failed';
  END IF;

  -- 1b. Recipient attempting to tamper with message body must FAIL
  BEGIN
    UPDATE public.messages SET body = 'Forged message body' WHERE id = v_msg;
    RAISE EXCEPTION 'TEST_FAIL: Recipient successfully tampered with message body';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%RECIPIENTS_MAY_ONLY_UPDATE_READ_STATE%' THEN RAISE; END IF;
  END;

  -- 1c. Recipient attempting to change sender_id must FAIL
  BEGIN
    UPDATE public.messages SET sender_id = v_recipient WHERE id = v_msg;
    RAISE EXCEPTION 'TEST_FAIL: Recipient successfully changed sender_id';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%RECIPIENTS_MAY_ONLY_UPDATE_READ_STATE%' THEN RAISE; END IF;
  END;

  -- 1d. Recipient attempting to reassign shipment_id must FAIL
  BEGIN
    UPDATE public.messages SET shipment_id = v_shp2 WHERE id = v_msg;
    RAISE EXCEPTION 'TEST_FAIL: Recipient successfully changed shipment_id';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%RECIPIENTS_MAY_ONLY_UPDATE_READ_STATE%' THEN RAISE; END IF;
  END;

  -- 1e. Unauthorized third party cannot update the message
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.messages SET is_read = false WHERE id = v_msg;
  EXECUTE 'RESET ROLE';
  -- Confirm third party update did NOT apply
  SELECT is_read INTO v_updated FROM public.messages WHERE id = v_msg;
  IF v_updated IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_FAIL: Third party successfully altered message read state';
  END IF;
END $test_part_1$;

-- ============================================================================
-- TEST PART 2: SYS-08 Delivery documents shipment_id consistency
-- ============================================================================
DO $test_part_2$
DECLARE
  v_del1 uuid := current_setting('test.delivery_1')::uuid;
  v_shp1 uuid := current_setting('test.shipment_1')::uuid;
  v_shp2 uuid := current_setting('test.shipment_2')::uuid;
  v_doc_id uuid := gen_random_uuid();
  v_doc_path text := v_del1::text || '/pod-photo-test.jpg';
BEGIN
  -- 2a. Inserting document with matching delivery and shipment must SUCCEED
  INSERT INTO public.delivery_documents(
    id, delivery_id, shipment_id, kind, storage_path, file_name, mime_type, recipient_name, uploaded_by, proof_attempt
  ) VALUES (
    v_doc_id, v_del1, v_shp1, 'proof_of_delivery', v_doc_path, 'pod-photo-test.jpg', 'image/jpeg', 'Signer', current_setting('test.admin')::uuid, 1
  );

  IF NOT EXISTS (SELECT 1 FROM public.delivery_documents WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'TEST_FAIL: Valid delivery document insertion failed';
  END IF;

  -- 2b. Inserting document with mismatched shipment_id must FAIL
  BEGIN
    INSERT INTO public.delivery_documents(
      delivery_id, shipment_id, kind, storage_path, file_name, mime_type, recipient_name, uploaded_by, proof_attempt
    ) VALUES (
      v_del1, v_shp2, 'proof_of_delivery', v_del1::text || '/pod-mismatch.jpg', 'pod-mismatch.jpg', 'image/jpeg', 'Signer', current_setting('test.admin')::uuid, 1
    );
    RAISE EXCEPTION 'TEST_FAIL: Mismatched shipment_id was accepted for delivery document';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%DELIVERY_DOCUMENT_SHIPMENT_MISMATCH%' THEN RAISE; END IF;
  END;

  -- 2c. Updating existing document to mismatched shipment_id must FAIL
  BEGIN
    UPDATE public.delivery_documents SET shipment_id = v_shp2 WHERE id = v_doc_id;
    RAISE EXCEPTION 'TEST_FAIL: Delivery document update to mismatched shipment_id accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%DELIVERY_DOCUMENT_SHIPMENT_MISMATCH%' THEN RAISE; END IF;
  END;
END $test_part_2$;

-- ============================================================================
-- TEST PART 3: SYS-07 driver_set_delivery_status transition & active-driver checks
-- ============================================================================
DO $test_part_3$
DECLARE
  v_drv_user uuid := current_setting('test.driver_user')::uuid;
  v_other_drv_user uuid := current_setting('test.other_driver_user')::uuid;
  v_inact_drv_user uuid := current_setting('test.inactive_driver_user')::uuid;
  v_del1 uuid := current_setting('test.delivery_1')::uuid;
  v_del2 uuid := current_setting('test.delivery_2')::uuid;
  v_curr_status public.delivery_status;
BEGIN
  -- 3a. Unauthenticated caller must FAIL
  BEGIN
    PERFORM public.driver_set_delivery_status(v_del1, 'loading'::public.delivery_status);
    RAISE EXCEPTION 'TEST_FAIL: Unauthenticated caller updated delivery status';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%ACTIVE_DRIVER_REQUIRED%' THEN RAISE; END IF;
  END;

  -- 3b. Inactive driver must FAIL
  PERFORM set_config('request.jwt.claim.sub', v_inact_drv_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_inact_drv_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.driver_set_delivery_status(v_del1, 'loading'::public.delivery_status);
    RAISE EXCEPTION 'TEST_FAIL: Inactive driver updated delivery status';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%ACTIVE_DRIVER_REQUIRED%' THEN RAISE; END IF;
  END;

  -- 3c. Other driver attempting to update another driver's delivery must FAIL
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_other_drv_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_drv_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.driver_set_delivery_status(v_del1, 'loading'::public.delivery_status);
    RAISE EXCEPTION 'TEST_FAIL: Unassigned driver updated delivery status';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%DELIVERY_NOT_FOUND%' THEN RAISE; END IF;
  END;

  -- 3d. Active assigned driver calling assigned -> loading must SUCCEED
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_drv_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_drv_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.driver_set_delivery_status(v_del1, 'loading'::public.delivery_status);
  SELECT status INTO v_curr_status FROM public.deliveries WHERE id = v_del1;
  IF v_curr_status <> 'loading' THEN
    RAISE EXCEPTION 'TEST_FAIL: Assigned to loading transition failed';
  END IF;

  -- 3e. Active assigned driver calling loading -> in_transit must SUCCEED
  PERFORM public.driver_set_delivery_status(v_del1, 'in_transit'::public.delivery_status);
  SELECT status INTO v_curr_status FROM public.deliveries WHERE id = v_del1;
  IF v_curr_status <> 'in_transit' THEN
    RAISE EXCEPTION 'TEST_FAIL: Loading to in_transit transition failed';
  END IF;

  -- 3f. Active driver attempting backward jump in_transit -> loading must FAIL
  BEGIN
    PERFORM public.driver_set_delivery_status(v_del1, 'loading'::public.delivery_status);
    RAISE EXCEPTION 'TEST_FAIL: Backward transition in_transit -> loading accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%INVALID_DELIVERY_TRANSITION%' THEN RAISE; END IF;
  END;

  -- 3g. Active driver on del2 attempting assigned -> delivered jump must FAIL
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_other_drv_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_drv_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.driver_set_delivery_status(v_del2, 'delivered'::public.delivery_status);
    RAISE EXCEPTION 'TEST_FAIL: Direct assigned -> delivered jump accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%INVALID_DELIVERY_TRANSITION%' THEN RAISE; END IF;
  END;

  EXECUTE 'RESET ROLE';
END $test_part_3$;

-- ============================================================================
-- TEST PART 4: SYS-28 search_path and EXECUTE privilege verification
-- ============================================================================
DO $test_part_4$
DECLARE
  v_insecure_search_path_count int;
  v_insecure_anon_grant_count int;
BEGIN
  -- 4a. Check that no SECURITY DEFINER functions in schema 'public' have mutable or missing search_path
  SELECT count(*) INTO v_insecure_search_path_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (
      p.proconfig IS NULL
      OR NOT ('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig))
    );

  IF v_insecure_search_path_count > 0 THEN
    RAISE EXCEPTION 'TEST_FAIL: Found % SECURITY DEFINER functions without explicit empty search_path', v_insecure_search_path_count;
  END IF;

  -- 4b. Check that no SECURITY DEFINER functions in schema 'public' are executable by anon or PUBLIC
  SELECT count(*) INTO v_insecure_anon_grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND acl.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
    AND acl.privilege_type = 'EXECUTE';

  IF v_insecure_anon_grant_count > 0 THEN
    RAISE EXCEPTION 'TEST_FAIL: Found % SECURITY DEFINER functions with EXECUTE granted to anon or PUBLIC', v_insecure_anon_grant_count;
  END IF;
END $test_part_4$;

-- All test fixtures and modifications roll back cleanly
ROLLBACK;

