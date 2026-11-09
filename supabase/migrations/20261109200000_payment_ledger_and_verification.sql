-- Migration: 20261109200000_payment_ledger_and_verification.sql
-- Enables RLS and establishes atomic SECURITY INVOKER RPCs for shipment payment ledger and verification.

-- 1. Ensure RLS on public.payments and define access policies
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop any previous or conflicting payment policies
DROP POLICY IF EXISTS "office_view_payments" ON public.payments;
DROP POLICY IF EXISTS "office_manage_payments" ON public.payments;
DROP POLICY IF EXISTS "office_select_payments" ON public.payments;
DROP POLICY IF EXISTS "office_insert_payments" ON public.payments;
DROP POLICY IF EXISTS "office_update_payments" ON public.payments;
DROP POLICY IF EXISTS "payments_office_all" ON public.payments;
DROP POLICY IF EXISTS "payments_customer_select" ON public.payments;
DROP POLICY IF EXISTS "payments_select_office" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_office" ON public.payments;
DROP POLICY IF EXISTS "payments_update_office" ON public.payments;

-- Office staff and admins can view all payments
CREATE POLICY "payments_select_office" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = true
        AND u.role IN ('admin', 'staff')
    )
  );

-- Customers can view payments for their own shipments
CREATE POLICY "payments_customer_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.customers c ON c.id = s.customer_id
      WHERE s.id = payments.shipment_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- Office staff and admins can insert payments
CREATE POLICY "payments_insert_office" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = true
        AND u.role IN ('admin', 'staff')
    )
  );

-- Office staff and admins can update payments (e.g. status, verification)
CREATE POLICY "payments_update_office" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = true
        AND u.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = true
        AND u.role IN ('admin', 'staff')
    )
  );

REVOKE ALL ON public.payments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;

-- Ensure foreign key references to public.users exist for created_by and verified_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_created_by_fkey' AND table_name = 'payments'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_verified_by_fkey' AND table_name = 'payments'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Allow payment event types in shipment_events
DO $migration$
DECLARE
  predicate text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO STRICT predicate
  FROM pg_constraint
  WHERE conrelid = 'public.shipment_events'::regclass
    AND conname = 'shipment_events_event_type_check';

  IF predicate NOT LIKE '%payment_recorded%' THEN
    ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
    EXECUTE 'ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK (('
      || predicate || ') OR event_type IN (''payment_recorded'', ''payment_verified'', ''payment_rejected''))';
  END IF;
END $migration$;

-- 2. RPC: office_record_payment
-- Atomic SECURITY INVOKER function to record a payment for an active shipment
CREATE OR REPLACE FUNCTION public.office_record_payment(
  p_shipment_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  s public.shipments%ROWTYPE;
  pay public.payments%ROWTYPE;
  v_ref text;
  v_notes text;
  v_paid_at timestamptz;
BEGIN
  PERFORM public.require_active_office();

  IF p_shipment_id IS NULL THEN
    RAISE EXCEPTION 'Shipment ID is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found' USING ERRCODE = 'P0002';
  END IF;

  IF s.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record payment for a cancelled shipment' USING ERRCODE = '22000';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Payment method is required' USING ERRCODE = '22023';
  END IF;

  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  v_paid_at := coalesce(p_paid_at, now());

  IF v_paid_at > now() + interval '1 day' THEN
    RAISE EXCEPTION 'Payment date cannot be in the future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (
    shipment_id,
    amount,
    method,
    status,
    reference_number,
    paid_at,
    notes,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    s.id,
    round(p_amount, 2),
    p_method,
    'pending',
    v_ref,
    v_paid_at,
    v_notes,
    auth.uid(),
    now(),
    now()
  )
  RETURNING * INTO pay;

  -- Record audit event in shipment_events
  INSERT INTO public.shipment_events (
    shipment_id,
    event_type,
    actor_id,
    meta
  )
  VALUES (
    s.id,
    'payment_recorded',
    auth.uid(),
    jsonb_build_object(
      'payment_id', pay.id,
      'amount', pay.amount,
      'method', pay.method,
      'status', pay.status,
      'reference_number', pay.reference_number,
      'paid_at', pay.paid_at
    )
  );

  RETURN jsonb_build_object(
    'id', pay.id,
    'shipment_id', pay.shipment_id,
    'amount', pay.amount,
    'method', pay.method,
    'status', pay.status,
    'reference_number', pay.reference_number,
    'paid_at', pay.paid_at,
    'notes', pay.notes,
    'created_by', pay.created_by,
    'created_at', pay.created_at,
    'updated_at', pay.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.office_record_payment(uuid, numeric, public.payment_method, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_record_payment(uuid, numeric, public.payment_method, text, timestamptz, text) TO authenticated;

-- 3. RPC: office_review_payment
-- Atomic SECURITY INVOKER function to verify or reject a payment with optimistic concurrency
CREATE OR REPLACE FUNCTION public.office_review_payment(
  p_payment_id uuid,
  p_expected timestamptz,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  v_action text;
  v_reason text;
  v_updated_notes text;
BEGIN
  PERFORM public.require_active_office();

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required' USING ERRCODE = '22023';
  END IF;

  v_action := lower(btrim(coalesce(p_action, '')));
  IF v_action NOT IN ('verify', 'reject') THEN
    RAISE EXCEPTION 'Invalid review action: must be verify or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002';
  END IF;

  -- Optimistic concurrency check
  IF p_expected IS NULL OR pay.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'PAYMENT_CHANGED_RELOAD' USING ERRCODE = '40001';
  END IF;

  IF pay.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment is not pending review (current status: %)', pay.status USING ERRCODE = '22000';
  END IF;

  IF v_action = 'reject' THEN
    v_reason := btrim(coalesce(p_reason, ''));
    IF length(v_reason) < 5 THEN
      RAISE EXCEPTION 'A rejection reason of at least 5 characters is required' USING ERRCODE = '22023';
    END IF;

    v_updated_notes := CASE
      WHEN pay.notes IS NULL OR pay.notes = '' THEN '[Rejected: ' || v_reason || ']'
      ELSE pay.notes || E'\n[Rejected: ' || v_reason || ']'
    END;

    UPDATE public.payments
    SET status = 'rejected',
        verified_by = auth.uid(),
        verified_at = now(),
        notes = v_updated_notes,
        updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;
  ELSE
    UPDATE public.payments
    SET status = 'verified',
        verified_by = auth.uid(),
        verified_at = now(),
        updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;
  END IF;

  -- Record audit event in shipment_events
  INSERT INTO public.shipment_events (
    shipment_id,
    event_type,
    actor_id,
    meta
  )
  VALUES (
    pay.shipment_id,
    CASE WHEN v_action = 'verify' THEN 'payment_verified' ELSE 'payment_rejected' END,
    auth.uid(),
    jsonb_build_object(
      'payment_id', pay.id,
      'amount', pay.amount,
      'method', pay.method,
      'status', pay.status,
      'action', v_action,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'verified_at', pay.verified_at
    )
  );

  RETURN jsonb_build_object(
    'id', pay.id,
    'shipment_id', pay.shipment_id,
    'amount', pay.amount,
    'method', pay.method,
    'status', pay.status,
    'reference_number', pay.reference_number,
    'paid_at', pay.paid_at,
    'notes', pay.notes,
    'created_by', pay.created_by,
    'verified_by', pay.verified_by,
    'verified_at', pay.verified_at,
    'created_at', pay.created_at,
    'updated_at', pay.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.office_review_payment(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_review_payment(uuid, timestamptz, text, text) TO authenticated;

