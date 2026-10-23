-- Development Dashboard/Fleet integration. Existing records and assignment rules retained.
-- Rollback: revoke/drop public.fleet_save(text,uuid,jsonb,uuid[],jsonb,timestamptz),
-- remove only the named fleet compliance policies and added publication memberships.
-- Keep uploaded objects/document rows; never delete application data during rollback.

create or replace function public.fleet_save(
 p_kind text, p_id uuid, p_data jsonb,
 p_categories uuid[] default null, p_documents jsonb default '[]'::jsonb,
 p_expected timestamptz default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
 v_id uuid := coalesce(p_id, gen_random_uuid());
 v_updated timestamptz;
 v_truck uuid;
 v_driver uuid;
 v_doc jsonb;
 v_path text;
 v_owner text;
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
   select updated_at into v_updated from public.trucks where id=v_id for update;
   if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
   if exists(select 1 from public.deliveries where truck_id=v_id and status in ('assigned','loading','in_transit')) then raise exception 'Vehicle has an active delivery; finish it before changing the vehicle.'; end if;
   v_driver := nullif(p_data->>'assigned_driver_id','')::uuid;
   if v_driver is not null then
     perform 1 from public.drivers where id=v_driver and status='available' for update;
     if not found then raise exception 'Assigned driver must be available'; end if;
     if exists(select 1 from public.trucks where assigned_driver_id=v_driver and id<>v_id)
       or exists(select 1 from public.deliveries where driver_id=v_driver and status in ('assigned','loading','in_transit')) then raise exception 'Driver is already assigned or reserved'; end if;
   end if;
   if p_id is null then
     insert into public.trucks(id,plate_number,model,model_year,vehicle_type_id,capacity_kg,assigned_driver_id,status,notes)
       values(v_id,upper(btrim(p_data->>'plate_number')),btrim(p_data->>'model'),nullif(p_data->>'model_year','')::int,
        (p_data->>'vehicle_type_id')::uuid,(p_data->>'capacity_kg')::numeric,v_driver,
        coalesce(nullif(p_data->>'status',''),'available')::public.truck_status,p_data->>'notes');
   else
     update public.trucks set plate_number=upper(btrim(p_data->>'plate_number')),model=btrim(p_data->>'model'),
       model_year=nullif(p_data->>'model_year','')::int,vehicle_type_id=(p_data->>'vehicle_type_id')::uuid,
       capacity_kg=(p_data->>'capacity_kg')::numeric,assigned_driver_id=v_driver,
       status=(p_data->>'status')::public.truck_status,notes=p_data->>'notes' where id=v_id;
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
$$;
revoke all on function public.fleet_save(text,uuid,jsonb,uuid[],jsonb,timestamptz) from public,anon;
grant execute on function public.fleet_save(text,uuid,jsonb,uuid[],jsonb,timestamptz) to authenticated;

-- Private, unique uploads; no overwriting existing objects.
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'] where id='compliance-documents';
create policy "fleet office upload compliance" on storage.objects for insert to authenticated
 with check (bucket_id='compliance-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.get_user_role() in ('admin','staff'));
create policy "fleet office read compliance" on storage.objects for select to authenticated
 using (bucket_id='compliance-documents' and public.get_user_role() in ('admin','staff'));
create policy "fleet cleanup own unlinked upload" on storage.objects for delete to authenticated
 using (bucket_id='compliance-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.get_user_role() in ('admin','staff')
 and not exists(select 1 from public.compliance_documents d where d.file_path=name));

do $$ declare t text; begin
 foreach t in array array['trucks','drivers','maintenance_records','compliance_documents','shipment_status_history'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
     execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
 end loop;
end $$;
