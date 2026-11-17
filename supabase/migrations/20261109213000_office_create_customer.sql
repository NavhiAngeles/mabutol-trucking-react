-- Migration: 20261109213000_office_create_customer.sql
-- Establishes atomic SECURITY INVOKER RPC for active office staff/admin to register
-- a new billing customer with duplicate email and phone number validation.

CREATE OR REPLACE FUNCTION public.office_create_customer(
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_barangay text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_province text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_address text;
  v_barangay text;
  v_city text;
  v_province text;
  v_notes text;
  v_customer public.customers%ROWTYPE;
BEGIN
  -- 1. Security Check: Only active office staff and administrators may register customers
  PERFORM public.require_active_office();

  -- 2. Validate and trim Name (mandatory, minimum 2 characters)
  v_name := btrim(coalesce(p_name, ''));
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Customer name is required and must be at least 2 characters.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Validate and trim Email (optional, but if provided must be valid and unique among active customers)
  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  ELSE
    IF v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Enter a valid email address.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE lower(btrim(email)) = v_email
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'A customer with email "%" already exists.', v_email
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 4. Validate and trim Phone (optional, but if provided must have 7-15 digits and be unique)
  v_phone := btrim(coalesce(p_phone, ''));
  IF v_phone = '' THEN
    v_phone := NULL;
  ELSE
    v_phone_digits := regexp_replace(v_phone, '\D', '', 'g');
    IF length(v_phone_digits) < 7 OR length(v_phone_digits) > 15 THEN
      RAISE EXCEPTION 'Enter a valid contact number (7–15 digits).'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE regexp_replace(phone, '\D', '', 'g') = v_phone_digits
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'A customer with phone number "%" already exists.', v_phone
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 5. Trim optional address and notes fields
  v_address := nullif(btrim(coalesce(p_address, '')), '');
  v_barangay := nullif(btrim(coalesce(p_barangay, '')), '');
  v_city := nullif(btrim(coalesce(p_city, '')), '');
  v_province := nullif(btrim(coalesce(p_province, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  -- 6. Insert new billing customer record (is_active = true)
  INSERT INTO public.customers (
    name,
    email,
    phone,
    address,
    barangay,
    city,
    province,
    notes,
    is_active
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    v_address,
    v_barangay,
    v_city,
    v_province,
    v_notes,
    true
  )
  RETURNING * INTO v_customer;

  -- 7. Record structured audit log in activity_logs
  BEGIN
    INSERT INTO public.activity_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'customer_created',
      'customer',
      v_customer.id::text,
      jsonb_build_object(
        'customer_id', v_customer.id,
        'customer_code', v_customer.customer_code,
        'name', v_customer.name,
        'email', v_customer.email,
        'phone', v_customer.phone
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN to_jsonb(v_customer);
END;
$$;

REVOKE ALL ON FUNCTION public.office_create_customer(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_create_customer(text, text, text, text, text, text, text, text) TO authenticated;

