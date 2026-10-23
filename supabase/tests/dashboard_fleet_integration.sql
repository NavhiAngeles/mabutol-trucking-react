-- Development-only rollback verification; run against tanaw-dev, not the original Tanaw project.
-- Uses an existing active administrator only inside this transaction. No credentials are embedded.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from public.users where role='admin' and is_active limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare t uuid; d uuid; m uuid; doc uuid; version timestamptz; before_count int;
begin
 select count(*) into before_count from public.trucks;
 begin
   perform public.fleet_save('truck',null,'{"plate_number":"VERIFY-INVALID","model":"Validation","capacity_kg":-1}'::jsonb);
   raise exception 'negative capacity unexpectedly succeeded';
 exception when raise_exception then if sqlerrm='negative capacity unexpectedly succeeded' then raise; end if; end;
 if (select count(*) from public.trucks)<>before_count then raise exception 'invalid truck left data'; end if;
 select count(*) into before_count from public.drivers;
 begin
   perform public.fleet_save('driver',null,'{"full_name":"Rollback fixture","license_number":"VERIFY-ROLLBACK"}',null,
     '[{"doc_type":"drivers_license","review_status":"valid"}]');
   raise exception 'invalid document unexpectedly succeeded';
 exception when invalid_text_representation then null; end;
 if (select count(*) from public.drivers)<>before_count then raise exception 'registration not atomic'; end if;
 d := public.fleet_save('driver',null,'{"full_name":"Transactional fixture","license_number":"VERIFY-TEMP"}',null,
   '[{"doc_type":"drivers_license","document_number":"VERIFY-TEMP","review_status":"pending_review"}]');
 if not exists(select 1 from public.compliance_documents where driver_id=d) then raise exception 'driver document missing'; end if;
 t := public.fleet_save('truck',null,jsonb_build_object('plate_number','VERIFY-TEMP','model','Verification','capacity_kg',1000,'vehicle_type_id',(select id from public.vehicle_types limit 1),'assigned_driver_id',d));
 if not exists(select 1 from public.trucks where id=t and assigned_driver_id=d) then raise exception 'driver assignment missing'; end if;
 begin
   perform public.fleet_save('truck',null,jsonb_build_object('plate_number','VERIFY-DUPLICATE','model','Verification','capacity_kg',1000,'vehicle_type_id',(select id from public.vehicle_types limit 1),'assigned_driver_id',d));
   raise exception 'reserved driver unexpectedly reassigned';
 exception when raise_exception then if sqlerrm='reserved driver unexpectedly reassigned' then raise; end if; end;
 m := public.fleet_save('maintenance',null,jsonb_build_object('truck_id',t,'kind','inspection','status','in_progress','scheduled_date',current_date));
 select updated_at into version from public.maintenance_records where id=m;
 perform public.fleet_save('maintenance',m,jsonb_build_object('truck_id',t,'kind','inspection','status','completed','scheduled_date',current_date,'completed_date',current_date,'cost',0),null,'[]',version);
 begin
   perform public.fleet_save('maintenance',m,jsonb_build_object('truck_id',t,'kind','inspection','status','scheduled','scheduled_date',current_date),null,'[]','2000-01-01');
   raise exception 'stale edit unexpectedly succeeded';
 exception when raise_exception then if sqlerrm='stale edit unexpectedly succeeded' then raise; end if; end;
 begin
   perform public.fleet_save('document',null,jsonb_build_object('truck_id',t,'doc_type','insurance','file_path','someone-else/fake.pdf'));
   raise exception 'foreign file unexpectedly linked';
 exception when raise_exception then if sqlerrm='foreign file unexpectedly linked' then raise; end if; end;
end $test$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
do $denied$ begin
 begin
   perform public.fleet_save('driver',null,'{"full_name":"Denied","license_number":"DENIED"}');
   raise exception 'unauthorized save succeeded';
 exception when insufficient_privilege then null; end;
end $denied$;
reset role;
rollback;
select jsonb_build_object('result','passed: active office CRUD, atomic rollback, driver assignment conflict, stale edit, foreign file rejection, unknown-user denial; all fixtures rolled back',
 'trucks',(select count(*) from public.trucks),'drivers',(select count(*) from public.drivers),'maintenance',(select count(*) from public.maintenance_records),'documents',(select count(*) from public.compliance_documents));
