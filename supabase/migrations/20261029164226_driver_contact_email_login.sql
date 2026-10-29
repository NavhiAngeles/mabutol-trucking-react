-- Extend the existing private password-verified contact alias resolver to linked drivers.
CREATE OR REPLACE FUNCTION public.resolve_mobile_login_email(p_email text)
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
 -- Contact aliases are login identifiers, not verified email identities.
 -- Both branches require an active server profile and confirmed phone password login.
 SELECT count(*),min(alias.phone) INTO matches,candidate FROM (
  SELECT a.phone FROM public.customers c
  JOIN auth.users a ON a.id=c.user_id JOIN public.users u ON u.id=a.id
  WHERE lower(btrim(c.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND c.is_active AND u.role='customer' AND a.phone ~ '^639[0-9]{9}$'
  UNION ALL
  SELECT a.phone FROM public.users u JOIN auth.users a ON a.id=u.id
  JOIN public.drivers d ON d.user_id=u.id
  WHERE lower(btrim(u.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND u.role='driver' AND a.phone ~ '^639[0-9]{9}$'
 ) alias;
 RETURN QUERY SELECT CASE WHEN matches=1 THEN candidate ELSE NULL::text END,false;
END $$;
REVOKE ALL ON FUNCTION public.resolve_mobile_login_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_mobile_login_email(text) TO service_role;
