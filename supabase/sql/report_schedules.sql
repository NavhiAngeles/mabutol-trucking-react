-- Dev-only recurring report snapshots. All dates/times use Asia/Manila.
create extension if not exists pg_cron;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.report_schedules (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.users(id),
 report_type text not null check(report_type in ('Overview','Shipments','Drivers','Revenue')),
 frequency text not null check(frequency in ('daily','weekly','monthly')),
 local_time time not null default '08:00', enabled boolean not null default true,
 next_run_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index report_schedules_due_idx on public.report_schedules(next_run_at) where enabled;
create index report_schedules_owner_idx on public.report_schedules(owner_id,created_at desc);
create table public.report_snapshots (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.report_schedules(id),
 owner_id uuid not null references public.users(id), report_type text not null,
 period_start date not null, period_end date not null, due_at timestamptz not null,
 generated_at timestamptz not null default now(), model_version integer not null default 1,
 status text not null check(status in ('ready','failed')), data jsonb, error_message text,
 unique(schedule_id,due_at), check(period_start<=period_end)
);
create index report_snapshots_owner_idx on public.report_snapshots(owner_id,generated_at desc);
alter table public.report_schedules enable row level security;
alter table public.report_snapshots enable row level security;
revoke all on public.report_schedules,public.report_snapshots from anon,authenticated;
grant select on public.report_schedules,public.report_snapshots to authenticated;
grant insert(report_type,frequency,local_time) on public.report_schedules to authenticated;
grant update(enabled) on public.report_schedules to authenticated;
create policy own_schedules_read on public.report_schedules for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active and u.role in ('admin','staff')));
create policy own_schedules_create on public.report_schedules for insert to authenticated with check (owner_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active and u.role in ('admin','staff')));
create policy own_schedules_toggle on public.report_schedules for update to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active and u.role in ('admin','staff'))) with check (owner_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active and u.role in ('admin','staff')));
create policy own_snapshots_read on public.report_snapshots for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active and u.role in ('admin','staff')));

create function private.next_report_run(frequency text,local_time time,after_time timestamptz)
returns timestamptz language plpgsql stable set search_path='' as $$
declare local_now timestamp:=after_time at time zone 'Asia/Manila'; candidate timestamp;
begin
 if frequency='daily' then candidate:=local_now::date+local_time;
 elsif frequency='weekly' then candidate:=date_trunc('week',local_now)::date+local_time;
 else candidate:=date_trunc('month',local_now)::date+local_time; end if;
 if candidate<=local_now then candidate:=candidate+case frequency when 'daily' then interval '1 day' when 'weekly' then interval '1 week' else interval '1 month' end; end if;
 return candidate at time zone 'Asia/Manila';
end $$;
create function private.prepare_report_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,8193));
  if (select count(*) from public.report_schedules where owner_id=new.owner_id)>=20 then raise exception 'Maximum 20 report schedules per account'; end if;
 end if;
 new.next_run_at:=private.next_report_run(new.frequency,new.local_time,now());
 return new;
