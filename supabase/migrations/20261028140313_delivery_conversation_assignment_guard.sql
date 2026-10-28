-- Keep a stale office composer bound to its original driver even during concurrent reassignment.
GRANT INSERT(driver_id) ON public.delivery_messages TO authenticated;
CREATE OR REPLACE FUNCTION public.prepare_delivery_message() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=NEW.delivery_id;
 IF NOT FOUND OR public.get_user_role() NOT IN ('admin','staff','driver') OR public.get_user_role() IS NULL
 OR (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN
 RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 IF NEW.driver_id IS DISTINCT FROM d.driver_id THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 NEW.driver_id:=d.driver_id;NEW.sender_id:=auth.uid();NEW.sender_role:=public.get_user_role();
 NEW.body:=btrim(NEW.body);NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.send_delivery_message(p_delivery uuid,p_request uuid,p_body text,p_driver uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;m public.delivery_messages%ROWTYPE;
BEGIN
 -- Serialize retries before consulting the idempotency key. No identity or recipient from the caller.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 PERFORM public.delivery_conversation(p_delivery);
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF d.driver_id IS DISTINCT FROM p_driver THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 SELECT * INTO m FROM public.delivery_messages WHERE sender_id=auth.uid() AND request_id=p_request;
 IF FOUND THEN
 IF m.delivery_id<>p_delivery OR m.driver_id<>d.driver_id OR m.body IS DISTINCT FROM btrim(p_body) THEN RAISE EXCEPTION 'MESSAGE_RETRY_MISMATCH';END IF;
 ELSE
 INSERT INTO public.delivery_messages(delivery_id,driver_id,request_id,body) VALUES(p_delivery,p_driver,p_request,p_body) RETURNING * INTO m;
 END IF;
 RETURN jsonb_build_object('id',m.id::text,'sender_id',m.sender_id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at);
END $$;
