BEGIN;
DO $$
DECLARE first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid(); result record; i integer;
 email_alias text:='alias-'||gen_random_uuid()::text||'@example.invalid';
BEGIN
 IF has_function_privilege('anon','public.resolve_mobile_login_email(text)','EXECUTE') OR has_function_privilege('authenticated','public.resolve_mobile_login_email(text)','EXECUTE') OR has_table_privilege('authenticated','public.mobile_email_login_limits','SELECT') THEN RAISE EXCEPTION 'Resolver or rate data exposed'; END IF;
 INSERT INTO auth.users(id,phone,raw_app_meta_data,raw_user_meta_data) VALUES(first_id,'639999000081','{}',jsonb_build_object('full_name','Alias fixture','contact_email',email_alias));
 SELECT * INTO result FROM public.resolve_mobile_login_email(email_alias);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Unverified account resolved'; END IF;
 UPDATE auth.users SET phone_confirmed_at=now() WHERE id=first_id;
 SELECT * INTO result FROM public.resolve_mobile_login_email(upper(email_alias));
 IF result.phone IS DISTINCT FROM '639999000081' THEN RAISE EXCEPTION 'Confirmed case-insensitive alias missing'; END IF;
 INSERT INTO auth.users(id,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES(second_id,'639999000082',now(),'{}',jsonb_build_object('full_name','Duplicate alias fixture','contact_email',email_alias));
 SELECT * INTO result FROM public.resolve_mobile_login_email(email_alias);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Duplicate alias did not fail closed'; END IF;
 UPDATE public.customers SET email='other-'||second_id::text||'@example.invalid' WHERE user_id=second_id;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES(legacy_id,email_alias,'{}','{"full_name":"Legacy email fixture"}');
 SELECT * INTO result FROM public.resolve_mobile_login_email(email_alias);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Alias shadowed Auth email'; END IF;
 FOR i IN 1..11 LOOP SELECT * INTO result FROM public.resolve_mobile_login_email('rate-'||first_id::text||'@example.invalid'); END LOOP;
 IF NOT result.limited THEN RAISE EXCEPTION 'Per-identity rate limit failed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: private resolver, phone confirmation, case normalization, duplicate rejection, Auth-email precedence and rate limits; rolled back' AS result;
