-- Migration: 20261107103000_sync_driver_phone_login.sql
-- Synchronizes driver contact numbers to auth.users.phone and public.users.phone
-- so drivers can sign in to Tanaw Mobile using their phone number or email.

-- 1. Helper function to normalize Philippine mobile numbers to E.164 (+639XXXXXXXXX)
CREATE OR REPLACE FUNCTION public.normalize_ph_phone(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE cleaned text := regexp_replace(coalesce(raw, ''), '[^0-9+]', '', 'g');
BEGIN
  IF cleaned ~ '^09[0-9]{9}$' THEN RETURN '+63' || substr(cleaned, 2);
  ELSIF cleaned ~ '^9[0-9]{9}$' THEN RETURN '+63' || cleaned;
  ELSIF cleaned ~ '^639[0-9]{9}$' THEN RETURN '+' || cleaned;
  ELSIF cleaned ~ '^\+639[0-9]{9}$' THEN RETURN cleaned;
  ELSE RETURN NULL;
  END IF;
END $$;

-- 2. Backfill existing driver accounts (e.g. Nav Angeles) with confirmed phone credentials
UPDATE auth.users a
SET phone = public.normalize_ph_phone(d.contact_number),
    phone_confirmed_at = coalesce(a.phone_confirmed_at, now()),
    updated_at = now()
FROM public.drivers d
WHERE d.user_id = a.id
  AND d.contact_number IS NOT NULL
  AND public.normalize_ph_phone(d.contact_number) IS NOT NULL
  AND (a.phone IS NULL OR a.phone = '' OR a.phone_confirmed_at IS NULL);

UPDATE public.users u
SET phone = public.normalize_ph_phone(d.contact_number),
    updated_at = now()
FROM public.drivers d
WHERE d.user_id = u.id
  AND d.contact_number IS NOT NULL
  AND public.normalize_ph_phone(d.contact_number) IS NOT NULL
  AND (u.phone IS NULL OR u.phone = '');

-- 3. Trigger to keep auth.users.phone and public.users.phone in sync when drivers are registered/updated
CREATE OR REPLACE FUNCTION public.sync_driver_phone_to_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_norm text;
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.contact_number IS NOT NULL THEN
    v_norm := public.normalize_ph_phone(NEW.contact_number);
    IF v_norm IS NOT NULL THEN
      -- Sync auth.users
      UPDATE auth.users
      SET phone = v_norm,
          phone_confirmed_at = coalesce(phone_confirmed_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id
        AND (phone IS DISTINCT FROM v_norm OR phone_confirmed_at IS NULL);

      -- Sync public.users
      UPDATE public.users
      SET phone = v_norm,
          updated_at = now()
      WHERE id = NEW.user_id
        AND (phone IS DISTINCT FROM v_norm);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_driver_phone_to_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_driver_phone_to_auth ON public.drivers;
CREATE TRIGGER trg_sync_driver_phone_to_auth
  AFTER INSERT OR UPDATE OF contact_number, user_id ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_phone_to_auth();

-- 4. RPC to allow on-demand driver phone synchronization by office staff/admin
CREATE OR REPLACE FUNCTION public.sync_driver_phones()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role() NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Active office account required' USING errcode = '42501';
  END IF;

  WITH updated AS (
    UPDATE auth.users a
    SET phone = public.normalize_ph_phone(d.contact_number),
        phone_confirmed_at = coalesce(a.phone_confirmed_at, now()),
        updated_at = now()
    FROM public.drivers d
    WHERE d.user_id = a.id
      AND d.contact_number IS NOT NULL
      AND public.normalize_ph_phone(d.contact_number) IS NOT NULL
      AND (a.phone IS DISTINCT FROM public.normalize_ph_phone(d.contact_number) OR a.phone_confirmed_at IS NULL)
    RETURNING a.id
  )
  SELECT count(*) INTO v_count FROM updated;

  UPDATE public.users u
  SET phone = public.normalize_ph_phone(d.contact_number),
      updated_at = now()
  FROM public.drivers d
  WHERE d.user_id = u.id
    AND d.contact_number IS NOT NULL
    AND public.normalize_ph_phone(d.contact_number) IS NOT NULL
    AND (u.phone IS DISTINCT FROM public.normalize_ph_phone(d.contact_number));

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.sync_driver_phones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_driver_phones() TO authenticated;

-- 5. Extend resolve_mobile_login_email to handle phone numbers with or without leading +
CREATE OR REPLACE FUNCTION public.resolve_mobile_login_email(p_email text)
RETURNS TABLE(phone text,limited boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE normalized text:=lower(btrim(p_email)); used integer; candidate text; matches integer;
BEGIN
 IF normalized IS NULL OR length(normalized) NOT BETWEEN 3 AND 254 THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
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
 IF EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=normalized) THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
 SELECT count(*),min(alias.phone) INTO matches,candidate FROM (
  SELECT a.phone FROM public.customers c
  JOIN auth.users a ON a.id=c.user_id JOIN public.users u ON u.id=a.id
  WHERE lower(btrim(c.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND c.is_active AND u.role='customer' AND a.phone ~ '^\+?639[0-9]{9}$'
  UNION ALL
  SELECT a.phone FROM public.users u JOIN auth.users a ON a.id=u.id
  JOIN public.drivers d ON d.user_id=u.id
  WHERE lower(btrim(u.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND u.role='driver' AND a.phone ~ '^\+?639[0-9]{9}$'
 ) alias;
 RETURN QUERY SELECT CASE WHEN matches=1 THEN candidate ELSE NULL::text END,false;
END $$;
REVOKE ALL ON FUNCTION public.resolve_mobile_login_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_mobile_login_email(text) TO service_role;

