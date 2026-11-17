-- Fictional fixtures only. Run after office_cancel_shipment migration; every write rolls back.
BEGIN;
DO $fixtures$
DECLARE actor uuid; office uuid; role_name text; marker text:='cancel-test-'||gen_random_uuid();
BEGIN
 FOREACH role_name IN ARRAY ARRAY['admin','staff','customer','driver','inactive'] LOOP
  actor:=gen_random_uuid();
  INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  VALUES(actor,marker||'-'||role_name||'@example.invalid','{}','{}');
  UPDATE public.users SET role=(CASE WHEN role_name='inactive' THEN 'staff' ELSE role_name END)::public.user_role,
   is_active=role_name<>'inactive' WHERE id=actor;
  PERFORM set_config('test.cancel_'||role_name,actor::text,true);
  IF role_name='admin' THEN office:=actor; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',office::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);
END $fixtures$;

CREATE FUNCTION pg_temp.expect_cancel_failure(s uuid,v timestamptz,d uuid,reason text,ack boolean,pattern text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  PERFORM public.office_cancel_shipment(s,v,d,reason,ack);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE pattern THEN RAISE; END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'Expected cancellation rejection: %',pattern;
END $$;

SET LOCAL ROLE authenticated;
DO $tests$
DECLARE customer uuid; vehicle uuid; driver uuid; truck uuid; s uuid; d uuid; v timestamptz;
 result jsonb; original_payments jsonb; original_ship jsonb; original_delivery jsonb;
 marker text:='cancel-fixture-'||gen_random_uuid(); state text; key text; actor text; office uuid:=current_setting('test.cancel_admin')::uuid;
BEGIN
 INSERT INTO public.customers(name,customer_code) VALUES(marker,marker) RETURNING id INTO customer;
 INSERT INTO public.vehicle_types(name,default_capacity_kg) VALUES(marker,4000) RETURNING id INTO vehicle;
 INSERT INTO public.drivers(full_name,license_number) VALUES(marker,marker) RETURNING id INTO driver;
 INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,assigned_driver_id)
 VALUES(marker,vehicle,4000,driver) RETURNING id INTO truck;

 -- Both office roles; all supported sources; pending and booked do not need an assignment.
 FOREACH actor IN ARRAY ARRAY['admin','staff'] LOOP
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.cancel_'||actor),true);
  FOREACH state IN ARRAY ARRAY['pending','booked'] LOOP
   INSERT INTO public.shipments(customer_id,pickup_address,dropoff_address,status,booking_source,quoted_amount)
   VALUES(customer,'Fictional pickup','Fictional dropoff','pending','mobile',2500) RETURNING id INTO s;
   UPDATE public.shipments SET status=state::public.shipment_status WHERE id=s RETURNING updated_at INTO v;
   PERFORM pg_temp.expect_cancel_failure(s,v-interval '1 second',NULL,'Customer requested',true,'Shipment changed%');
   PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'    ',true,'Enter a cancellation reason%');
   PERFORM pg_temp.expect_cancel_failure(s,v,NULL,repeat('x',1001),true,'Enter a cancellation reason%');
   PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'Customer requested',NULL,'Acknowledge%');
   result:=public.office_cancel_shipment(s,v,NULL,'Customer requested',true);
   IF result->>'status'<>'cancelled' OR result->>'cancelled_at' IS NULL THEN RAISE EXCEPTION 'Cancellation not confirmed'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.shipment_events WHERE shipment_id=s AND event_type='shipment_cancelled' AND actor_id=auth.uid() AND meta->>'reason'='Customer requested') THEN RAISE EXCEPTION 'Missing reason/actor audit'; END IF;
   SELECT updated_at INTO v FROM public.shipments WHERE id=s;
   PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'Retry cancellation',true,'Only pending%');
   IF (SELECT count(*) FROM public.shipment_events WHERE shipment_id=s AND event_type='shipment_cancelled')<>1 THEN RAISE EXCEPTION 'Duplicate cancellation event'; END IF;
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',office::text,true);

 -- Deny non-office and inactive actors without changing a shipment.
 INSERT INTO public.shipments(customer_id,pickup_address,dropoff_address,status)
 VALUES(customer,'Fictional pickup','Fictional dropoff','pending') RETURNING id,updated_at INTO s,v;
 FOREACH actor IN ARRAY ARRAY['customer','driver','inactive'] LOOP
  PERFORM set_config('request.jwt.claim.sub',current_setting('test.cancel_'||actor),true);
  PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'Customer requested',true,'Only active admin or staff%');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'Customer requested',true,'Only active admin or staff%');
 PERFORM set_config('request.jwt.claim.sub',office::text,true);
 IF (SELECT status FROM public.shipments WHERE id=s)<>'pending' THEN RAISE EXCEPTION 'Unauthorized state change'; END IF;

 -- Active/later shipment states cannot bypass their own operational/review workflow.
 FOREACH state IN ARRAY ARRAY['loading','in_transit','delayed','review','completed','cancelled'] LOOP
  UPDATE public.shipments SET status=state::public.shipment_status,cancelled_at=CASE WHEN state='cancelled' THEN now() END WHERE id=s RETURNING updated_at INTO v;
  PERFORM pg_temp.expect_cancel_failure(s,v,NULL,'Customer requested',true,'Only pending%');
 END LOOP;

 INSERT INTO public.shipments(customer_id,pickup_address,dropoff_address,status,requested_vehicle_type_id,weight_kg,quoted_amount,override_amount,override_reason,driver_notes)
 VALUES(customer,'Fictional pickup','Fictional dropoff','pending',vehicle,3000,2500,2400,'Approved test override','Retain instructions') RETURNING id INTO s;
 INSERT INTO public.deliveries(shipment_id,driver_id,truck_id,status,assigned_by)
 VALUES(s,driver,truck,'assigned',office) RETURNING id INTO d;
 SELECT updated_at INTO v FROM public.shipments WHERE id=s;
 PERFORM pg_temp.expect_cancel_failure(s,v,gen_random_uuid(),'Customer requested',true,'Assignment changed%');
 -- Every milestone, including pickup/no-show markers, independently locks general cancellation.
 FOREACH key IN ARRAY ARRAY['departed_at','route_started_at','pickup_arrived_at','customer_showed_at','grace_ends_at','auto_cancel_at'] LOOP
  EXECUTE format('UPDATE public.deliveries SET %I=now() WHERE id=$1',key) USING d;
  SELECT updated_at INTO v FROM public.shipments WHERE id=s;
  PERFORM pg_temp.expect_cancel_failure(s,v,d,'Customer requested',true,'Started trips cannot%');
  EXECUTE format('UPDATE public.deliveries SET %I=NULL WHERE id=$1',key) USING d;
 END LOOP;
 INSERT INTO public.payments(shipment_id,amount,status,created_by,verified_by,verified_at)
 SELECT s,100,status::public.payment_status,office,CASE WHEN status='verified' THEN office END,CASE WHEN status='verified' THEN now() END
 FROM unnest(ARRAY['pending','verified','rejected','refunded']) status;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO original_payments FROM public.payments p WHERE shipment_id=s;
 SELECT to_jsonb(row) INTO original_ship FROM public.shipments row WHERE id=s;
 SELECT to_jsonb(row) INTO original_delivery FROM public.deliveries row WHERE id=d;
 SELECT updated_at INTO v FROM public.shipments WHERE id=s;
 result:=public.office_cancel_shipment(s,v,d,'  Customer requested  ',true);
 IF result->>'financial_review_required'<>'true' THEN RAISE EXCEPTION 'Financial review not flagged'; END IF;
 IF original_payments IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payments p WHERE shipment_id=s) THEN RAISE EXCEPTION 'Payment ledger changed'; END IF;
 IF original_ship-'status'-'updated_at'-'cancelled_at'-'cancelled_reason' IS DISTINCT FROM
  (SELECT to_jsonb(row)-'status'-'updated_at'-'cancelled_at'-'cancelled_reason' FROM public.shipments row WHERE id=s) THEN RAISE EXCEPTION 'Shipment terms/charges changed'; END IF;
 IF original_delivery-'status'-'updated_at' IS DISTINCT FROM
  (SELECT to_jsonb(row)-'status'-'updated_at' FROM public.deliveries row WHERE id=d) THEN RAISE EXCEPTION 'Delivery history changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.deliveries WHERE id=d AND status<>'cancelled') THEN RAISE EXCEPTION 'Reservation not released'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shipment_events WHERE shipment_id=s AND event_type='shipment_cancelled' AND meta->>'payment_count_at_cancellation'='4') THEN RAISE EXCEPTION 'Missing finance audit'; END IF;
 -- A fresh assignment may reuse the same resources; the cancelled row remains for history.
 INSERT INTO public.shipments(customer_id,pickup_address,dropoff_address,status)
 VALUES(customer,'Fictional pickup','Fictional dropoff','pending') RETURNING id INTO s;
 INSERT INTO public.deliveries(shipment_id,driver_id,truck_id,status,assigned_by) VALUES(s,driver,truck,'assigned',office);
 IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE id=d AND status='cancelled') THEN RAISE EXCEPTION 'Historical assignment removed'; END IF;
 IF has_function_privilege('anon','public.office_cancel_shipment(uuid,timestamptz,uuid,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Anon execution permitted'; END IF;
 RAISE NOTICE 'SHIP-06 role, lifecycle, concurrency-version, finance, audit and reservation tests passed';
END $tests$;
ROLLBACK;
