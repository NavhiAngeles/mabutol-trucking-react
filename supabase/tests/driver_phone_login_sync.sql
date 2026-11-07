-- Test: driver phone synchronization and login credential binding
BEGIN;
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_driver uuid := gen_random_uuid();
  v_auth_phone text;
  v_auth_confirmed timestamptz;
  v_user_phone text;
BEGIN
  -- 1. Create a driver auth account without a phone number (simulating legacy registration)
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user, 'nav.fixture@tanawlogistics.com', '{"role":"driver"}', '{"full_name":"Nav Angeles Fixture"}');

  INSERT INTO public.users(id, email, full_name, role, is_active)
  VALUES (v_user, 'nav.fixture@tanawlogistics.com', 'Nav Angeles Fixture', 'driver', true);

  -- 2. Insert driver into public.drivers with local contact number '09675132862'
  INSERT INTO public.drivers(id, user_id, full_name, license_number, contact_number, status)
  VALUES (v_driver, v_user, 'Nav Angeles Fixture', 'TEST-LIC-NAV-01', '09675132862', 'available');

  -- 3. Verify trigger automatically normalized and synchronized to auth.users.phone and public.users.phone
  SELECT phone, phone_confirmed_at INTO v_auth_phone, v_auth_confirmed FROM auth.users WHERE id = v_user;
  SELECT phone INTO v_user_phone FROM public.users WHERE id = v_user;

  IF v_auth_phone IS DISTINCT FROM '+639675132862' THEN
    RAISE EXCEPTION 'auth.users.phone was not synced: expected +639675132862, got %', v_auth_phone;
  END IF;

  IF v_auth_confirmed IS NULL THEN
    RAISE EXCEPTION 'auth.users.phone_confirmed_at was not confirmed';
  END IF;

  IF v_user_phone IS DISTINCT FROM '+639675132862' THEN
    RAISE EXCEPTION 'public.users.phone was not synced: expected +639675132862, got %', v_user_phone;
  END IF;

  -- 4. Verify update of contact number re-synchronizes auth.users and public.users
  UPDATE public.drivers SET contact_number = '09181234567' WHERE id = v_driver;

  SELECT phone INTO v_auth_phone FROM auth.users WHERE id = v_user;
  SELECT phone INTO v_user_phone FROM public.users WHERE id = v_user;

  IF v_auth_phone IS DISTINCT FROM '+639181234567' THEN
    RAISE EXCEPTION 'Updated auth.users.phone was not synced: expected +639181234567, got %', v_auth_phone;
  END IF;

  IF v_user_phone IS DISTINCT FROM '+639181234567' THEN
    RAISE EXCEPTION 'Updated public.users.phone was not synced: expected +639181234567, got %', v_user_phone;
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: driver phone trigger and sync correctly bind confirmed phone credentials for login' AS result;

