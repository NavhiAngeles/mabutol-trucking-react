-- Administrator-run checks; fixture Auth/profiles/rosters/audit rows all roll back.
begin;
do $$ declare owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); unsafe_id uuid:=gen_random_uuid(); inactive_id uuid:=gen_random_uuid(); begin
  perform set_config('test.office_owner',owner_id::text,true);
  perform set_config('test.office_staff',staff_id::text,true);
  perform set_config('test.office_unsafe',unsafe_id::text,true);
  perform set_config('test.office_inactive',inactive_id::text,true);
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
    (owner_id,'office-rollback-'||owner_id||'@example.invalid','{"provisioned_role":"admin"}','{"full_name":"Rollback administrator"}'),
    (staff_id,'office-rollback-'||staff_id||'@example.invalid','{"provisioned_role":"staff"}','{"full_name":"Rollback staff"}'),
    (unsafe_id,'office-rollback-'||unsafe_id||'@example.invalid','{}','{"role":"admin","full_name":"Untrusted signup"}'),
    (inactive_id,'office-rollback-'||inactive_id||'@example.invalid','{"provisioned_role":"admin"}','{"full_name":"Inactive admin"}');
  if (select role from public.users where id=unsafe_id)<>'customer' then raise exception 'Editable metadata created office privileges'; end if;
  if exists(select 1 from public.customers where user_id in (owner_id,staff_id)) then raise exception 'Office creation unexpectedly created customer roster'; end if;
  update public.users set is_active=false where id=inactive_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare owner_id uuid:=current_setting('test.office_owner')::uuid; staff_id uuid:=current_setting('test.office_staff')::uuid; version timestamptz; result uuid; begin
  select updated_at into version from public.users where id=staff_id;
  result:=public.manage_office_user(staff_id,'Edited staff','123','admin',true,version);
  if result<>staff_id or (select role from public.users where id=staff_id)<>'admin' then raise exception 'Admin role/profile save failed'; end if;
  begin
    perform public.manage_office_user(staff_id,'Stale','123','staff',true,'1900-01-01');
    raise exception 'Stale update unexpectedly accepted';
  exception when others then if sqlerrm not like 'Account changed%' then raise; end if; end;
  select updated_at into version from public.users where id=owner_id;
  begin
    perform public.manage_office_user(owner_id,'Self demotion','','staff',true,version);
    raise exception 'Self demotion unexpectedly accepted';
  exception when others then if sqlerrm not like 'You cannot change your own%' then raise; end if; end;
  begin
    perform public.manage_office_user(owner_id,'Self disable','','admin',false,version);
    raise exception 'Self disable unexpectedly accepted';
  exception when others then if sqlerrm not like 'You cannot change your own%' then raise; end if; end;
  begin
    delete from public.users where id=staff_id;
    raise exception 'Profile deletion unexpectedly accepted';
  exception when others then if sqlerrm not like 'Use account deactivation%' then raise; end if; end;
  select updated_at into version from public.users where id=current_setting('test.office_unsafe')::uuid;
  begin
    perform public.manage_office_user(current_setting('test.office_unsafe')::uuid,'Not office','','staff',true,version);
    raise exception 'Nonoffice conversion unexpectedly accepted';
  exception when others then if sqlerrm not like 'Account changed%' then raise; end if; end;
  select updated_at into version from public.users where id=staff_id;
  perform public.manage_office_user(staff_id,'Edited staff','123','staff',false,version);
  if (select is_active from public.users where id=staff_id) then raise exception 'Deactivation failed'; end if;
  select updated_at into version from public.users where id=staff_id;
  perform public.manage_office_user(staff_id,'Edited staff','123','staff',true,version);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
  begin
    perform public.manage_office_user(owner_id,'Forbidden','','admin',true,version);
    raise exception 'Staff RPC unexpectedly accepted';
  exception when others then if sqlerrm not like 'Active administrator required%' then raise; end if; end;
  begin
    update public.users set role='admin' where id=staff_id;
    raise exception 'Staff self escalation unexpectedly accepted';
  exception when others then if sqlerrm not like 'Only active administrators%' then raise; end if; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.office_inactive'),'role','authenticated')::text,true);
  begin
    perform public.manage_office_user(staff_id,'Forbidden','','staff',true,version);
    raise exception 'Inactive admin RPC unexpectedly accepted';
  exception when others then if sqlerrm not like 'Active administrator required%' then raise; end if; end;
end $$;
rollback;
select 'PASS: trusted provisioning, editable-metadata denial, profile/role/activation, stale-save rejection, self-lockout/deletion/nonoffice guards, staff/inactive denial; all rolled back' as result;

