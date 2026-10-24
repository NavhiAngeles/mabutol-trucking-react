-- Disposable fixtures only. All data and temporary trigger changes roll back.
begin;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); begin
 perform set_config('test.report_a',a::text,true); perform set_config('test.report_b',b::text,true); perform set_config('test.report_c',c::text,true);
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 (a,'report-rollback-'||a||'@example.invalid','{"provisioned_role":"staff"}','{"full_name":"Report fixture A"}'),
 (b,'report-rollback-'||b||'@example.invalid','{"provisioned_role":"staff"}','{"full_name":"Report fixture B"}'),
 (c,'report-rollback-'||c||'@example.invalid','{}','{"full_name":"Report fixture customer"}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 if private.next_report_run('daily','08:00','2026-10-24T00:00:00Z')<>'2026-10-25T00:00:00Z' then raise exception 'Daily boundary wrong'; end if;
 if private.next_report_run('weekly','08:00','2026-10-24T00:00:00Z')<>'2026-10-26T00:00:00Z' then raise exception 'Weekly boundary wrong'; end if;
 if private.next_report_run('monthly','08:00','2026-10-24T00:00:00Z')<>'2026-11-01T00:00:00Z' then raise exception 'Monthly boundary wrong'; end if;
end $$;
set local role authenticated;
insert into public.report_schedules(report_type,frequency,local_time) values
 ('Overview','daily','08:00'),('Shipments','daily','08:00'),('Drivers','daily','08:00'),('Revenue','daily','08:00');
do $$ begin
 if (select count(*) from public.report_schedules)<>4 then raise exception 'Owner create/read failed'; end if;
 begin
  update public.report_schedules set owner_id=current_setting('test.report_b')::uuid;
  raise exception 'Owner reassignment accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.report_snapshots(schedule_id,owner_id,report_type,period_start,period_end,due_at,status,data)
  select id,owner_id,report_type,current_date,current_date,now(),'ready','{}' from public.report_schedules limit 1;
  raise exception 'Forged report accepted';
 exception when insufficient_privilege then null; end;
 update public.report_schedules set enabled=false where report_type='Overview';
 if (select enabled from public.report_schedules where report_type='Overview') then raise exception 'Pause failed'; end if;
 update public.report_schedules set enabled=true where report_type='Overview';
end $$;
reset role;
-- Set only fixture schedules due. Trigger restored before worker runs.
alter table public.report_schedules disable trigger prepare_report_schedule;
update public.report_schedules set next_run_at=now()-interval '1 minute' where owner_id=current_setting('test.report_a')::uuid;
alter table public.report_schedules enable trigger prepare_report_schedule;
select private.generate_due_reports();
do $$ begin
 if (select count(*) from public.report_snapshots where owner_id=current_setting('test.report_a')::uuid and status='ready')<>4 then raise exception 'Worker did not generate all four report types'; end if;
 if exists(select 1 from public.report_schedules where owner_id=current_setting('test.report_a')::uuid and next_run_at<=now()) then raise exception 'Worker did not advance schedule'; end if;
 if private.generate_due_reports()<>0 then raise exception 'Duplicate report generated'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.report_b'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.report_schedules) or exists(select 1 from public.report_snapshots) then raise exception 'Cross-owner report leakage'; end if;
 begin perform private.generate_due_reports(); raise exception 'Worker is publicly callable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.report_c'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 begin insert into public.report_schedules(report_type,frequency,local_time) values('Overview','daily','08:00'); raise exception 'Customer scheduled office report'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claims','{}',true);
 update public.users set is_active=false where id=current_setting('test.report_a')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.report_a'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.report_schedules) or exists(select 1 from public.report_snapshots) then raise exception 'Inactive account can read reports'; end if;
end $$;
reset role;
rollback;
