-- No legacy backfill. Office confirmation is required per assigned truck/load.
CREATE TABLE public.delivery_route_plans (
 delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE,
 truck_id uuid NOT NULL REFERENCES public.trucks(id),
 version uuid NOT NULL DEFAULT gen_random_uuid(),
 pickup_lat numeric NOT NULL CHECK(pickup_lat BETWEEN -90 AND 90),pickup_lng numeric NOT NULL CHECK(pickup_lng BETWEEN -180 AND 180),
 dropoff_lat numeric NOT NULL CHECK(dropoff_lat BETWEEN -90 AND 90),dropoff_lng numeric NOT NULL CHECK(dropoff_lng BETWEEN -180 AND 180),
 profile jsonb NOT NULL,geometry jsonb NOT NULL,cargo_weight_kg numeric NOT NULL,distance_km numeric NOT NULL CHECK(distance_km>0),duration_minutes numeric NOT NULL CHECK(duration_minutes>0),
 confirmed_by uuid NOT NULL REFERENCES public.users(id),confirmed_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
 CHECK(pickup_lat<>dropoff_lat OR pickup_lng<>dropoff_lng)
);
CREATE INDEX delivery_route_plans_truck_idx ON public.delivery_route_plans(truck_id);
CREATE INDEX delivery_route_plans_actor_idx ON public.delivery_route_plans(confirmed_by);
CREATE TABLE public.delivery_route_eta (
 delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE,
 plan_version uuid NOT NULL,leg text NOT NULL CHECK(leg IN ('pickup','destination')),
 eta_at timestamptz NOT NULL,calculated_at timestamptz NOT NULL,position_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 duration_seconds numeric NOT NULL CHECK(duration_seconds>=0),distance_m numeric NOT NULL CHECK(distance_m>=0),
 CHECK(expires_at>calculated_at AND expires_at<=calculated_at+interval '2 minutes' AND expires_at<=position_at+interval '2 minutes')
);
ALTER TABLE public.delivery_route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_eta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_route_plans,public.delivery_route_eta FROM anon,authenticated;
GRANT SELECT ON public.delivery_route_plans,public.delivery_route_eta TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.delivery_route_plans,public.delivery_route_eta TO service_role;
CREATE POLICY "authorized delivery route plan" ON public.delivery_route_plans FOR SELECT TO authenticated USING (
 public.get_user_role() IN ('admin','staff') OR (public.get_user_role()='driver' AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=public.my_driver_id())));
CREATE POLICY "authorized delivery eta" ON public.delivery_route_eta FOR SELECT TO authenticated USING (
 public.get_user_role() IN ('admin','staff') OR (public.get_user_role()='driver' AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=public.my_driver_id())));

