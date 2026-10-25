-- All fictional fixture writes, settings and storage metadata roll back. No actual file upload.
BEGIN;
DO $fixtures$
DECLARE office uuid:=gen_random_uuid(); customer_user uuid:=gen_random_uuid(); driver_user uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 customer uuid; driver uuid; vehicle uuid; truck uuid; marker text:='shared-flow-'||gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 (office,marker||'-office@example.invalid','{}','{}'),(customer_user,marker||'-customer@example.invalid','{}','{}'),
 (driver_user,marker||'-driver@example.invalid','{}','{}'),(outsider,marker||'-other@example.invalid','{}','{}');
 UPDATE public.users SET role='admin' WHERE id=office;
 UPDATE public.users SET role='driver' WHERE id=driver_user;
 SELECT id INTO customer FROM public.customers WHERE user_id=customer_user;
 INSERT INTO public.vehicle_types(name,default_capacity_kg) VALUES(marker,1000) RETURNING id INTO vehicle;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(driver_user,marker,marker) RETURNING id INTO driver;
 INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,assigned_driver_id) VALUES(marker,vehicle,1000,driver) RETURNING id INTO truck;
 INSERT INTO public.pricing_rates(name,vehicle_type_id,per_km_rate,min_charge,effective_from) VALUES(marker,vehicle,10,2500,current_date-1);
 UPDATE public.system_settings SET value='"00:00"' WHERE key='operating_hours_start';
 UPDATE public.system_settings SET value='"23:59"' WHERE key='operating_hours_end';
 INSERT INTO public.system_settings(key,value) VALUES('minimum_booking_fee','2500'),('driver_allowance','0') ON CONFLICT(key) DO NOTHING;
 PERFORM set_config('test.office',office::text,true);PERFORM set_config('test.customer',customer_user::text,true);
 PERFORM set_config('test.driver',driver_user::text,true);PERFORM set_config('test.outsider',outsider::text,true);
 PERFORM set_config('test.vehicle',vehicle::text,true);
END $fixtures$;

