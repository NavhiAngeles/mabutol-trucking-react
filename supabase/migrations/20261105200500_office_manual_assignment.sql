-- Office-controlled initial assignment and guarded pre-trip reassignment.
-- Automatic assignment remains unchanged; manual selection requires complete current compliance.

ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK(event_type IN
 ('route_started','arrived_at_pickup','grace_period_ended','on_my_way_pressed','customer_showed','no_show_confirmed','cargo_loaded','delivered',
  'office_quoted','no_show_reported','proof_submitted','complete','request_correction','cancel_no_show','incident_resolved',
  'manual_assignment','pretrip_reassignment'));

CREATE FUNCTION public.office_assign_shipment_resources(
  p_shipment uuid, p_driver uuid, p_truck uuid, p_reason text,
  p_expected_delivery uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  shipment public.shipments%ROWTYPE;
  current_delivery public.deliveries%ROWTYPE;
  chosen_driver public.drivers%ROWTYPE;
  chosen_truck public.trucks%ROWTYPE;
  new_delivery uuid;
  has_current boolean := false;
  mode text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')
  ) THEN RAISE EXCEPTION 'Only active admin or staff may assign deliveries' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Enter an assignment reason of 5 to 1000 characters';
  END IF;

  SELECT * INTO shipment FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;
  IF shipment.requested_vehicle_type_id IS NULL OR shipment.weight_kg IS NULL OR shipment.weight_kg<=0
     OR shipment.weight_kg::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Shipment needs a valid vehicle type and cargo weight before assignment';
  END IF;

  SELECT * INTO current_delivery FROM public.deliveries
  WHERE shipment_id=shipment.id AND status<>'cancelled' FOR UPDATE;
  has_current := FOUND;
  IF has_current THEN
    mode := 'reassigned';
    IF p_expected_delivery IS NULL OR p_expected_delivery<>current_delivery.id THEN
      RAISE EXCEPTION 'Assignment changed. Reload before reassigning.' USING ERRCODE='40001';
    END IF;
    IF current_delivery.status<>'assigned' OR current_delivery.departed_at IS NOT NULL
       OR current_delivery.route_started_at IS NOT NULL OR current_delivery.pickup_arrived_at IS NOT NULL
       OR current_delivery.customer_showed_at IS NOT NULL OR current_delivery.grace_ends_at IS NOT NULL
       OR current_delivery.auto_cancel_at IS NOT NULL THEN
      RAISE EXCEPTION 'Active or started trips cannot be reassigned. Complete or cancel the trip through its supported workflow.';
    END IF;
    IF shipment.status NOT IN ('assigned','booked') THEN
      RAISE EXCEPTION 'This shipment is no longer eligible for pre-trip reassignment';
    END IF;
    IF current_delivery.driver_id=p_driver AND current_delivery.truck_id=p_truck THEN
      RAISE EXCEPTION 'Choose a different driver or truck before reassigning';
    END IF;
  ELSE
    mode := 'assigned';
    IF p_expected_delivery IS NOT NULL THEN RAISE EXCEPTION 'Assignment changed. Reload before assigning.' USING ERRCODE='40001'; END IF;
    IF shipment.status<>'booked' THEN RAISE EXCEPTION 'Only booked shipments without an active delivery can be assigned'; END IF;
  END IF;

  SELECT * INTO chosen_driver FROM public.drivers WHERE id=p_driver FOR UPDATE;
  IF NOT FOUND OR chosen_driver.status<>'available' THEN RAISE EXCEPTION 'Selected driver is no longer available'; END IF;
  SELECT * INTO chosen_truck FROM public.trucks WHERE id=p_truck FOR UPDATE;
  IF NOT FOUND OR chosen_truck.status<>'available' THEN RAISE EXCEPTION 'Selected truck is no longer available'; END IF;

  IF chosen_truck.vehicle_type_id IS DISTINCT FROM shipment.requested_vehicle_type_id THEN
    RAISE EXCEPTION 'Selected truck does not match the requested vehicle type';
  END IF;
  IF chosen_truck.capacity_kg IS NULL OR chosen_truck.capacity_kg<shipment.weight_kg
     OR chosen_truck.capacity_kg::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Selected truck cannot carry this shipment weight';
  END IF;
  IF chosen_truck.assigned_driver_id IS NOT NULL AND chosen_truck.assigned_driver_id<>chosen_driver.id THEN
    RAISE EXCEPTION 'Selected truck is assigned to a different driver';
  END IF;
  IF shipment.booking_source='mobile' AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=chosen_driver.user_id AND is_active AND role='driver'
  ) THEN RAISE EXCEPTION 'Mobile bookings require a driver with an active driver account'; END IF;
  IF EXISTS (SELECT 1 FROM public.maintenance_records WHERE truck_id=chosen_truck.id AND status='in_progress') THEN
    RAISE EXCEPTION 'Selected truck is under active maintenance';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE (NOT has_current OR id<>current_delivery.id)
             AND status IN ('assigned','loading','in_transit') AND driver_id=chosen_driver.id) THEN
    RAISE EXCEPTION 'Selected driver is reserved by another active delivery';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE (NOT has_current OR id<>current_delivery.id)
             AND status IN ('assigned','loading','in_transit') AND truck_id=chosen_truck.id) THEN
    RAISE EXCEPTION 'Selected truck is reserved by another active delivery';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['drivers_license','medical_certificate','nbi_clearance']::public.compliance_doc_type[]) required(doc_type)
    WHERE (SELECT cd.review_status='approved' AND (cd.expiry_date IS NULL OR cd.expiry_date>=current_date)
           FROM public.compliance_documents cd WHERE cd.driver_id=chosen_driver.id AND cd.doc_type=required.doc_type
           ORDER BY cd.created_at DESC,cd.id DESC LIMIT 1) IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Selected driver needs approved, unexpired license, medical and NBI compliance documents'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['lto_registration','franchise_permit','emission_test']::public.compliance_doc_type[]) required(doc_type)
    WHERE (SELECT cd.review_status='approved' AND (cd.expiry_date IS NULL OR cd.expiry_date>=current_date)
           FROM public.compliance_documents cd WHERE cd.truck_id=chosen_truck.id AND cd.doc_type=required.doc_type
           ORDER BY cd.created_at DESC,cd.id DESC LIMIT 1) IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Selected truck needs approved, unexpired OR/CR, LTFRB and emission compliance documents'; END IF;

  IF has_current THEN UPDATE public.deliveries SET status='cancelled' WHERE id=current_delivery.id; END IF;
  INSERT INTO public.deliveries(shipment_id,truck_id,driver_id,status,assigned_by)
  VALUES(shipment.id,chosen_truck.id,chosen_driver.id,'assigned',auth.uid()) RETURNING id INTO new_delivery;
  INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta)
  VALUES(shipment.id,new_delivery,CASE mode WHEN 'assigned' THEN 'manual_assignment' ELSE 'pretrip_reassignment' END,
    auth.uid(),jsonb_build_object('reason',btrim(p_reason),'previous_delivery',CASE WHEN has_current THEN current_delivery.id END,
      'driver',chosen_driver.id,'truck',chosen_truck.id));
  RETURN jsonb_build_object('shipment_id',shipment.id,'delivery_id',new_delivery,'status','assigned','mode',mode);
END;
$$;
REVOKE ALL ON FUNCTION public.office_assign_shipment_resources(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.office_assign_shipment_resources(uuid,uuid,uuid,text,uuid) TO authenticated;
