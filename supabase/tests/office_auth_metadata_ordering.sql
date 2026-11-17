-- Reproduce Auth Admin's INSERT-before-app_metadata-update ordering.
-- Synthetic rows only; all fixture changes are rolled back.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare fixture uuid := gen_random_uuid();
begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  values(fixture,'office-ordering-'||fixture::text||'@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Isolated ordering regression"}'::jsonb);
  if (select role from public.users where id=fixture) <> 'customer' then
    raise exception 'Expected initial customer profile';
  end if;
  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"provisioned_role":"staff"}'::jsonb where id=fixture;
  if (select role from public.users where id=fixture) <> 'customer' then
    raise exception 'Expected unsynchronized profile after Auth metadata update';
  end if;
  update public.users set role='staff' where id=fixture and role='customer';
  delete from public.customers where user_id=fixture;
  if not exists(select 1 from public.users where id=fixture and role='staff' and is_active)
    or exists(select 1 from public.customers where user_id=fixture) then
    raise exception 'Office finalization failed';
  end if;
end $$;
rollback;
