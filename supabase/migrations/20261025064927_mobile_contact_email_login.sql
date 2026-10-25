-- Public password-login endpoint uses this resolver only with server credentials.
-- No email/phone lookup is exposed to mobile or anonymous database callers.
CREATE TABLE public.mobile_email_login_limits (
 bucket text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL
);
ALTER TABLE public.mobile_email_login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_email_login_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.mobile_email_login_limits TO service_role;

CREATE FUNCTION public.resolve_mobile_login_email(p_email text)
RETURNS TABLE(phone text,limited boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE normalized text:=lower(btrim(p_email)); used integer; candidate text; matches integer;
BEGIN
 IF normalized IS NULL OR length(normalized) NOT BETWEEN 3 AND 254 THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
 -- Shared cap bounds enumeration and storage growth; per-address cap bounds guesses.
 INSERT INTO public.mobile_email_login_limits AS l VALUES('global',now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 attempts=CASE WHEN l.window_start<now()-interval '5 minutes' THEN 1 ELSE l.attempts+1 END,
 window_start=CASE WHEN l.window_start<now()-interval '5 minutes' THEN now() ELSE l.window_start END
 RETURNING attempts INTO used;
 IF used>300 THEN RETURN QUERY SELECT NULL::text,true; RETURN; END IF;
 INSERT INTO public.mobile_email_login_limits AS l VALUES(md5(normalized),now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 attempts=CASE WHEN l.window_start<now()-interval '5 minutes' THEN 1 ELSE l.attempts+1 END,
 window_start=CASE WHEN l.window_start<now()-interval '5 minutes' THEN now() ELSE l.window_start END
 RETURNING attempts INTO used;
 IF used>10 THEN RETURN QUERY SELECT NULL::text,true; RETURN; END IF;
 -- Auth email owners have precedence over informational contact aliases.
 IF EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=normalized) THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
 SELECT count(*),min(a.phone) INTO matches,candidate
 FROM public.customers c JOIN auth.users a ON a.id=c.user_id JOIN public.users u ON u.id=a.id
 WHERE lower(btrim(c.email))=normalized AND nullif(a.email,'') IS NULL
 AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
 AND u.is_active AND c.is_active AND u.role='customer' AND a.phone ~ '^639[0-9]{9}$';
 RETURN QUERY SELECT CASE WHEN matches=1 THEN candidate ELSE NULL::text END,false;
END $$;
REVOKE ALL ON FUNCTION public.resolve_mobile_login_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_mobile_login_email(text) TO service_role;