DO $workflow$
DECLARE customer uuid:=current_setting('test.customer')::uuid; office uuid:=current_setting('test.office')::uuid;
 driver uuid:=current_setting('test.driver')::uuid; outsider uuid:=current_setting('test.outsider')::uuid;
 request uuid:=gen_random_uuid(); payload jsonb; result jsonb; shipment uuid; delivery uuid; version timestamptz;
 doc1 text;doc2 text; incident uuid:=gen_random_uuid(); sample uuid:=gen_random_uuid(); count_before int; next_shipment uuid;next_delivery uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',customer::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 payload:=jsonb_build_object('pickup','Fictional test pickup','dropoff','Fictional test destination','cargo','Test cargo','weight',500,
 'vehicle_id',current_setting('test.vehicle'),'departure',now()+interval '2 days','contact','+639000000001','notes','isolated rollback test',
 'pickup_lat',14.6,'pickup_lng',120.96,'dropoff_lat',14.65,'dropoff_lng',120.98,'handling','None');
 result:=public.mobile_create_request(request,payload);shipment:=(result->>'id')::uuid;
 IF public.mobile_create_request(request,payload)->>'id'<>shipment::text THEN RAISE EXCEPTION 'Replay duplicated request';END IF;
 BEGIN PERFORM public.mobile_create_request(request,payload||'{"pickup_lat":14.61}');RAISE EXCEPTION 'Changed replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REQUEST_ALREADY_SAVED_REFRESH' THEN RAISE;END IF;END;
 BEGIN PERFORM public.office_prepare_quote(shipment,now(),'{}');RAISE EXCEPTION 'Customer quoted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',office::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT updated_at INTO version FROM public.shipments WHERE id=shipment;
 BEGIN PERFORM public.office_prepare_quote(shipment,version-interval '1 second','{}');RAISE EXCEPTION 'Stale quote accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 result:=public.office_prepare_quote(shipment,version,jsonb_build_object('pickup_lat',14.6,'pickup_lng',120.96,'dropoff_lat',14.65,'dropoff_lng',120.98,'distance_km',10,'duration_minutes',30,'source','manual','reason','Checked fictional road route'));
 IF (result->>'quoted_amount')::numeric<2500 THEN RAISE EXCEPTION 'Minimum price ignored';END IF;
 result:=public.review_booking_request(shipment,(result->>'updated_at')::timestamptz,'approve');delivery:=(result->>'delivery_id')::uuid;
 IF result->>'status'<>'assigned' OR delivery IS NULL THEN RAISE EXCEPTION 'Approved mobile request not assigned';END IF;
 IF (SELECT driver_allowance FROM public.deliveries WHERE id=delivery) IS DISTINCT FROM (SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key='driver_allowance') THEN RAISE EXCEPTION 'Configured allowance ignored';END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.mobile_shipment_details(shipment);RAISE EXCEPTION 'Other customer read details';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.driver_confirm_cargo_loaded(delivery);RAISE EXCEPTION 'Skipped pickup';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_TRANSITION' THEN RAISE;END IF;END;
 BEGIN PERFORM public.driver_set_delivery_status(delivery,'delivered');RAISE EXCEPTION 'Legacy bypass available';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.driver_start_route(delivery);PERFORM public.driver_start_route(delivery);
 BEGIN PERFORM public.driver_arrive_at_pickup(delivery,15,121);RAISE EXCEPTION 'Far arrival accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ARRIVAL_TOO_FAR' THEN RAISE;END IF;END;
 PERFORM public.driver_record_position(delivery,sample,jsonb_build_object('lat',14.6,'lng',120.96,'accuracy',10,'recorded_at',now()));
 PERFORM public.driver_record_position(delivery,sample,jsonb_build_object('lat',14.6,'lng',120.96,'accuracy',10,'recorded_at',now()));
 IF (SELECT count(*) FROM public.tracking_logs WHERE client_sample_id=sample)<>1 THEN RAISE EXCEPTION 'GPS replay duplicated';END IF;
 PERFORM public.driver_arrive_at_pickup(delivery,14.6,120.96);
 PERFORM public.driver_confirm_customer_showed(delivery);PERFORM public.driver_confirm_cargo_loaded(delivery);
 PERFORM public.driver_report_incident(delivery,incident,'traffic','Fictional road delay',5);
 PERFORM public.driver_report_incident(delivery,incident,'traffic','Fictional road delay',5);
 BEGIN PERFORM public.driver_submit_pod(delivery,'Test Recipient',NULL,NULL);RAISE EXCEPTION 'Null proof accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_POD_FILE' THEN RAISE;END IF;END;
 doc1:=delivery||'/pod-photo-fixture.jpg';doc2:=delivery||'/signature-fixture.png';
 INSERT INTO storage.objects(bucket_id,name,owner,metadata) VALUES('delivery-documents',doc1,driver,'{"mimetype":"image/jpeg","size":100}'),('delivery-documents',doc2,driver,'{"mimetype":"image/png","size":100}');
 PERFORM public.driver_submit_pod(delivery,'Test Recipient',doc1,doc2);PERFORM public.driver_submit_pod(delivery,'Test Recipient',doc1,doc2);
 IF (SELECT count(*) FROM public.delivery_documents WHERE delivery_id=delivery)<>2 THEN RAISE EXCEPTION 'POD replay duplicated';END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',office::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT updated_at INTO version FROM public.deliveries WHERE id=delivery;
 BEGIN PERFORM public.office_delivery_action(delivery,version,'complete');RAISE EXCEPTION 'Unresolved incident completed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROOF_AND_INCIDENT_REVIEW_REQUIRED' THEN RAISE;END IF;END;
 PERFORM public.office_resolve_incident(incident,version,'Road delay resolved');
 SELECT updated_at INTO version FROM public.deliveries WHERE id=delivery;
 PERFORM public.office_delivery_action(delivery,version,'request_correction','Please capture a clearer delivery photo');
 -- A driver/truck may already be on its next trip while old proof is corrected.
 INSERT INTO public.shipments(customer_id,requested_vehicle_type_id,pickup_address,dropoff_address,cargo_description,weight_kg,distance_km,quoted_amount,scheduled_departure,status)
 SELECT customer_id,requested_vehicle_type_id,'Next fictional pickup','Next fictional destination','Next cargo',100,10,2500,now()+interval '3 days','booked' FROM public.shipments WHERE id=shipment RETURNING id INTO next_shipment;
 SELECT id INTO next_delivery FROM public.deliveries WHERE shipment_id=next_shipment;
 IF next_delivery IS NULL THEN RAISE EXCEPTION 'Next-trip fixture assignment missing';END IF;
 UPDATE public.deliveries SET route_started_at=now(),pickup_arrived_at=now(),customer_showed_at=now(),status='loading' WHERE id=next_delivery;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 doc1:=delivery||'/pod-photo-fixture-2.jpg';doc2:=delivery||'/signature-fixture-2.png';
 INSERT INTO storage.objects(bucket_id,name,owner,metadata) VALUES('delivery-documents',doc1,driver,'{"mimetype":"image/jpeg","size":100}'),('delivery-documents',doc2,driver,'{"mimetype":"image/png","size":100}');
 PERFORM public.driver_submit_pod(delivery,'Test Recipient',doc1,doc2);
 IF (SELECT count(*) FROM public.delivery_documents WHERE delivery_id=delivery)<>4 THEN RAISE EXCEPTION 'Proof history lost';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deliveries d JOIN public.trucks t ON t.id=d.truck_id JOIN public.drivers dr ON dr.id=d.driver_id WHERE d.id=next_delivery AND t.status='on_trip' AND dr.status='on_trip') THEN RAISE EXCEPTION 'Old proof correction released next trip resources';END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',office::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT updated_at INTO version FROM public.deliveries WHERE id=delivery;
 PERFORM public.office_delivery_action(delivery,version,'complete');
 IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=shipment AND status='completed' AND actual_delivery_at IS NOT NULL) THEN RAISE EXCEPTION 'Completion missing';END IF;
 UPDATE public.deliveries SET status='cancelled' WHERE id=next_delivery;
 UPDATE public.shipments SET status='cancelled',cancelled_reason='Rollback fixture cleanup' WHERE id=next_shipment;
 EXECUTE 'RESET ROLE';
 UPDATE public.users SET is_active=false WHERE id=driver;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.driver_start_route(delivery);RAISE EXCEPTION 'Inactive driver allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 IF has_function_privilege('anon','public.driver_submit_pod(uuid,text,text,text)','EXECUTE') OR has_function_privilege('anon','public.office_prepare_quote(uuid,timestamptz,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous command execution';END IF;
END $workflow$;
DO $no_show$
DECLARE customer uuid:=current_setting('test.customer')::uuid;office uuid:=current_setting('test.office')::uuid;driver uuid:=current_setting('test.driver')::uuid;
 result jsonb;shipment uuid;delivery uuid;version timestamptz;request uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('request.jwt.claim.sub',office::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);
 UPDATE public.users SET is_active=true WHERE id=driver;
 PERFORM set_config('request.jwt.claim.sub',customer::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.mobile_create_request(request,jsonb_build_object('pickup','Fictional test pickup','dropoff','Fictional test destination','cargo','Test cargo','weight',500,'vehicle_id',current_setting('test.vehicle'),'departure',now()+interval '2 days','contact','+639000000001','notes','rollback no-show test','pickup_lat',14.6,'pickup_lng',120.96,'dropoff_lat',14.65,'dropoff_lng',120.98));shipment:=(result->>'id')::uuid;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',office::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT updated_at INTO version FROM public.shipments WHERE id=shipment;
 result:=public.office_prepare_quote(shipment,version,jsonb_build_object('pickup_lat',14.6,'pickup_lng',120.96,'dropoff_lat',14.65,'dropoff_lng',120.98,'distance_km',10,'duration_minutes',30,'source','manual','reason','Fictional checked test route'));
 result:=public.review_booking_request(shipment,(result->>'updated_at')::timestamptz,'approve');delivery:=(result->>'delivery_id')::uuid;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',driver::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.driver_start_route(delivery);PERFORM public.driver_arrive_at_pickup(delivery,14.6,120.96);
 BEGIN PERFORM public.mobile_driver_action(delivery,'no_show');RAISE EXCEPTION 'Early no-show allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'WAIT_PERIOD_NOT_FINISHED' THEN RAISE;END IF;END;
 EXECUTE 'RESET ROLE';UPDATE public.deliveries SET assigned_at=now()-interval '40 minutes',route_started_at=now()-interval '35 minutes',pickup_arrived_at=now()-interval '31 minutes',grace_ends_at=now()-interval '16 minutes',auto_cancel_at=now()-interval '1 minute' WHERE id=delivery;
 PERFORM public.process_no_shows();IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE id=delivery AND status='assigned') THEN RAISE EXCEPTION 'Unattended cancellation occurred';END IF;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.mobile_driver_action(delivery,'no_show');PERFORM public.mobile_driver_action(delivery,'no_show');
 BEGIN PERFORM public.cancel_for_no_show(delivery);RAISE EXCEPTION 'Driver cancelled';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',office::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT updated_at INTO version FROM public.deliveries WHERE id=delivery;
 BEGIN PERFORM public.office_delivery_action(delivery,version-interval '1 second','cancel_no_show','Verified no-show');RAISE EXCEPTION 'Stale cancellation accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 PERFORM public.office_delivery_action(delivery,version,'cancel_no_show','Verified no-show after recorded wait');
 IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=shipment AND status='cancelled') OR NOT EXISTS(SELECT 1 FROM public.deliveries WHERE id=delivery AND status='cancelled') THEN RAISE EXCEPTION 'Office cancellation not synchronized';END IF;
 EXECUTE 'RESET ROLE';
END $no_show$;
ROLLBACK;
SELECT 'PASS: request/replay, server quote/stale versions, assignment, customer isolation, driver order/geofence, GPS dedup, incidents, proof/replay/correction history, completion, inactive/anon denial; early/repeated no-show, no automatic cancellation, stale/office cancellation; fixtures rolled back' result;
