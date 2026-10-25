-- Dev-only shared lifecycle. Existing customer, vehicle, pricing and record data retained.
ALTER TABLE public.shipments ADD COLUMN route_source text CHECK(route_source IN ('provider','manual')),
 ADD COLUMN route_reason text, ADD COLUMN route_duration_minutes numeric,
 ADD COLUMN route_geometry jsonb;
ALTER TABLE public.deliveries ADD COLUMN proof_attempt integer NOT NULL DEFAULT 0,
 ADD COLUMN proof_review_status text NOT NULL DEFAULT 'awaiting_submission'
 CHECK(proof_review_status IN ('awaiting_submission','pending_review','correction_requested','approved')),
 ADD COLUMN proof_review_reason text, ADD COLUMN proof_reviewed_by uuid REFERENCES public.users(id),
 ADD COLUMN proof_reviewed_at timestamptz;
ALTER TABLE public.delivery_documents ADD COLUMN proof_attempt integer NOT NULL DEFAULT 0;
ALTER TABLE public.tracking_logs ADD COLUMN client_sample_id uuid;
CREATE UNIQUE INDEX tracking_logs_client_sample_idx ON public.tracking_logs(delivery_id,client_sample_id);

CREATE FUNCTION public.require_active_office() RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('admin','staff'))
 THEN RAISE EXCEPTION 'ACTIVE_OFFICE_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_active_office() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.require_active_office() TO authenticated;

