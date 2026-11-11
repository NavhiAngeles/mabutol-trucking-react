-- Migration: 20261111220000_office_customer_credentials.sql
-- Enables office administrators and staff to confirm customer auth users
-- (email_confirmed_at and phone_confirmed_at) and link them to customer records
-- so customers can log in to Tanaw Mobile immediately without email friction.

CREATE OR REPLACE FUNCTION public.office_confirm_customer_user(
  p_user_id uuid,
  p_customer_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Security Check: Only active office staff and administrators may confirm accounts
  PERFORM public.require_active_office();

  -- 2. Confirm email and phone on auth.users so customer can log in immediately on mobile
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      phone_confirmed_at = coalesce(phone_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_user_id;

  -- 3. Ensure role is customer in public.users
  UPDATE public.users
  SET role = 'customer',
      is_active = true,
      updated_at = now()
  WHERE id = p_user_id;

  -- 4. If customer_id provided, ensure link
  IF p_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET user_id = p_user_id,
        updated_at = now()
    WHERE id = p_customer_id
      AND (user_id IS NULL OR user_id = p_user_id);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.office_confirm_customer_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_confirm_customer_user(uuid, uuid) TO authenticated;

