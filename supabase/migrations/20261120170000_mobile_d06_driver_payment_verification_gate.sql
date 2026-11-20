-- Migration: 20261120170000_mobile_d06_driver_payment_verification_gate.sql
-- Implements Request D06: Driver Face-to-Face Full Payment Collection & Strict Admin Verification Gate
-- 1. Adds client_request_id (idempotency) and rejection_reason to public.payments
-- 2. Adds driver RLS SELECT policy and Realtime publication for public.payments
-- 3. Adds storage policies on delivery-documents for driver payment receipt uploads & authorized reads
-- 4. Adds driver_record_payment and review_shipment_payment RPCs, and updates office_review_payment
-- 5. Enforces strict server-side payment verification gate in driver_milestone ('loaded') and driver_set_delivery_status ('in_transit')
-- 6. Extends mobile_delivery_evidence_file ('payment'), mobile_workspace(), and mobile_shipment_details()

-- 1. Schema & Idempotency Index on public.payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_shipment_client_request_uidx
  ON public.payments (shipment_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 2. Driver RLS SELECT Policy on public.payments
DROP POLICY IF EXISTS "driver reads assigned shipment payments" ON public.payments;
CREATE POLICY "driver reads assigned shipment payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  shipment_id IN (SELECT public.my_driver_shipment_ids())
);

-- 3. Realtime publication for public.payments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;

-- 4. Storage policies on delivery-documents for driver payment receipts
DROP POLICY IF EXISTS "driver uploads payment receipt for loading delivery" ON storage.objects;
CREATE POLICY "driver uploads payment receipt for loading delivery"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-documents'
  AND owner = (SELECT auth.uid())
  AND (SELECT public.get_user_role()) = 'driver'
  AND name ~ '^[0-9a-f-]{36}/payment-[0-9a-f-]{36}\.jpg$'
  AND EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.id::text = split_part(name, '/', 1)
      AND d.driver_id = (SELECT public.my_driver_id())
      AND d.status = 'loading'
  )
);

DROP POLICY IF EXISTS "driver reads staged payment receipts" ON storage.objects;
CREATE POLICY "driver reads staged payment receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-documents'
  AND owner = (SELECT auth.uid())
  AND (SELECT public.get_user_role()) = 'driver'
  AND name ~ '^[0-9a-f-]{36}/payment-[0-9a-f-]{36}\.jpg$'
  AND EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.id::text = split_part(name, '/', 1)
      AND d.driver_id = (SELECT public.my_driver_id())
  )
);

DROP POLICY IF EXISTS "authorized users read recorded payment receipts" ON storage.objects;
CREATE POLICY "authorized users read recorded payment receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-documents'
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.proof_path = storage.objects.name
      AND (
        (SELECT public.is_admin())
        OR p.shipment_id IN (SELECT public.my_driver_shipment_ids())
      )
  )
);

