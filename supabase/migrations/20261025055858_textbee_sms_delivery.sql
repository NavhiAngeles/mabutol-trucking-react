-- Phone-only Auth accounts have no email; NULL preserves unique real emails.
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE assigned_role public.user_role := 'customer';
BEGIN
 IF coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role') IN ('admin','staff','driver') THEN
  assigned_role := coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role')::public.user_role;
 END IF;
 INSERT INTO public.users(id,email,full_name,phone,role)
 VALUES(new.id,nullif(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200),
  left(CASE WHEN nullif(new.phone,'') IS NOT NULL THEN '+'||ltrim(new.phone,'+') ELSE new.raw_user_meta_data->>'phone' END,30),assigned_role)
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=now();
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;

CREATE TABLE public.sms_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id),
 shipment_id uuid NOT NULL REFERENCES public.shipments(id),
 type public.notification_type NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','queued','failed','unknown','skipped')),
 created_at timestamptz NOT NULL DEFAULT now(), attempted_at timestamptz,
 provider_batch text
);
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sms_outbox TO service_role;
CREATE INDEX sms_outbox_pending ON public.sms_outbox(created_at) WHERE state='pending';

-- Existing in-app preferences remain independent. SMS requires explicit opt-in,
-- a verified Auth phone matching the current operational contact, and shipment access.
CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid,p_type public.notification_type,p_title text,p_body text DEFAULT NULL,p_shipment uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_user IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notification_preferences WHERE user_id=p_user AND type=p_type AND channel='in_app' AND NOT enabled) THEN
  INSERT INTO public.notifications(user_id,type,title,body,shipment_id) VALUES(p_user,p_type,p_title,p_body,p_shipment);
 END IF;
 IF p_shipment IS NOT NULL AND p_type::text IN ('shipment_status','delay')
 AND EXISTS(SELECT 1 FROM public.notification_preferences WHERE user_id=p_user AND type=p_type AND channel='sms' AND enabled)
 AND EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=p_user AND u.is_active
  AND a.phone_confirmed_at IS NOT NULL AND '+'||ltrim(a.phone,'+')=u.phone AND u.phone ~ '^\+639[0-9]{9}$') THEN
  -- Coalesce rapid duplicate updates; notification body stays inside Tanaw.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_shipment::text||p_type::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.sms_outbox WHERE user_id=p_user AND shipment_id=p_shipment AND type=p_type AND created_at>now()-interval '1 minute') THEN
   INSERT INTO public.sms_outbox(user_id,shipment_id,type) VALUES(p_user,p_shipment,p_type);
  END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.notify_user(uuid,public.notification_type,text,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_textbee_shipments()
RETURNS TABLE(id uuid,phone text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE remaining integer;
BEGIN
 -- One worker at a time; reserve <=20 shipment texts/day, leaving OTP headroom.
 PERFORM pg_advisory_xact_lock(625102520);
 UPDATE public.sms_outbox q SET state='skipped' WHERE q.state='pending' AND (q.created_at<now()-interval '1 day' OR NOT EXISTS(
  SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
  JOIN public.notification_preferences p ON p.user_id=u.id AND p.type=q.type AND p.channel='sms' AND p.enabled
  JOIN public.customers c ON c.user_id=u.id JOIN public.shipments s ON s.customer_id=c.id AND s.id=q.shipment_id
  WHERE u.id=q.user_id AND u.is_active AND c.is_active AND a.phone_confirmed_at IS NOT NULL
   AND '+'||ltrim(a.phone,'+')=u.phone AND u.phone ~ '^\+639[0-9]{9}$'));
 SELECT greatest(0,20-count(*)) INTO remaining FROM public.sms_outbox WHERE attempted_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
 RETURN QUERY WITH selected AS (SELECT q.id FROM public.sms_outbox q WHERE q.state='pending' ORDER BY q.created_at LIMIT least(remaining,5) FOR UPDATE SKIP LOCKED),
 reserved AS (UPDATE public.sms_outbox q SET state='sending',attempted_at=now() FROM selected s WHERE q.id=s.id RETURNING q.id,q.user_id)
 SELECT r.id,u.phone FROM reserved r JOIN public.users u ON u.id=r.user_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_textbee_shipments() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_textbee_shipments() TO service_role;
