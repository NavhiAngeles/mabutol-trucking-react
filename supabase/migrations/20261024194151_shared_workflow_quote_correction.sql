CREATE OR REPLACE FUNCTION public.office_prepare_quote(p_shipment uuid,p_expected timestamptz,p_data jsonb)
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
 pricing_rate_id=rate.id,quoted_amount=charge,override_amount=NULL,override_reason=NULL,
 estimated_arrival=scheduled_departure+minutes*interval '1 minute' WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.shipment_events(shipment_id,event_type,actor_id,meta) VALUES(s.id,'office_quoted',auth.uid(),jsonb_build_object('source',s.route_source,'amount',charge));
 RETURN jsonb_build_object('id',s.id,'updated_at',s.updated_at,'quoted_amount',charge);
END $$;