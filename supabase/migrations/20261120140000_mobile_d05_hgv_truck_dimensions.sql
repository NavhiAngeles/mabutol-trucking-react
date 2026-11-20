-- Migration: 20261120140000_mobile_d05_hgv_truck_dimensions.sql
-- Implements Request D05 schema extensions:
-- Physical HGV dimensions, tare/gross weight, and axle count on public.trucks
-- and default dimensional specifications on public.vehicle_types.

ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS height_m numeric(4,2) CHECK (height_m IS NULL OR (height_m > 0 AND height_m <= 10)),
  ADD COLUMN IF NOT EXISTS width_m numeric(4,2) CHECK (width_m IS NULL OR (width_m > 0 AND width_m <= 10)),
  ADD COLUMN IF NOT EXISTS length_m numeric(5,2) CHECK (length_m IS NULL OR (length_m > 0 AND length_m <= 50)),
  ADD COLUMN IF NOT EXISTS tare_weight_kg numeric(10,2) CHECK (tare_weight_kg IS NULL OR tare_weight_kg >= 0),
  ADD COLUMN IF NOT EXISTS gross_weight_kg numeric(10,2) CHECK (gross_weight_kg IS NULL OR gross_weight_kg > 0),
  ADD COLUMN IF NOT EXISTS axle_count smallint DEFAULT 2 CHECK (axle_count IS NULL OR (axle_count >= 2 AND axle_count <= 20));

ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS default_height_m numeric(4,2) CHECK (default_height_m IS NULL OR (default_height_m > 0 AND default_height_m <= 10)),
  ADD COLUMN IF NOT EXISTS default_width_m numeric(4,2) CHECK (default_width_m IS NULL OR (default_width_m > 0 AND default_width_m <= 10)),
  ADD COLUMN IF NOT EXISTS default_length_m numeric(5,2) CHECK (default_length_m IS NULL OR (default_length_m > 0 AND default_length_m <= 50));

