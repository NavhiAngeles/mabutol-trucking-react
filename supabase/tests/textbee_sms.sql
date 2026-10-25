BEGIN;
DO $$
DECLARE first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); shipment uuid; claimed integer;
BEGIN
 INSERT INTO auth.users(id,phone,raw_app_meta_data,raw_user_meta_data) VALUES
 (first_id,'639999000001','{}','{"full_name":"SMS rollback fixture","role":"admin"}'),
 (second_id,'639999000002','{}','{"full_name":"SMS rollback fixture 2"}');
 IF (SELECT count(*) FROM public.users WHERE id IN (first_id,second_id) AND email IS NULL AND role='customer')<>2 THEN
  RAISE EXCEPTION 'Phone-only signup null-email or role isolation failed';
 END IF;
 IF (SELECT phone FROM public.users WHERE id=first_id)<>'+639999000001' THEN RAISE EXCEPTION 'Auth phone propagation failed'; END IF;
 IF has_table_privilege('authenticated','public.sms_outbox','SELECT') OR
 has_function_privilege('authenticated','public.claim_textbee_shipments()','EXECUTE') THEN RAISE EXCEPTION 'SMS queue exposed'; END IF;
 IF has_function_privilege('anon','public.notify_user(uuid,public.notification_type,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Arbitrary notification API exposed'; END IF;
 PERFORM public.notify_user(first_id,'shipment_status','Rollback in-app fixture');
 IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE user_id=first_id AND title='Rollback in-app fixture') THEN RAISE EXCEPTION 'In-app regression'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_outbox WHERE user_id=first_id) THEN RAISE EXCEPTION 'Unverified or non-opted-in phone queued'; END IF;
 INSERT INTO public.shipments(customer_id,tracking_number,status,pickup_address,dropoff_address)
 SELECT c.id,'SMS-ROLLBACK-'||gen_random_uuid()::text,'pending','Rollback pickup','Rollback destination' FROM public.customers c WHERE c.user_id=first_id RETURNING id INTO shipment;
 INSERT INTO public.notification_preferences(user_id,type,channel,enabled) VALUES(first_id,'shipment_status','sms',true),(first_id,'shipment_status','in_app',false);
 PERFORM public.notify_user(first_id,'shipment_status','Unverified fixture',NULL,shipment);
 IF EXISTS(SELECT 1 FROM public.sms_outbox WHERE user_id=first_id) THEN RAISE EXCEPTION 'Unverified phone queued'; END IF;
 UPDATE auth.users SET phone_confirmed_at=now() WHERE id=first_id;
 PERFORM public.notify_user(first_id,'shipment_status','Verified fixture',NULL,shipment);
 PERFORM public.notify_user(first_id,'shipment_status','Rapid duplicate fixture',NULL,shipment);
 IF (SELECT count(*) FROM public.sms_outbox WHERE user_id=first_id)<>1 THEN RAISE EXCEPTION 'Opt-in generation/dedup failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE user_id=first_id AND title='Verified fixture') THEN RAISE EXCEPTION 'SMS bypassed disabled in-app preference'; END IF;
 SELECT count(*) INTO claimed FROM public.claim_textbee_shipments() q WHERE q.phone='+639999000001';
 IF claimed<>1 THEN RAISE EXCEPTION 'Eligible worker claim failed'; END IF;
 SELECT count(*) INTO claimed FROM public.claim_textbee_shipments() q WHERE q.phone='+639999000001';
 IF claimed<>0 THEN RAISE EXCEPTION 'Worker reservation can resend'; END IF;
 UPDATE public.sms_outbox SET state='pending' WHERE user_id=first_id;
 UPDATE public.notification_preferences SET enabled=false WHERE user_id=first_id AND channel='sms';
 PERFORM public.claim_textbee_shipments();
 IF EXISTS(SELECT 1 FROM public.sms_outbox WHERE user_id=first_id AND state<>'skipped') THEN RAISE EXCEPTION 'Send-time opt-out not respected'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: phone-only signup, role isolation, private queue, verified opt-in, channel independence, dedup, claim reservation and opt-out; all rolled back' AS result;