end $$;
create trigger prepare_report_schedule before insert or update on public.report_schedules for each row execute function private.prepare_report_schedule();
create function private.capture_report(kind text,from_date date,to_date date) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:='{}'; begin
if true then result:=result||jsonb_build_object('shipments',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select s.id,s.tracking_number,s.status,s.created_at,s.estimated_arrival,s.actual_delivery_at,s.final_amount,s.customer_id,s.billing_customer_id,s.pickup_address,s.dropoff_address,jsonb_build_object('name',c.name) customer from public.shipments s left join public.customers c on c.id=s.customer_id where (s.created_at at time zone 'Asia/Manila')::date between from_date and to_date) q)); end if;
if true then result:=result||jsonb_build_object('deliveries',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select d.id,d.shipment_id,d.truck_id,d.driver_id,d.status,d.arrived_at,d.odometer_start,d.odometer_end,jsonb_build_object('full_name',r.full_name) driver from public.deliveries d left join public.drivers r on r.id=d.driver_id) q)); end if;
if kind in ('Overview','Drivers') then result:=result||jsonb_build_object('drivers',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,full_name,status from public.drivers) q)); end if;
if kind='Revenue' then result:=result||jsonb_build_object('customers',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,name from public.customers) q)); end if;
if kind='Revenue' then result:=result||jsonb_build_object('payments',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,status,amount,paid_at from public.payments where paid_at is null or (paid_at at time zone 'Asia/Manila')::date between from_date and to_date) q)); end if;
if kind='Revenue' then result:=result||jsonb_build_object('expenses',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,delivery_id,category,amount,status,created_at from public.delivery_expenses where (created_at at time zone 'Asia/Manila')::date between from_date and to_date) q)); end if;
if kind='Revenue' then result:=result||jsonb_build_object('fuel',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,total_cost,logged_at from public.fuel_logs where (logged_at at time zone 'Asia/Manila')::date between from_date and to_date) q)); end if;
if kind in ('Overview','Revenue') then result:=result||jsonb_build_object('maintenance',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,truck_id,status,cost,completed_date,scheduled_date,next_due_date from public.maintenance_records) q)); end if;
if kind='Drivers' then result:=result||jsonb_build_object('incidents',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,delivery_id,shipment_id,category,delay_minutes,created_at from public.delivery_incidents where (created_at at time zone 'Asia/Manila')::date between from_date and to_date) q)); end if;
if kind='Overview' then result:=result||jsonb_build_object('trucks',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,status from public.trucks) q)); end if;
if kind='Overview' then result:=result||jsonb_build_object('documents',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from (select id,driver_id,truck_id,doc_type,expiry_date,review_status,created_at,case when remarks like 'OR copy%' then 'OR copy' when remarks like 'CR copy%' then 'CR copy' else '' end remarks from public.compliance_documents) q)); end if;
if kind='Overview' then result:=result||jsonb_build_object('settings',(select coalesce(jsonb_agg(to_jsonb(q) order by q.key),'[]'::jsonb) from (select key,value from public.system_settings where key in ('compliance_thresholds','compliance_threshold_days')) q)); end if;
return result; end $$;
create function private.generate_due_reports() returns integer language plpgsql security definer set search_path='' as $$
declare schedule public.report_schedules; local_day date; start_day date; end_day date; payload jsonb; generated integer:=0;
begin
 for schedule in select s.* from public.report_schedules s join public.users u on u.id=s.owner_id
 where s.enabled and s.next_run_at<=now() and u.is_active and u.role in ('admin','staff')
 order by s.next_run_at limit 100 for update of s skip locked loop
  local_day:=(schedule.next_run_at at time zone 'Asia/Manila')::date;
  end_day:=local_day-1;
  start_day:=case schedule.frequency when 'daily' then end_day when 'weekly' then local_day-7 else (date_trunc('month',local_day)-interval '1 month')::date end;
  begin
   payload:=private.capture_report(schedule.report_type,start_day,end_day);
   insert into public.report_snapshots(schedule_id,owner_id,report_type,period_start,period_end,due_at,status,data)
   values(schedule.id,schedule.owner_id,schedule.report_type,start_day,end_day,schedule.next_run_at,'ready',payload) on conflict(schedule_id,due_at) do nothing;
  exception when others then
   insert into public.report_snapshots(schedule_id,owner_id,report_type,period_start,period_end,due_at,status,error_message)
   values(schedule.id,schedule.owner_id,schedule.report_type,start_day,end_day,schedule.next_run_at,'failed','Report generation failed. Contact an administrator.') on conflict(schedule_id,due_at) do nothing;
  end;
  update public.report_schedules set next_run_at=private.next_report_run(schedule.frequency,schedule.local_time,now()) where id=schedule.id;
  generated:=generated+1;
 end loop;
 return generated;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
select cron.schedule('mabutol-report-snapshots','* * * * *','select private.generate_due_reports();');