CREATE OR REPLACE FUNCTION public.fleet_save(
  p_kind text,
  p_id uuid,
  p_data jsonb,
  p_categories uuid[] DEFAULT NULL::uuid[],
  p_documents jsonb DEFAULT '[]'::jsonb,
  p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_updated timestamptz;
  v_truck uuid;
  v_driver uuid;
  v_doc jsonb;
  v_path text;
  v_height_m numeric(4,2);
  v_width_m numeric(4,2);
  v_length_m numeric(5,2);
  v_tare_weight_kg numeric(10,2);
  v_gross_weight_kg numeric(10,2);
  v_axle_count smallint;
  v_existing_tare numeric(10,2);
  v_existing_gross numeric(10,2);
  v_eff_tare numeric(10,2);
  v_eff_gross numeric(10,2);
begin
  if auth.uid() is null or public.get_user_role() not in ('admin','staff') or public.get_user_role() is null then
    raise exception 'Active office account required' using errcode='42501';
  end if;
  if p_kind not in ('truck','driver','maintenance','document') then raise exception 'Unsupported fleet record'; end if;
  if p_kind='truck' then
    if nullif(btrim(p_data->>'plate_number'),'') is null or nullif(btrim(p_data->>'model'),'') is null
      or nullif(p_data->>'vehicle_type_id','') is null or coalesce((p_data->>'capacity_kg')::numeric,0)<=0 then
      raise exception 'Plate, model, vehicle type and positive capacity are required';
    end if;

    v_height_m := nullif(btrim(coalesce(p_data->>'height_m', '')), '')::numeric;
    v_width_m := nullif(btrim(coalesce(p_data->>'width_m', '')), '')::numeric;
    v_length_m := nullif(btrim(coalesce(p_data->>'length_m', '')), '')::numeric;
    v_tare_weight_kg := nullif(btrim(coalesce(p_data->>'tare_weight_kg', '')), '')::numeric;
    v_gross_weight_kg := nullif(btrim(coalesce(p_data->>'gross_weight_kg', '')), '')::numeric;
    v_axle_count := nullif(btrim(coalesce(p_data->>'axle_count', '')), '')::smallint;

    if v_height_m is not null and (v_height_m <= 0 or v_height_m > 10) then
      raise exception 'Truck height must be greater than 0 and at most 10 meters';
    end if;
    if v_width_m is not null and (v_width_m <= 0 or v_width_m > 10) then
      raise exception 'Truck width must be greater than 0 and at most 10 meters';
    end if;
    if v_length_m is not null and (v_length_m <= 0 or v_length_m > 50) then
      raise exception 'Truck length must be greater than 0 and at most 50 meters';
    end if;
    if v_tare_weight_kg is not null and v_tare_weight_kg < 0 then
      raise exception 'Tare weight cannot be negative';
    end if;
    if v_gross_weight_kg is not null and v_gross_weight_kg <= 0 then
      raise exception 'Gross vehicle weight must be positive';
    end if;
    if v_axle_count is not null and (v_axle_count < 2 or v_axle_count > 20) then
      raise exception 'Axle count must be between 2 and 20';
    end if;

    select updated_at, tare_weight_kg, gross_weight_kg
    into v_updated, v_existing_tare, v_existing_gross
    from public.trucks
    where id=v_id
    for update;

    if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then
      raise exception 'Record changed. Refresh and reopen before saving.';
    end if;

    v_eff_tare := case when p_id is null or p_data ? 'tare_weight_kg' then v_tare_weight_kg else v_existing_tare end;
    v_eff_gross := case when p_id is null or p_data ? 'gross_weight_kg' then v_gross_weight_kg else v_existing_gross end;
    if v_eff_tare is not null and v_eff_gross is not null and v_eff_gross < v_eff_tare then
      raise exception 'Gross vehicle weight cannot be less than tare weight';
    end if;

    if exists(select 1 from public.deliveries where truck_id=v_id and status in ('assigned','loading','in_transit')) then
      raise exception 'Vehicle has an active delivery; finish it before changing the vehicle.';
    end if;
    v_driver := nullif(p_data->>'assigned_driver_id','')::uuid;
    if v_driver is not null then
      perform 1 from public.drivers where id=v_driver and status='available' for update;
      if not found then raise exception 'Assigned driver must be available'; end if;
      if exists(select 1 from public.trucks where assigned_driver_id=v_driver and id<>v_id)
        or exists(select 1 from public.deliveries where driver_id=v_driver and status in ('assigned','loading','in_transit')) then
        raise exception 'Driver is already assigned or reserved';
      end if;
    end if;
    if p_id is null then
      insert into public.trucks(
        id, plate_number, model, model_year, vehicle_type_id, capacity_kg,
        assigned_driver_id, status, notes,
        height_m, width_m, length_m, tare_weight_kg, gross_weight_kg, axle_count
      )
      values(
        v_id, upper(btrim(p_data->>'plate_number')), btrim(p_data->>'model'), nullif(p_data->>'model_year','')::int,
        (p_data->>'vehicle_type_id')::uuid, (p_data->>'capacity_kg')::numeric,
        v_driver, coalesce(nullif(p_data->>'status',''),'available')::public.truck_status, p_data->>'notes',
        v_height_m, v_width_m, v_length_m, v_tare_weight_kg, v_gross_weight_kg, coalesce(v_axle_count, 2)
      );
    else
      update public.trucks set
        plate_number=upper(btrim(p_data->>'plate_number')),
        model=btrim(p_data->>'model'),
        model_year=nullif(p_data->>'model_year','')::int,
        vehicle_type_id=(p_data->>'vehicle_type_id')::uuid,
        capacity_kg=(p_data->>'capacity_kg')::numeric,
        assigned_driver_id=v_driver,
        status=(p_data->>'status')::public.truck_status,
        notes=p_data->>'notes',
        height_m=case when p_data ? 'height_m' then v_height_m else height_m end,
        width_m=case when p_data ? 'width_m' then v_width_m else width_m end,
        length_m=case when p_data ? 'length_m' then v_length_m else length_m end,
        tare_weight_kg=case when p_data ? 'tare_weight_kg' then v_tare_weight_kg else tare_weight_kg end,
        gross_weight_kg=case when p_data ? 'gross_weight_kg' then v_gross_weight_kg else gross_weight_kg end,
        axle_count=case when p_data ? 'axle_count' then coalesce(v_axle_count, 2) else axle_count end
      where id=v_id;
    end if;
    if p_categories is not null then
      delete from public.truck_cargo_categories where truck_id=v_id;
      insert into public.truck_cargo_categories(truck_id,cargo_category_id) select v_id,x from (select distinct unnest(p_categories) x)y;
    end if;
  elsif p_kind='driver' then
    if nullif(btrim(p_data->>'full_name'),'') is null or nullif(btrim(p_data->>'license_number'),'') is null then raise exception 'Driver name and license are required'; end if;
    v_truck := nullif(p_data->>'assigned_truck_id','')::uuid;
    if v_truck is not null then
      perform 1 from public.trucks where id=v_truck and assigned_driver_id is null and status='available' for update;
      if not found or exists(select 1 from public.deliveries where truck_id=v_truck and status in ('assigned','loading','in_transit'))
        or exists(select 1 from public.maintenance_records where truck_id=v_truck and status='in_progress') then raise exception 'Vehicle is no longer assignable'; end if;
    end if;
    select updated_at into v_updated from public.drivers where id=v_id for update;
    if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
    if exists(select 1 from public.deliveries where driver_id=v_id and status in ('assigned','loading','in_transit')) then raise exception 'Driver has an active delivery; finish it before changing the driver.'; end if;
    if p_id is null then
      if nullif(p_data->>'user_id','') is not null and not exists(select 1 from public.users where id=(p_data->>'user_id')::uuid and role='driver') then raise exception 'Driver account is invalid'; end if;
      insert into public.drivers(id,user_id,full_name,license_number,contact_number,date_hired,emergency_contact_number,status,notes)
        values(v_id,nullif(p_data->>'user_id','')::uuid,btrim(p_data->>'full_name'),btrim(p_data->>'license_number'),
         p_data->>'contact_number',nullif(p_data->>'date_hired','')::date,p_data->>'emergency_contact_number','available',p_data->>'notes');
    else
      update public.drivers set full_name=btrim(p_data->>'full_name'),license_number=btrim(p_data->>'license_number'),
        contact_number=p_data->>'contact_number',date_hired=nullif(p_data->>'date_hired','')::date,
        emergency_contact_number=p_data->>'emergency_contact_number',status=(p_data->>'status')::public.driver_status,notes=p_data->>'notes' where id=v_id;
    end if;
    if v_truck is not null then
      if exists(select 1 from public.trucks where assigned_driver_id=v_id and id<>v_truck) then raise exception 'Driver is already assigned to a vehicle'; end if;
      update public.trucks set assigned_driver_id=v_id where id=v_truck;
    end if;
  elsif p_kind='maintenance' then
    v_truck := (p_data->>'truck_id')::uuid;
    if v_truck is null or nullif(p_data->>'scheduled_date','') is null then raise exception 'Vehicle and scheduled date are required'; end if;
    perform 1 from public.trucks where id=v_truck for update;
    if not found then raise exception 'Vehicle not found'; end if;
    select updated_at into v_updated from public.maintenance_records where id=v_id for update;
    if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
    if p_data->>'status'='in_progress' and exists(select 1 from public.deliveries where truck_id=v_truck and status in ('assigned','loading','in_transit')) then raise exception 'Vehicle has an active delivery; cannot start maintenance'; end if;
    if p_data->>'status'='completed' and nullif(p_data->>'completed_date','') is null then raise exception 'Completion date is required'; end if;
    if nullif(p_data->>'completed_date','')::date < (p_data->>'scheduled_date')::date then raise exception 'Completion cannot precede scheduled date'; end if;
    if p_id is null then
      insert into public.maintenance_records(id,truck_id,kind,status,scheduled_date,completed_date,description,vendor,cost,created_by)
        values(v_id,v_truck,coalesce(p_data->>'kind','preventive')::public.maintenance_kind,
         coalesce(p_data->>'status','scheduled')::public.maintenance_status,(p_data->>'scheduled_date')::date,
         nullif(p_data->>'completed_date','')::date,p_data->>'description',p_data->>'vendor',nullif(p_data->>'cost','')::numeric,auth.uid());
    else
      update public.maintenance_records set kind=(p_data->>'kind')::public.maintenance_kind,status=(p_data->>'status')::public.maintenance_status,
        scheduled_date=(p_data->>'scheduled_date')::date,completed_date=nullif(p_data->>'completed_date','')::date,
        description=p_data->>'description',vendor=p_data->>'vendor',cost=nullif(p_data->>'cost','')::numeric where id=v_id and truck_id=v_truck;
      if not found then raise exception 'Maintenance vehicle cannot be changed'; end if;
    end if;
  elsif p_kind='document' then
    v_path := nullif(p_data->>'file_path','');
    select updated_at into v_updated from public.compliance_documents where id=v_id for update;
    if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
    if v_path is not null and not exists(select 1 from public.compliance_documents where id=v_id and file_path=v_path) then
      if split_part(v_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='compliance-documents' and name=v_path) then raise exception 'Upload the document before saving'; end if;
    end if;
    if p_id is null then
      insert into public.compliance_documents(id,driver_id,truck_id,doc_type,document_number,issued_date,expiry_date,file_path,review_status,remarks,uploaded_by,reviewed_by,reviewed_at)
        values(v_id,nullif(p_data->>'driver_id','')::uuid,nullif(p_data->>'truck_id','')::uuid,(p_data->>'doc_type')::public.compliance_doc_type,
        p_data->>'document_number',nullif(p_data->>'issued_date','')::date,nullif(p_data->>'expiry_date','')::date,v_path,
        coalesce(p_data->>'review_status','pending_review')::public.review_status,p_data->>'remarks',auth.uid(),
        case when p_data->>'review_status' in ('approved','rejected') then auth.uid() end,
        case when p_data->>'review_status' in ('approved','rejected') then now() end);
    else
      update public.compliance_documents set document_number=p_data->>'document_number',issued_date=nullif(p_data->>'issued_date','')::date,
        expiry_date=nullif(p_data->>'expiry_date','')::date,file_path=v_path,review_status=(p_data->>'review_status')::public.review_status,
        remarks=p_data->>'remarks',reviewed_by=case when p_data->>'review_status' in ('approved','rejected') then auth.uid() end,
        reviewed_at=case when p_data->>'review_status' in ('approved','rejected') then now() end where id=v_id;
    end if;
  end if;
  for v_doc in select value from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) loop
    if p_kind not in ('truck','driver') then raise exception 'Nested documents only supported for vehicles/drivers'; end if;
    v_doc := v_doc - 'truck_id' - 'driver_id' || jsonb_build_object(case when p_kind='truck' then 'truck_id' else 'driver_id' end,v_id);
    perform public.fleet_save('document',null,v_doc,null,'[]'::jsonb,null);
  end loop;
  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.fleet_save(text, uuid, jsonb, uuid[], jsonb, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_save(text, uuid, jsonb, uuid[], jsonb, timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.delivery_routing_context(p_delivery uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  d public.deliveries%ROWTYPE;
  s public.shipments%ROWTYPE;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('driver', 'admin', 'staff') THEN
    RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.deliveries WHERE id = p_delivery;
  IF NOT FOUND OR (public.get_user_role() = 'driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.shipments WHERE id = d.shipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'delivery', to_jsonb(d),
    'shipment', jsonb_build_object(
      'id', s.id,
      'updated_at', s.updated_at,
      'status', s.status,
      'pickup_lat', s.pickup_lat,
      'pickup_lng', s.pickup_lng,
      'dropoff_lat', s.dropoff_lat,
      'dropoff_lng', s.dropoff_lng,
      'route_geometry', s.route_geometry,
      'weight_kg', s.weight_kg
    ),
    'truck', (
      SELECT jsonb_build_object(
        'id', tr.id,
        'plate_number', tr.plate_number,
        'model', tr.model,
        'capacity_kg', tr.capacity_kg,
        'height_m', coalesce(tr.height_m, vt.default_height_m),
        'width_m', coalesce(tr.width_m, vt.default_width_m),
        'length_m', coalesce(tr.length_m, vt.default_length_m),
        'tare_weight_kg', tr.tare_weight_kg,
        'gross_weight_kg', tr.gross_weight_kg,
        'axle_count', coalesce(tr.axle_count, 2),
        'vehicle_type_name', vt.name
      )
      FROM public.trucks tr
      LEFT JOIN public.vehicle_types vt ON vt.id = tr.vehicle_type_id
      WHERE tr.id = d.truck_id
    ),
    'plan', (SELECT to_jsonb(p) FROM public.delivery_route_plans p WHERE delivery_id = d.id),
    'eta', (SELECT to_jsonb(e) FROM public.delivery_route_eta e WHERE delivery_id = d.id),
    'position', (
      SELECT to_jsonb(p)
      FROM (
        SELECT latitude, longitude, accuracy_m, recorded_at
        FROM public.tracking_logs
        WHERE delivery_id = d.id
        ORDER BY recorded_at DESC, id DESC
        LIMIT 1
      ) p
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delivery_routing_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_routing_context(uuid) TO authenticated;