-- Quote calculation uses stored current prices; no client-submitted amount accepted.
CREATE FUNCTION public.office_prepare_quote(p_shipment uuid,p_expected timestamptz,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.shipments%ROWTYPE; rate public.pricing_rates%ROWTYPE; km numeric; minutes numeric;
 lat1 numeric; lng1 numeric; lat2 numeric; lng2 numeric; minimum numeric; surcharge numeric; charge numeric; handling text; handling_key text;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO s FROM public.shipments WHERE id=p_shipment FOR UPDATE;
 IF NOT FOUND OR s.status<>'pending' OR p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected
 THEN RAISE EXCEPTION 'REQUEST_CHANGED_RELOAD' USING ERRCODE='40001'; END IF;
 km:=(p_data->>'distance_km')::numeric; minutes:=(p_data->>'duration_minutes')::numeric;
 lat1:=(p_data->>'pickup_lat')::numeric; lng1:=(p_data->>'pickup_lng')::numeric;
 lat2:=(p_data->>'dropoff_lat')::numeric; lng2:=(p_data->>'dropoff_lng')::numeric;
 IF km IS NULL OR NOT(km>0 AND km<20000) OR minutes IS NULL OR NOT(minutes>0 AND minutes<100000)
 OR lat1 IS NULL OR NOT(lat1 BETWEEN -90 AND 90) OR lat2 IS NULL OR NOT(lat2 BETWEEN -90 AND 90)
 OR lng1 IS NULL OR NOT(lng1 BETWEEN -180 AND 180) OR lng2 IS NULL OR NOT(lng2 BETWEEN -180 AND 180)
 OR (lat1=lat2 AND lng1=lng2) OR coalesce(p_data->>'source','') NOT IN ('provider','manual')
 OR (p_data->>'source'='manual' AND length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000)
 THEN RAISE EXCEPTION 'INVALID_ROUTE'; END IF;
 IF s.scheduled_departure IS NULL OR s.scheduled_departure<=now() THEN RAISE EXCEPTION 'INVALID_DEPARTURE'; END IF;
 SELECT * INTO rate FROM public.pricing_rates WHERE vehicle_type_id=s.requested_vehicle_type_id AND is_active
 AND effective_from<=(now() AT TIME ZONE 'Asia/Manila')::date
 AND (effective_to IS NULL OR effective_to>=(now() AT TIME ZONE 'Asia/Manila')::date)
 ORDER BY effective_from DESC,id LIMIT 1;
 SELECT (value #>> '{}')::numeric INTO minimum FROM public.system_settings WHERE key='minimum_booking_fee';
 handling:=coalesce(nullif(s.special_handling,''),'None');
 handling_key:=CASE handling WHEN 'None' THEN 'none' WHEN 'Fragile' THEN 'fragile' WHEN 'Keep Dry' THEN 'keepdry'
 WHEN 'Temperature Sensitive' THEN 'temp' WHEN 'Perishable' THEN 'perishable' WHEN 'Cold Chain (Refrigerated)' THEN 'cold' END;
 SELECT (value->>handling_key)::numeric INTO surcharge FROM public.system_settings WHERE key='handling_surcharges';
 IF rate.id IS NULL OR rate.per_km_rate IS NULL OR NOT(rate.per_km_rate>=0 AND rate.per_km_rate<1000000)
 OR rate.min_charge IS NULL OR NOT(rate.min_charge>=0 AND rate.min_charge<1000000000)
 OR minimum IS NULL OR NOT(minimum>=0 AND minimum<1000000000)
 OR surcharge IS NULL OR NOT(surcharge>=0 AND surcharge<1000000000) THEN RAISE EXCEPTION 'PRICING_CONFIGURATION_REQUIRED'; END IF;
 charge:=round(greatest(km*rate.per_km_rate,rate.min_charge,minimum)+surcharge*CASE WHEN handling_key='cold' THEN km ELSE 1 END,2);
 UPDATE public.shipments SET pickup_lat=lat1,pickup_lng=lng1,dropoff_lat=lat2,dropoff_lng=lng2,
 distance_km=km,route_duration_minutes=minutes,route_source=p_data->>'source',route_reason=left(p_data->>'reason',1000),
 route_geometry=CASE WHEN p_data->>'source'='provider' THEN p_data->'geometry' ELSE NULL END,
 pricing_rate_id=rate.id,quoted_amount=charge,override_amount=NULL,override_reason=NULL,final_amount=charge,
 estimated_arrival=scheduled_departure+minutes*interval '1 minute' WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.shipment_events(shipment_id,event_type,actor_id,meta) VALUES(s.id,'office_quoted',auth.uid(),jsonb_build_object('source',s.route_source,'amount',charge));
 RETURN jsonb_build_object('id',s.id,'updated_at',s.updated_at,'quoted_amount',charge);
END $$;

-- Keep original validated/idempotent intake and extend it without changing its public signature.
ALTER FUNCTION public.mobile_create_request(uuid,jsonb) RENAME TO mobile_create_request_base;
REVOKE ALL ON FUNCTION public.mobile_create_request_base(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.mobile_create_request(p_request_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; s public.shipments%ROWTYPE; lat1 numeric; lng1 numeric;lat2 numeric;lng2 numeric;handling text;
BEGIN
 -- Coordinate-less legacy request callers remain compatible; new UI always confirms coordinates.
 lat1:=(p_data->>'pickup_lat')::numeric; lng1:=(p_data->>'pickup_lng')::numeric;
 lat2:=(p_data->>'dropoff_lat')::numeric; lng2:=(p_data->>'dropoff_lng')::numeric;
 IF p_data ?| array['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'] AND
 (lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL OR NOT(lat1 BETWEEN -90 AND 90)
 OR NOT(lat2 BETWEEN -90 AND 90) OR NOT(lng1 BETWEEN -180 AND 180) OR NOT(lng2 BETWEEN -180 AND 180)
 OR (lat1=lat2 AND lng1=lng2)) THEN RAISE EXCEPTION 'INVALID_COORDINATES';END IF;
 handling:=coalesce(p_data->>'handling','None');
 IF handling NOT IN ('None','Fragile','Keep Dry','Temperature Sensitive','Perishable','Cold Chain (Refrigerated)') THEN RAISE EXCEPTION 'INVALID_HANDLING';END IF;
 result:=public.mobile_create_request_base(p_request_id,p_data);
 SELECT * INTO s FROM public.shipments WHERE id=(result->>'id')::uuid FOR UPDATE;
 IF s.pickup_lat IS NOT NULL AND (s.pickup_lat IS DISTINCT FROM lat1 OR s.pickup_lng IS DISTINCT FROM lng1 OR s.dropoff_lat IS DISTINCT FROM lat2 OR s.dropoff_lng IS DISTINCT FROM lng2 OR s.special_handling IS DISTINCT FROM handling)
 THEN RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';END IF;
 IF s.status='pending' AND s.pickup_lat IS NULL THEN UPDATE public.shipments SET pickup_lat=lat1,pickup_lng=lng1,dropoff_lat=lat2,dropoff_lng=lng2,special_handling=handling WHERE id=s.id;END IF;
 RETURN result;
END $$;

-- Preserve RPC signatures but close the old unrestricted transition entrypoint.
CREATE OR REPLACE FUNCTION public.driver_set_delivery_status(p_delivery uuid,p_status public.delivery_status)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'USE_VALIDATED_DELIVERY_MILESTONES' USING ERRCODE='42501'; END $$;

-- Detailed commands share one ownership/row-lock guard and cannot operate on closed shipments.
CREATE FUNCTION public.driver_milestone(p_delivery uuid,p_action text,p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE; lat numeric;lng numeric;radius numeric;distance numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.status IN ('completed','cancelled') OR d.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF p_action='start' THEN
  IF d.status<>'assigned' THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  IF d.route_started_at IS NOT NULL THEN RETURN;END IF;
  IF NOT public.is_within_operating_hours(now()) THEN RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';END IF;
  UPDATE public.deliveries SET route_started_at=now() WHERE id=d.id;
 ELSIF p_action='arrive' THEN
  IF d.status<>'assigned' OR d.route_started_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  IF d.pickup_arrived_at IS NOT NULL THEN RETURN;END IF;
  lat:=(p_data->>'lat')::numeric;lng:=(p_data->>'lng')::numeric;
  IF lat IS NULL OR lng IS NULL OR NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180)
  OR s.pickup_lat IS NULL OR s.pickup_lng IS NULL THEN RAISE EXCEPTION 'INVALID_COORDINATES';END IF;
  radius:=coalesce((SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key='no_show_arrival_radius_meters'),500);
  distance:=extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(lng::float8,lat::float8),4326)::extensions.geography,extensions.ST_SetSRID(extensions.ST_MakePoint(s.pickup_lng::float8,s.pickup_lat::float8),4326)::extensions.geography);
  IF distance>radius THEN RAISE EXCEPTION 'ARRIVAL_TOO_FAR';END IF;
  UPDATE public.deliveries SET pickup_arrived_at=now(),pickup_arrival_lat=lat,pickup_arrival_lng=lng,
    grace_ends_at=now()+coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='no_show_grace_minutes'),15)*interval '1 minute',
    auto_cancel_at=now()+coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='no_show_total_wait_minutes'),30)*interval '1 minute' WHERE id=d.id;
 ELSIF p_action='showed' THEN
  IF d.status='loading' AND d.customer_showed_at IS NOT NULL THEN RETURN;END IF;
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  UPDATE public.deliveries SET status='loading',customer_showed_at=now(),grace_ends_at=NULL,auto_cancel_at=NULL WHERE id=d.id;
 ELSIF p_action='loaded' THEN
  IF d.status='in_transit' THEN RETURN;END IF;
  IF d.status<>'loading' OR d.customer_showed_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  UPDATE public.deliveries SET status='in_transit' WHERE id=d.id;
 ELSIF p_action='no_show' THEN
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL OR d.auto_cancel_at IS NULL OR now()<d.auto_cancel_at THEN RAISE EXCEPTION 'WAIT_PERIOD_NOT_FINISHED';END IF;
  IF EXISTS(SELECT 1 FROM public.shipment_events WHERE delivery_id=d.id AND event_type='no_show_reported') THEN RETURN;END IF;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_DRIVER_ACTION'; END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id) VALUES(s.id,d.id,
 CASE p_action WHEN 'start' THEN 'route_started' WHEN 'arrive' THEN 'arrived_at_pickup' WHEN 'showed' THEN 'customer_showed' WHEN 'loaded' THEN 'cargo_loaded' ELSE 'no_show_reported' END,auth.uid());
 IF p_action IN ('arrive','no_show') THEN
  PERFORM public.notify_user(c.user_id,'shipment_status'::public.notification_type,CASE p_action WHEN 'arrive' THEN 'Driver arrived at pickup' ELSE 'Pickup attendance needs office review' END,'Open your shipment for the recorded update.',s.id) FROM public.customers c WHERE c.id=s.customer_id;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mobile_driver_action(p_delivery uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM public.driver_milestone(p_delivery,p_action); END $$;
CREATE OR REPLACE FUNCTION public.driver_start_route(p_delivery_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'start'); END $$;
CREATE OR REPLACE FUNCTION public.driver_arrive_at_pickup(p_delivery_id uuid,p_lat numeric,p_lng numeric) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'arrive',jsonb_build_object('lat',p_lat,'lng',p_lng)); END $$;
CREATE OR REPLACE FUNCTION public.driver_confirm_customer_showed(p_delivery_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'showed'); END $$;
CREATE OR REPLACE FUNCTION public.driver_confirm_cargo_loaded(p_delivery_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'loaded'); END $$;