-- 5. RPC: Driver records full payment received after loading (always status = 'pending')
CREATE OR REPLACE FUNCTION public.driver_record_payment(
  p_delivery_id uuid,
  p_request_id uuid,
  p_method public.payment_method,
  p_reference_number text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_driver_id uuid;
  v_delivery public.deliveries%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_verified_paid numeric(12,2);
  v_balance numeric(12,2);
  v_ref text := nullif(btrim(coalesce(p_reference_number, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_payment public.payments%ROWTYPE;
  v_customer_user_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active AND role = 'driver'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE user_id = v_uid AND status <> 'inactive'
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_delivery_id IS NULL OR p_request_id IS NULL OR p_method IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_REQUEST';
  END IF;

  -- Serialize concurrent retries for the same delivery
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_delivery_id::text, 0));

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id AND driver_id = v_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;

  IF v_delivery.status <> 'loading' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATE';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = v_delivery.shipment_id
  FOR UPDATE;

  IF NOT FOUND OR v_shipment.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND';
  END IF;

  -- Idempotent replay check on client_request_id
  SELECT * INTO v_existing
  FROM public.payments
  WHERE shipment_id = v_shipment.id AND client_request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM v_uid
       OR v_existing.method IS DISTINCT FROM p_method
       OR v_existing.reference_number IS DISTINCT FROM v_ref
       OR v_existing.proof_path IS DISTINCT FROM v_proof THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'shipment_id', v_existing.shipment_id,
      'amount', v_existing.amount,
      'method', v_existing.method,
      'status', v_existing.status,
      'paid_at', v_existing.paid_at
    );
  END IF;

  IF v_shipment.final_amount IS NULL OR v_shipment.final_amount <= 0 THEN
    RAISE EXCEPTION 'FINAL_AMOUNT_REQUIRED';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_verified_paid
  FROM public.payments
  WHERE shipment_id = v_shipment.id AND status = 'verified';

  v_balance := v_shipment.final_amount - v_verified_paid;
  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_PAID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE shipment_id = v_shipment.id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_PENDING';
  END IF;

  IF v_proof IS NULL OR v_proof <> (p_delivery_id::text || '/payment-' || p_request_id::text || '.jpg') THEN
    RAISE EXCEPTION 'PAYMENT_PROOF_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'delivery-documents'
      AND o.name = v_proof
      AND o.owner = v_uid
      AND o.metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp')
      AND (o.metadata->>'size')::bigint BETWEEN 1 AND 10485760
  ) THEN
    RAISE EXCEPTION 'PAYMENT_PROOF_REQUIRED';
  END IF;

  IF p_method IN ('gcash', 'bank_transfer', 'check') AND v_ref IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_REFERENCE_REQUIRED';
  END IF;

  INSERT INTO public.payments (
    shipment_id, amount, method, reference_number, proof_path,
    status, paid_at, notes, created_by, client_request_id
  )
  VALUES (
    v_shipment.id, v_balance, p_method, v_ref, v_proof,
    'pending', now(), v_notes, v_uid, p_request_id
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.shipment_events (
    shipment_id, delivery_id, event_type, actor_id, meta
  )
  VALUES (
    v_shipment.id,
    v_delivery.id,
    'payment_recorded',
    v_uid,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'status', v_payment.status,
      'reference_number', v_payment.reference_number,
      'proof_path', v_payment.proof_path,
      'source', 'driver_mobile'
    )
  );

  -- Notify active admin/staff users for immediate review before truck departs
  INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
  SELECT
    u.id,
    'payment'::public.notification_type,
    'Payment verification required',
    'Driver submitted ₱' || to_char(v_balance, 'FM999,999,990.00') || ' (' || p_method::text ||
    ') for ' || coalesce(v_shipment.tracking_number, 'shipment') || '. Review signed receipt before departure.',
    v_shipment.id
  FROM public.users u
  WHERE u.is_active AND u.role IN ('admin', 'staff');

  -- Notify customer for transparency (anti-collusion audit)
  SELECT c.user_id INTO v_customer_user_id
  FROM public.customers c
  WHERE c.id = v_shipment.customer_id;

  IF v_customer_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
    VALUES (
      v_customer_user_id,
      'payment'::public.notification_type,
      'Payment submitted for office review',
      'Your driver recorded a full payment of ₱' || to_char(v_balance, 'FM999,999,990.00') ||
      ' (' || p_method::text || ') for ' || coalesce(v_shipment.tracking_number, 'your shipment') ||
      '. It is pending office verification.',
      v_shipment.id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'shipment_id', v_payment.shipment_id,
    'amount', v_payment.amount,
    'method', v_payment.method,
    'status', v_payment.status,
    'paid_at', v_payment.paid_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_record_payment(uuid, uuid, public.payment_method, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_record_payment(uuid, uuid, public.payment_method, text, text, text) TO authenticated;

-- 6. RPC: Admin/Staff verifies or rejects a pending payment (D06 contract + office_review_payment alignment)
CREATE OR REPLACE FUNCTION public.review_shipment_payment(
  p_payment_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment public.payments%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_driver_user_id uuid;
  v_customer_user_id uuid;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active AND role IN ('admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'OFFICE_ACCESS_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_REVIEWED';
  END IF;

  SELECT * INTO v_shipment FROM public.shipments WHERE id = v_payment.shipment_id;

  SELECT dr.user_id INTO v_driver_user_id
  FROM public.deliveries d
  JOIN public.drivers dr ON dr.id = d.driver_id
  WHERE d.shipment_id = v_shipment.id AND d.status <> 'cancelled'
  ORDER BY d.assigned_at DESC
  LIMIT 1;

  SELECT c.user_id INTO v_customer_user_id
  FROM public.customers c
  WHERE c.id = v_shipment.customer_id;

  IF v_decision = 'verify' THEN
    UPDATE public.payments
    SET
      status = 'verified',
      verified_by = v_uid,
      verified_at = now(),
      rejection_reason = NULL,
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    INSERT INTO public.shipment_events (shipment_id, event_type, actor_id, meta)
    VALUES (
      v_payment.shipment_id,
      'payment_verified',
      v_uid,
      jsonb_build_object(
        'payment_id', v_payment.id,
        'amount', v_payment.amount,
        'method', v_payment.method,
        'status', v_payment.status,
        'action', 'verify',
        'verified_at', v_payment.verified_at
      )
    );

    IF v_driver_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_driver_user_id,
        'payment'::public.notification_type,
        'Payment verified — ready to depart',
        'Office verified ₱' || to_char(v_payment.amount, 'FM999,999,990.00') || ' for ' ||
        coalesce(v_shipment.tracking_number, 'your trip') || '. You may now start transit.',
        v_shipment.id
      );
    END IF;

    IF v_customer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_customer_user_id,
        'payment'::public.notification_type,
        'Payment verified',
        'Your payment of ₱' || to_char(v_payment.amount, 'FM999,999,990.00') || ' for ' ||
        coalesce(v_shipment.tracking_number, 'your shipment') || ' has been verified by the office.',
        v_shipment.id
      );
    END IF;

    RETURN jsonb_build_object('id', v_payment.id, 'status', 'verified');

  ELSIF v_decision = 'reject' THEN
    IF v_reason IS NULL OR length(v_reason) < 3 THEN
      RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
    END IF;

    UPDATE public.payments
    SET
      status = 'rejected',
      verified_by = v_uid,
      verified_at = now(),
      rejection_reason = v_reason,
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    INSERT INTO public.shipment_events (shipment_id, event_type, actor_id, meta)
    VALUES (
      v_payment.shipment_id,
      'payment_rejected',
      v_uid,
      jsonb_build_object(
        'payment_id', v_payment.id,
        'amount', v_payment.amount,
        'method', v_payment.method,
        'status', v_payment.status,
        'action', 'reject',
        'reason', v_reason,
        'verified_at', v_payment.verified_at
      )
    );

    IF v_driver_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_driver_user_id,
        'payment'::public.notification_type,
        'Payment proof rejected',
        'Office rejected payment proof for ' || coalesce(v_shipment.tracking_number, 'your trip') ||
        ': ' || v_reason || '. Resolve and resubmit before departing.',
        v_shipment.id
      );
    END IF;

    IF v_customer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_customer_user_id,
        'payment'::public.notification_type,
        'Payment verification issue',
        'The office could not verify the submitted payment for ' ||
        coalesce(v_shipment.tracking_number, 'your shipment') || '. Please coordinate with your driver.',
        v_shipment.id
      );
    END IF;

    RETURN jsonb_build_object('id', v_payment.id, 'status', 'rejected');
  ELSE
    RAISE EXCEPTION 'INVALID_PAYMENT_DECISION';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_shipment_payment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_shipment_payment(uuid, text, text) TO authenticated;

