-- One RPC request is one transaction. Exceptions roll back every rate, vehicle rule, and setting.
create or replace function public.save_pricing(p_rates jsonb, p_settings jsonb, p_vehicle_types jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  setting_key text;
  rate public.pricing_rates%rowtype;
  vt public.vehicle_types%rowtype;
  changed integer := 0;
  changed_vt integer := 0;
  affected integer;
  v_free_deadhead_km numeric;
  v_deadhead_rate numeric;
  v_lead_time_hours integer;
  v_buffer_minutes integer;
begin
  if auth.uid() is null or public.get_user_role() is distinct from 'admin' then
    raise exception 'Only active administrators can save pricing.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'array'
     or jsonb_typeof(p_settings) is distinct from 'object'
     or jsonb_typeof(coalesce(p_vehicle_types, '[]'::jsonb)) is distinct from 'array'
     or (select count(*) from jsonb_object_keys(p_settings)) <> 3
     or not (p_settings ?& array['minimum_booking_fee','driver_allowance','handling_surcharges']) then
    raise exception 'Invalid pricing payload.';
  end if;
  foreach setting_key in array array['minimum_booking_fee','driver_allowance'] loop
    if jsonb_typeof(p_settings->setting_key) is distinct from 'number'
       or (p_settings->>setting_key)::numeric < 0 then
      raise exception 'Invalid pricing amount: %', setting_key;
    end if;
  end loop;
  if jsonb_typeof(p_settings->'handling_surcharges') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_settings->'handling_surcharges')) <> 6
     or not ((p_settings->'handling_surcharges') ?& array['none','fragile','keepdry','temp','perishable','cold']) then
    raise exception 'Invalid handling surcharge configuration.';
  end if;
  for setting_key, item in select key, value from jsonb_each(p_settings->'handling_surcharges') loop
    if jsonb_typeof(item) is distinct from 'number' or item::text::numeric < 0 then
      raise exception 'Invalid handling surcharge: %', setting_key;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rates)) <>
     (select count(distinct value->>'id') from jsonb_array_elements(p_rates)) then
    raise exception 'Duplicate or missing pricing rate IDs.';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb))) <>
     (select count(distinct value->>'id') from jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb))) then
    raise exception 'Duplicate or missing vehicle type IDs.';
  end if;
  for item in select value from jsonb_array_elements(p_rates) order by value->>'id' loop
    if jsonb_typeof(item->'per_km_rate') is distinct from 'number'
       or jsonb_typeof(item->'expected_rate') is distinct from 'number'
       or (item->>'per_km_rate')::numeric < 0 then
      raise exception 'Invalid vehicle rate.';
    end if;
    if item ? 'free_deadhead_km' then
      if jsonb_typeof(item->'free_deadhead_km') is distinct from 'number'
         or (item->>'free_deadhead_km')::numeric < 0 then
        raise exception 'Invalid free deadhead threshold.';
      end if;
    end if;
    if item ? 'deadhead_per_km_rate' then
      if jsonb_typeof(item->'deadhead_per_km_rate') is distinct from 'number'
         or (item->>'deadhead_per_km_rate')::numeric < 0 then
        raise exception 'Invalid deadhead mobilization rate.';
      end if;
    end if;
    select * into rate from public.pricing_rates where id = (item->>'id')::uuid for update;
    if not found or not rate.is_active
       or rate.vehicle_type_id is distinct from (item->>'vehicle_type_id')::uuid
       or rate.per_km_rate is distinct from (item->>'expected_rate')::numeric
       or (item ? 'expected_free_deadhead_km' and rate.free_deadhead_km is distinct from (item->>'expected_free_deadhead_km')::numeric)
       or (item ? 'expected_deadhead_per_km_rate' and rate.deadhead_per_km_rate is distinct from (item->>'expected_deadhead_per_km_rate')::numeric) then
      raise exception 'Vehicle pricing changed or is unavailable. Reload and retry.';
    end if;
    v_free_deadhead_km := case when item ? 'free_deadhead_km' then (item->>'free_deadhead_km')::numeric else rate.free_deadhead_km end;
    v_deadhead_rate := case when item ? 'deadhead_per_km_rate' then (item->>'deadhead_per_km_rate')::numeric else rate.deadhead_per_km_rate end;
    update public.pricing_rates
    set per_km_rate = (item->>'per_km_rate')::numeric,
        free_deadhead_km = v_free_deadhead_km,
        deadhead_per_km_rate = v_deadhead_rate
    where id = rate.id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Vehicle pricing update was denied.'; end if;
    changed := changed + 1;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_vehicle_types, '[]'::jsonb)) order by value->>'id' loop
    if jsonb_typeof(item->'min_lead_time_hours') is distinct from 'number'
       or jsonb_typeof(item->'loading_buffer_minutes') is distinct from 'number'
       or (item->>'min_lead_time_hours')::numeric < 0
       or (item->>'min_lead_time_hours')::numeric <> trunc((item->>'min_lead_time_hours')::numeric)
       or (item->>'loading_buffer_minutes')::numeric < 0
       or (item->>'loading_buffer_minutes')::numeric <> trunc((item->>'loading_buffer_minutes')::numeric) then
      raise exception 'Invalid vehicle scheduling rule.';
    end if;
    v_lead_time_hours := (item->>'min_lead_time_hours')::integer;
    v_buffer_minutes := (item->>'loading_buffer_minutes')::integer;
    select * into vt from public.vehicle_types where id = (item->>'id')::uuid for update;
    if not found or not vt.is_active
       or (item ? 'expected_min_lead_time_hours' and vt.min_lead_time_hours is distinct from (item->>'expected_min_lead_time_hours')::integer)
       or (item ? 'expected_loading_buffer_minutes' and vt.loading_buffer_minutes is distinct from (item->>'expected_loading_buffer_minutes')::integer) then
      raise exception 'Vehicle rules changed or are unavailable. Reload and retry.';
    end if;
    update public.vehicle_types
    set min_lead_time_hours = v_lead_time_hours,
        loading_buffer_minutes = v_buffer_minutes
    where id = vt.id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Vehicle rules update was denied.'; end if;
    changed_vt := changed_vt + 1;
  end loop;
  for setting_key, item in select key, value from jsonb_each(p_settings) order by key loop
    insert into public.system_settings(key,value,updated_by)
    values (setting_key,item,auth.uid())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Pricing setting update was denied.'; end if;
  end loop;
  return jsonb_build_object('saved',true,'rates',changed,'settings',3,'vehicle_types',changed_vt);
end;
$$;
revoke all on function public.save_pricing(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_pricing(jsonb,jsonb,jsonb) to authenticated;

create or replace function public.save_pricing(p_rates jsonb, p_settings jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.save_pricing(p_rates, p_settings, '[]'::jsonb);
  return jsonb_build_object(
    'saved', (v_result->'saved')::boolean,
    'rates', (v_result->>'rates')::integer,
    'settings', (v_result->>'settings')::integer
  );
end;
$$;
revoke all on function public.save_pricing(jsonb,jsonb) from public, anon;
grant execute on function public.save_pricing(jsonb,jsonb) to authenticated;