CREATE FUNCTION public.driver_report_incident(p_delivery uuid,p_request uuid,p_category public.incident_category,p_description text,p_delay integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE; result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND OR d.status NOT IN ('assigned','loading','in_transit') THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
 IF p_request IS NULL OR p_category IS NULL OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 2000 OR p_delay IS NULL OR p_delay NOT BETWEEN 0 AND 10080 THEN RAISE EXCEPTION 'INVALID_INCIDENT';END IF;
 SELECT id INTO result FROM public.delivery_incidents WHERE id=p_request AND delivery_id=d.id AND reported_by=auth.uid();IF FOUND THEN RETURN result;END IF;
 INSERT INTO public.delivery_incidents(id,delivery_id,shipment_id,category,description,delay_minutes,reported_by) VALUES(p_request,d.id,d.shipment_id,p_category,btrim(p_description),p_delay,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.driver_record_position(p_delivery uuid,p_sample uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;lat numeric;lng numeric;accuracy numeric; recorded timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND OR d.route_started_at IS NULL OR NOT(d.status IN ('assigned','loading','in_transit') OR (d.status='delivered' AND d.arrived_at>=now()-coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='buffered_tracking_window_minutes'),5)*interval '1 minute')) THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 lat:=(p_data->>'lat')::numeric;lng:=(p_data->>'lng')::numeric;accuracy:=(p_data->>'accuracy')::numeric;recorded:=(p_data->>'recorded_at')::timestamptz;
 IF p_sample IS NULL OR lat IS NULL OR NOT(lat BETWEEN -90 AND 90) OR lng IS NULL OR NOT(lng BETWEEN -180 AND 180)
 OR accuracy IS NULL OR NOT(accuracy>=0 AND accuracy<=10000) OR recorded IS NULL OR recorded<greatest(d.route_started_at,now()-interval '24 hours') OR recorded>now()+interval '1 minute'
 OR (d.status='delivered' AND recorded>d.arrived_at) THEN RAISE EXCEPTION 'INVALID_POSITION';END IF;
 INSERT INTO public.tracking_logs(delivery_id,truck_id,driver_id,latitude,longitude,accuracy_m,recorded_at,is_buffered,client_sample_id)
 VALUES(d.id,d.truck_id,d.driver_id,lat,lng,accuracy,recorded,coalesce((p_data->>'buffered')::boolean,false),p_sample) ON CONFLICT(delivery_id,client_sample_id) DO NOTHING;
END $$;

-- POD command validates non-null paths, exact owned objects, MIME and distinct files.
CREATE OR REPLACE FUNCTION public.driver_submit_pod(p_delivery_id uuid,p_recipient_name text,p_photo_path text,p_signature_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE; attempt integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery_id AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.shipments WHERE id=d.shipment_id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF d.status='delivered' AND EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND storage_path=p_photo_path)
 AND EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND storage_path=p_signature_path) THEN RETURN; END IF;
 IF NOT(d.status='in_transit' OR (d.status='delivered' AND d.proof_review_status='correction_requested')) THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
 IF length(btrim(coalesce(p_recipient_name,''))) NOT BETWEEN 2 AND 100 OR p_photo_path IS NULL OR p_signature_path IS NULL
 OR p_photo_path=p_signature_path OR p_photo_path NOT LIKE d.id::text||'/pod-photo-%' OR p_signature_path NOT LIKE d.id::text||'/signature-%'
 OR position('..' in p_photo_path)>0 OR position('..' in p_signature_path)>0 THEN RAISE EXCEPTION 'INVALID_POD_FILE';END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='delivery-documents' AND name IN (p_photo_path,p_signature_path) AND owner=auth.uid()
 AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp') AND (metadata->>'size')::bigint BETWEEN 1 AND 10485760)<>2 THEN RAISE EXCEPTION 'INVALID_POD_FILE';END IF;
 attempt:=d.proof_attempt+1;
 INSERT INTO public.delivery_documents(shipment_id,delivery_id,kind,storage_path,file_name,mime_type,recipient_name,uploaded_by,proof_attempt)
 SELECT d.shipment_id,d.id,CASE WHEN name=p_photo_path THEN 'proof_of_delivery'::public.document_kind ELSE 'signature'::public.document_kind END,name,storage.filename(name),metadata->>'mimetype',btrim(p_recipient_name),auth.uid(),attempt
 FROM storage.objects WHERE bucket_id='delivery-documents' AND name IN (p_photo_path,p_signature_path) AND owner=auth.uid();
 UPDATE public.deliveries SET recipient_name=btrim(p_recipient_name),status='delivered',proof_attempt=attempt,proof_review_status='pending_review',proof_review_reason=NULL,proof_reviewed_at=NULL,proof_reviewed_by=NULL WHERE id=d.id;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(d.shipment_id,d.id,'proof_submitted',auth.uid(),jsonb_build_object('attempt',attempt));
