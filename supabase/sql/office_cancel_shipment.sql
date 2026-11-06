-- SHIP-06: general office cancellation. No-show review remains a separate command.
-- Preserve all pre-existing event types, including additions outside this checkout.
DO $migration$
DECLARE predicate text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT predicate FROM pg_constraint
 WHERE conrelid='public.shipment_events'::regclass AND conname='shipment_events_event_type_check';
 ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
 EXECUTE 'ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK (('
   ||predicate||') OR event_type = ''shipment_cancelled'')';
END $migration$;

CREATE FUNCTION public.office_cancel_shipment(
 p_shipment uuid, p_expected timestamptz, p_expected_delivery uuid,
 p_reason text, p_financial_ack boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 s public.shipments%ROWTYPE; d public.deliveries%ROWTYPE;
 current_delivery public.deliveries%ROWTYPE; delivery_count integer:=0;
 payment_count bigint; previous_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')
 ) THEN RAISE EXCEPTION 'Only active admin or staff may cancel shipments' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'Enter a cancellation reason of 5 to 1000 characters';
 END IF;
 IF p_financial_ack IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Acknowledge that cancellation does not refund payments or change recorded charges';
 END IF;
 SELECT * INTO s FROM public.shipments WHERE id=p_shipment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;
 IF p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'Shipment changed. Reload before cancelling.' USING ERRCODE='40001';
 END IF;
 IF s.status NOT IN ('pending','booked','assigned') THEN
  RAISE EXCEPTION 'Only pending, booked or unstarted assigned shipments can be cancelled here';
 END IF;
 FOR current_delivery IN SELECT * FROM public.deliveries
  WHERE shipment_id=s.id AND status<>'cancelled' ORDER BY id FOR UPDATE
 LOOP
  delivery_count:=delivery_count+1; d:=current_delivery;
 END LOOP;
 IF delivery_count>1 OR d.id IS DISTINCT FROM p_expected_delivery THEN
  RAISE EXCEPTION 'Assignment changed. Reload before cancelling.' USING ERRCODE='40001';
 END IF;
 IF s.status='assigned' THEN
  IF delivery_count<>1 OR d.status<>'assigned' OR d.departed_at IS NOT NULL
   OR d.route_started_at IS NOT NULL OR d.pickup_arrived_at IS NOT NULL
   OR d.customer_showed_at IS NOT NULL OR d.grace_ends_at IS NOT NULL OR d.auto_cancel_at IS NOT NULL THEN
   RAISE EXCEPTION 'Started trips cannot be cancelled here. Use the operational review workflow; no-show requires its separate review.';
  END IF;
 ELSIF delivery_count<>0 THEN
  RAISE EXCEPTION 'Shipment has an unexpected active delivery. Reload and review its lifecycle.';
 END IF;
 IF d.id IS NOT NULL THEN
  -- Same resource lock order as manual assignment. Reservation is the active delivery row.
  PERFORM 1 FROM public.drivers WHERE id=d.driver_id FOR UPDATE;
  PERFORM 1 FROM public.trucks WHERE id=d.truck_id FOR UPDATE;
  -- Existing legacy release triggers must never make a different active trip available.
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE id<>d.id AND status IN ('assigned','loading','in_transit')
    AND (driver_id=d.driver_id OR truck_id=d.truck_id)) THEN
   RAISE EXCEPTION 'Resources are shared with another active delivery. Resolve the reservation conflict first.';
  END IF;
  UPDATE public.deliveries SET status='cancelled' WHERE id=d.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery cancellation denied' USING ERRCODE='42501'; END IF;
 END IF;
 -- No fee/refund contract exists in the available schema. Keep the financial ledger,
 -- quoted/override/generated final amounts and all evidence intact; never invent a refund.
 SELECT count(*) INTO payment_count FROM public.payments WHERE shipment_id=s.id;
 previous_status:=s.status::text;
 UPDATE public.shipments SET status='cancelled',cancelled_reason=btrim(p_reason),cancelled_at=now()
 WHERE id=s.id RETURNING * INTO s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shipment cancellation denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta)
 VALUES(s.id,d.id,'shipment_cancelled',auth.uid(),jsonb_build_object(
  'reason',btrim(p_reason),'previous_status',previous_status,'previous_delivery',d.id,
  'financial_policy','preserve_charges_and_payments_no_automatic_fee_or_refund',
  'financial_acknowledged',true,'payment_count_at_cancellation',payment_count,
  'financial_review_required',payment_count>0));
 RETURN jsonb_build_object('id',s.id,'status',s.status,'updated_at',s.updated_at,
  'cancelled_at',s.cancelled_at,'delivery_id',d.id,'financial_review_required',payment_count>0);
END;
$$;
REVOKE ALL ON FUNCTION public.office_cancel_shipment(uuid,timestamptz,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.office_cancel_shipment(uuid,timestamptz,uuid,text,boolean) TO authenticated;
