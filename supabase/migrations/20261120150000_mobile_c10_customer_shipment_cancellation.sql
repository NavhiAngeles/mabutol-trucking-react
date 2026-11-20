-- Migration: 20261120150000_mobile_c10_customer_shipment_cancellation.sql
-- Implements Request C10:
-- 1. Hardened customer self-service UPDATE RLS policy on public.shipments (Option A)
--    with field-immutability BEFORE UPDATE guard trigger so customers can only cancel
--    their own pre-transit shipments with a valid reason.
-- 2. Atomic RPC public.mobile_cancel_shipment(p_shipment uuid, p_reason text) (Option B).
-- 3. Extends shipment_events_event_type_check to allow 'quote_accepted' for FTL-01.

-- 1. Allow 'quote_accepted' in shipment_events_event_type_check
DO $migration$
DECLARE
  predicate text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO STRICT predicate
  FROM pg_constraint
  WHERE conrelid = 'public.shipment_events'::regclass
    AND conname = 'shipment_events_event_type_check';

  IF predicate NOT LIKE '%quote_accepted%' THEN
    ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
    EXECUTE 'ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK (('
      || predicate || ') OR event_type = ''quote_accepted'')';
  END IF;
END $migration$;

-- 2. Hardened BEFORE UPDATE guard for direct PostgREST customer cancellations
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
  -- Enforce immutability only on direct authenticated client updates by customers.
  -- SECURITY DEFINER RPCs (current_user <> 'authenticated') and office staff keep their own workflows.
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
    IF NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(v_old) LOOP
      IF k NOT IN ('status', 'cancelled_reason', 'cancelled_at', 'updated_at') THEN
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

DROP TRIGGER IF EXISTS trg_shipments_guard_customer_update ON public.shipments;
CREATE TRIGGER trg_shipments_guard_customer_update
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_customer_shipment_update();

-- Log direct customer cancellation in shipment_events so Option A matches Option B audit trail
CREATE OR REPLACE FUNCTION public.log_customer_shipment_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery_id uuid;
BEGIN
  IF coalesce(pg_catalog.current_setting('app.skip_customer_cancel_log', true), '') <> '1'
     AND coalesce(public.get_user_role(), '') = 'customer'
     AND NEW.status = 'cancelled'::public.shipment_status
     AND OLD.status IS DISTINCT FROM 'cancelled'::public.shipment_status THEN
    UPDATE public.deliveries
    SET status = 'cancelled', updated_at = now()
    WHERE shipment_id = NEW.id
      AND status = 'assigned'
      AND route_started_at IS NULL
      AND pickup_arrived_at IS NULL
      AND departed_at IS NULL
      AND customer_showed_at IS NULL
    RETURNING id INTO v_delivery_id;

    INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta, occurred_at)
    VALUES (
      NEW.id,
      v_delivery_id,
      'shipment_cancelled',
      auth.uid(),
      jsonb_build_object(
        'reason', NEW.cancelled_reason,
        'cancelled_by', 'customer',
        'previous_status', OLD.status,
        'previous_delivery', v_delivery_id
      ),
      now()
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_customer_shipment_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_shipments_log_customer_cancel ON public.shipments;
CREATE TRIGGER trg_shipments_log_customer_cancel
  AFTER UPDATE OF status ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_customer_shipment_cancellation();

-- 3. Option A: RLS UPDATE policy on public.shipments for customer pre-transit cancellation
DROP POLICY IF EXISTS "customer cancels own eligible shipment" ON public.shipments;
CREATE POLICY "customer cancels own eligible shipment"
ON public.shipments
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT public.my_customer_id())
  AND status::text IN ('pending', 'quoted', 'booked', 'assigned')
  AND NOT EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.shipment_id = public.shipments.id
      AND d.status <> 'cancelled'
      AND (
        d.route_started_at IS NOT NULL
        OR d.pickup_arrived_at IS NOT NULL
        OR d.departed_at IS NOT NULL
        OR d.customer_showed_at IS NOT NULL
        OR d.status IN ('loading', 'in_transit', 'delivered')
      )
  )
)
WITH CHECK (
  customer_id = (SELECT public.my_customer_id())
  AND status = 'cancelled'
  AND cancelled_reason IS NOT NULL
  AND length(btrim(cancelled_reason)) BETWEEN 3 AND 1000
);

-- 4. Option B: Atomic RPC for customer self-service shipment cancellation
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
