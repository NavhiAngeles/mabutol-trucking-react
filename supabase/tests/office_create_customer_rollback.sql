-- Rollback SQL Test Suite: supabase/tests/office_create_customer_rollback.sql
-- Verifies public.office_create_customer SECURITY INVOKER RPC:
-- 1. Office access requirement (rejects customer/unauthenticated callers)
-- 2. Input validation (name length, email format, phone digits)
-- 3. Duplicate active customer email validation
-- 4. Duplicate active customer phone validation
-- 5. Successful insertion with auto-generated customer_code and activity_logs audit
-- 6. Clean rollback at completion

BEGIN;

DO $test_suite$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_customer_user uuid := gen_random_uuid();
  v_marker text := 'cust-test-' || substring(gen_random_uuid()::text, 1, 8);

  v_res jsonb;
  v_cust_id uuid;
  v_cust_code text;
  v_threw boolean;
  v_err_msg text;
BEGIN
  -- 1. Setup Auth and Users
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
    (v_admin, v_marker || '-admin@example.invalid', '{"role":"admin"}', '{"full_name":"Test Admin"}'),
    (v_staff, v_marker || '-staff@example.invalid', '{"role":"staff"}', '{"full_name":"Test Staff"}'),
    (v_customer_user, v_marker || '-cust@example.invalid', '{"role":"customer"}', '{"full_name":"Test Customer"}');

  UPDATE public.users SET role = 'admin', is_active = true WHERE id = v_admin;
  UPDATE public.users SET role = 'staff', is_active = true WHERE id = v_staff;
  UPDATE public.users SET role = 'customer', is_active = true WHERE id = v_customer_user;

  -- 2. Unauthorized caller (customer role) must fail
  PERFORM set_config('request.jwt.claim.sub', v_customer_user::text, true);
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(
      p_name := 'Unauthorized Customer Attempt',
      p_email := v_marker || '-unauth@example.invalid'
    );
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
    v_err_msg := SQLERRM;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Non-office customer role was allowed to call office_create_customer';
  END IF;

  -- Switch context to Office Staff
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  -- 3. Validation: Name must be >= 2 characters
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(p_name := 'X');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Name < 2 characters was allowed';
  END IF;

  -- 4. Validation: Invalid email format must be rejected
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(p_name := 'Valid Name', p_email := 'invalid-email-address');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Malformed email was allowed';
  END IF;

  -- 5. Validation: Invalid phone length (< 7 digits) must be rejected
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(p_name := 'Valid Name', p_phone := '12345');
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Short phone number was allowed';
  END IF;

  -- 6. Successful creation by Office Staff
  v_res := public.office_create_customer(
    p_name := 'Acme Logistics Corp',
    p_email := v_marker || '-acme@example.invalid',
    p_phone := '0917-555-1234',
    p_address := '123 Industrial Rd',
    p_barangay := 'San Antonio',
    p_city := 'Pasig',
    p_province := 'Metro Manila',
    p_notes := 'Priority billing customer'
  );

  v_cust_id := (v_res->>'id')::uuid;
  v_cust_code := v_res->>'customer_code';

  IF v_cust_id IS NULL OR v_cust_code IS NULL OR v_cust_code NOT LIKE 'CUST-%' THEN
    RAISE EXCEPTION 'TEST FAILED: Customer was not created with expected code. Got: %', v_res;
  END IF;

  IF (v_res->>'is_active')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST FAILED: Customer is_active was not true';
  END IF;

  -- 7. Duplicate email validation: inserting another customer with same email must fail
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(
      p_name := 'Duplicate Email Corp',
      p_email := upper(v_marker || '-acme@example.invalid'),
      p_phone := '0918-999-8888'
    );
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Duplicate email was permitted';
  END IF;

  -- 8. Duplicate phone validation: inserting another customer with same phone digits must fail
  v_threw := false;
  BEGIN
    PERFORM public.office_create_customer(
      p_name := 'Duplicate Phone Corp',
      p_email := v_marker || '-other@example.invalid',
      p_phone := '(0917) 555-1234' -- same digits
    );
  EXCEPTION WHEN OTHERS THEN
    v_threw := true;
  END;
  IF NOT v_threw THEN
    RAISE EXCEPTION 'TEST FAILED: Duplicate phone number was permitted';
  END IF;

  -- 9. Verify activity log entry was recorded
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE user_id = v_staff
      AND action = 'customer_created'
      AND entity_id = v_cust_id::text
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: activity_logs audit record was not created';
  END IF;

  RAISE NOTICE 'ALL OFFICE_CREATE_CUSTOMER ROLLBACK TESTS PASSED';
END $test_suite$;

ROLLBACK;

