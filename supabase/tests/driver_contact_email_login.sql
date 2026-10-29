-- Fictional fixtures only; every row and rate-limit effect rolls back.
BEGIN;
DO $$
DECLARE driver_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); customer_user uuid:=gen_random_uuid(); email_owner uuid:=gen_random_uuid();
 alias_email text:='driver-alias-'||gen_random_uuid()::text||'@example.invalid'; result record;
BEGIN
 IF has_function_privilege('anon','public.resolve_mobile_login_email(text)','EXECUTE') OR has_function_privilege('authenticated','public.resolve_mobile_login_email(text)','EXECUTE') THEN RAISE EXCEPTION 'Private resolver exposed'; END IF;
 INSERT INTO auth.users(id,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES
 (driver_user,'639999000083',now(),'{}','{"full_name":"Driver alias fixture"}'),
 (other_user,'639999000084',now(),'{}','{"full_name":"Other driver alias fixture"}'),
 (customer_user,'639999000085',now(),'{}','{"full_name":"Customer alias collision fixture"}');
 UPDATE public.users SET role='driver',email=alias_email WHERE id=driver_user;
 UPDATE public.users SET role='driver' WHERE id=other_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Unlinked driver resolved'; END IF;
 INSERT INTO public.drivers(user_id,full_name,license_number) VALUES(driver_user,'Driver alias fixture','TEST-ALIAS-'||driver_user),(other_user,'Other driver alias fixture','TEST-ALIAS-'||other_user);
 SELECT * INTO result FROM public.resolve_mobile_login_email('  '||upper(alias_email)||'  ');
 IF result.phone IS DISTINCT FROM '639999000083' OR result.limited THEN RAISE EXCEPTION 'Linked normalized driver alias missing'; END IF;
 UPDATE public.users SET is_active=false WHERE id=driver_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Inactive driver resolved'; END IF;
 UPDATE public.users SET is_active=true WHERE id=driver_user;
 UPDATE auth.users SET phone_confirmed_at=null WHERE id=driver_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Unconfirmed phone resolved'; END IF;
 UPDATE auth.users SET phone_confirmed_at=now(),banned_until=now()+interval '1 hour' WHERE id=driver_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Banned driver resolved'; END IF;
 UPDATE auth.users SET banned_until=null WHERE id=driver_user;
 UPDATE public.users SET email=upper(alias_email) WHERE id=other_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Duplicate driver aliases did not fail closed'; END IF;
 UPDATE public.users SET email=null WHERE id=other_user;
 UPDATE public.customers SET email=alias_email WHERE user_id=customer_user;
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Cross-role alias collision did not fail closed'; END IF;
 UPDATE public.customers SET email=null WHERE user_id=customer_user;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES(email_owner,upper(alias_email),'{}','{"full_name":"Auth email owner fixture"}');
 SELECT * INTO result FROM public.resolve_mobile_login_email(alias_email);
 IF result.phone IS NOT NULL THEN RAISE EXCEPTION 'Driver alias shadowed Auth email'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: driver alias normalization/linkage, private access, active/confirmed/unbanned guards, cross-role duplicates and Auth precedence; rolled back' AS result;
