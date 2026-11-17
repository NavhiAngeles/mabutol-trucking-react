-- Migration: 20261111220000_office_customer_credentials.sql
-- Enables office administrators and staff to confirm customer auth users
-- (email_confirmed_at and phone_confirmed_at), upsert their profile in public.users,
-- and link them to public.customers so they can sign in to Tanaw Mobile immediately.

CREATE OR REPLACE FUNCTION public.office_confirm_customer_user(
  p_user_id uuid,
  p_customer_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cust public.customers%ROWTYPE;
  v_auth auth.users%ROWTYPE;
  v_digits text;
  v_auth_phone text;
  v_public_phone text;
  v_email text;
  v_name text;
BEGIN
  -- 1. Security Check: Only active office staff and administrators may confirm accounts
  PERFORM public.require_active_office();

  SELECT * INTO v_auth FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user % not found.', p_user_id;
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
  ELSE
    SELECT * INTO v_cust FROM public.customers WHERE user_id = p_user_id LIMIT 1;
  END IF;

  v_name := coalesce(
    nullif(btrim(v_cust.name), ''),
    nullif(btrim(v_auth.raw_user_meta_data->>'full_name'), ''),
    'Customer'
  );
  v_email := lower(coalesce(
    nullif(btrim(v_cust.email), ''),
    nullif(btrim(v_auth.email), '')
  ));

  -- Normalize PH mobile number for both auth.users (639XXXXXXXXX) and public.users (+639XXXXXXXXX)
  v_digits := regexp_replace(
    coalesce(v_cust.phone, v_auth.phone, v_auth.raw_user_meta_data->>'phone', ''),
    '\D', '', 'g'
  );
  IF v_digits ~ '^09[0-9]{9}$' THEN
    v_auth_phone := '63' || substring(v_digits FROM 2);
    v_public_phone := '+' || v_auth_phone;
  ELSIF v_digits ~ '^9[0-9]{9}$' THEN
    v_auth_phone := '63' || v_digits;
    v_public_phone := '+' || v_auth_phone;
  ELSIF v_digits ~ '^639[0-9]{9}$' THEN
    v_auth_phone := v_digits;
    v_public_phone := '+' || v_digits;
  ELSE
    v_auth_phone := nullif(v_auth.phone, '');
    v_public_phone := nullif(btrim(coalesce(v_cust.phone, v_auth.raw_user_meta_data->>'phone', '')), '');
  END IF;

  -- 2. Confirm email and phone on auth.users so customer can log in immediately on mobile
  UPDATE auth.users
  SET email = coalesce(nullif(email, ''), v_email),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      phone = coalesce(v_auth_phone, phone),
      phone_confirmed_at = CASE
        WHEN coalesce(v_auth_phone, phone) IS NOT NULL THEN coalesce(phone_confirmed_at, now())
        ELSE phone_confirmed_at
      END,
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"customer"}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_name,
        'role', 'customer',
        'phone', coalesce(v_public_phone, '')
      ),
      updated_at = now()
  WHERE id = p_user_id;

  -- 3. Upsert customer profile in public.users so Tanaw Mobile resolves the user record
  INSERT INTO public.users (id, email, full_name, phone, role, is_active, updated_at)
  VALUES (p_user_id, v_email, v_name, v_public_phone, 'customer', true, now())
  ON CONFLICT (id) DO UPDATE
  SET email = coalesce(excluded.email, public.users.email),
      full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
      phone = coalesce(excluded.phone, public.users.phone),
      role = 'customer',
      is_active = true,
      updated_at = now();

  -- 4. If customer record exists, ensure user_id link and active state
  IF v_cust.id IS NOT NULL THEN
    UPDATE public.customers
    SET user_id = p_user_id,
        is_active = true,
        updated_at = now()
    WHERE id = v_cust.id
      AND (user_id IS NULL OR user_id = p_user_id);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.office_confirm_customer_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_confirm_customer_user(uuid, uuid) TO authenticated;


