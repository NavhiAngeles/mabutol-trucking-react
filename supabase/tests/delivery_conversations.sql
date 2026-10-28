BEGIN;
DO $$
DECLARE office uuid:=gen_random_uuid();office2 uuid:=gen_random_uuid();du uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();cu uuid:=gen_random_uuid();
 customer uuid;driver uuid;other_driver uuid;vehicle uuid;truck uuid;shipment uuid;delivery uuid;other_delivery uuid;request uuid:=gen_random_uuid();
 marker text:='conversation-test-'||gen_random_uuid();sent jsonb;reply jsonb;page jsonb;initial_request uuid:=request;i integer;
BEGIN
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 (office,marker||'-office@example.invalid','{}','{}'),(office2,marker||'-office2@example.invalid','{}','{}'),
 (du,marker||'-driver@example.invalid','{}','{}'),(outsider,marker||'-other@example.invalid','{}','{}'),(cu,marker||'-customer@example.invalid','{}','{}');
 UPDATE public.users SET role='staff' WHERE id IN(office,office2);UPDATE public.users SET role='driver' WHERE id IN(du,outsider);
 SELECT id INTO customer FROM public.customers WHERE user_id=cu;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(du,marker,marker) RETURNING id INTO driver;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(outsider,marker||'-other',marker||'-other') RETURNING id INTO other_driver;
 INSERT INTO public.vehicle_types(name,default_capacity_kg) VALUES(marker,10000) RETURNING id INTO vehicle;
 INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg) VALUES(marker,vehicle,10000) RETURNING id INTO truck;
 INSERT INTO public.shipments(customer_id,status,pickup_address,dropoff_address,weight_kg) VALUES(customer,'assigned',marker,marker,100) RETURNING id INTO shipment;
 INSERT INTO public.deliveries(shipment_id,driver_id,truck_id,status) VALUES(shipment,driver,truck,'assigned') RETURNING id INTO delivery;
 PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 sent:=public.send_delivery_message(delivery,request,' Driver update ',driver);
 IF sent->>'body'<>'Driver update' OR sent->>'sender_id'<>du::text OR sent->>'sender_role'<>'driver' THEN RAISE EXCEPTION 'Sender/body mismatch';END IF;
 IF public.send_delivery_message(delivery,request,'Driver update',driver)->>'id'<>sent->>'id' THEN RAISE EXCEPTION 'Duplicate retry';END IF;
 BEGIN PERFORM public.send_delivery_message(delivery,request,'Different',driver);RAISE EXCEPTION 'Retry changed body';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MESSAGE_RETRY_MISMATCH' THEN RAISE;END IF;END;
 BEGIN PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'Old composer',other_driver);RAISE EXCEPTION 'Stale driver composer sent';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ASSIGNMENT_CHANGED_RELOAD' THEN RAISE;END IF;END;
 BEGIN INSERT INTO public.delivery_messages(delivery_id,driver_id,request_id,body) VALUES(delivery,other_driver,gen_random_uuid(),'Stale direct composer');RAISE EXCEPTION 'Trigger accepted stale driver';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ASSIGNMENT_CHANGED_RELOAD' THEN RAISE;END IF;END;
 BEGIN PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'  ',driver);RAISE EXCEPTION 'Blank accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM public.send_delivery_message(delivery,gen_random_uuid(),repeat('x',2001),driver);RAISE EXCEPTION 'Oversize accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE public.delivery_messages SET body='forged' WHERE id=(sent->>'id')::bigint;RAISE EXCEPTION 'Message edited';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.delivery_messages(delivery_id,request_id,body,sender_id) VALUES(delivery,gen_random_uuid(),'forged',office);RAISE EXCEPTION 'Sender forged';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',office::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF (public.delivery_conversation_unread()->0->>'unread')::int<>1 THEN RAISE EXCEPTION 'Office unread missing';END IF;
 page:=public.delivery_conversation(delivery);IF jsonb_array_length(page->'messages')<>1 THEN RAISE EXCEPTION 'Office cannot read driver';END IF;
 PERFORM public.read_delivery_messages(delivery,ARRAY[(sent->>'id')::bigint]);PERFORM public.read_delivery_messages(delivery,ARRAY[(sent->>'id')::bigint]);
 IF jsonb_array_length(public.delivery_conversation_unread())<>0 THEN RAISE EXCEPTION 'Read not cleared';END IF;
 reply:=public.send_delivery_message(delivery,gen_random_uuid(),'Office reply',driver);
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',office2::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office2,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF (public.delivery_conversation_unread()->0->>'unread')::int<>1 THEN RAISE EXCEPTION 'Another office receipt cleared';END IF;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF (public.delivery_conversation_unread()->0->>'unread')::int<>1 THEN RAISE EXCEPTION 'Driver unread reply missing';END IF;
 PERFORM public.read_delivery_messages(delivery,ARRAY[(reply->>'id')::bigint]);
 IF jsonb_array_length(public.delivery_conversation_unread())<>0 THEN RAISE EXCEPTION 'Driver read failed';END IF;
 -- A later arrival stays unread when an older displayed page is acknowledged again.
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',office::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'Later office arrival',driver);
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.read_delivery_messages(delivery,ARRAY[(reply->>'id')::bigint]);
 IF (public.delivery_conversation_unread()->0->>'unread')::int<>1 THEN RAISE EXCEPTION 'Unseen arrival marked read';END IF;
 BEGIN INSERT INTO public.delivery_message_reads(message_id,user_id) VALUES((reply->>'id')::bigint,office);RAISE EXCEPTION 'Another receipt forged';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- 121 further messages: latest/older pages complete, no implicit mark-all.
 FOR i IN 1..121 LOOP PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'Page message '||i,driver);END LOOP;
 page:=public.delivery_conversation(delivery);IF jsonb_array_length(page->'messages')<>50 OR NOT (page->>'has_more')::boolean THEN RAISE EXCEPTION 'First page';END IF;
 page:=public.delivery_conversation(delivery,(page->'messages'->0->>'id')::bigint);IF jsonb_array_length(page->'messages')<>50 THEN RAISE EXCEPTION 'Second page';END IF;
 page:=public.delivery_conversation(delivery,(page->'messages'->0->>'id')::bigint);IF jsonb_array_length(page->'messages')<>24 OR (page->>'has_more')::boolean THEN RAISE EXCEPTION 'Final page';END IF;
 EXECUTE 'RESET ROLE';
 -- Unassigned driver and own customer are both denied despite knowing the delivery ID.
 FOREACH request IN ARRAY ARRAY[outsider,cu] LOOP
 PERFORM set_config('request.jwt.claim.sub',request::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',request,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.delivery_messages) THEN RAISE EXCEPTION 'Other account message leak';END IF;
 BEGIN PERFORM public.delivery_conversation(delivery);RAISE EXCEPTION 'Other account RPC leak';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'Unauthorized',driver);RAISE EXCEPTION 'Other account sent';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.read_delivery_messages(delivery,ARRAY[(sent->>'id')::bigint]);RAISE EXCEPTION 'Other account read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';END LOOP;
 UPDATE public.deliveries SET driver_id=other_driver WHERE id=delivery;
 PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.delivery_conversation(delivery);RAISE EXCEPTION 'Former driver reads';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',outsider::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF jsonb_array_length(public.delivery_conversation(delivery)->'messages')<>0 THEN RAISE EXCEPTION 'Replacement driver sees former conversation';END IF;
 EXECUTE 'RESET ROLE';UPDATE public.deliveries SET driver_id=driver,status='cancelled' WHERE id=delivery;
 PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF (public.delivery_conversation(delivery)->>'can_send')::boolean THEN RAISE EXCEPTION 'Closed writable';END IF;
 BEGIN PERFORM public.send_delivery_message(delivery,gen_random_uuid(),'Closed send',driver);RAISE EXCEPTION 'Closed sent';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- A confirmed earlier send can still be reconciled after closing.
 IF public.send_delivery_message(delivery,initial_request,'Driver update',driver)->>'id'<>sent->>'id' THEN RAISE EXCEPTION 'Closed retry duplicated';END IF;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);UPDATE public.users SET is_active=false WHERE id=du;
 PERFORM set_config('request.jwt.claim.sub',du::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',du,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.delivery_messages) THEN RAISE EXCEPTION 'Inactive account leak';END IF;
 BEGIN PERFORM public.delivery_conversation(delivery);RAISE EXCEPTION 'Inactive RPC leak';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);EXECUTE 'SET LOCAL ROLE anon';
 BEGIN PERFORM public.delivery_conversation(delivery);RAISE EXCEPTION 'Anon read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
SELECT 'PASS: two-way send/read/unread, per-office and exact displayed receipts, immutable identity/body, safe retries/stale composer guard, 124-message pagination, reassignment, closed/inactive/customer/other-driver/anonymous isolation; fixtures rolled back' result;
