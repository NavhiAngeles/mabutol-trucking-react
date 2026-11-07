-- Migration: 20261108000500_supabase_security_audit_hardening.sql
-- Security audit hardening for SYS-07, SYS-08, and SYS-28:
-- 1. SYS-08: Restrict legacy messages UPDATE so recipients can only update read state without modifying sender/body/shipment
-- 2. SYS-08: Enforce delivery_documents.shipment_id matches the linked delivery's shipment_id
-- 3. SYS-07: Lock down driver_set_delivery_status transitions and active-driver checks with FOR UPDATE row locks
-- 4. SYS-28: Set explicit empty search_path and revoke unnecessary PUBLIC/anon EXECUTE grants on SECURITY DEFINER functions

-- ============================================================================
-- 1. SYS-08: Guard legacy messages table UPDATE policy and immutable fields
-- ============================================================================

-- Ensure public.messages table exists with standard schema if not present
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.users(id),
  recipient_id uuid NOT NULL REFERENCES public.users(id),
  shipment_id uuid REFERENCES public.shipments(id),
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop legacy / overly-permissive UPDATE policies
DROP POLICY IF EXISTS "Users can update their received messages" ON public.messages;
DROP POLICY IF EXISTS "recipients update read status" ON public.messages;
DROP POLICY IF EXISTS "recipients update messages" ON public.messages;
DROP POLICY IF EXISTS "recipients update read state" ON public.messages;
DROP POLICY IF EXISTS "recipients update read state only" ON public.messages;
DROP POLICY IF EXISTS "update_messages" ON public.messages;

-- Create strict UPDATE policy: recipients can only target rows where they are the recipient
CREATE POLICY "recipients update read state only" ON public.messages
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

-- Restrict column-level UPDATE privileges
REVOKE ALL ON public.messages FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.messages TO authenticated;
REVOKE UPDATE ON public.messages FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='is_read') THEN
    EXECUTE 'GRANT UPDATE (is_read) ON public.messages TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='read') THEN
    EXECUTE 'GRANT UPDATE ("read") ON public.messages TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='read_at') THEN
    EXECUTE 'GRANT UPDATE (read_at) ON public.messages TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='updated_at') THEN
    EXECUTE 'GRANT UPDATE (updated_at) ON public.messages TO authenticated';
  END IF;
END $$;

-- Protective trigger to prevent tampering with sender_id, recipient_id, body/content, shipment_id, id, created_at
CREATE OR REPLACE FUNCTION public.guard_legacy_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  k text;
BEGIN
  -- Any column that changed MUST be in the permitted read-state list
  FOR k IN SELECT jsonb_object_keys(v_old) LOOP
    IF k NOT IN ('is_read', 'read', 'read_at', 'updated_at') THEN
      IF v_new->k IS DISTINCT FROM v_old->k THEN
        RAISE EXCEPTION 'RECIPIENTS_MAY_ONLY_UPDATE_READ_STATE' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  -- Auto-populate read_at when marked read
  IF (v_old ? 'is_read') AND (v_new ? 'is_read') THEN
    IF (v_old->>'is_read')::boolean = false AND (v_new->>'is_read')::boolean = true THEN
      IF (v_new ? 'read_at') AND NEW.read_at IS NULL THEN
        NEW.read_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_legacy_messages_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_legacy_messages_update ON public.messages;
CREATE TRIGGER trg_guard_legacy_messages_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_legacy_messages_update();

-- ============================================================================
-- 2. SYS-08: Enforce delivery_documents.shipment_id matches linked delivery's shipment_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_delivery_document_shipment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery_shipment_id uuid;
BEGIN
  IF NEW.delivery_id IS NOT NULL THEN
    SELECT shipment_id INTO v_delivery_shipment_id
    FROM public.deliveries
    WHERE id = NEW.delivery_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '42501';
    END IF;

    IF NEW.shipment_id IS NULL THEN
      NEW.shipment_id := v_delivery_shipment_id;
    ELSIF NEW.shipment_id IS DISTINCT FROM v_delivery_shipment_id THEN
      RAISE EXCEPTION 'DELIVERY_DOCUMENT_SHIPMENT_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_delivery_document_shipment_consistency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_delivery_document_shipment ON public.delivery_documents;
CREATE TRIGGER trg_check_delivery_document_shipment
  BEFORE INSERT OR UPDATE OF delivery_id, shipment_id ON public.delivery_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.check_delivery_document_shipment_consistency();

