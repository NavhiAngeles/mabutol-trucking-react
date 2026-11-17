-- Rollback SQL Test Suite: supabase/tests/payment_ledger_rollback.sql
-- Verifies public.payments RLS policies, office_record_payment, and office_review_payment atomic RPCs
-- Ensures optimistic concurrency control, audit trail logging, and role-based access checks.

BEGIN;

DO $fixtures$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_customer_user uuid := gen_random_uuid();
  v_customer_id uuid;
  v_shipment_id uuid;
  v_cancelled_shipment_id uuid;
  v_marker text := 'pay-test-' || gen_random_uuid();

  v_rec_result jsonb;
  v_payment_id uuid;
  v_expected_updated_at timestamptz;
  v_review_result jsonb;

  v_threw boolean;
  v_err_code text;
  v_err_msg text;
BEGIN
  -- 1. Setup Auth and Users
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_admin, v_marker || '-admin@example.invalid', '{"role":"admin"}', '{"full_name":"Pay Test Admin"}'),
    (v_staff, v_marker || '-staff@example.invalid', '{"role":"staff"}', '{"full_name":"Pay Test Staff"}'),
    (v_customer_user, v_marker || '-cust@example.invalid', '{"role":"customer"}', '{"full_name":"Pay Test Customer"}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_admin;
  UPDATE public.users SET role = 'staff', is_active = true WHERE id = v_staff;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id = v_customer_user;

  SELECT id INTO v_customer_id FROM public.customers WHERE user_id = v_customer_user;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers(user_id, name, customer_code)
    VALUES (v_customer_user, v_marker || ' Customer', v_marker)
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, booking_source, quoted_amount)
  VALUES (v_customer_id, 'Origin warehouse', 'Destination store', 'booked', 'web', 15000)
  RETURNING id INTO v_shipment_id;

  INSERT INTO public.shipments(customer_id, pickup_address, dropoff_address, status, booking_source, quoted_amount, cancelled_reason, cancelled_at)
  VALUES (v_customer_id, 'Origin warehouse', 'Destination store', 'cancelled', 'web', 10000, 'Customer cancelled before dispatch', now())
  RETURNING id INTO v_cancelled_shipment_id;

  -- 2. Act as Admin to record payment
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- TEST 2A: Valid payment record
  v_rec_result := public.office_record_payment(
    p_shipment_id := v_shipment_id,
    p_amount := 5000.50,
    p_method := 'cash',
    p_reference := 'OR-REF-998877',
    p_paid_at := now(),
    p_notes := 'Initial 50% deposit'
  );

  IF v_rec_result->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'Expected payment status pending, got %', v_rec_result->>'status';
  END IF;

  IF (v_rec_result->>'amount')::numeric <> 5000.50 THEN
    RAISE EXCEPTION 'Expected amount 5000.50, got %', v_rec_result->>'amount';
  END IF;

  v_payment_id := (v_rec_result->>'id')::uuid;

  -- Verify shipment_events audit trail
  IF NOT EXISTS (
    SELECT 1 FROM public.shipment_events
    WHERE shipment_id = v_shipment_id
      AND event_type = 'payment_recorded'
      AND actor_id = v_admin
      AND (meta->>'payment_id')::uuid = v_payment_id
  ) THEN
    RAISE EXCEPTION 'Audit event payment_recorded was not logged';
  END IF;

  -- TEST 2B: Guard against non-positive amount
  v_threw := false;
  BEGIN
    PERFORM public.office_record_payment(v_shipment_id, 0, 'cash');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'Expected non-positive amount to be rejected';
  END IF;

  -- TEST 2C: Guard against cancelled shipment
  v_threw := false;
  BEGIN
    PERFORM public.office_record_payment(v_cancelled_shipment_id, 1000, 'cash');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'Expected recording payment for cancelled shipment to be rejected';
  END IF;

  -- TEST 2D: Guard against future payment date (> 1 day)
  v_threw := false;
  BEGIN
    PERFORM public.office_record_payment(
      v_shipment_id, 1000, 'cash', NULL, now() + interval '5 days', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'Expected future payment date to be rejected';
  END IF;

  -- 3. Act as Customer (unauthorized for office RPCs)
  PERFORM set_config('request.jwt.claim.sub', v_customer_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_customer_user, 'role', 'authenticated')::text, true);

  v_threw := false;
  BEGIN
    PERFORM public.office_record_payment(v_shipment_id, 1000, 'cash');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
    v_threw := true;
  END;
  IF NOT v_threw OR v_err_code <> '42501' THEN
    RAISE EXCEPTION 'Expected customer recording payment to fail with 42501, got threw=%, code=%', v_threw, v_err_code;
  END IF;

  -- Verify customer CAN read their payment via RLS SELECT policy
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_payment_id) THEN
    RAISE EXCEPTION 'Customer should be able to view payments for their own shipment via RLS';
  END IF;

  -- 4. Act as Staff to verify the payment
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);

  SELECT updated_at INTO v_expected_updated_at FROM public.payments WHERE id = v_payment_id;

  -- TEST 4A: Optimistic concurrency conflict test
  v_threw := false;
  BEGIN
    PERFORM public.office_review_payment(
      p_payment_id := v_payment_id,
      p_expected := v_expected_updated_at - interval '10 seconds',
      p_action := 'verify'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
    v_threw := true;
  END;
  IF NOT v_threw OR v_err_code <> '40001' THEN
    RAISE EXCEPTION 'Expected optimistic lock conflict 40001, got threw=%, code=%', v_threw, v_err_code;
  END IF;

  -- TEST 4B: Successful verification
  v_review_result := public.office_review_payment(
    p_payment_id := v_payment_id,
    p_expected := v_expected_updated_at,
    p_action := 'verify'
  );

  IF v_review_result->>'status' <> 'verified' THEN
    RAISE EXCEPTION 'Expected payment status verified, got %', v_review_result->>'status';
  END IF;

  IF (v_review_result->>'verified_by')::uuid <> v_staff THEN
    RAISE EXCEPTION 'Expected verified_by to be staff uuid, got %', v_review_result->>'verified_by';
  END IF;

  -- Verify shipment_events audit trail for verification
  IF NOT EXISTS (
    SELECT 1 FROM public.shipment_events
    WHERE shipment_id = v_shipment_id
      AND event_type = 'payment_verified'
      AND actor_id = v_staff
      AND (meta->>'payment_id')::uuid = v_payment_id
  ) THEN
    RAISE EXCEPTION 'Audit event payment_verified was not logged';
  END IF;

  -- TEST 4C: Cannot review an already verified payment
  SELECT updated_at INTO v_expected_updated_at FROM public.payments WHERE id = v_payment_id;
  v_threw := false;
  BEGIN
    PERFORM public.office_review_payment(v_payment_id, v_expected_updated_at, 'verify');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'Expected re-verifying an already verified payment to fail';
  END IF;

  -- 5. TEST REJECTION FLOW on a second payment
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_rec_result := public.office_record_payment(
    p_shipment_id := v_shipment_id,
    p_amount := 2500,
    p_method := 'gcash',
    p_reference := 'GC-554433',
    p_notes := 'Second installment attempt'
  );
  v_payment_id := (v_rec_result->>'id')::uuid;

  SELECT updated_at INTO v_expected_updated_at FROM public.payments WHERE id = v_payment_id;

  -- TEST 5A: Reject requires reason >= 5 characters
  v_threw := false;
  BEGIN
    PERFORM public.office_review_payment(v_payment_id, v_expected_updated_at, 'reject', 'bad');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'Expected rejection with short reason to fail';
  END IF;

  -- TEST 5B: Valid rejection
  v_review_result := public.office_review_payment(
    v_payment_id,
    v_expected_updated_at,
    'reject',
    'Transaction reference invalid on bank statement'
  );

  IF v_review_result->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'Expected status rejected, got %', v_review_result->>'status';
  END IF;

  IF NOT (v_review_result->>'notes' LIKE '%[Rejected: Transaction reference invalid on bank statement]%') THEN
    RAISE EXCEPTION 'Expected rejection reason appended to notes, got %', v_review_result->>'notes';
  END IF;

  -- Verify shipment_events audit trail for rejection
  IF NOT EXISTS (
    SELECT 1 FROM public.shipment_events
    WHERE shipment_id = v_shipment_id
      AND event_type = 'payment_rejected'
      AND actor_id = v_admin
      AND (meta->>'reason') = 'Transaction reference invalid on bank statement'
  ) THEN
    RAISE EXCEPTION 'Audit event payment_rejected was not logged';
  END IF;

END $fixtures$;

ROLLBACK;

