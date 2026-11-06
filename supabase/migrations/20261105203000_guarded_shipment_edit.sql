-- Guarded office editing for existing shipments. Customer-approved terms and active trips stay immutable.
ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK(event_type IN
 ('route_started','arrived_at_pickup','grace_period_ended','on_my_way_pressed','customer_showed','no_show_confirmed','cargo_loaded','delivered','office_quoted','no_show_reported','proof_submitted','complete','request_correction','cancel_no_show','incident_resolved','manual_assignment','pretrip_reassignment','shipment_edited'));

CREATE FUNCTION public.office_edit_shipment(p_shipment uuid,p_expected timestamptz,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.shipments%ROWTYPE; d public.deliveries%ROWTYPE; allowed text[]; supplied text[]; changed text[]:=ARRAY[]::text[]; material boolean:=false;
 cargo text; handling text; notes text; weight numeric; vehicle uuid; departure timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')) THEN RAISE EXCEPTION 'Only active admin or staff may edit shipments' USING ERRCODE='42501';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid shipment changes';END IF;
 SELECT coalesce(array_agg(key ORDER BY key),ARRAY[]::text[]) INTO supplied FROM jsonb_object_keys(p_data) key;
 IF cardinality(supplied)=0 THEN RAISE EXCEPTION 'No shipment changes were supplied';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=p_shipment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied';END IF;
 IF p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Shipment changed. Reload before saving.' USING ERRCODE='40001';END IF;
 IF s.status='pending' THEN
  IF s.booking_source='mobile' THEN RAISE EXCEPTION 'Customer-submitted requests cannot be rewritten without customer consent';END IF;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=s.id AND status<>'cancelled') THEN RAISE EXCEPTION 'Pending requests with an active delivery cannot be edited';END IF;
  allowed:=ARRAY['cargo_description','weight_kg','requested_vehicle_type_id','special_handling','scheduled_departure','driver_notes'];
 ELSIF s.status IN ('booked','assigned') THEN
  allowed:=ARRAY['driver_notes'];
  IF s.status='assigned' THEN
   SELECT * INTO d FROM public.deliveries WHERE shipment_id=s.id AND status<>'cancelled' FOR UPDATE;
   IF NOT FOUND OR d.status<>'assigned' OR d.departed_at IS NOT NULL OR d.route_started_at IS NOT NULL OR d.pickup_arrived_at IS NOT NULL OR d.customer_showed_at IS NOT NULL OR d.grace_ends_at IS NOT NULL OR d.auto_cancel_at IS NOT NULL THEN RAISE EXCEPTION 'Started or active trips cannot be edited through the shipment form';END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Shipments in this lifecycle state cannot be edited';END IF;
 IF EXISTS(SELECT 1 FROM unnest(supplied) key WHERE NOT key=ANY(allowed)) THEN RAISE EXCEPTION 'One or more fields cannot be edited in this shipment state';END IF;
 IF 'cargo_description'=ANY(supplied) THEN cargo:=btrim(coalesce(p_data->>'cargo_description',''));IF length(cargo) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'Cargo description must be 2 to 500 characters';END IF;IF cargo IS DISTINCT FROM s.cargo_description THEN changed:=array_append(changed,'cargo_description');material:=true;END IF;ELSE cargo:=s.cargo_description;END IF;
 IF 'weight_kg'=ANY(supplied) THEN BEGIN weight:=(p_data->>'weight_kg')::numeric;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Cargo weight must be a valid number';END;IF weight<2000 OR weight>4000 OR weight::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cargo weight must be between 2,000 and 4,000 kg';END IF;IF weight IS DISTINCT FROM s.weight_kg THEN changed:=array_append(changed,'weight_kg');material:=true;END IF;ELSE weight:=s.weight_kg;END IF;
 IF 'requested_vehicle_type_id'=ANY(supplied) THEN BEGIN vehicle:=(p_data->>'requested_vehicle_type_id')::uuid;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Choose a valid vehicle type';END;IF NOT EXISTS(SELECT 1 FROM public.vehicle_types WHERE id=vehicle AND is_active AND default_capacity_kg>=weight) THEN RAISE EXCEPTION 'Choose an active vehicle type that can carry the shipment weight';END IF;IF vehicle IS DISTINCT FROM s.requested_vehicle_type_id THEN changed:=array_append(changed,'requested_vehicle_type_id');material:=true;END IF;ELSE vehicle:=s.requested_vehicle_type_id;END IF;
 IF 'special_handling'=ANY(supplied) THEN handling:=nullif(btrim(coalesce(p_data->>'special_handling','')),'');IF length(coalesce(handling,''))>1000 THEN RAISE EXCEPTION 'Special handling must not exceed 1000 characters';END IF;IF handling IS DISTINCT FROM s.special_handling THEN changed:=array_append(changed,'special_handling');material:=true;END IF;ELSE handling:=s.special_handling;END IF;
 IF 'scheduled_departure'=ANY(supplied) THEN BEGIN departure:=(p_data->>'scheduled_departure')::timestamptz;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Choose a valid departure date and time';END;IF departure<=now() THEN RAISE EXCEPTION 'Departure must be scheduled in the future';END IF;IF departure IS DISTINCT FROM s.scheduled_departure THEN changed:=array_append(changed,'scheduled_departure');material:=true;END IF;ELSE departure:=s.scheduled_departure;END IF;
 IF 'driver_notes'=ANY(supplied) THEN notes:=nullif(btrim(coalesce(p_data->>'driver_notes','')),'');IF length(coalesce(notes,''))>1000 THEN RAISE EXCEPTION 'Driver instructions must not exceed 1000 characters';END IF;IF notes IS DISTINCT FROM s.driver_notes THEN changed:=array_append(changed,'driver_notes');END IF;ELSE notes:=s.driver_notes;END IF;
 IF cardinality(changed)=0 THEN RAISE EXCEPTION 'No shipment fields changed';END IF;
 UPDATE public.shipments SET cargo_description=cargo,weight_kg=weight,requested_vehicle_type_id=vehicle,special_handling=handling,scheduled_departure=departure,driver_notes=notes,pricing_rate_id=CASE WHEN material THEN NULL ELSE pricing_rate_id END,quoted_amount=CASE WHEN material THEN NULL ELSE quoted_amount END,override_amount=CASE WHEN material THEN NULL ELSE override_amount END,override_reason=CASE WHEN material THEN NULL ELSE override_reason END WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.shipment_events(shipment_id,event_type,actor_id,meta) VALUES(s.id,'shipment_edited',auth.uid(),jsonb_build_object('fields',to_jsonb(changed),'quotation_invalidated',material));
 RETURN jsonb_build_object('id',s.id,'status',s.status,'updated_at',s.updated_at,'changed_fields',to_jsonb(changed),'quotation_invalidated',material);
END $$;
REVOKE ALL ON FUNCTION public.office_edit_shipment(uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.office_edit_shipment(uuid,timestamptz,jsonb) TO authenticated;