-- Keep office_review_payment (optimistic concurrency + web PaymentLedger) aligned with rejection_reason & notifications
CREATE OR REPLACE FUNCTION public.office_review_payment(
  p_payment_id uuid,
  p_expected timestamptz,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_driver_user_id uuid;
  v_customer_user_id uuid;
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

  SELECT * INTO v_shipment FROM public.shipments WHERE id = pay.shipment_id;

  SELECT dr.user_id INTO v_driver_user_id
  FROM public.deliveries d
  JOIN public.drivers dr ON dr.id = d.driver_id
  WHERE d.shipment_id = pay.shipment_id AND d.status <> 'cancelled'
  ORDER BY d.assigned_at DESC
  LIMIT 1;

  SELECT c.user_id INTO v_customer_user_id
  FROM public.customers c
  WHERE c.id = v_shipment.customer_id;

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
    SET
      status = 'rejected',
      verified_by = auth.uid(),
      verified_at = now(),
      rejection_reason = v_reason,
      notes = v_updated_notes,
      updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;

    IF v_driver_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_driver_user_id,
        'payment'::public.notification_type,
        'Payment proof rejected',
        'Office rejected payment proof for ' || coalesce(v_shipment.tracking_number, 'your trip') ||
        ': ' || v_reason || '. Resolve and resubmit before departing.',
        v_shipment.id
      );
    END IF;

    IF v_customer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_customer_user_id,
        'payment'::public.notification_type,
        'Payment verification issue',
        'The office could not verify the submitted payment for ' ||
        coalesce(v_shipment.tracking_number, 'your shipment') || '. Please coordinate with your driver.',
        v_shipment.id
      );
    END IF;
  ELSE
    UPDATE public.payments
    SET
      status = 'verified',
      verified_by = auth.uid(),
      verified_at = now(),
      rejection_reason = NULL,
      updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;

    IF v_driver_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_driver_user_id,
        'payment'::public.notification_type,
        'Payment verified — ready to depart',
        'Office verified ₱' || to_char(pay.amount, 'FM999,999,990.00') || ' for ' ||
        coalesce(v_shipment.tracking_number, 'your trip') || '. You may now start transit.',
        v_shipment.id
      );
    END IF;

    IF v_customer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, shipment_id)
      VALUES (
        v_customer_user_id,
        'payment'::public.notification_type,
        'Payment verified',
        'Your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00') || ' for ' ||
        coalesce(v_shipment.tracking_number, 'your shipment') || ' has been verified by the office.',
        v_shipment.id
      );
    END IF;
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
    'proof_path', pay.proof_path,
    'rejection_reason', pay.rejection_reason,
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

