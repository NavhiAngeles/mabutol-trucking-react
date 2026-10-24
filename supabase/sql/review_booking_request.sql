-- Pending-request review is atomic with resource assignment. Existing RLS,
-- audit, status-history, notification and cancellation-date triggers apply.
CREATE OR REPLACE FUNCTION public.review_booking_request(
  p_shipment uuid, p_expected_updated_at timestamptz,
  p_decision text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  request public.shipments%ROWTYPE;
  delivery_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')
  ) THEN
    RAISE EXCEPTION 'Only active admin or staff may review booking requests' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Choose approve or reject';
  END IF;
  SELECT * INTO request FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking request not found or access denied'; END IF;
  IF request.status <> 'pending' OR p_expected_updated_at IS NULL
     OR request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Request changed or was already reviewed. Reload before deciding.' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE shipment_id=request.id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Request already has a delivery. Reload before deciding.';
  END IF;
  IF p_decision='reject' THEN
    IF nullif(btrim(p_reason),'') IS NULL OR length(btrim(p_reason))>1000 THEN
      RAISE EXCEPTION 'Enter a rejection reason of 1 to 1000 characters';
    END IF;
    UPDATE public.shipments SET status='cancelled', cancelled_reason=btrim(p_reason)
    WHERE id=request.id RETURNING * INTO request;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE='42501'; END IF;
  ELSE
    -- Accept the displayed quote, without silently replacing it with today's rates.
    -- Incomplete or expired requests require correction before approval.
    IF nullif(btrim(request.pickup_address),'') IS NULL
       OR nullif(btrim(request.dropoff_address),'') IS NULL
       OR nullif(btrim(request.cargo_description),'') IS NULL
       OR request.scheduled_departure IS NULL OR request.scheduled_departure<=now()
       OR request.distance_km IS NULL OR request.distance_km<=0 OR request.distance_km::text IN ('NaN','Infinity','-Infinity')
       OR request.weight_kg IS NULL OR request.weight_kg<=0 OR request.weight_kg::text IN ('NaN','Infinity','-Infinity')
       OR request.quoted_amount IS NULL OR request.quoted_amount<0 OR request.quoted_amount::text IN ('NaN','Infinity','-Infinity')
       OR (request.override_amount IS NOT NULL AND (request.override_amount<0 OR request.override_amount::text IN ('NaN','Infinity','-Infinity')))
       OR NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE id=request.requested_vehicle_type_id AND is_active)
       OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id=request.customer_id AND is_active)
    THEN RAISE EXCEPTION 'Request needs valid cargo, route, future departure, active customer/vehicle type and quoted price before approval';
    END IF;
    UPDATE public.shipments SET status='booked', confirmed_by=auth.uid()
    WHERE id=request.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE='42501'; END IF;
    delivery_id := public.assign_shipment_resources(request.id);
    SELECT * INTO request FROM public.shipments WHERE id=p_shipment;
  END IF;
  RETURN jsonb_build_object('id',request.id,'status',request.status,'delivery_id',delivery_id);
END;
$$;
REVOKE ALL ON FUNCTION public.review_booking_request(uuid,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_booking_request(uuid,timestamptz,text,text) TO authenticated;
