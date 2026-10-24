-- One RPC request is one transaction. Exceptions roll back every rate and setting.
create or replace function public.save_pricing(p_rates jsonb, p_settings jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  setting_key text;
  rate public.pricing_rates%rowtype;
  changed integer := 0;
  affected integer;
begin
  if auth.uid() is null or public.get_user_role() is distinct from 'admin' then
    raise exception 'Only active administrators can save pricing.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'array'
     or jsonb_typeof(p_settings) is distinct from 'object'
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
  for item in select value from jsonb_array_elements(p_rates) order by value->>'id' loop
    if jsonb_typeof(item->'per_km_rate') is distinct from 'number'
       or jsonb_typeof(item->'expected_rate') is distinct from 'number'
       or (item->>'per_km_rate')::numeric < 0 then
      raise exception 'Invalid vehicle rate.';
    end if;
    select * into rate from public.pricing_rates where id = (item->>'id')::uuid for update;
    if not found or not rate.is_active
       or rate.vehicle_type_id is distinct from (item->>'vehicle_type_id')::uuid
       or rate.per_km_rate is distinct from (item->>'expected_rate')::numeric then
      raise exception 'Vehicle pricing changed or is unavailable. Reload and retry.';
    end if;
    update public.pricing_rates set per_km_rate = (item->>'per_km_rate')::numeric
      where id = rate.id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Vehicle pricing update was denied.'; end if;
    changed := changed + 1;
  end loop;
  for setting_key, item in select key, value from jsonb_each(p_settings) order by key loop
    insert into public.system_settings(key,value,updated_by)
    values (setting_key,item,auth.uid())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Pricing setting update was denied.'; end if;
  end loop;
  return jsonb_build_object('saved',true,'rates',changed,'settings',3);
end;
$$;
revoke all on function public.save_pricing(jsonb,jsonb) from public, anon;
grant execute on function public.save_pricing(jsonb,jsonb) to authenticated;
