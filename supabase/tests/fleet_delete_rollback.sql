-- Rollback verification test for public.fleet_delete RPC
begin;

-- 1. Assume active office admin identity
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id::text from public.users where role = 'admin' and is_active limit 1),
  'role', 'authenticated'
)::text, true);
set local role authenticated;

do $test$
declare
  v_driver uuid;
  v_truck uuid;
  v_vt uuid;
  v_deleted boolean;
begin
  select id into v_vt from public.vehicle_types limit 1;

  -- Create a test driver
  v_driver := public.fleet_save('driver', null, '{"full_name":"Test Delete Driver","license_number":"DEL-DRV-001"}'::jsonb);
  if v_driver is null then
    raise exception 'Failed to create test driver';
  end if;

  -- Create a test truck assigned to that driver
  v_truck := public.fleet_save('truck', null, jsonb_build_object(
    'plate_number', 'DEL-TRK-01',
    'model', 'Test Truck',
    'capacity_kg', 3500,
    'vehicle_type_id', v_vt,
    'assigned_driver_id', v_driver
  ));
  if v_truck is null then
    raise exception 'Failed to create test truck';
  end if;

  -- Verify delete truck removes the truck and clears assignment
  v_deleted := public.fleet_delete('truck', v_truck);
  if not v_deleted then
    raise exception 'fleet_delete(truck) returned false';
  end if;

  if exists (select 1 from public.trucks where id = v_truck) then
    raise exception 'Truck was not deleted';
  end if;

  -- Verify delete driver removes the driver
  v_deleted := public.fleet_delete('driver', v_driver);
  if not v_deleted then
    raise exception 'fleet_delete(driver) returned false';
  end if;

  if exists (select 1 from public.drivers where id = v_driver) then
    raise exception 'Driver was not deleted';
  end if;

  -- Verify non-existent record raises exception
  begin
    perform public.fleet_delete('truck', '00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'Expected exception for non-existent vehicle';
  exception when raise_exception then
    if sqlerrm not like '%Vehicle not found%' then raise; end if;
  end;

end $test$;

-- 2. Verify non-office caller rejection
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
set local role authenticated;

do $denied$
begin
  begin
    perform public.fleet_delete('truck', gen_random_uuid());
    raise exception 'Unauthorized caller unexpectedly allowed to delete';
  exception when insufficient_privilege then
    null; -- expected 42501
  end;
end $denied$;

reset role;
rollback;
select jsonb_build_object('status', 'passed', 'test', 'fleet_delete rollback test completed successfully');

