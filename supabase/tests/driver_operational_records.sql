-- Fictional fixtures and all effects roll back. Run after driver_operational_records.sql.
BEGIN;
DO $$
DECLARE driver_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); customer_user uuid:=gen_random_uuid();
 driver uuid; other_driver uuid; customer uuid; vehicle uuid; truck uuid; other_truck uuid;
 shipment uuid; delivery uuid; first_delivery uuid; first_shipment uuid; request uuid:=gen_random_uuid(); result jsonb; again jsonb;
 marker text:='operations-test-'||gen_random_uuid(); i integer; start_at timestamptz;
BEGIN
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 (driver_user,marker||'-driver@example.invalid','{}','{}'),(other_user,marker||'-other@example.invalid','{}','{}'),(customer_user,marker||'-customer@example.invalid','{}','{}');
 UPDATE public.users SET role='driver' WHERE id IN (driver_user,other_user);
 SELECT id INTO customer FROM public.customers WHERE user_id=customer_user;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(driver_user,marker,marker) RETURNING id INTO driver;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(other_user,marker||'-other',marker||'-other') RETURNING id INTO other_driver;
 INSERT INTO public.vehicle_types(name,default_capacity_kg) VALUES(marker,1000) RETURNING id INTO vehicle;
 INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg) VALUES(marker,vehicle,1000) RETURNING id INTO truck;
 INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg) VALUES(marker||'-other',vehicle,1000) RETURNING id INTO other_truck;
 start_at:=date_trunc('month',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
 FOR i IN 1..225 LOOP
  INSERT INTO public.shipments(customer_id,status,pickup_address,dropoff_address,scheduled_departure,estimated_arrival)
   VALUES(customer,'completed',marker,marker,start_at+interval '1 hour',start_at+interval '3 hours') RETURNING id INTO shipment;
  INSERT INTO public.deliveries(shipment_id,driver_id,truck_id,status,assigned_at,arrived_at,driver_allowance)
   VALUES(shipment,driver,truck,'delivered',start_at+interval '30 minutes',start_at+interval '2 hours',100) RETURNING id INTO delivery;
  IF i=1 THEN first_delivery:=delivery;first_shipment:=shipment; END IF;
 END LOOP;
 -- A previous-period record exactly before the Philippine month boundary.
 INSERT INTO public.shipments(customer_id,status,pickup_address,dropoff_address,scheduled_departure,cancelled_at)
  VALUES(customer,'cancelled',marker,marker,start_at-interval '1 second',now()) RETURNING id INTO shipment;
 INSERT INTO public.deliveries(shipment_id,driver_id,truck_id,status) VALUES(shipment,driver,truck,'cancelled');
 PERFORM set_config('request.jwt.claim.sub',driver_user::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver_user,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.mobile_driver_history('This month',0,50);
 IF (result->>'total')::integer<>225 OR jsonb_array_length(result->'shipments')<>50 OR jsonb_array_length(result->'driver_deliveries')<>50 OR (result->>'completed')::integer<>225 OR (result->>'allowance_total')::numeric<>22500 OR (result->>'on_time_count')::integer<>225 THEN RAISE EXCEPTION 'Incomplete period aggregate: %',result-'shipments'-'driver_deliveries'; END IF;
 again:=public.mobile_driver_history('This month',200,50);
 IF result->>'revision' IS NULL OR result->>'revision' IS DISTINCT FROM again->>'revision' THEN RAISE EXCEPTION 'Stable history revision missing'; END IF;
 IF jsonb_array_length(again->'shipments')<>25 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'shipments')a JOIN jsonb_array_elements(again->'shipments')b ON a->>'id'=b->>'id') THEN RAISE EXCEPTION 'History page overlap or truncation'; END IF;
 IF (public.mobile_driver_history('Last month')->>'total')::integer<>1 OR (public.mobile_driver_history('All records')->>'total')::integer<>226 THEN RAISE EXCEPTION 'Period boundary wrong'; END IF;
 EXECUTE 'RESET ROLE';
 UPDATE public.shipments SET driver_notes='Changed while paging' WHERE id=first_shipment;
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF result->>'revision' IS NOT DISTINCT FROM public.mobile_driver_history('This month',50,50)->>'revision' THEN RAISE EXCEPTION 'History changes invisible across pages'; END IF;
 result:=public.mobile_driver_log_fuel(request,first_delivery,10.25,66.78,12000.1,'Station');
 IF (result->>'total_cost')::numeric<>684.50 OR result->>'truck_id'<>truck::text THEN RAISE EXCEPTION 'Wrong fuel totals/vehicle'; END IF;
 again:=public.mobile_driver_log_fuel(request,first_delivery,10.25,66.78,12000.1,'Station');
 IF again->>'id'<>result->>'id' OR (SELECT count(*) FROM public.fuel_logs WHERE id=request)<>1 THEN RAISE EXCEPTION 'Fuel replay duplicated'; END IF;
 IF jsonb_array_length(public.mobile_driver_fuel_history(first_shipment))<>1 THEN RAISE EXCEPTION 'Fuel history not connected'; END IF;
 BEGIN PERFORM public.mobile_driver_log_fuel(request,first_delivery,11,66.78,12000.1,'Station');RAISE EXCEPTION 'Changed replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FUEL_REQUEST_CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mobile_driver_log_fuel(gen_random_uuid(),first_delivery,1.234,66,12000,'');RAISE EXCEPTION 'Unsupported precision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FUEL_RECORD' THEN RAISE;END IF;END;
 BEGIN INSERT INTO public.fuel_logs(delivery_id,driver_id,truck_id,liters,price_per_liter,total_cost,odometer_km) VALUES(first_delivery,driver,other_truck,1,60,60,1000);RAISE EXCEPTION 'Wrong truck accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF (public.mobile_driver_history('All records')->>'total')::integer<>0 THEN RAISE EXCEPTION 'Other driver history leaked'; END IF;
 BEGIN PERFORM public.mobile_driver_log_fuel(gen_random_uuid(),first_delivery,1,60,1000,'');RAISE EXCEPTION 'Other driver fuel accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.fuel_logs WHERE id=request) THEN RAISE EXCEPTION 'Other driver fuel leaked'; END IF;
 IF jsonb_array_length(public.mobile_driver_fuel_history(first_shipment))<>0 THEN RAISE EXCEPTION 'Other driver fuel history leaked'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE public.users SET is_active=false WHERE id=driver_user;
 PERFORM set_config('request.jwt.claim.sub',driver_user::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver_user,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.mobile_driver_history('All records');RAISE EXCEPTION 'Inactive driver read history';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.mobile_driver_log_fuel(gen_random_uuid(),first_delivery,1,60,1000,'');RAISE EXCEPTION 'Inactive driver fuel accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 RAISE NOTICE 'PASS: 225-trip aggregates/paging, Philippine month boundary, own-driver isolation, fuel precision/total/idempotency/truck and active-role checks';
END $$;
ROLLBACK;