END $$;
DROP POLICY IF EXISTS "drivers upload pod files" ON storage.objects;
CREATE POLICY "active assigned driver uploads proof" ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='delivery-documents' AND EXISTS(SELECT 1 FROM public.users u JOIN public.drivers dr ON dr.user_id=u.id JOIN public.deliveries d ON d.driver_id=dr.id
 JOIN public.shipments s ON s.id=d.shipment_id WHERE u.id=(SELECT auth.uid()) AND u.is_active AND u.role='driver' AND dr.status<>'inactive'
 AND (storage.foldername(name))[1]=d.id::text AND s.status NOT IN ('completed','cancelled')
 AND (d.status='in_transit' OR (d.status='delivered' AND d.proof_review_status='correction_requested')))
 AND (storage.filename(name) LIKE 'pod-photo-%' OR storage.filename(name) LIKE 'signature-%'));
-- Only the validated POD command may create proof metadata.
DROP POLICY IF EXISTS "driver uploads POD" ON public.delivery_documents;

CREATE FUNCTION public.office_delivery_action(p_delivery uuid,p_expected timestamptz,p_action text,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE='40001';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF p_action='complete' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review'
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='proof_of_delivery')
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='signature')
  OR EXISTS(SELECT 1 FROM public.delivery_incidents WHERE delivery_id=d.id AND resolved_at IS NULL) THEN RAISE EXCEPTION 'PROOF_AND_INCIDENT_REVIEW_REQUIRED';END IF;
  UPDATE public.deliveries SET proof_review_status='approved',proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
  UPDATE public.shipments SET status='completed',actual_delivery_at=d.arrived_at WHERE id=s.id;
 ELSIF p_action='request_correction' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review' OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_PROOF_REVIEW';END IF;
  UPDATE public.deliveries SET proof_review_status='correction_requested',proof_review_reason=btrim(p_reason),proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
 ELSIF p_action='cancel_no_show' THEN
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL OR d.auto_cancel_at IS NULL OR now()<d.auto_cancel_at
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_NO_SHOW_REVIEW';END IF;
  UPDATE public.deliveries SET status='cancelled' WHERE id=d.id;
  UPDATE public.shipments SET status='cancelled',cancelled_reason=btrim(p_reason) WHERE id=s.id;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_OFFICE_ACTION';END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(s.id,d.id,p_action,auth.uid(),jsonb_build_object('reason',p_reason,'attempt',d.proof_attempt));
 PERFORM public.notify_user(c.user_id,'shipment_status'::public.notification_type,'Delivery review updated','Open your shipment for the latest office decision.',s.id) FROM public.customers c WHERE c.id=s.customer_id;
 PERFORM public.notify_user(dr.user_id,'shipment_status'::public.notification_type,'Delivery review updated',coalesce(p_reason,'Office completed delivery review.'),s.id) FROM public.drivers dr WHERE dr.id=d.driver_id;
