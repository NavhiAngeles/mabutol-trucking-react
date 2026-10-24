-- Administrator-run integration checks; all changes roll back.
begin;
do $$ begin
  perform set_config('test.threshold_admin',(select id::text from public.users where role='admin' and is_active limit 1),true);
  if current_setting('test.threshold_admin',true) is null then raise exception 'No active admin fixture'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.threshold_admin'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare n integer; begin
  insert into public.system_settings(key,value,updated_by,updated_at)
  values('compliance_thresholds','{"drivers_license":{"first":60,"critical":15},"medical_certificate":{"first":45,"critical":10},"nbi_clearance":{"first":30,"critical":7},"lto_registration":{"first":45,"critical":15},"insurance":{"first":60,"critical":15},"franchise_permit":{"first":60,"critical":15},"emission_test":{"first":21,"critical":7},"maintenance":{"first":14,"critical":3}}',auth.uid(),'2026-01-01T00:00:00Z')
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  if (select (value->'drivers_license'->>'first')::int from public.system_settings where key='compliance_thresholds') <> 60 then raise exception 'Admin save/read failed'; end if;
  update public.system_settings set updated_at='2026-01-02T00:00:00Z'
  where key='compliance_thresholds' and updated_at='2026-01-01T00:00:00Z';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'Versioned update failed'; end if;
  update public.system_settings set updated_at='2026-01-03T00:00:00Z'
  where key='compliance_thresholds' and updated_at='2026-01-01T00:00:00Z';
  get diagnostics n = row_count;
  if n<>0 then raise exception 'Stale write was not blocked'; end if;
end $$;
reset role;
-- Use a disposable staff fixture; office-management safeguards forbid self-demotion.
do $$ declare fixture uuid:=gen_random_uuid(); begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  values(fixture,'threshold-rollback-'||fixture||'@example.invalid','{"provisioned_role":"staff"}','{"full_name":"Rollback staff"}');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare n integer; begin
  if not exists(select 1 from public.system_settings where key='compliance_thresholds') then raise exception 'Staff read failed'; end if;
  update public.system_settings set value='{}' where key='compliance_thresholds';
  get diagnostics n = row_count;
  if n<>0 then raise exception 'Staff update was allowed'; end if;
  begin
    insert into public.system_settings(key,value) values('threshold-rollback-forbidden','{}');
    raise exception 'Staff insert was allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: admin save/read, stale update denied, staff read allowed, staff insert/update denied; all rolled back' as result;

