-- Execute as the database administrator. All fixture changes roll back.
begin;
do $$ begin
  perform set_config('test.notification_owner',(select id::text from public.users limit 1),true);
  if current_setting('test.notification_owner',true) is null then raise exception 'No test account'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.notification_owner'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare n integer; own_id uuid := auth.uid(); begin
  insert into public.notification_preferences(user_id,type,channel,enabled)
  values(own_id,'shipment_status','in_app',false)
  on conflict(user_id,type,channel) do update set enabled=excluded.enabled;
  if not exists(select 1 from public.notification_preferences where user_id=own_id and type='shipment_status' and channel='in_app' and enabled=false) then raise exception 'Own preference persistence failed'; end if;
  update public.notification_preferences set enabled=true where user_id=own_id and type='shipment_status' and channel='in_app';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'Own preference update failed'; end if;
  begin
    insert into public.notification_preferences(user_id,type,channel,enabled)
    values('00000000-0000-0000-0000-000000000099','shipment_status','in_app',false);
    raise exception 'Cross-user insert was allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}',true);
  if exists(select 1 from public.notification_preferences where user_id=own_id) then raise exception 'Cross-user read was allowed'; end if;
  update public.notification_preferences set enabled=false where user_id=own_id;
  get diagnostics n = row_count;
  if n<>0 then raise exception 'Cross-user update was allowed'; end if;
end $$;
reset role;
do $$ declare own_id uuid := current_setting('test.notification_owner')::uuid; marker text := 'notification-preference-rollback-'||gen_random_uuid()::text; n integer; begin
  delete from public.notification_preferences where user_id=own_id and type='shipment_status' and channel='in_app';
  perform public.notify_user(own_id,'shipment_status',marker);
  select count(*) into n from public.notifications where user_id=own_id and title=marker;
  if n<>1 then raise exception 'Missing preference must default enabled'; end if;
  insert into public.notification_preferences(user_id,type,channel,enabled) values(own_id,'shipment_status','in_app',false);
  perform public.notify_user(own_id,'shipment_status',marker);
  select count(*) into n from public.notifications where user_id=own_id and title=marker;
  if n<>1 then raise exception 'Disabled preference did not suppress notification'; end if;
  update public.notification_preferences set enabled=true where user_id=own_id and type='shipment_status' and channel='in_app';
  perform public.notify_user(own_id,'shipment_status',marker);
  select count(*) into n from public.notifications where user_id=own_id and title=marker;
  if n<>2 then raise exception 'Enabled preference did not restore notification'; end if;
end $$;
rollback;
select 'PASS: own preference insert/read/update, cross-user denial, default-enabled generation, disabled suppression and re-enabled generation; all rolled back' as result;

