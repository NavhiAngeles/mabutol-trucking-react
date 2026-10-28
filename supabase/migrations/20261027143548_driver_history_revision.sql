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
  'revision',md5(coalesce(string_agg(md5(to_jsonb(records)::text),',' ORDER BY id),'')),
  'period',p_period,'offset',p_offset,'limit',p_limit,'as_of',now()
 ) INTO result FROM records;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mobile_driver_history(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_driver_history(text,integer,integer) TO authenticated;