END $$;
CREATE FUNCTION public.office_resolve_incident(p_incident uuid,p_expected timestamptz,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.delivery_incidents%ROWTYPE; d public.deliveries%ROWTYPE;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO i FROM public.delivery_incidents WHERE id=p_incident;
 SELECT * INTO d FROM public.deliveries WHERE id=i.delivery_id FOR UPDATE;
 IF d.id IS NULL OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE='40001';END IF;
 IF i.resolved_at IS NOT NULL THEN RETURN;END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_RESOLUTION';END IF;
 UPDATE public.delivery_incidents SET resolved_at=now() WHERE id=i.id;
 UPDATE public.deliveries SET updated_at=clock_timestamp() WHERE id=d.id;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_incidents WHERE shipment_id=i.shipment_id AND resolved_at IS NULL) THEN
 UPDATE public.shipments SET status=CASE d.status WHEN 'loading' THEN 'loading'::public.shipment_status WHEN 'in_transit' THEN 'in_transit'::public.shipment_status WHEN 'delivered' THEN 'review'::public.shipment_status ELSE status END WHERE id=i.shipment_id AND status='delayed';END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(i.shipment_id,d.id,'incident_resolved',auth.uid(),jsonb_build_object('incident',i.id,'reason',btrim(p_reason)));
