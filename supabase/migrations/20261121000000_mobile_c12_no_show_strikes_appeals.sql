-- Migration: 20261121000000_mobile_c12_no_show_strikes_appeals.sql
-- Implements Request C12: Customer No-Show Flow, 3-Strike Standing, Booking Cooldowns,
-- Permanent Suspension & In-App Appeals (shared across Tanaw Mobile & mabutol-trucking-react).
-- Idempotent: safe to apply on fresh or already-migrated databases.

-- 1. public.customers standing & suspension columns
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS no_show_strike_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS standing_status text NOT NULL DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz;

DO $c12_cust_constraints$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%standing_status%' OR pg_get_constraintdef(oid) LIKE '%no_show_strike_count%')
  LOOP
    EXECUTE format('ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  ALTER TABLE public.customers
    ADD CONSTRAINT customers_no_show_strike_count_check CHECK (no_show_strike_count >= 0),
    ADD CONSTRAINT customers_standing_status_check CHECK (
      standing_status IN ('good', 'active', 'cooldown', 'suspended', 'reinstated')
    );
END $c12_cust_constraints$;

-- 2. public.deliveries & public.shipments tracking columns
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS pickup_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_showed_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_on_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_confirmed_at timestamptz;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_type text;

DO $c12_ship_constraints$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.shipments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%cancellation_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  ALTER TABLE public.shipments
    ADD CONSTRAINT shipments_cancellation_type_check CHECK (
      cancellation_type IS NULL OR cancellation_type IN ('no_show', 'customer', 'admin', 'office', 'system')
    );
END $c12_ship_constraints$;

-- 3. Immutable strike audit log: public.customer_no_show_strikes
CREATE TABLE IF NOT EXISTS public.customer_no_show_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL UNIQUE REFERENCES public.shipments(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL,
  strike_number integer NOT NULL CHECK (strike_number >= 1),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_by_role text NOT NULL DEFAULT 'admin',
  confirmed_source text NOT NULL DEFAULT 'office',
  reason text NOT NULL DEFAULT 'Confirmed no-show',
  attempt_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_no_show_strikes
  ADD COLUMN IF NOT EXISTS confirmed_by_role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS confirmed_source text NOT NULL DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'Confirmed no-show',
  ADD COLUMN IF NOT EXISTS attempt_notes text;

DO $c12_strike_constraints$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.customer_no_show_strikes'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%confirmed_by_role%' OR pg_get_constraintdef(oid) LIKE '%confirmed_source%')
  LOOP
    EXECUTE format('ALTER TABLE public.customer_no_show_strikes DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  ALTER TABLE public.customer_no_show_strikes
    ADD CONSTRAINT customer_no_show_strikes_role_check CHECK (confirmed_by_role IN ('driver', 'admin', 'staff', 'system')),
    ADD CONSTRAINT customer_no_show_strikes_source_check CHECK (confirmed_source IN ('driver', 'office', 'system'));
END $c12_strike_constraints$;

CREATE INDEX IF NOT EXISTS idx_customer_no_show_strikes_customer
  ON public.customer_no_show_strikes (customer_id, confirmed_at ASC);

ALTER TABLE public.customer_no_show_strikes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_no_show_strikes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.customer_no_show_strikes FROM authenticated;
GRANT SELECT ON public.customer_no_show_strikes TO authenticated;

DROP POLICY IF EXISTS "customers read own no-show strikes" ON public.customer_no_show_strikes;
CREATE POLICY "customers read own no-show strikes"
ON public.customer_no_show_strikes
FOR SELECT
TO authenticated
USING (customer_id = (SELECT public.my_customer_id()));

DROP POLICY IF EXISTS "office reads all no-show strikes" ON public.customer_no_show_strikes;
CREATE POLICY "office reads all no-show strikes"
ON public.customer_no_show_strikes
FOR SELECT
TO authenticated
USING ((SELECT public.get_user_role()) IN ('admin', 'staff'));

-- 4. Suspension appeals table: public.customer_appeals
CREATE TABLE IF NOT EXISTS public.customer_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  strike_count_at_appeal integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1500),
  contact_number text,
  admin_notes text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_appeals
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strike_count_at_appeal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_appeals_one_pending_per_customer
  ON public.customer_appeals (customer_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_customer_appeals_customer
  ON public.customer_appeals (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_appeals_status
  ON public.customer_appeals (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_customer_appeals_updated ON public.customer_appeals;
CREATE TRIGGER trg_customer_appeals_updated
  BEFORE UPDATE ON public.customer_appeals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_appeals FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.customer_appeals FROM authenticated;
GRANT SELECT ON public.customer_appeals TO authenticated;

DROP POLICY IF EXISTS "customers read own appeals" ON public.customer_appeals;
CREATE POLICY "customers read own appeals"
ON public.customer_appeals
FOR SELECT
TO authenticated
USING (customer_id = (SELECT public.my_customer_id()));

DROP POLICY IF EXISTS "office reads all customer appeals" ON public.customer_appeals;
CREATE POLICY "office reads all customer appeals"
ON public.customer_appeals
FOR SELECT
TO authenticated
USING ((SELECT public.get_user_role()) IN ('admin', 'staff'));

-- 5. Add tables to supabase_realtime publication
DO $c12_realtime$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['customers', 'customer_no_show_strikes', 'customer_appeals'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END $c12_realtime$;

-- 6. RPC A: customer_notify_on_the_way(p_delivery_id uuid)
CREATE OR REPLACE FUNCTION public.customer_notify_on_the_way(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid := public.my_customer_id();
  v_delivery public.deliveries%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_driver_user_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = v_delivery.shipment_id
    AND customer_id = v_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_GRACE_WINDOW';
  END IF;

  IF v_delivery.status <> 'assigned'
     OR v_delivery.pickup_arrived_at IS NULL
     OR v_delivery.customer_showed_at IS NOT NULL
     OR v_delivery.no_show_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'NOT_IN_GRACE_WINDOW';
  END IF;

  IF v_delivery.customer_on_way_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'delivery_id', v_delivery.id,
      'customer_on_way_at', v_delivery.customer_on_way_at,
      'already_notified', true
    );
  END IF;

  UPDATE public.deliveries
  SET customer_on_way_at = coalesce(customer_on_way_at, v_now),
      updated_at = v_now
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;

  IF NOT EXISTS (
    SELECT 1 FROM public.shipment_events
    WHERE delivery_id = v_delivery.id AND event_type = 'on_my_way_pressed'
  ) THEN
    INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta)
    VALUES (
      v_shipment.id,
      v_delivery.id,
      'on_my_way_pressed',
      auth.uid(),
      jsonb_build_object('customer_on_way_at', v_delivery.customer_on_way_at)
    );
  END IF;

  SELECT dr.user_id INTO v_driver_user_id
  FROM public.drivers dr
  WHERE dr.id = v_delivery.driver_id;

  IF v_driver_user_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_driver_user_id,
      'shipment_status'::public.notification_type,
      'Customer is on the way',
      'Customer is on the way to the pickup location for ' || coalesce(v_shipment.tracking_number, 'your trip') || '.',
      v_shipment.id
    );
  END IF;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id,
    'customer_on_way_at', v_delivery.customer_on_way_at,
    'already_notified', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_notify_on_the_way(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_notify_on_the_way(uuid) TO authenticated;

-- Keep legacy customer_notify_on_my_way(p_shipment_id) synchronized with customer_on_way_at
CREATE OR REPLACE FUNCTION public.customer_notify_on_my_way(p_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery_id uuid;
BEGIN
  SELECT d.id INTO v_delivery_id
  FROM public.deliveries d
  JOIN public.shipments s ON s.id = d.shipment_id
  WHERE s.id = p_shipment_id
    AND s.customer_id = public.my_customer_id()
    AND d.status <> 'cancelled'
  ORDER BY d.assigned_at DESC
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'NOT_IN_GRACE_WINDOW';
  END IF;

  PERFORM public.customer_notify_on_the_way(v_delivery_id);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_notify_on_my_way(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_notify_on_my_way(uuid) TO authenticated;

-- 7. RPC B: confirm_no_show_cancellation (driver after auto_cancel_at OR office/admin)
DROP FUNCTION IF EXISTS public.confirm_no_show_cancellation(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_no_show_cancellation(uuid, text, text);

CREATE OR REPLACE FUNCTION public.confirm_no_show_cancellation(
  p_delivery_id uuid,
  p_attempt_notes text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_delivery public.deliveries%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_existing_strike public.customer_no_show_strikes%ROWTYPE;
  v_inserted_strike public.customer_no_show_strikes%ROWTYPE;
  v_now timestamptz := now();
  v_effective_auto_cancel timestamptz;
  v_new_strikes integer;
  v_cooldown_until timestamptz;
  v_new_standing text;
  v_role_label text;
  v_source text;
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Confirmed no-show');
  v_notes text := nullif(btrim(coalesce(p_attempt_notes, '')), '');
  v_office record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_role
  FROM public.users
  WHERE id = v_uid AND is_active;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;

  IF v_role = 'driver' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drivers dr
      WHERE dr.id = v_delivery.driver_id AND dr.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    v_role_label := 'driver';
    v_source := 'driver';
  ELSIF v_role IN ('admin', 'staff') THEN
    v_role_label := 'admin';
    v_source := 'office';
  ELSE
    RAISE EXCEPTION 'OFFICE_OR_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = v_delivery.shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = v_shipment.customer_id
  FOR UPDATE;

  -- Idempotency check BEFORE transition validation so repeated calls return the existing strike
  SELECT * INTO v_existing_strike
  FROM public.customer_no_show_strikes
  WHERE shipment_id = v_shipment.id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'shipment_id', v_shipment.id,
      'delivery_id', v_delivery.id,
      'strike_id', v_existing_strike.id,
      'strike_number', v_existing_strike.strike_number,
      'standing_status', v_customer.standing_status,
      'booking_cooldown_until', v_customer.booking_cooldown_until,
      'no_show_confirmed_at', coalesce(v_delivery.no_show_confirmed_at, v_existing_strike.confirmed_at),
      'already_confirmed', true
    );
  END IF;

  IF v_delivery.status <> 'assigned'
     OR v_delivery.pickup_arrived_at IS NULL
     OR v_delivery.customer_showed_at IS NOT NULL
     OR v_delivery.no_show_confirmed_at IS NOT NULL
     OR v_shipment.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'DELIVERY_CLOSED';
  END IF;

  IF v_role = 'driver' THEN
    v_effective_auto_cancel := coalesce(
      v_delivery.auto_cancel_at,
      v_delivery.pickup_arrived_at + interval '30 minutes'
    );
    IF v_now < v_effective_auto_cancel THEN
      RAISE EXCEPTION 'WAIT_PERIOD_NOT_FINISHED';
    END IF;
  END IF;

  -- Lock truck and driver rows cleanly and cancel delivery first so triggers release resources
  PERFORM 1 FROM public.drivers WHERE id = v_delivery.driver_id FOR UPDATE;
  PERFORM 1 FROM public.trucks WHERE id = v_delivery.truck_id FOR UPDATE;

  UPDATE public.deliveries
  SET status = 'cancelled',
      no_show_confirmed_at = v_now,
      updated_at = v_now
  WHERE id = v_delivery.id;

  UPDATE public.shipments
  SET status = 'cancelled',
      cancellation_type = 'no_show',
      cancelled_reason = 'Customer no-show at pickup',
      cancelled_at = v_now,
      updated_at = v_now
  WHERE id = v_shipment.id;

  v_new_strikes := coalesce(v_customer.no_show_strike_count, 0) + 1;

  INSERT INTO public.customer_no_show_strikes (
    customer_id,
    shipment_id,
    delivery_id,
    strike_number,
    confirmed_at,
    confirmed_by,
    confirmed_by_role,
    confirmed_source,
    reason,
    attempt_notes
  )
  VALUES (
    v_customer.id,
    v_shipment.id,
    v_delivery.id,
    v_new_strikes,
    v_now,
    v_uid,
    v_role_label,
    v_source,
    v_reason,
    v_notes
  )
  ON CONFLICT (shipment_id) DO NOTHING
  RETURNING * INTO v_inserted_strike;

  IF v_inserted_strike.id IS NULL THEN
    SELECT * INTO v_existing_strike
    FROM public.customer_no_show_strikes
    WHERE shipment_id = v_shipment.id;

    RETURN jsonb_build_object(
      'shipment_id', v_shipment.id,
      'delivery_id', v_delivery.id,
      'strike_id', v_existing_strike.id,
      'strike_number', v_existing_strike.strike_number,
      'standing_status', v_customer.standing_status,
      'booking_cooldown_until', v_customer.booking_cooldown_until,
      'no_show_confirmed_at', v_now,
      'already_confirmed', true
    );
  END IF;

  IF v_new_strikes = 1 THEN
    v_cooldown_until := v_now + interval '48 hours';
    v_new_standing := 'cooldown';
  ELSIF v_new_strikes = 2 THEN
    v_cooldown_until := v_now + interval '72 hours';
    v_new_standing := 'cooldown';
  ELSE
    v_cooldown_until := NULL;
    v_new_standing := 'suspended';
  END IF;

  -- Preserve public.users.is_active = true and public.customers.is_active = true for no-show suspensions
  UPDATE public.customers
  SET no_show_strike_count = v_new_strikes,
      booking_cooldown_until = v_cooldown_until,
      blocked_until = v_cooldown_until,
      standing_status = v_new_standing,
      suspended_at = CASE WHEN v_new_standing = 'suspended' THEN v_now ELSE suspended_at END,
      suspension_reason = CASE
        WHEN v_new_standing = 'suspended' AND v_new_strikes >= 4 THEN v_new_strikes || ' confirmed no-shows (post-reinstatement review)'
        WHEN v_new_standing = 'suspended' THEN '3 confirmed no-shows'
        ELSE suspension_reason
      END,
      updated_at = v_now
  WHERE id = v_customer.id
  RETURNING * INTO v_customer;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta)
  VALUES (
    v_shipment.id,
    v_delivery.id,
    'no_show_confirmed',
    v_uid,
    jsonb_build_object(
      'strike_id', v_inserted_strike.id,
      'strike_number', v_new_strikes,
      'standing_status', v_new_standing,
      'booking_cooldown_until', v_cooldown_until,
      'confirmed_by_role', v_role_label,
      'confirmed_source', v_source,
      'reason', v_reason,
      'attempt_notes', v_notes
    )
  );

  IF v_customer.user_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_customer.user_id,
      'shipment_status'::public.notification_type,
      CASE
        WHEN v_new_standing = 'suspended' THEN 'Account Suspended: Strike ' || v_new_strikes || ' of 3'
        ELSE 'Booking Cancelled (No-Show): Strike ' || v_new_strikes || ' of 3'
      END,
      CASE
        WHEN v_new_strikes = 1 THEN 'Shipment ' || coalesce(v_shipment.tracking_number, '') || ' was cancelled due to no-show. Booking is paused for 48 hours.'
        WHEN v_new_strikes = 2 THEN 'Final warning: Shipment ' || coalesce(v_shipment.tracking_number, '') || ' was cancelled due to no-show. Booking is paused for 72 hours.'
        ELSE 'Your account has been suspended after ' || v_new_strikes || ' confirmed no-shows. Open the app to view strike history and submit an appeal.'
      END,
      v_shipment.id
    );
  END IF;

  FOR v_office IN
    SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') AND id <> v_uid
  LOOP
    PERFORM public.notify_user(
      v_office.id,
      'shipment_status'::public.notification_type,
      'No-show cancelled: ' || coalesce(v_shipment.tracking_number, 'shipment'),
      coalesce(v_customer.name, 'Customer') || ' received strike #' || v_new_strikes || ' (' || v_new_standing || ').',
      v_shipment.id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'shipment_id', v_shipment.id,
    'delivery_id', v_delivery.id,
    'strike_id', v_inserted_strike.id,
    'strike_number', v_new_strikes,
    'standing_status', v_new_standing,
    'booking_cooldown_until', v_cooldown_until,
    'no_show_confirmed_at', v_now,
    'already_confirmed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_no_show_cancellation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_no_show_cancellation(uuid, text, text) TO authenticated;

-- 8. RPC C: customer_submit_suspension_appeal(p_reason text, p_contact_number text default null)
CREATE OR REPLACE FUNCTION public.customer_submit_suspension_appeal(
  p_reason text,
  p_contact_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer public.customers%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_contact text := nullif(btrim(coalesce(p_contact_number, '')), '');
  v_appeal public.customer_appeals%ROWTYPE;
  v_office record;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE user_id = v_uid AND is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED';
  END IF;

  IF v_customer.standing_status <> 'suspended' THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_SUSPENDED';
  END IF;

  IF length(v_reason) < 10 OR length(v_reason) > 1500 THEN
    RAISE EXCEPTION 'APPEAL_REASON_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_appeals
    WHERE customer_id = v_customer.id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'APPEAL_ALREADY_PENDING';
  END IF;

  BEGIN
    INSERT INTO public.customer_appeals (
      customer_id,
      user_id,
      strike_count_at_appeal,
      status,
      reason,
      contact_number
    )
    VALUES (
      v_customer.id,
      v_uid,
      coalesce(v_customer.no_show_strike_count, 3),
      'pending',
      v_reason,
      coalesce(v_contact, v_customer.phone)
    )
    RETURNING * INTO v_appeal;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'APPEAL_ALREADY_PENDING';
  END;

  FOR v_office IN
    SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff')
  LOOP
    PERFORM public.notify_user(
      v_office.id,
      'system'::public.notification_type,
      'New suspension appeal submitted',
      coalesce(v_customer.name, 'A customer') || ' submitted a suspension appeal (' ||
      v_appeal.strike_count_at_appeal || ' strikes). Review within 3-5 business days.',
      NULL
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_appeal.id,
    'status', v_appeal.status,
    'created_at', v_appeal.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_submit_suspension_appeal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_submit_suspension_appeal(text, text) TO authenticated;

-- 9. RPC D: office_review_customer_appeal(p_appeal_id uuid, p_decision text, p_admin_notes text default null)
CREATE OR REPLACE FUNCTION public.office_review_customer_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal public.customer_appeals%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_raw_decision text := lower(btrim(coalesce(p_decision, '')));
  v_decision text;
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active AND role IN ('admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'OFFICE_ACCESS_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_raw_decision IN ('approved', 'approve') THEN
    v_decision := 'approved';
  ELSIF v_raw_decision IN ('rejected', 'reject') THEN
    v_decision := 'rejected';
  ELSE
    RAISE EXCEPTION 'INVALID_APPEAL_DECISION';
  END IF;

  SELECT * INTO v_appeal
  FROM public.customer_appeals
  WHERE id = p_appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPEAL_NOT_FOUND';
  END IF;

  IF v_appeal.status <> 'pending' THEN
    RAISE EXCEPTION 'APPEAL_ALREADY_REVIEWED';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = v_appeal.customer_id
  FOR UPDATE;

  UPDATE public.customer_appeals
  SET status = v_decision,
      admin_notes = v_notes,
      reviewed_by = v_uid,
      reviewed_at = v_now,
      updated_at = v_now
  WHERE id = v_appeal.id
  RETURNING * INTO v_appeal;

  IF v_decision = 'approved' THEN
    -- Reinstates booking access while preserving existing no_show_strike_count and strike rows
    UPDATE public.customers
    SET standing_status = 'reinstated',
        reinstated_at = v_now,
        booking_cooldown_until = NULL,
        blocked_until = NULL,
        updated_at = v_now
    WHERE id = v_customer.id
    RETURNING * INTO v_customer;

    IF v_customer.user_id IS NOT NULL THEN
      PERFORM public.notify_user(
        v_customer.user_id,
        'system'::public.notification_type,
        'Account reinstated',
        'Your suspension appeal was approved. Note: prior no-show strikes remain on record; a subsequent no-show triggers permanent suspension and admin review again.',
        NULL
      );
    END IF;
  ELSE
    IF v_customer.user_id IS NOT NULL THEN
      PERFORM public.notify_user(
        v_customer.user_id,
        'system'::public.notification_type,
        'Suspension appeal declined',
        coalesce('Your appeal was not approved: ' || v_notes, 'Your suspension appeal was declined by administration.'),
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_appeal.id,
    'customer_id', v_appeal.customer_id,
    'status', v_appeal.status,
    'standing_status', v_customer.standing_status,
    'no_show_strike_count', v_customer.no_show_strike_count,
    'reviewed_at', v_appeal.reviewed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.office_review_customer_appeal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_review_customer_appeal(uuid, text, text) TO authenticated;

-- 10. Updates to existing RPCs

-- 10a. Enforce ACCOUNT_SUSPENDED & BOOKING_COOLDOWN_ACTIVE inside mobile_create_request_base & mobile_create_request
CREATE OR REPLACE FUNCTION public.mobile_create_request_base(
  p_request_id uuid,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  customer uuid;
  shipment public.shipments%ROWTYPE;
  vehicle public.vehicle_types%ROWTYPE;
  weight numeric;
  departure timestamptz;
  contact text;
  max_capacity numeric;
  lead_hours integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CUSTOMER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE user_id = auth.uid() AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED';
  END IF;

  IF v_customer.standing_status = 'suspended'
     OR (v_customer.standing_status <> 'reinstated' AND coalesce(v_customer.no_show_strike_count, 0) >= 3) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
  END IF;

  IF v_customer.booking_cooldown_until IS NOT NULL AND v_customer.booking_cooldown_until > now() THEN
    RAISE EXCEPTION 'BOOKING_COOLDOWN_ACTIVE';
  END IF;

  customer := v_customer.id;

  IF p_request_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text, 0)
  );

  departure := coalesce(
    nullif(p_data->>'scheduled_departure', ''),
    nullif(p_data->>'departure', '')
  )::timestamptz;

  SELECT * INTO shipment
  FROM public.shipments
  WHERE customer_id = customer AND client_request_id = p_request_id;

  IF FOUND THEN
    IF shipment.pickup_address IS DISTINCT FROM btrim(p_data->>'pickup')
       OR shipment.dropoff_address IS DISTINCT FROM btrim(p_data->>'dropoff')
       OR shipment.cargo_description IS DISTINCT FROM btrim(p_data->>'cargo')
       OR shipment.weight_kg IS DISTINCT FROM (p_data->>'weight')::numeric
       OR shipment.requested_vehicle_type_id IS DISTINCT FROM (p_data->>'vehicle_id')::uuid
       OR shipment.scheduled_departure IS DISTINCT FROM departure
       OR shipment.driver_notes IS DISTINCT FROM 'Contact: ' || (p_data->>'contact') || E'\n' || coalesce(p_data->>'notes', '') THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
    RETURN jsonb_build_object(
      'id', shipment.id,
      'tracking_number', shipment.tracking_number,
      'status', shipment.status,
      'replayed', true
    );
  END IF;

  IF jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 10000 THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  IF length(btrim(coalesce(p_data->>'pickup', ''))) < 5 OR length(p_data->>'pickup') > 500
     OR length(btrim(coalesce(p_data->>'dropoff', ''))) < 5 OR length(p_data->>'dropoff') > 500
     OR lower(btrim(p_data->>'pickup')) = lower(btrim(p_data->>'dropoff'))
     OR length(btrim(coalesce(p_data->>'cargo', ''))) < 3 OR length(p_data->>'cargo') > 1000
     OR length(coalesce(p_data->>'notes', '')) > 2000 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_DETAILS';
  END IF;

  contact := p_data->>'contact';
  IF contact IS NULL OR contact !~ '^\+639[0-9]{9}$' THEN
    RAISE EXCEPTION 'INVALID_CONTACT';
  END IF;

  weight := (p_data->>'weight')::numeric;
  IF weight IS NULL OR weight <= 0 OR weight::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;

  SELECT * INTO vehicle
  FROM public.vehicle_types
  WHERE id = (p_data->>'vehicle_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_TYPE';
  END IF;

  SELECT max(capacity_kg) INTO max_capacity
  FROM public.trucks
  WHERE vehicle_type_id = vehicle.id;

  IF weight > coalesce(max_capacity, vehicle.default_capacity_kg, 0) THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED';
  END IF;

  lead_hours := coalesce(vehicle.min_lead_time_hours, 24);
  IF departure IS NULL
     OR departure < now() + make_interval(hours => lead_hours)
     OR departure > now() + interval '14 days' THEN
    RAISE EXCEPTION 'INVALID_DEPARTURE';
  END IF;

  INSERT INTO public.shipments (
    customer_id,
    status,
    booking_source,
    cargo_description,
    weight_kg,
    requested_vehicle_type_id,
    pickup_address,
    dropoff_address,
    scheduled_departure,
    driver_notes,
    created_by,
    client_request_id
  )
  VALUES (
    customer,
    'pending',
    'mobile',
    btrim(p_data->>'cargo'),
    weight,
    vehicle.id,
    btrim(p_data->>'pickup'),
    btrim(p_data->>'dropoff'),
    departure,
    'Contact: ' || contact || E'\n' || coalesce(p_data->>'notes', ''),
    auth.uid(),
    p_request_id
  )
  RETURNING * INTO shipment;

  RETURN jsonb_build_object(
    'id', shipment.id,
    'tracking_number', shipment.tracking_number,
    'status', shipment.status,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_create_request_base(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 10b. Enrich mobile_workspace_base() and mobile_workspace() while preserving all FTL-01, D05, D06, C03, C11 fields
CREATE OR REPLACE FUNCTION public.mobile_workspace_base()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  me public.users%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', me.id,
      'full_name', me.full_name,
      'email', me.email,
      'phone', me.phone,
      'role', me.role,
      'avatar_url', me.avatar_url,
      'created_at', me.created_at
    ),
    'customer', (
      SELECT to_jsonb(c)
      FROM (
        SELECT
          id,
          name,
          phone,
          address,
          barangay,
          city,
          province,
          no_show_strike_count,
          booking_cooldown_until,
          standing_status,
          suspended_at,
          suspension_reason,
          reinstated_at
        FROM public.customers
        WHERE user_id = me.id
        LIMIT 1
      ) c
    ),
    'vehicles', coalesce(
      (
        SELECT jsonb_agg(v ORDER BY v.name)
        FROM (
          SELECT
            id,
            name,
            default_capacity_kg,
            toll_class,
            min_lead_time_hours,
            loading_buffer_minutes,
            default_height_m,
            default_width_m,
            default_length_m
          FROM public.vehicle_types
          WHERE is_active
        ) v
      ),
      '[]'::jsonb
    ),
    'shipments', coalesce(
      (
        SELECT jsonb_agg(s ORDER BY s.created_at DESC)
        FROM (
          SELECT
            id,
            tracking_number,
            status,
            pickup_address,
            dropoff_address,
            cargo_description,
            weight_kg,
            special_handling,
            scheduled_departure,
            estimated_arrival,
            quoted_amount,
            final_amount,
            driver_notes,
            cancellation_type,
            cancelled_reason,
            cancelled_at,
            created_at,
            updated_at
          FROM public.shipments
          ORDER BY created_at DESC
          LIMIT 200
        ) s
      ),
      '[]'::jsonb
    ),
    'deliveries', coalesce(
      (
        SELECT jsonb_agg(d)
        FROM (
          SELECT
            id,
            shipment_id,
            truck_id,
            status,
            assigned_at,
            departed_at,
            arrived_at,
            recipient_name,
            route_started_at,
            pickup_arrived_at,
            customer_showed_at,
            grace_ends_at,
            auto_cancel_at,
            customer_on_way_at,
            no_show_confirmed_at
          FROM public.deliveries
          ORDER BY assigned_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'documents', coalesce(
      (
        SELECT jsonb_agg(d)
        FROM (
          SELECT id, shipment_id, kind, file_name, recipient_name, created_at
          FROM public.delivery_documents
          ORDER BY created_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'notifications', coalesce(
      (
        SELECT jsonb_agg(n ORDER BY n.created_at DESC)
        FROM (
          SELECT id, title, body, shipment_id, read_at, created_at
          FROM public.notifications
          WHERE user_id = me.id
          ORDER BY created_at DESC
          LIMIT 100
        ) n
      ),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_workspace_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace_base() TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  result := public.mobile_workspace_base();
  RETURN result || jsonb_build_object(
    'shipments', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
        FROM (
          SELECT
            id,
            tracking_number,
            status,
            pickup_address,
            dropoff_address,
            pickup_lat,
            pickup_lng,
            dropoff_lat,
            dropoff_lng,
            cargo_description,
            weight_kg,
            special_handling,
            requested_vehicle_type_id,
            scheduled_departure,
            estimated_arrival,
            linehaul_amount,
            toll_amount,
            mobilization_fee,
            quoted_amount,
            override_amount,
            final_amount,
            quote_expires_at,
            driver_notes,
            cancellation_type,
            cancelled_reason,
            cancelled_at,
            created_at,
            updated_at,
            distance_km,
            route_source,
            route_duration_minutes,
            route_geometry
          FROM public.shipments
          ORDER BY created_at DESC
          LIMIT 200
        ) s
      ),
      '[]'::jsonb
    ),
    'deliveries', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(d))
        FROM (
          SELECT
            id,
            shipment_id,
            truck_id,
            status,
            assigned_at,
            updated_at,
            departed_at,
            arrived_at,
            recipient_name,
            route_started_at,
            pickup_arrived_at,
            customer_showed_at,
            grace_ends_at,
            auto_cancel_at,
            customer_on_way_at,
            no_show_confirmed_at,
            proof_attempt,
            proof_review_status,
            proof_review_reason
          FROM public.deliveries
          ORDER BY assigned_at DESC
          LIMIT 200
        ) d
      ),
      '[]'::jsonb
    ),
    'payments', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM (
          SELECT
            id,
            shipment_id,
            amount,
            method,
            status,
            reference_number,
            proof_path,
            paid_at,
            verified_at,
            rejection_reason,
            notes,
            created_at,
            updated_at
          FROM public.payments
          ORDER BY created_at DESC
          LIMIT 200
        ) p
      ),
      '[]'::jsonb
    ),
    'driver_trucks', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.plate_number, t.id)
        FROM (
          SELECT
            tr.id,
            tr.fleet_code,
            tr.plate_number,
            tr.model,
            tr.model_year,
            tr.vehicle_type_id,
            tr.capacity_kg,
            tr.status,
            tr.assigned_driver_id,
            tr.height_m,
            tr.width_m,
            tr.length_m,
            tr.tare_weight_kg,
            tr.gross_weight_kg,
            tr.axle_count
          FROM public.trucks tr
          WHERE public.get_user_role() = 'driver'
            AND (
              tr.assigned_driver_id = public.my_driver_id()
              OR tr.id IN (
                SELECT d.truck_id
                FROM public.deliveries d
                WHERE d.driver_id = public.my_driver_id()
              )
            )
        ) t
      ),
      '[]'::jsonb
    ),
    'customer_strikes', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(st) ORDER BY st.confirmed_at ASC)
        FROM (
          SELECT
            k.id,
            k.customer_id,
            k.shipment_id,
            s.tracking_number,
            k.delivery_id,
            k.strike_number,
            k.confirmed_at,
            k.confirmed_by,
            k.confirmed_by_role,
            k.confirmed_source,
            k.reason,
            k.attempt_notes,
            k.created_at
          FROM public.customer_no_show_strikes k
          LEFT JOIN public.shipments s ON s.id = k.shipment_id
          WHERE k.customer_id = public.my_customer_id()
          ORDER BY k.confirmed_at ASC
        ) st
      ),
      '[]'::jsonb
    ),
    'customer_appeals', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.created_at DESC)
        FROM (
          SELECT
            a.id,
            a.customer_id,
            a.strike_count_at_appeal,
            a.status,
            a.reason,
            a.contact_number,
            a.admin_notes,
            a.reviewed_by,
            a.reviewed_at,
            a.created_at,
            a.updated_at
          FROM public.customer_appeals a
          WHERE a.customer_id = public.my_customer_id()
          ORDER BY a.created_at DESC
          LIMIT 20
        ) ap
      ),
      '[]'::jsonb
    ),
    'settings', coalesce(
      (
        SELECT jsonb_object_agg(key, value)
        FROM public.system_settings
        WHERE key IN (
          'no_show_arrival_radius_meters',
          'no_show_grace_minutes',
          'no_show_total_wait_minutes',
          'buffered_tracking_window_minutes'
        )
      ),
      '{}'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace() TO authenticated;

-- 10c. Driver arrival & no-show delegation inside driver_milestone & mobile_driver_action
CREATE OR REPLACE FUNCTION public.driver_milestone(
  p_delivery uuid,
  p_action text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d public.deliveries%ROWTYPE;
  s public.shipments%ROWTYPE;
  lat numeric;
  lng numeric;
  radius numeric;
  distance numeric;
  v_verified_paid numeric(12,2);
  v_now timestamptz := now();
  v_grace_mins integer;
  v_wait_mins integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver' AND is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'no_show' THEN
    PERFORM public.confirm_no_show_cancellation(
      p_delivery,
      nullif(btrim(coalesce(p_data->>'attempt_notes', '')), ''),
      nullif(btrim(coalesce(p_data->>'reason', '')), '')
    );
    RETURN;
  END IF;

  SELECT * INTO d
  FROM public.deliveries
  WHERE id = p_delivery AND driver_id = public.my_driver_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s
  FROM public.shipments
  WHERE id = d.shipment_id
  FOR UPDATE;

  IF s.status IN ('completed', 'cancelled') OR d.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'DELIVERY_CLOSED';
  END IF;

  IF p_action = 'start' THEN
    IF d.status <> 'assigned' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    IF d.route_started_at IS NOT NULL THEN RETURN; END IF;
    IF NOT public.is_within_operating_hours(v_now) THEN RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS'; END IF;
    UPDATE public.deliveries SET route_started_at = v_now WHERE id = d.id;

  ELSIF p_action IN ('arrive', 'arrived_pickup', 'pickup_arrived') THEN
    IF d.status <> 'assigned' OR d.route_started_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    IF d.pickup_arrived_at IS NOT NULL THEN RETURN; END IF;
    lat := (p_data->>'lat')::numeric;
    lng := (p_data->>'lng')::numeric;
    IF lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN -90 AND 90) OR NOT (lng BETWEEN -180 AND 180)
       OR s.pickup_lat IS NULL OR s.pickup_lng IS NULL THEN
      RAISE EXCEPTION 'INVALID_COORDINATES';
    END IF;
    radius := coalesce((SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key = 'no_show_arrival_radius_meters'), 500);
    distance := extensions.ST_Distance(
      extensions.ST_SetSRID(extensions.ST_MakePoint(lng::float8, lat::float8), 4326)::extensions.geography,
      extensions.ST_SetSRID(extensions.ST_MakePoint(s.pickup_lng::float8, s.pickup_lat::float8), 4326)::extensions.geography
    );
    IF distance > radius THEN RAISE EXCEPTION 'ARRIVAL_TOO_FAR'; END IF;

    v_grace_mins := coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key = 'no_show_grace_minutes'), 15);
    v_wait_mins := coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key = 'no_show_total_wait_minutes'), 30);

    UPDATE public.deliveries
    SET
      pickup_arrived_at = v_now,
      pickup_arrival_lat = lat,
      pickup_arrival_lng = lng,
      grace_ends_at = v_now + make_interval(mins => v_grace_mins),
      auto_cancel_at = v_now + make_interval(mins => v_wait_mins)
    WHERE id = d.id;

  ELSIF p_action = 'showed' THEN
    IF d.status = 'loading' AND d.customer_showed_at IS NOT NULL THEN RETURN; END IF;
    IF d.status <> 'assigned' OR d.pickup_arrived_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    UPDATE public.deliveries
    SET status = 'loading', customer_showed_at = v_now, grace_ends_at = NULL, auto_cancel_at = NULL
    WHERE id = d.id;

  ELSIF p_action = 'loaded' THEN
    IF d.status = 'in_transit' THEN RETURN; END IF;
    IF d.status <> 'loading' OR d.customer_showed_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;

    -- D06 strict admin payment verification departure gate
    SELECT coalesce(sum(p.amount), 0) INTO v_verified_paid
    FROM public.payments p
    WHERE p.shipment_id = s.id AND p.status = 'verified';

    IF s.final_amount IS NULL OR s.final_amount <= 0 OR v_verified_paid < s.final_amount THEN
      RAISE EXCEPTION 'PAYMENT_VERIFICATION_REQUIRED';
    END IF;

    UPDATE public.deliveries SET status = 'in_transit' WHERE id = d.id;

  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_DRIVER_ACTION';
  END IF;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id)
  VALUES (
    s.id,
    d.id,
    CASE
      WHEN p_action = 'start' THEN 'route_started'
      WHEN p_action IN ('arrive', 'arrived_pickup', 'pickup_arrived') THEN 'arrived_at_pickup'
      WHEN p_action = 'showed' THEN 'customer_showed'
      ELSE 'cargo_loaded'
    END,
    auth.uid()
  );

  IF p_action IN ('arrive', 'arrived_pickup', 'pickup_arrived') THEN
    PERFORM public.notify_user(
      c.user_id,
      'shipment_status'::public.notification_type,
      'Driver arrived at pickup',
      'Your driver arrived at the pickup location. Standard 15-minute grace window has started.',
      s.id
    )
    FROM public.customers c
    WHERE c.id = s.customer_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_milestone(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_milestone(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_driver_action(p_delivery uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.driver_milestone(p_delivery, p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_driver_action(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_action(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_driver_action(p_delivery uuid, p_action text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.driver_milestone(p_delivery, p_action, coalesce(p_data, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_driver_action(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_action(uuid, text, jsonb) TO authenticated;

-- 10d. Align office_delivery_action('cancel_no_show') with confirm_no_show_cancellation
CREATE OR REPLACE FUNCTION public.office_delivery_action(
  p_delivery uuid,
  p_expected timestamptz,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  d public.deliveries%ROWTYPE;
  s public.shipments%ROWTYPE;
BEGIN
  PERFORM public.require_active_office();
  SELECT * INTO d FROM public.deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO s FROM public.shipments WHERE id = d.shipment_id FOR UPDATE;
  IF s.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'DELIVERY_CLOSED';
  END IF;

  IF p_action = 'complete' THEN
    IF d.status <> 'delivered' OR d.proof_review_status <> 'pending_review'
       OR NOT EXISTS (SELECT 1 FROM public.delivery_documents WHERE delivery_id = d.id AND proof_attempt = d.proof_attempt AND kind = 'proof_of_delivery')
       OR NOT EXISTS (SELECT 1 FROM public.delivery_documents WHERE delivery_id = d.id AND proof_attempt = d.proof_attempt AND kind = 'signature')
       OR EXISTS (SELECT 1 FROM public.delivery_incidents WHERE delivery_id = d.id AND resolved_at IS NULL) THEN
      RAISE EXCEPTION 'PROOF_AND_INCIDENT_REVIEW_REQUIRED';
    END IF;
    UPDATE public.deliveries SET proof_review_status = 'approved', proof_reviewed_by = auth.uid(), proof_reviewed_at = now() WHERE id = d.id;
    UPDATE public.shipments SET status = 'completed', actual_delivery_at = d.arrived_at WHERE id = s.id;
  ELSIF p_action = 'request_correction' THEN
    IF d.status <> 'delivered' OR d.proof_review_status <> 'pending_review'
       OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'INVALID_PROOF_REVIEW';
    END IF;
    UPDATE public.deliveries SET proof_review_status = 'correction_requested', proof_review_reason = btrim(p_reason), proof_reviewed_by = auth.uid(), proof_reviewed_at = now() WHERE id = d.id;
  ELSIF p_action = 'cancel_no_show' THEN
    IF d.status <> 'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL
       OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'INVALID_NO_SHOW_REVIEW';
    END IF;
    PERFORM public.confirm_no_show_cancellation(d.id, btrim(p_reason), btrim(p_reason));
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_OFFICE_ACTION';
  END IF;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta)
  VALUES (s.id, d.id, p_action, auth.uid(), jsonb_build_object('reason', p_reason, 'attempt', d.proof_attempt));
END;
$$;

REVOKE ALL ON FUNCTION public.office_delivery_action(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_delivery_action(uuid, timestamptz, text, text) TO authenticated;

-- 10e. Stamp cancellation_type on customer and office cancellations
CREATE OR REPLACE FUNCTION public.guard_customer_shipment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  k text;
BEGIN
  IF current_user = 'authenticated' AND coalesce(public.get_user_role(), '') = 'customer' THEN
    IF OLD.status::text NOT IN ('pending', 'quoted', 'booked', 'assigned') THEN
      RAISE EXCEPTION 'SHIPMENT_NOT_CANCELLABLE' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM 'cancelled'::public.shipment_status THEN
      RAISE EXCEPTION 'CUSTOMERS_MAY_ONLY_CANCEL_SHIPMENT' USING ERRCODE = '42501';
    END IF;

    IF NEW.cancelled_reason IS NULL OR length(btrim(NEW.cancelled_reason)) NOT BETWEEN 3 AND 1000 THEN
      RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED';
    END IF;

    NEW.cancelled_reason := btrim(NEW.cancelled_reason);
    NEW.cancellation_type := 'customer';
    IF NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(v_old) LOOP
      IF k NOT IN ('status', 'cancelled_reason', 'cancelled_at', 'cancellation_type', 'updated_at') THEN
        IF v_new->k IS DISTINCT FROM v_old->k THEN
          RAISE EXCEPTION 'CUSTOMERS_MAY_ONLY_UPDATE_CANCELLATION_FIELDS' USING ERRCODE = '42501';
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_shipment_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mobile_cancel_shipment(
  p_shipment uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_shipment public.shipments%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_customer_id := public.my_customer_id();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = p_shipment AND customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND';
  END IF;

  IF v_shipment.status::text NOT IN ('pending', 'quoted', 'booked', 'assigned') THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_CANCELLABLE';
  END IF;

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE shipment_id = p_shipment AND status <> 'cancelled'
  FOR UPDATE;

  IF FOUND THEN
    IF v_delivery.route_started_at IS NOT NULL
       OR v_delivery.pickup_arrived_at IS NOT NULL
       OR v_delivery.departed_at IS NOT NULL
       OR v_delivery.customer_showed_at IS NOT NULL
       OR v_delivery.status IN ('loading', 'in_transit', 'delivered') THEN
      RAISE EXCEPTION 'DRIVER_ALREADY_EN_ROUTE';
    END IF;

    UPDATE public.deliveries
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_delivery.id;
  END IF;

  PERFORM pg_catalog.set_config('app.skip_customer_cancel_log', '1', true);

  UPDATE public.shipments
  SET
    status = 'cancelled',
    cancellation_type = 'customer',
    cancelled_reason = v_reason,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_shipment;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta, occurred_at)
  VALUES (
    p_shipment,
    v_delivery.id,
    'shipment_cancelled',
    auth.uid(),
    jsonb_build_object(
      'reason', v_reason,
      'cancelled_by', 'customer',
      'previous_status', v_shipment.status,
      'previous_delivery', v_delivery.id
    ),
    now()
  );

  RETURN jsonb_build_object('success', true, 'id', p_shipment, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_cancel_shipment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_cancel_shipment(uuid, text) TO authenticated;