-- 7. Enforce server-side payment verification departure gate (loading -> in_transit)
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
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver' AND is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE = '42501';
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
    IF NOT public.is_within_operating_hours(now()) THEN RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS'; END IF;
    UPDATE public.deliveries SET route_started_at = now() WHERE id = d.id;

  ELSIF p_action = 'arrive' THEN
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
    UPDATE public.deliveries
    SET
      pickup_arrived_at = now(),
      pickup_arrival_lat = lat,
      pickup_arrival_lng = lng,
      grace_ends_at = now() + coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key = 'no_show_grace_minutes'), 15) * interval '1 minute',
      auto_cancel_at = now() + coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key = 'no_show_total_wait_minutes'), 30) * interval '1 minute'
    WHERE id = d.id;

  ELSIF p_action = 'showed' THEN
    IF d.status = 'loading' AND d.customer_showed_at IS NOT NULL THEN RETURN; END IF;
    IF d.status <> 'assigned' OR d.pickup_arrived_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    UPDATE public.deliveries
    SET status = 'loading', customer_showed_at = now(), grace_ends_at = NULL, auto_cancel_at = NULL
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

  ELSIF p_action = 'no_show' THEN
    IF d.status <> 'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL
       OR d.auto_cancel_at IS NULL OR now() < d.auto_cancel_at THEN
      RAISE EXCEPTION 'WAIT_PERIOD_NOT_FINISHED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shipment_events WHERE delivery_id = d.id AND event_type = 'no_show_reported') THEN
      RETURN;
    END IF;

  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_DRIVER_ACTION';
  END IF;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id)
  VALUES (
    s.id,
    d.id,
    CASE p_action
      WHEN 'start' THEN 'route_started'
      WHEN 'arrive' THEN 'arrived_at_pickup'
      WHEN 'showed' THEN 'customer_showed'
      WHEN 'loaded' THEN 'cargo_loaded'
      ELSE 'no_show_reported'
    END,
    auth.uid()
  );

  IF p_action IN ('arrive', 'no_show') THEN
    PERFORM public.notify_user(
      c.user_id,
      'shipment_status'::public.notification_type,
      CASE p_action WHEN 'arrive' THEN 'Driver arrived at pickup' ELSE 'Pickup attendance needs office review' END,
      'Open your shipment for the recorded update.',
      s.id
    )
    FROM public.customers c
    WHERE c.id = s.customer_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_milestone(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_milestone(uuid, text, jsonb) TO authenticated;

-- Also enforce the same payment verification gate in driver_set_delivery_status (loading -> in_transit)
CREATE OR REPLACE FUNCTION public.driver_set_delivery_status(
  p_delivery uuid,
  p_status public.delivery_status
)
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
  v_verified_paid numeric(12,2);
BEGIN
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

  IF p_status = v_delivery.status THEN
    RETURN;
  END IF;

  IF v_delivery.status = 'assigned' AND p_status = 'loading' THEN
    UPDATE public.deliveries
    SET
      status = 'loading',
      customer_showed_at = coalesce(customer_showed_at, now()),
      updated_at = clock_timestamp()
    WHERE id = v_delivery.id;
  ELSIF v_delivery.status = 'loading' AND p_status = 'in_transit' THEN
    SELECT coalesce(sum(p.amount), 0) INTO v_verified_paid
    FROM public.payments p
    WHERE p.shipment_id = v_shipment.id AND p.status = 'verified';

    IF v_shipment.final_amount IS NULL OR v_shipment.final_amount <= 0 OR v_verified_paid < v_shipment.final_amount THEN
      RAISE EXCEPTION 'PAYMENT_VERIFICATION_REQUIRED';
    END IF;

    UPDATE public.deliveries
    SET
      status = 'in_transit',
      departed_at = coalesce(departed_at, now()),
      updated_at = clock_timestamp()
    WHERE id = v_delivery.id;
  ELSE
    RAISE EXCEPTION 'INVALID_DELIVERY_TRANSITION' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id, meta)
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