END $$;

-- Existing unattended functions become harmless; office no-show command is the only cancellation path here.
CREATE OR REPLACE FUNCTION public.process_no_shows() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN;END $$;
CREATE OR REPLACE FUNCTION public.cancel_for_no_show(p_delivery_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'OFFICE_REVIEW_REQUIRED' USING ERRCODE='42501';END $$;
DO $$ DECLARE j record;BEGIN IF to_regclass('cron.job') IS NOT NULL THEN FOR j IN EXECUTE 'select jobid from cron.job where command like ''%process_no_shows%'' or command like ''%cancel_for_no_show%''' LOOP EXECUTE format('select cron.unschedule(%s)',j.jobid);END LOOP;END IF;END $$;

-- Deny anonymous calls to all lifecycle commands and wrappers.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('office_prepare_quote','mobile_create_request','driver_milestone','driver_record_position','driver_report_incident','driver_submit_pod','office_delivery_action','office_resolve_incident','driver_start_route','driver_arrive_at_pickup','driver_confirm_customer_showed','driver_confirm_cargo_loaded') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.process_no_shows(),public.cancel_for_no_show(uuid),public.driver_set_delivery_status(uuid,public.delivery_status) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.mobile_workspace() RENAME TO mobile_workspace_base;
REVOKE ALL ON FUNCTION public.mobile_workspace_base() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace_base() TO authenticated;
CREATE FUNCTION public.mobile_workspace() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.mobile_workspace_base();
 RETURN result||jsonb_build_object(
 'shipments',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC) FROM
  (SELECT id,tracking_number,status,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,cargo_description,weight_kg,special_handling,scheduled_departure,estimated_arrival,quoted_amount,final_amount,driver_notes,cancelled_reason,created_at,updated_at,distance_km,route_source,route_duration_minutes,route_geometry FROM public.shipments ORDER BY created_at DESC LIMIT 200)s),'[]'::jsonb),
 'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM
  (SELECT id,shipment_id,status,assigned_at,updated_at,departed_at,arrived_at,recipient_name,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at,proof_attempt,proof_review_status,proof_review_reason FROM public.deliveries ORDER BY assigned_at DESC LIMIT 200)d),'[]'::jsonb),
 'settings',coalesce((SELECT jsonb_object_agg(key,value) FROM public.system_settings WHERE key IN ('no_show_arrival_radius_meters','no_show_grace_minutes','no_show_total_wait_minutes','buffered_tracking_window_minutes')),'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.mobile_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace() TO authenticated;
ALTER FUNCTION public.mobile_shipment_details(uuid) RENAME TO mobile_shipment_details_base;
REVOKE ALL ON FUNCTION public.mobile_shipment_details_base(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_shipment_details_base(uuid) TO authenticated;
CREATE FUNCTION public.mobile_shipment_details(p_shipment uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.mobile_shipment_details_base(p_shipment);
 RETURN result||jsonb_build_object(
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM
  (SELECT id,kind,storage_path,file_name,mime_type,recipient_name,created_at,proof_attempt FROM public.delivery_documents WHERE shipment_id=p_shipment AND kind IN ('proof_of_delivery','signature'))d),'[]'::jsonb),
 'incidents',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at) FROM
  (SELECT id,category,description,delay_minutes,created_at,resolved_at FROM public.delivery_incidents WHERE shipment_id=p_shipment)i),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at) FROM
  (SELECT id,event_type,occurred_at,meta FROM public.shipment_events WHERE shipment_id=p_shipment ORDER BY occurred_at DESC LIMIT 200)e),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.mobile_shipment_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_shipment_details(uuid) TO authenticated;

