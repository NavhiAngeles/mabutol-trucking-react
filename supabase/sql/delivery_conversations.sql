-- Delivery/driver scoped office conversation; legacy direct messages are untouched.
CREATE TABLE public.delivery_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id),
 driver_id uuid NOT NULL REFERENCES public.drivers(id),
 sender_id uuid NOT NULL REFERENCES public.users(id),
 sender_role text NOT NULL CHECK(sender_role IN ('admin','staff','driver')),
 request_id uuid NOT NULL, body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sender_id,request_id)
);
CREATE INDEX delivery_messages_thread_idx ON public.delivery_messages(delivery_id,driver_id,id DESC);
CREATE INDEX delivery_messages_driver_idx ON public.delivery_messages(driver_id);
CREATE TABLE public.delivery_message_reads (
 message_id bigint NOT NULL REFERENCES public.delivery_messages(id),
 user_id uuid NOT NULL REFERENCES public.users(id),
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,message_id)
);
CREATE INDEX delivery_message_reads_message_idx ON public.delivery_message_reads(message_id);
ALTER TABLE public.delivery_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_message_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_messages,public.delivery_message_reads FROM anon,authenticated;
GRANT SELECT ON public.delivery_messages,public.delivery_message_reads TO authenticated;
GRANT INSERT(delivery_id,driver_id,request_id,body) ON public.delivery_messages TO authenticated;
GRANT INSERT(message_id,user_id) ON public.delivery_message_reads TO authenticated;
GRANT USAGE ON SEQUENCE public.delivery_messages_id_seq TO authenticated;

CREATE POLICY "current delivery participants read messages" ON public.delivery_messages FOR SELECT TO authenticated USING (
 (SELECT public.get_user_role()) IN ('admin','staff','driver') AND EXISTS (
 SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=delivery_messages.driver_id
 AND ((SELECT public.get_user_role()) IN ('admin','staff') OR d.driver_id=(SELECT public.my_driver_id()))));
CREATE POLICY "current participants send as themselves" ON public.delivery_messages FOR INSERT TO authenticated WITH CHECK (
 sender_id=(SELECT auth.uid()) AND sender_role=(SELECT public.get_user_role()) AND EXISTS (
 SELECT 1 FROM public.deliveries d JOIN public.shipments s ON s.id=d.shipment_id
 WHERE d.id=delivery_id AND d.driver_id=delivery_messages.driver_id AND d.status IN ('assigned','loading','in_transit','delivered')
 AND s.status NOT IN ('completed','cancelled') AND ((SELECT public.get_user_role()) IN ('admin','staff') OR d.driver_id=(SELECT public.my_driver_id()))));
CREATE POLICY "own authorized message receipts" ON public.delivery_message_reads FOR SELECT TO authenticated USING (
 user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.delivery_messages m WHERE m.id=message_id));
CREATE POLICY "mark only received authorized messages" ON public.delivery_message_reads FOR INSERT TO authenticated WITH CHECK (
 user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.delivery_messages m WHERE m.id=message_id
 AND (m.sender_role='driver') IS DISTINCT FROM ((SELECT public.get_user_role())='driver')));

CREATE FUNCTION public.prepare_delivery_message() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
CREATE TRIGGER prepare_delivery_message BEFORE INSERT ON public.delivery_messages FOR EACH ROW EXECUTE FUNCTION public.prepare_delivery_message();

CREATE FUNCTION public.delivery_conversation(p_delivery uuid,p_before bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;page jsonb;oldest bigint;more boolean;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF NOT FOUND OR coalesce(public.get_user_role(),'') NOT IN ('admin','staff','driver') OR
 (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'sender_id',m.sender_id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at) ORDER BY m.id),'[]'),min(m.id) INTO page,oldest
 FROM (SELECT * FROM public.delivery_messages WHERE delivery_id=d.id AND driver_id=d.driver_id AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 50)m;
 SELECT EXISTS(SELECT 1 FROM public.delivery_messages WHERE delivery_id=d.id AND driver_id=d.driver_id AND id<oldest) INTO more;
 RETURN jsonb_build_object('delivery_id',d.id,'driver_id',d.driver_id,'messages',page,'has_more',more,
 'can_send',d.status IN ('assigned','loading','in_transit','delivered') AND EXISTS(SELECT 1 FROM public.shipments s WHERE s.id=d.shipment_id AND s.status NOT IN ('completed','cancelled')));
END $$;

CREATE FUNCTION public.send_delivery_message(p_delivery uuid,p_request uuid,p_body text,p_driver uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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

CREATE FUNCTION public.read_delivery_messages(p_delivery uuid,p_ids bigint[]) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM public.delivery_conversation(p_delivery);
 IF coalesce(cardinality(p_ids),0)>50 THEN RAISE EXCEPTION 'INVALID_MESSAGE_READ_BATCH';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids) i WHERE NOT EXISTS(SELECT 1 FROM public.delivery_messages m WHERE m.id=i AND m.delivery_id=p_delivery)) THEN RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO public.delivery_message_reads(message_id,user_id)
 SELECT id,auth.uid() FROM public.delivery_messages WHERE delivery_id=p_delivery AND id=ANY(p_ids)
 AND (sender_role='driver') IS DISTINCT FROM (public.get_user_role()='driver') ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION public.delivery_conversation_unread() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('delivery_id',delivery_id,'driver_id',driver_id,'tracking_number',tracking_number,'unread',unread)),'[]') FROM (
 SELECT m.delivery_id,m.driver_id,s.tracking_number,count(*) unread FROM public.delivery_messages m
 JOIN public.deliveries d ON d.id=m.delivery_id JOIN public.shipments s ON s.id=d.shipment_id
 WHERE (m.sender_role='driver') IS DISTINCT FROM (public.get_user_role()='driver')
 AND NOT EXISTS(SELECT 1 FROM public.delivery_message_reads r WHERE r.message_id=m.id AND r.user_id=auth.uid()) GROUP BY m.delivery_id,m.driver_id,s.tracking_number)t;
$$;
REVOKE ALL ON FUNCTION public.prepare_delivery_message(),public.delivery_conversation(uuid,bigint),public.send_delivery_message(uuid,uuid,text,uuid),public.read_delivery_messages(uuid,bigint[]),public.delivery_conversation_unread() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delivery_conversation(uuid,bigint),public.send_delivery_message(uuid,uuid,text,uuid),public.read_delivery_messages(uuid,bigint[]),public.delivery_conversation_unread() TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_messages;
