-- Driver operational records. Invoker functions retain existing row-level security.
CREATE OR REPLACE FUNCTION public.mobile_driver_history(p_period text DEFAULT 'This month', p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; start_at timestamptz; end_at timestamptz; driver uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN
  RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';
 END IF;
 driver:=public.my_driver_id();
 IF driver IS NULL THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR p_period NOT IN ('This month','Last month','All records') OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_HISTORY_QUERY'; END IF;
 IF p_period<>'All records' THEN
  start_at:=(date_trunc('month',now() AT TIME ZONE 'Asia/Manila') - CASE WHEN p_period='Last month' THEN interval '1 month' ELSE interval '0' END) AT TIME ZONE 'Asia/Manila';
  end_at:=((start_at AT TIME ZONE 'Asia/Manila')+interval '1 month') AT TIME ZONE 'Asia/Manila';
 END IF;
 WITH records AS MATERIALIZED (
  SELECT s.*,to_jsonb(d) AS own_delivery FROM public.shipments s
  JOIN LATERAL (SELECT * FROM public.deliveries WHERE shipment_id=s.id AND driver_id=driver ORDER BY assigned_at DESC,id DESC LIMIT 1)d ON true
  WHERE start_at IS NULL OR (coalesce(s.scheduled_departure,s.created_at)>=start_at AND coalesce(s.scheduled_departure,s.created_at)<end_at)
 ), page AS (
  SELECT * FROM records ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC OFFSET p_offset LIMIT p_limit
 )
 SELECT jsonb_build_object(
  'shipments',coalesce((SELECT jsonb_agg(to_jsonb(p)-'own_delivery' ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC) FROM page p),'[]'::jsonb),
  'driver_deliveries',coalesce((SELECT jsonb_agg(own_delivery ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC) FROM page),'[]'::jsonb),
  'total',count(*),'completed',count(*) FILTER(WHERE status='completed'),
  'allowance_missing',count(*) FILTER(WHERE status='completed' AND own_delivery->>'driver_allowance' IS NULL),
  'allowance_total',coalesce(sum((own_delivery->>'driver_allowance')::numeric) FILTER(WHERE status='completed'),0),
  'on_time_known',count(*) FILTER(WHERE status='completed' AND estimated_arrival IS NOT NULL AND own_delivery->>'arrived_at' IS NOT NULL),
  'on_time_count',count(*) FILTER(WHERE status='completed' AND (own_delivery->>'arrived_at')::timestamptz<=estimated_arrival),
  'period',p_period,'offset',p_offset,'limit',p_limit,'as_of',now()
 ) INTO result FROM records;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mobile_driver_history(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_history(text,integer,integer) TO authenticated;

-- Restrict the existing driver insert path; office policy remains unchanged.
ALTER POLICY "driver logs fuel" ON public.fuel_logs TO authenticated WITH CHECK (
 driver_id=public.my_driver_id()
 AND EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active)
 AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=public.my_driver_id() AND d.truck_id=fuel_logs.truck_id AND d.status IN ('assigned','loading','in_transit','delivered'))
 AND liters>0 AND liters<=10000 AND price_per_liter>0 AND price_per_liter<=10000
 AND odometer_km>=0 AND odometer_km<=10000000
 AND total_cost=round(liters*price_per_liter,2) AND total_cost<=1000000
 AND (station IS NULL OR length(station)<=200)
 AND receipt_path IS NULL
);

CREATE OR REPLACE FUNCTION public.mobile_driver_log_fuel(p_request uuid,p_delivery uuid,p_liters numeric,p_price numeric,p_odometer numeric,p_station text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries; existing public.fuel_logs; result public.fuel_logs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_delivery IS NULL OR p_liters IS NULL OR NOT(p_liters>0 AND p_liters<=10000) OR p_liters<>round(p_liters,2) OR p_price IS NULL OR NOT(p_price>0 AND p_price<=10000) OR p_price<>round(p_price,2) OR p_odometer IS NULL OR NOT(p_odometer>=0 AND p_odometer<=10000000) OR p_odometer<>round(p_odometer,1) OR length(coalesce(p_station,''))>200 OR round(p_liters*p_price,2)>1000000 THEN RAISE EXCEPTION 'INVALID_FUEL_RECORD'; END IF;
 -- Serialize retries for the same caller/request, including concurrent responses.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 SELECT * INTO existing FROM public.fuel_logs WHERE id=p_request;
 IF FOUND THEN
  IF existing.driver_id IS DISTINCT FROM public.my_driver_id() OR existing.delivery_id IS DISTINCT FROM p_delivery OR existing.liters IS DISTINCT FROM p_liters OR existing.price_per_liter IS DISTINCT FROM p_price OR existing.odometer_km IS DISTINCT FROM p_odometer OR existing.station IS DISTINCT FROM nullif(trim(p_station),'') THEN RAISE EXCEPTION 'FUEL_REQUEST_CONFLICT'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id();
 IF NOT FOUND OR d.status NOT IN ('assigned','loading','in_transit','delivered') THEN RAISE EXCEPTION 'DELIVERY_CLOSED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.fuel_logs(id,delivery_id,driver_id,truck_id,liters,price_per_liter,total_cost,odometer_km,station)
 VALUES(p_request,d.id,d.driver_id,d.truck_id,p_liters,p_price,round(p_liters*p_price,2),p_odometer,nullif(trim(p_station),'')) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.mobile_driver_log_fuel(uuid,uuid,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_log_fuel(uuid,uuid,numeric,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_driver_fuel_history(p_shipment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.logged_at DESC,f.id DESC),'[]'::jsonb) INTO result
 FROM public.fuel_logs f JOIN public.deliveries d ON d.id=f.delivery_id
 WHERE d.shipment_id=p_shipment AND d.driver_id=public.my_driver_id() AND f.driver_id=public.my_driver_id();
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mobile_driver_fuel_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_fuel_history(uuid) TO authenticated;