-- If unique constraint on deliveries(id, shipment_id) can be added, enforce composite foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_id_shipment_id_key'
  ) THEN
    ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_id_shipment_id_key UNIQUE (id, shipment_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_documents_delivery_shipment'
  ) THEN
    ALTER TABLE public.delivery_documents
      ADD CONSTRAINT fk_delivery_documents_delivery_shipment
      FOREIGN KEY (delivery_id, shipment_id)
      REFERENCES public.deliveries(id, shipment_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- 3. SYS-07: Lock down driver_set_delivery_status with active driver checks and row locks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.driver_set_delivery_status(p_delivery uuid, p_status public.delivery_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_driver_id uuid;
  v_delivery public.deliveries%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  -- 1. Active driver caller verification
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT dr.id INTO v_driver_id
  FROM public.users u
  JOIN public.drivers dr ON dr.user_id = u.id
  WHERE u.id = v_caller
    AND u.role = 'driver'
    AND u.is_active = true
    AND dr.status <> 'inactive';

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- 2. Concurrency-safe FOR UPDATE row locks on delivery and shipment
  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery
    AND driver_id = v_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = v_delivery.shipment_id
  FOR UPDATE;

  IF NOT FOUND OR v_shipment.status IN ('completed', 'cancelled') OR v_delivery.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'DELIVERY_CLOSED' USING ERRCODE = '42501';
  END IF;

  -- 3. Idempotent check: if already at the requested status, do nothing
  IF p_status = v_delivery.status THEN
    RETURN;
  END IF;

  -- 4. Strict transition validation:
  -- Allowed progression for direct driver status calls:
  -- 'assigned' -> 'loading'
  -- 'loading'  -> 'in_transit'
  -- Rejects assigned -> delivered! Rejects in_transit -> loading!
  -- Transition to 'delivered' requires verified POD upload via driver_submit_pod().
  IF v_delivery.status = 'assigned' AND p_status = 'loading' THEN
    UPDATE public.deliveries
    SET status = 'loading',
        customer_showed_at = coalesce(customer_showed_at, now()),
        updated_at = clock_timestamp()
    WHERE id = v_delivery.id;
  ELSIF v_delivery.status = 'loading' AND p_status = 'in_transit' THEN
    UPDATE public.deliveries
    SET status = 'in_transit',
        departed_at = coalesce(departed_at, now()),
        updated_at = clock_timestamp()
    WHERE id = v_delivery.id;
  ELSE
    RAISE EXCEPTION 'INVALID_DELIVERY_TRANSITION' USING ERRCODE = '42501';
  END IF;

  -- 5. Record operational event
  INSERT INTO public.shipment_events(shipment_id, delivery_id, event_type, actor_id, meta)
  VALUES (
    v_delivery.shipment_id,
    v_delivery.id,
    CASE p_status
      WHEN 'loading' THEN 'loading_started'
      WHEN 'in_transit' THEN 'in_transit_started'
      ELSE 'status_updated'
    END,
    v_caller,
    jsonb_build_object('from_status', v_delivery.status, 'to_status', p_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_set_delivery_status(uuid, public.delivery_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_set_delivery_status(uuid, public.delivery_status) TO authenticated;

-- Text overload for PostgREST callers
CREATE OR REPLACE FUNCTION public.driver_set_delivery_status(p_delivery uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('assigned', 'loading', 'in_transit', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_STATUS' USING ERRCODE = '42501';
  END IF;
  PERFORM public.driver_set_delivery_status(p_delivery, p_status::public.delivery_status);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_set_delivery_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_set_delivery_status(uuid, text) TO authenticated;

-- ============================================================================
-- 4. SYS-28: Set explicit empty search_path and revoke unnecessary EXECUTE grants
-- ============================================================================

-- 4a. Redefine functions with mutable or missing search_path to explicitly set search_path = ''

CREATE OR REPLACE FUNCTION public.sync_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ship public.shipment_status;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  v_ship := CASE NEW.status
    WHEN 'assigned'   THEN 'assigned'::public.shipment_status
    WHEN 'loading'    THEN 'loading'::public.shipment_status
    WHEN 'in_transit' THEN 'in_transit'::public.shipment_status
    WHEN 'delivered'  THEN 'review'::public.shipment_status
    ELSE NULL END;

  IF v_ship IS NOT NULL THEN
    UPDATE public.shipments SET status = v_ship
    WHERE id = NEW.shipment_id AND status NOT IN ('completed', 'cancelled') AND status <> v_ship;
  END IF;

  IF NEW.status IN ('loading', 'in_transit') THEN
    UPDATE public.trucks  SET status = 'on_trip'::public.truck_status WHERE id = NEW.truck_id  AND status = 'available';
    UPDATE public.drivers SET status = 'on_trip'::public.driver_status WHERE id = NEW.driver_id AND status = 'available';
  ELSIF NEW.status IN ('delivered', 'cancelled') THEN
    UPDATE public.trucks 
    SET status = CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.maintenance_records 
        WHERE truck_id = NEW.truck_id AND status = 'in_progress'
      ) THEN 'maintenance'::public.truck_status
      ELSE 'available'::public.truck_status
    END
    WHERE id = NEW.truck_id AND status = 'on_trip';

    UPDATE public.drivers SET status = 'available'::public.driver_status WHERE id = NEW.driver_id AND status = 'on_trip';
  END IF;

  IF NEW.status = 'in_transit' AND NEW.departed_at IS NULL THEN
    UPDATE public.deliveries SET departed_at = now() WHERE id = NEW.id;
  ELSIF NEW.status = 'delivered' AND NEW.arrived_at IS NULL THEN
    UPDATE public.deliveries SET arrived_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.sync_from_delivery() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assigned_role public.user_role := 'customer';
BEGIN
  IF coalesce(new.raw_app_meta_data->>'provisioned_role', new.raw_app_meta_data->>'role') IN ('admin', 'staff', 'driver') THEN
    assigned_role := coalesce(new.raw_app_meta_data->>'provisioned_role', new.raw_app_meta_data->>'role')::public.user_role;
  ELSIF new.raw_user_meta_data->>'role' = 'driver' THEN
    assigned_role := 'driver'::public.user_role;
  END IF;

  INSERT INTO public.users(id, email, full_name, phone, role)
  VALUES (
    new.id,
    nullif(new.email, ''),
    left(coalesce(new.raw_user_meta_data->>'full_name', ''), 200),
    left(CASE WHEN nullif(new.phone, '') IS NOT NULL THEN '+' || ltrim(new.phone, '+') ELSE new.raw_user_meta_data->>'phone' END, 30),
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE SET email = excluded.email, updated_at = now();

  IF assigned_role = 'customer' THEN
    UPDATE public.customers
    SET email = coalesce(nullif(new.email, ''), nullif(left(btrim(new.raw_user_meta_data->>'contact_email'), 254), '')),
        address = nullif(left(btrim(new.raw_user_meta_data->>'address'), 500), '')
    WHERE user_id = new.id;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Use account deactivation to preserve operational records' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(872621004);
    IF coalesce(public.get_user_role(), '') <> 'admin' THEN
      RAISE EXCEPTION 'Only active administrators may change access' USING ERRCODE = '42501';
    END IF;
    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot change your own role or active status' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'admin' AND OLD.is_active AND (NEW.role <> 'admin' OR NOT NEW.is_active)
      AND (SELECT count(*) FROM public.users WHERE role = 'admin' AND is_active) <= 1 THEN
      RAISE EXCEPTION 'The last active administrator must be retained' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_privileges() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_ph_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  cleaned text := regexp_replace(coalesce(raw, ''), '[^0-9+]', '', 'g');
BEGIN
  IF cleaned ~ '^09[0-9]{9}$' THEN RETURN '+63' || substr(cleaned, 2);
  ELSIF cleaned ~ '^9[0-9]{9}$' THEN RETURN '+63' || cleaned;
  ELSIF cleaned ~ '^639[0-9]{9}$' THEN RETURN '+' || cleaned;
  ELSIF cleaned ~ '^\+639[0-9]{9}$' THEN RETURN cleaned;
  ELSE RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_ph_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_ph_phone(text) TO authenticated;

-- 4b. Scan all SECURITY DEFINER functions in schema 'public':
-- Enforce SET search_path = '' and revoke PUBLIC and anon execution.
DO $$
DECLARE
  f record;
BEGIN
  -- Set explicit empty search_path on any function in public lacking empty search_path
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT ('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig)))
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', f.signature);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Revoke EXECUTE from PUBLIC and anon on ALL SECURITY DEFINER functions in schema 'public'
  FOR f IN
    SELECT p.oid::regprocedure AS signature, p.prorettype::regtype::text AS rettype, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);

    -- Trigger functions and internal worker/dispatcher utilities must not be callable by authenticated clients
    IF f.rettype = 'trigger' OR f.proname IN (
      'handle_new_user',
      'protect_user_privileges',
      'sync_from_delivery',
      'stamp_delivery_allowance',
      'notify_office_delivery_review',
      'notify_delivery_proof_review',
      'notify_office_mobile_booking',
      'notify_office_driver_message',
      'notify_office_driver_incident',
      'notify_office_driver_expense',
      'notify_office_driver_milestone',
      'sync_driver_phone_to_auth',
      'notify_user',
      'claim_textbee_shipments',
      'resolve_mobile_login_email',
      'process_no_shows',
      'check_delivery_document_shipment_consistency',
      'guard_legacy_messages_update'
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.signature);
    END IF;
  END LOOP;

  -- Dedicated service_role grants for background worker endpoints
  IF to_regprocedure('public.claim_textbee_shipments()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_textbee_shipments() TO service_role';
  END IF;
  IF to_regprocedure('public.resolve_mobile_login_email(text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_mobile_login_email(text) TO service_role';
  END IF;
END $$;

