-- Shared Dev mobile baseline. No existing records are removed or autoapproved.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE assigned_role public.user_role := 'customer';
BEGIN
  -- app metadata is server-managed; signup user metadata cannot grant a role.
  IF coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role') IN ('admin','staff','driver') THEN
    assigned_role := coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role')::public.user_role;
  END IF;
  INSERT INTO public.users(id,email,full_name,phone,role)
  VALUES(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200),
    left(new.raw_user_meta_data->>'phone',30),assigned_role)
  ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=now();
  RETURN new;
END $$;

-- Read-only invoker endpoint: existing RLS remains authoritative for each row.
CREATE OR REPLACE FUNCTION public.mobile_workspace()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE me public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE id=auth.uid() AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'profile',jsonb_build_object('id',me.id,'full_name',me.full_name,'email',me.email,'phone',me.phone,'role',me.role),
    'customer',(SELECT to_jsonb(c) FROM (SELECT id,name,phone,address,city FROM public.customers WHERE user_id=me.id LIMIT 1)c),
    'vehicles',coalesce((SELECT jsonb_agg(v ORDER BY v.name) FROM (SELECT id,name,default_capacity_kg FROM public.vehicle_types WHERE is_active)v),'[]'::jsonb),
    'shipments',coalesce((SELECT jsonb_agg(s ORDER BY s.created_at DESC) FROM
      (SELECT id,tracking_number,status,pickup_address,dropoff_address,cargo_description,weight_kg,special_handling,
        scheduled_departure,estimated_arrival,quoted_amount,final_amount,driver_notes,cancelled_reason,created_at,updated_at
       FROM public.shipments ORDER BY created_at DESC LIMIT 200)s),'[]'::jsonb),
    'deliveries',coalesce((SELECT jsonb_agg(d) FROM (SELECT id,shipment_id,status,assigned_at,departed_at,arrived_at,recipient_name,route_started_at,pickup_arrived_at,customer_showed_at FROM public.deliveries ORDER BY assigned_at DESC LIMIT 200)d),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(d) FROM (SELECT id,shipment_id,kind,file_name,recipient_name,created_at FROM public.delivery_documents ORDER BY created_at DESC LIMIT 200)d),'[]'::jsonb),
    'notifications',coalesce((SELECT jsonb_agg(n ORDER BY n.created_at DESC) FROM (SELECT id,title,body,shipment_id,read_at,created_at FROM public.notifications WHERE user_id=me.id ORDER BY created_at DESC LIMIT 100)n),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Narrow command endpoint: intentionally privileged to create only an owned pending
-- request, not a broad customer INSERT policy or client-selected prices/statuses.
CREATE OR REPLACE FUNCTION public.mobile_create_request(p_request_id uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE customer uuid; shipment public.shipments%ROWTYPE; vehicle public.vehicle_types%ROWTYPE;
  weight numeric; departure timestamptz; contact text; max_capacity numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role='customer') THEN
    RAISE EXCEPTION 'ACTIVE_CUSTOMER_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT id INTO customer FROM public.customers WHERE user_id=auth.uid() AND is_active;
  IF customer IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED'; END IF;
  IF p_request_id IS NULL OR p_data IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text,0));
  SELECT * INTO shipment FROM public.shipments WHERE customer_id=customer AND client_request_id=p_request_id;
  IF FOUND THEN
    IF shipment.pickup_address IS DISTINCT FROM btrim(p_data->>'pickup')
       OR shipment.dropoff_address IS DISTINCT FROM btrim(p_data->>'dropoff')
       OR shipment.cargo_description IS DISTINCT FROM btrim(p_data->>'cargo')
       OR shipment.weight_kg IS DISTINCT FROM (p_data->>'weight')::numeric
       OR shipment.requested_vehicle_type_id IS DISTINCT FROM (p_data->>'vehicle_id')::uuid
       OR shipment.scheduled_departure IS DISTINCT FROM (p_data->>'departure')::timestamptz
       OR shipment.driver_notes IS DISTINCT FROM 'Contact: '||(p_data->>'contact')||E'\n'||coalesce(p_data->>'notes','') THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
    RETURN jsonb_build_object('id',shipment.id,'tracking_number',shipment.tracking_number,'status',shipment.status);
  END IF;
  IF jsonb_typeof(p_data)<>'object' OR length(p_data::text)>10000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF length(btrim(coalesce(p_data->>'pickup','')))<5 OR length(p_data->>'pickup')>500
     OR length(btrim(coalesce(p_data->>'dropoff','')))<5 OR length(p_data->>'dropoff')>500
     OR lower(btrim(p_data->>'pickup'))=lower(btrim(p_data->>'dropoff'))
     OR length(btrim(coalesce(p_data->>'cargo','')))<3 OR length(p_data->>'cargo')>1000
     OR length(coalesce(p_data->>'notes',''))>2000 THEN RAISE EXCEPTION 'INVALID_BOOKING_DETAILS'; END IF;
  contact := p_data->>'contact';
  IF contact IS NULL OR contact !~ '^\+639[0-9]{9}$' THEN RAISE EXCEPTION 'INVALID_CONTACT'; END IF;
  weight := (p_data->>'weight')::numeric;
  IF weight IS NULL OR weight<=0 OR weight::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  SELECT * INTO vehicle FROM public.vehicle_types WHERE id=(p_data->>'vehicle_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_VEHICLE_TYPE'; END IF;
  SELECT max(capacity_kg) INTO max_capacity FROM public.trucks WHERE vehicle_type_id=vehicle.id;
  IF weight>coalesce(max_capacity,vehicle.default_capacity_kg,0) THEN RAISE EXCEPTION 'CAPACITY_EXCEEDED'; END IF;
  departure := (p_data->>'departure')::timestamptz;
  IF departure IS NULL OR departure<=now() OR departure>now()+interval '1 year' THEN RAISE EXCEPTION 'INVALID_DEPARTURE'; END IF;
  INSERT INTO public.shipments(customer_id,status,booking_source,cargo_description,weight_kg,
    requested_vehicle_type_id,pickup_address,dropoff_address,scheduled_departure,driver_notes,created_by,client_request_id)
  VALUES(customer,'pending','mobile',btrim(p_data->>'cargo'),weight,vehicle.id,btrim(p_data->>'pickup'),
    btrim(p_data->>'dropoff'),departure,'Contact: '||contact||E'\n'||coalesce(p_data->>'notes',''),auth.uid(),p_request_id)
  RETURNING * INTO shipment;
  RETURN jsonb_build_object('id',shipment.id,'tracking_number',shipment.tracking_number,'status',shipment.status);
END $$;

-- Atomic command, fixed editable field set, exact auth.uid ownership. Does not
-- change login email, role, activation or claim customer rows by matching email.
CREATE OR REPLACE FUNCTION public.mobile_save_profile(p_name text,p_phone text,p_address text,p_city text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 200 OR p_phone IS NULL OR p_phone !~ '^\+639[0-9]{9}$'
     OR length(coalesce(p_address,''))>500 OR length(coalesce(p_city,''))>100 THEN RAISE EXCEPTION 'INVALID_PROFILE'; END IF;
  UPDATE public.users SET full_name=btrim(p_name),phone=p_phone WHERE id=auth.uid();
  UPDATE public.customers SET name=btrim(p_name),phone=p_phone,address=btrim(p_address),city=btrim(p_city) WHERE user_id=auth.uid();
END $$;

-- Guarded wrapper preserves existing detailed driver RPC transition/geofence/POD
-- rules; this baseline exposes only route start and loaded-cargo progression.
CREATE OR REPLACE FUNCTION public.mobile_driver_action(p_delivery uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role='driver') THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_action='start' THEN PERFORM public.driver_start_route(p_delivery);
  ELSIF p_action='loaded' THEN PERFORM public.driver_confirm_cargo_loaded(p_delivery);
  ELSE RAISE EXCEPTION 'UNSUPPORTED_DRIVER_ACTION'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.mobile_workspace() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mobile_create_request(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mobile_save_profile(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mobile_driver_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_workspace(),public.mobile_create_request(uuid,jsonb),public.mobile_save_profile(text,text,text,text),public.mobile_driver_action(uuid,text) TO authenticated;

-- Exact-ID detail reads retain table RLS and require an active account.
CREATE INDEX IF NOT EXISTS delivery_documents_storage_path_idx ON public.delivery_documents(storage_path);
CREATE OR REPLACE FUNCTION public.mobile_shipment_details(p_shipment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=p_shipment) THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'shipment_id',p_shipment,
    'events',coalesce((SELECT jsonb_agg(e ORDER BY e.occurred_at) FROM
      (SELECT id,event_type,occurred_at FROM public.shipment_events WHERE shipment_id=p_shipment ORDER BY occurred_at DESC LIMIT 200)e),'[]'::jsonb),
    'history',coalesce((SELECT jsonb_agg(h ORDER BY h.created_at) FROM
      (SELECT id,from_status,to_status,note,created_at FROM public.shipment_status_history WHERE shipment_id=p_shipment ORDER BY created_at DESC LIMIT 200)h),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(d ORDER BY d.created_at) FROM
      (SELECT id,kind,storage_path,file_name,mime_type,recipient_name,created_at FROM public.delivery_documents
       WHERE shipment_id=p_shipment AND kind::text IN ('proof_of_delivery','signature') ORDER BY created_at DESC LIMIT 50)d),'[]'::jsonb),
    'position',(SELECT to_jsonb(p) FROM
      (SELECT l.latitude,l.longitude,l.accuracy_m,l.recorded_at FROM public.tracking_logs l
       JOIN public.deliveries d ON d.id=l.delivery_id WHERE d.shipment_id=p_shipment ORDER BY l.recorded_at DESC LIMIT 1)p)
  );
END $$;
REVOKE ALL ON FUNCTION public.mobile_shipment_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_shipment_details(uuid) TO authenticated;

-- Customers may read their own recorded photo and signature metadata.
CREATE POLICY "active customer recorded proof metadata" ON public.delivery_documents
FOR SELECT TO authenticated USING (
  kind::text IN ('proof_of_delivery','signature')
  AND EXISTS(SELECT 1 FROM public.users u JOIN public.customers c ON c.user_id=u.id
    JOIN public.shipments s ON s.customer_id=c.id
    WHERE u.id=(SELECT auth.uid()) AND u.is_active AND c.is_active AND s.id=shipment_id)
);

-- Restrictive legacy object policies must not OR around recorded-object checks.
DROP POLICY IF EXISTS "customers read own pod files" ON storage.objects;
DROP POLICY IF EXISTS "drivers read own delivery files" ON storage.objects;

-- The object must be an actual recorded proof visible under delivery_documents
-- RLS. No public URLs and no general office access to unrelated bucket objects.
CREATE POLICY "active accounts read recorded authorized proof"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='delivery-documents'
  AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid()) AND u.is_active)
  AND EXISTS(SELECT 1 FROM public.delivery_documents d WHERE d.storage_path=storage.objects.name
    AND d.kind::text IN ('proof_of_delivery','signature'))
);

-- Document INSERT permission alone must not let a driver attach a victim object's
-- path to an otherwise authorized shipment. Bind path, delivery, shipment and owner.
ALTER POLICY "active accounts read recorded authorized proof" ON storage.objects
USING (
  bucket_id='delivery-documents'
  AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid()) AND u.is_active)
  AND EXISTS(
    SELECT 1 FROM public.delivery_documents d
    JOIN public.deliveries delivery ON delivery.id=d.delivery_id AND delivery.shipment_id=d.shipment_id
    WHERE d.storage_path=storage.objects.name
      AND storage.objects.owner=d.uploaded_by
      AND (storage.foldername(storage.objects.name))[1]=delivery.id::text
      AND ((d.kind::text='proof_of_delivery' AND storage.filename(storage.objects.name) LIKE 'pod-photo-%')
        OR (d.kind::text='signature' AND storage.filename(storage.objects.name) LIKE 'signature-%'))
  )
);
