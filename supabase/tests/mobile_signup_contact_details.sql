BEGIN;
DO $$
DECLARE phone_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,phone,raw_app_meta_data,raw_user_meta_data)
 VALUES(phone_id,'639999000091','{}','{"full_name":"Contact rollback fixture","contact_email":"contact-fixture@example.invalid","address":"  Synthetic location address  ","role":"admin","phone":"639999000099"}');
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE user_id=phone_id AND email='contact-fixture@example.invalid' AND address='Synthetic location address' AND phone='+639999000091') THEN RAISE EXCEPTION 'Contact details or authoritative phone not saved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=phone_id AND email IS NULL AND role='customer') THEN RAISE EXCEPTION 'Contact email changed authentication or metadata granted role'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=phone_id AND (nullif(email,'') IS NOT NULL OR email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Contact details changed verification'; END IF;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(legacy_id,'legacy-'||legacy_id::text||'@example.invalid','{}','{"full_name":"Legacy fixture","contact_email":"other@example.invalid"}');
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE user_id=legacy_id AND email='legacy-'||legacy_id::text||'@example.invalid') THEN RAISE EXCEPTION 'Legacy email precedence changed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: contact email/address recorded; phone authentication and server role preserved; legacy email retained; all fixtures rolled back' AS result;