-- An existing driver table INSERT grant must not bypass active-trip ingestion rules.
CREATE POLICY "active started tracking only" ON public.tracking_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(
 EXISTS(SELECT 1 FROM public.users u JOIN public.drivers dr ON dr.user_id=u.id JOIN public.deliveries d ON d.driver_id=dr.id
 WHERE u.id=(SELECT auth.uid()) AND u.is_active AND u.role='driver' AND d.id=delivery_id AND d.route_started_at IS NOT NULL));
-- Shared atomic assignment for initial bookings and staff retries.
CREATE OR REPLACE FUNCTION public.assign_shipment_resources(p_shipment uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  shipment public.shipments%ROWTYPE;
  candidate record;
  delivery_id uuid;
BEGIN
  IF current_user NOT IN ('postgres','service_role')
     AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('admin','staff')) THEN
    RAISE EXCEPTION 'Only admin or staff may assign deliveries' USING ERRCODE='42501';
  END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;
  SELECT id INTO delivery_id FROM public.deliveries WHERE shipment_id=shipment.id AND status<>'cancelled';
  IF FOUND THEN RETURN delivery_id; END IF;
  IF shipment.status<>'booked' THEN RAISE EXCEPTION 'Only booked shipments can be assigned'; END IF;
  IF shipment.requested_vehicle_type_id IS NULL OR shipment.weight_kg IS NULL OR shipment.weight_kg<=0 THEN
    RETURN NULL;
  END IF;
  SELECT t.id AS truck_id, d.id AS driver_id INTO candidate
  FROM public.trucks t
  JOIN public.drivers d ON (t.assigned_driver_id IS NULL OR t.assigned_driver_id = d.id)
  WHERE t.status = 'available' AND d.status = 'available'
    AND t.vehicle_type_id = shipment.requested_vehicle_type_id
    AND t.capacity_kg >= shipment.weight_kg
    AND (shipment.booking_source <> 'mobile' OR EXISTS(SELECT 1 FROM public.users u WHERE u.id=d.user_id AND u.is_active AND u.role='driver'))
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_records m WHERE m.truck_id = t.id AND m.status = 'in_progress')
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.truck_id = t.id AND a.status IN ('assigned','loading','in_transit'))
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.driver_id = d.id AND a.status IN ('assigned','loading','in_transit'))
  ORDER BY (t.assigned_driver_id = d.id) DESC NULLS LAST, t.capacity_kg, t.id, d.id
  LIMIT 1
  FOR UPDATE OF t, d SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.deliveries (shipment_id, truck_id, driver_id, status, assigned_by)
    VALUES (shipment.id, candidate.truck_id, candidate.driver_id, 'assigned', auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO delivery_id;
  END IF;

  RETURN delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_shipment_resources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_shipment_resources(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_assign_booked_shipment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.status='booked' THEN
    PERFORM public.assign_shipment_resources(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_assign_booked_shipment() FROM PUBLIC;

