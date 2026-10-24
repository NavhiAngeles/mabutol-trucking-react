-- Office provisioning trusts server-managed app metadata, never editable privileged roles.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare assigned_role public.user_role;
begin
  assigned_role := case
    when new.raw_app_meta_data->>'provisioned_role' in ('admin','staff') then (new.raw_app_meta_data->>'provisioned_role')::public.user_role
    when new.raw_user_meta_data->>'role' = 'driver' then 'driver'::public.user_role
    else 'customer'::public.user_role end;
  insert into public.users(id,email,full_name,role)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),assigned_role)
  on conflict(id) do update set email=excluded.email,updated_at=now();
  return new;
end $$;

create or replace function public.protect_user_privileges() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new; -- Auth administrative cleanup/migrations have no client identity.
  end if;
  if tg_op='DELETE' then raise exception 'Use account deactivation to preserve operational records'; end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    perform pg_advisory_xact_lock(872621004);
    if coalesce(public.get_user_role(),'') <> 'admin' then raise exception 'Only active administrators may change access'; end if;
    if old.id=auth.uid() then raise exception 'You cannot change your own role or active status'; end if;
    if old.role='admin' and old.is_active and (new.role<>'admin' or not new.is_active)
      and (select count(*) from public.users where role='admin' and is_active)<=1 then
      raise exception 'The last active administrator must be retained';
    end if;
  end if;
  return new;
end $$;
create trigger users_preserve_operational_records before delete on public.users
for each row execute function public.protect_user_privileges();

create or replace function public.manage_office_user(
  p_id uuid,p_full_name text,p_phone text,p_role text,p_is_active boolean,p_expected timestamptz
) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(872621004);
  if public.get_user_role() is distinct from 'admin' then raise exception 'Active administrator required'; end if;
  if p_role not in ('admin','staff') or p_role is null or p_is_active is null then raise exception 'Invalid office role or status'; end if;
  if p_full_name is null or length(btrim(p_full_name)) not between 1 and 200 or length(coalesce(p_phone,''))>40 then raise exception 'Invalid profile details'; end if;
  if p_expected is null then raise exception 'Reload the account before editing'; end if;
  update public.users set full_name=btrim(p_full_name),phone=nullif(btrim(p_phone),''),role=p_role::public.user_role,is_active=p_is_active
    where id=p_id and role in ('admin','staff') and updated_at=p_expected returning id into result;
  if result is null then raise exception 'Account changed or is not an office account. Reload and retry'; end if;
  return result;
end $$;
revoke all on function public.manage_office_user(uuid,text,text,text,boolean,timestamptz) from public,anon;
grant execute on function public.manage_office_user(uuid,text,text,text,boolean,timestamptz) to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.protect_user_privileges() from public,anon,authenticated;
