-- Run as administrator against dev. Every price and fixture change rolls back.
begin;
do $$ begin
  perform set_config('test.pricing_admin',(select id::text from public.users where role='admin' and is_active limit 1),true);
  if current_setting('test.pricing_admin',true) is null then raise exception 'No admin fixture'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.pricing_admin'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare
  r public.pricing_rates%rowtype;
  settings jsonb := '{"minimum_booking_fee":2600,"driver_allowance":123,"handling_surcharges":{"none":0,"fragile":1,"keepdry":2,"temp":3,"perishable":4,"cold":5}}';
  rates jsonb;
  before_rates jsonb;
  before_settings jsonb;
  result jsonb;
begin
  select * into r from public.pricing_rates where is_active order by id limit 1;
  if not found then raise exception 'No rate fixture'; end if;
  rates := jsonb_build_array(jsonb_build_object('id',r.id,'vehicle_type_id',r.vehicle_type_id,'expected_rate',r.per_km_rate,'per_km_rate',r.per_km_rate+1));
  select jsonb_agg(to_jsonb(p) order by id) into before_rates from public.pricing_rates p;
  select jsonb_agg(to_jsonb(s) order by key) into before_settings from public.system_settings s;
  -- A later missing rate must roll back the first real rate update.
  begin
    perform public.save_pricing(rates || jsonb_build_array(jsonb_build_object('id','ffffffff-ffff-ffff-ffff-ffffffffffff','vehicle_type_id',r.vehicle_type_id,'expected_rate',0,'per_km_rate',1)),settings);
    raise exception 'Expected missing rate failure' using errcode='ZX001';
  exception when others then if sqlstate='ZX001' then raise; end if; end;
  if (select jsonb_agg(to_jsonb(p) order by id) from public.pricing_rates p) is distinct from before_rates
     or (select jsonb_agg(to_jsonb(s) order by key) from public.system_settings s) is distinct from before_settings then
    raise exception 'Partial writes survived a later rate failure';
  end if;
  begin
    perform public.save_pricing(rates,jsonb_set(settings,'{driver_allowance}','-1'));
    raise exception 'Expected invalid setting failure' using errcode='ZX001';
  exception when others then if sqlstate='ZX001' then raise; end if; end;
  result := public.save_pricing(rates,settings);
  if result <> '{"saved":true,"rates":1,"settings":3}'::jsonb
     or (select per_km_rate from public.pricing_rates where id=r.id) <> r.per_km_rate+1
     or (select value from public.system_settings where key='driver_allowance') <> '123'::jsonb then
    raise exception 'Atomic save did not persist all values';
  end if;
  begin
    perform public.save_pricing(rates,settings);
    raise exception 'Expected stale rate failure' using errcode='ZX001';
  exception when others then if sqlstate='ZX001' then raise; end if; end;
end $$;
reset role;
do $$ declare fixture uuid:=gen_random_uuid(); begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  values(fixture,'pricing-rollback-'||fixture||'@example.invalid','{"provisioned_role":"staff"}','{"full_name":"Rollback staff"}');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.save_pricing('[]','{}');
    raise exception 'Staff allowed' using errcode='ZX001';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.save_pricing(jsonb,jsonb)','execute') then raise exception 'Anonymous execute allowed'; end if;
end $$;
rollback;
select 'PASS: atomic success, later-write rollback, invalid settings, stale rate, staff and anonymous denial; all fixture changes rolled back' as result;
