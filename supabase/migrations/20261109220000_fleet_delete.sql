-- Migration: 20261109220000_fleet_delete.sql
-- Atomic fleet deletion RPC for vehicles and drivers with delivery guards.

create or replace function public.fleet_delete(
  p_kind text,
  p_id uuid
) returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.get_user_role() not in ('admin', 'staff') or public.get_user_role() is null then
    raise exception 'Active office account required' using errcode = '42501';
  end if;

  if p_kind not in ('truck', 'driver') then
    raise exception 'Unsupported fleet record kind for deletion: %', p_kind;
  end if;

  if p_id is null then
    raise exception 'Record ID is required for deletion';
  end if;

  if p_kind = 'truck' then
    if not exists (select 1 from public.trucks where id = p_id) then
      raise exception 'Vehicle not found';
    end if;

    if exists (select 1 from public.deliveries where truck_id = p_id and status in ('assigned', 'loading', 'in_transit')) then
      raise exception 'Vehicle has an active delivery and cannot be removed.';
    end if;

    -- Delete linked cargo categories
    delete from public.truck_cargo_categories where truck_id = p_id;

    -- Delete linked compliance documents
    delete from public.compliance_documents where truck_id = p_id;

    -- Delete linked maintenance records
    delete from public.maintenance_records where truck_id = p_id;

    -- Delete delivery route plans if any
    delete from public.delivery_route_plans where truck_id = p_id;

    -- Delete the truck record
    delete from public.trucks where id = p_id;
    return true;

  elsif p_kind = 'driver' then
    if not exists (select 1 from public.drivers where id = p_id) then
      raise exception 'Driver not found';
    end if;

    if exists (select 1 from public.deliveries where driver_id = p_id and status in ('assigned', 'loading', 'in_transit')) then
      raise exception 'Driver has an active delivery and cannot be removed.';
    end if;

    -- Unassign from any truck
    update public.trucks set assigned_driver_id = null where assigned_driver_id = p_id;

    -- Delete linked compliance documents
    delete from public.compliance_documents where driver_id = p_id;

    -- Delete the driver record
    delete from public.drivers where id = p_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.fleet_delete(text, uuid) from public, anon;
grant execute on function public.fleet_delete(text, uuid) to authenticated;