-- 8. Evidence file resolution for 'payment' + enriched payments in mobile_workspace & mobile_shipment_details
CREATE OR REPLACE FUNCTION public.mobile_delivery_evidence_file(
  p_shipment uuid,
  p_kind text,
  p_record uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  records jsonb;
  path text;
BEGIN
  IF public.get_user_role() NOT IN ('driver', 'admin', 'staff') OR public.get_user_role() IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'payment' THEN
    SELECT p.proof_path INTO path
    FROM public.payments p
    WHERE p.id = p_record
      AND p.shipment_id = p_shipment
      AND p.proof_path IS NOT NULL;
  ELSE
    records := public.mobile_driver_evidence(p_shipment);
    IF p_kind = 'incident' THEN
      SELECT a->>'storage_path' INTO path
      FROM jsonb_array_elements(records->'incident_evidence') a
      WHERE a->>'id' = p_record::text;
    ELSIF p_kind = 'expense' THEN
      SELECT a->>'receipt_path' INTO path
      FROM jsonb_array_elements(records->'expenses') a
      WHERE a->>'id' = p_record::text;
    END IF;
  END IF;

  IF path IS NULL THEN
    RAISE EXCEPTION 'RECORDED_FILE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  RETURN path;
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_delivery_evidence_file(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_delivery_evidence_file(uuid, text, uuid) TO authenticated;

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
            cancelled_reason,
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

CREATE OR REPLACE FUNCTION public.mobile_shipment_details(p_shipment uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  result := public.mobile_shipment_details_base(p_shipment);
  RETURN result || jsonb_build_object(
    'documents', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at)
        FROM (
          SELECT id, kind, storage_path, file_name, mime_type, recipient_name, created_at, proof_attempt
          FROM public.delivery_documents
          WHERE shipment_id = p_shipment AND kind IN ('proof_of_delivery', 'signature')
        ) d
      ),
      '[]'::jsonb
    ),
    'incidents', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
        FROM (
          SELECT id, category, description, delay_minutes, created_at, resolved_at
          FROM public.delivery_incidents
          WHERE shipment_id = p_shipment
        ) i
      ),
      '[]'::jsonb
    ),
    'events', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at)
        FROM (
          SELECT id, event_type, occurred_at, meta
          FROM public.shipment_events
          WHERE shipment_id = p_shipment
          ORDER BY occurred_at DESC
          LIMIT 200
        ) e
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
          WHERE shipment_id = p_shipment
          ORDER BY created_at DESC
          LIMIT 50
        ) p
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_shipment_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_shipment_details(uuid) TO authenticated;