CREATE FUNCTION public.delivery_routing_context(p_delivery uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;
BEGIN
 IF coalesce(public.get_user_role(),'') NOT IN ('driver','admin','staff') THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF NOT FOUND OR (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('delivery',to_jsonb(d),'shipment',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'status',s.status,'pickup_lat',s.pickup_lat,'pickup_lng',s.pickup_lng,'dropoff_lat',s.dropoff_lat,'dropoff_lng',s.dropoff_lng,'route_geometry',s.route_geometry,'weight_kg',s.weight_kg),
 'plan',(SELECT to_jsonb(p) FROM public.delivery_route_plans p WHERE delivery_id=d.id),
 'eta',(SELECT to_jsonb(e) FROM public.delivery_route_eta e WHERE delivery_id=d.id),
 'position',(SELECT to_jsonb(p) FROM (SELECT latitude,longitude,accuracy_m,recorded_at FROM public.tracking_logs WHERE delivery_id=d.id ORDER BY recorded_at DESC,id DESC LIMIT 1)p));
END $$;

-- Only the authenticated Edge handler's service client may persist provider results.
CREATE FUNCTION public.store_confirmed_delivery_route(p_actor uuid,p_delivery uuid,p_expected timestamptz,p_shipment_expected timestamptz,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;profile jsonb:=p_data->'profile';key text;value numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND is_active AND role IN ('admin','staff')) THEN RAISE EXCEPTION 'OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR d.updated_at IS DISTINCT FROM p_expected OR d.status NOT IN ('assigned','loading','in_transit') THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.updated_at IS DISTINCT FROM p_shipment_expected OR s.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'SHIPMENT_CHANGED_RELOAD';END IF;
 IF p_data->>'truck_id' IS DISTINCT FROM d.truck_id::text OR p_data->>'confirmed' IS DISTINCT FROM 'true' OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'OFFICE_CONFIRMATION_REQUIRED';END IF;
 FOREACH key IN ARRAY ARRAY['height','width','length','weight','axleload'] LOOP
  value:=(profile->>key)::numeric;
  IF value IS NULL OR NOT(value>0 AND value<=CASE key WHEN 'height' THEN 10 WHEN 'width' THEN 10 WHEN 'length' THEN 50 WHEN 'weight' THEN 200 ELSE 100 END) THEN RAISE EXCEPTION 'VERIFIED_TRUCK_PROFILE_REQUIRED';END IF;
 END LOOP;
 IF jsonb_typeof(profile->'hazmat') IS DISTINCT FROM 'boolean' OR (profile->>'axleload')::numeric>(profile->>'weight')::numeric OR (profile->>'weight')::numeric*1000<=coalesce(s.weight_kg,0) THEN RAISE EXCEPTION 'INVALID_LOADED_TRUCK_WEIGHT';END IF;
 IF coalesce(p_data->'geometry'->>'type','')<>'FeatureCollection' OR jsonb_array_length(p_data->'geometry'->'features')<1 THEN RAISE EXCEPTION 'ROAD_GEOMETRY_REQUIRED';END IF;
 INSERT INTO public.delivery_route_plans(delivery_id,truck_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,profile,geometry,cargo_weight_kg,distance_km,duration_minutes,confirmed_by,reason)
 VALUES(d.id,d.truck_id,(p_data->>'pickup_lat')::numeric,(p_data->>'pickup_lng')::numeric,(p_data->>'dropoff_lat')::numeric,(p_data->>'dropoff_lng')::numeric,profile,p_data->'geometry',s.weight_kg,(p_data->>'distance_km')::numeric,(p_data->>'duration_minutes')::numeric,p_actor,btrim(p_data->>'reason'))
 ON CONFLICT(delivery_id) DO UPDATE SET truck_id=excluded.truck_id,version=gen_random_uuid(),pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,dropoff_lat=excluded.dropoff_lat,dropoff_lng=excluded.dropoff_lng,profile=excluded.profile,geometry=excluded.geometry,cargo_weight_kg=excluded.cargo_weight_kg,distance_km=excluded.distance_km,duration_minutes=excluded.duration_minutes,confirmed_by=excluded.confirmed_by,confirmed_at=now(),reason=excluded.reason;
 UPDATE public.shipments SET pickup_lat=(p_data->>'pickup_lat')::numeric,pickup_lng=(p_data->>'pickup_lng')::numeric,dropoff_lat=(p_data->>'dropoff_lat')::numeric,dropoff_lng=(p_data->>'dropoff_lng')::numeric,route_geometry=p_data->'geometry',distance_km=(p_data->>'distance_km')::numeric,route_duration_minutes=(p_data->>'duration_minutes')::numeric,route_source='provider',route_reason=btrim(p_data->>'reason') WHERE id=s.id;
 -- The promised/scheduled estimated_arrival and all prices are deliberately retained.
 DELETE FROM public.delivery_route_eta WHERE delivery_id=d.id;
 RETURN (SELECT to_jsonb(p) FROM public.delivery_route_plans p WHERE delivery_id=d.id);
END $$;

CREATE FUNCTION public.store_delivery_route_eta(p_actor uuid,p_delivery uuid,p_version uuid,p_leg text,p_position timestamptz,p_seconds numeric,p_distance numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;p public.delivery_route_plans%ROWTYPE;s public.shipments%ROWTYPE;sample public.tracking_logs%ROWTYPE;stamp timestamptz:=clock_timestamp();result public.delivery_route_eta%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_actor AND u.is_active AND (u.role IN ('admin','staff') OR (u.role='driver' AND EXISTS(SELECT 1 FROM public.drivers dr WHERE dr.id=d.driver_id AND dr.user_id=u.id AND dr.status<>'inactive')))) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.delivery_route_plans WHERE delivery_id=d.id;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id;
 SELECT * INTO sample FROM public.tracking_logs WHERE delivery_id=d.id ORDER BY recorded_at DESC,id DESC LIMIT 1;
 IF d.id IS NULL OR p.version IS DISTINCT FROM p_version OR p.truck_id IS DISTINCT FROM d.truck_id OR d.route_started_at IS NULL OR d.status NOT IN ('assigned','in_transit') OR s.status IN ('completed','cancelled')
 OR p_leg IS DISTINCT FROM (CASE WHEN d.status='in_transit' THEN 'destination' ELSE 'pickup' END) OR (p_leg='pickup' AND d.pickup_arrived_at IS NOT NULL)
 OR sample.recorded_at IS DISTINCT FROM p_position OR sample.recorded_at<stamp-interval '2 minutes' OR sample.recorded_at>stamp OR sample.accuracy_m>100 OR sample.accuracy_m IS NULL
 OR p.cargo_weight_kg IS DISTINCT FROM s.weight_kg OR p.pickup_lat IS DISTINCT FROM s.pickup_lat OR p.pickup_lng IS DISTINCT FROM s.pickup_lng OR p.dropoff_lat IS DISTINCT FROM s.dropoff_lat OR p.dropoff_lng IS DISTINCT FROM s.dropoff_lng OR p.geometry IS DISTINCT FROM s.route_geometry
 THEN RAISE EXCEPTION 'ETA_CONTEXT_CHANGED';END IF;
 IF p_seconds IS NULL OR p_distance IS NULL OR NOT(p_seconds BETWEEN 0 AND 604800 AND p_distance BETWEEN 0 AND 20000000) THEN RAISE EXCEPTION 'INVALID_ETA';END IF;
 INSERT INTO public.delivery_route_eta(delivery_id,plan_version,leg,eta_at,calculated_at,position_at,expires_at,duration_seconds,distance_m)
 VALUES(d.id,p.version,p_leg,stamp+p_seconds*interval '1 second',stamp,p_position,least(stamp+interval '2 minutes',p_position+interval '2 minutes'),p_seconds,p_distance)
 ON CONFLICT(delivery_id) DO UPDATE SET plan_version=excluded.plan_version,leg=excluded.leg,eta_at=excluded.eta_at,calculated_at=excluded.calculated_at,position_at=excluded.position_at,expires_at=excluded.expires_at,duration_seconds=excluded.duration_seconds,distance_m=excluded.distance_m RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.delivery_routing_context(uuid),public.store_confirmed_delivery_route(uuid,uuid,timestamptz,timestamptz,jsonb),public.store_delivery_route_eta(uuid,uuid,uuid,text,timestamptz,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_routing_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_confirmed_delivery_route(uuid,uuid,timestamptz,timestamptz,jsonb),public.store_delivery_route_eta(uuid,uuid,uuid,text,timestamptz,numeric,numeric) TO service_role;
