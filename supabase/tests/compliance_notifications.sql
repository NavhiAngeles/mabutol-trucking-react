-- Compliance & Maintenance Notifications Producer Integration Tests
-- All changes roll back.
begin;

do $$
declare
  marker text := 'comp-notif-' || gen_random_uuid()::text;
  admin_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  optout_id uuid := gen_random_uuid();
  cust_id uuid := gen_random_uuid();
  test_driver uuid := gen_random_uuid();
  test_truck uuid := gen_random_uuid();
  test_now timestamptz := '2026-11-07T08:00:00+08:00'; -- 2026-11-07 Manila
  v_count integer;
  n_admin integer;
  n_staff integer;
  n_optout integer;
  n_cust integer;
begin
  -- 1. Create fixture accounts in auth.users & public.users
  insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data) values
    (admin_id, marker || '-admin@example.invalid', '{"provisioned_role":"admin"}', '{"full_name":"Fixture Admin"}'),
    (staff_id, marker || '-staff@example.invalid', '{"provisioned_role":"staff"}', '{"full_name":"Fixture Staff"}'),
    (optout_id, marker || '-optout@example.invalid', '{"provisioned_role":"staff"}', '{"full_name":"Fixture Optout"}'),
    (cust_id, marker || '-cust@example.invalid', '{}', '{"full_name":"Fixture Customer"}');

  update public.users set role = 'admin', is_active = true where id = admin_id;
  update public.users set role = 'staff', is_active = true where id = staff_id;
  update public.users set role = 'staff', is_active = true where id = optout_id;
  update public.users set role = 'customer', is_active = true where id = cust_id;

  -- Opt-out user disables compliance_expiry in-app notifications
  insert into public.notification_preferences(user_id, type, channel, enabled)
  values(optout_id, 'compliance_expiry', 'in_app', false);

  -- 2. Configure system_settings.compliance_thresholds
  insert into public.system_settings(key, value, updated_by)
  values(
    'compliance_thresholds',
    '{"drivers_license":{"first":60,"critical":15},"medical_certificate":{"first":45,"critical":10},"nbi_clearance":{"first":30,"critical":7},"lto_registration":{"first":45,"critical":15},"insurance":{"first":60,"critical":15},"franchise_permit":{"first":60,"critical":15},"emission_test":{"first":21,"critical":7},"maintenance":{"first":14,"critical":3}}'::jsonb,
    admin_id
  )
  on conflict(key) do update set value = excluded.value, updated_by = excluded.updated_by;

  -- 3. Create active driver and truck fixtures
  insert into public.drivers(id, user_id, full_name, status)
  values(test_driver, admin_id, 'Test Driver ' || marker, 'available');

  insert into public.trucks(id, plate_number, model, status)
  values(test_truck, 'TEST-' || substr(marker, 1, 4), 'Hino 500', 'available');

  -- 4. Create compliance documents:
  -- (a) Driver's license: expires 2026-11-17 (10 days -> critical <= 15) -> ALERT
  insert into public.compliance_documents(id, driver_id, doc_type, expiry_date, review_status, created_at)
  values(gen_random_uuid(), test_driver, 'drivers_license', '2026-11-17', 'approved', test_now - interval '10 days');

  -- (b) Medical certificate: expires 2026-12-02 (25 days -> expiring soon <= 45, > 10) -> ALERT
  insert into public.compliance_documents(id, driver_id, doc_type, expiry_date, review_status, created_at)
  values(gen_random_uuid(), test_driver, 'medical_certificate', '2026-12-02', 'approved', test_now - interval '5 days');

  -- (c) NBI clearance: expires 2027-05-01 (175 days -> valid > 30) -> NO ALERT
  insert into public.compliance_documents(id, driver_id, doc_type, expiry_date, review_status, created_at)
  values(gen_random_uuid(), test_driver, 'nbi_clearance', '2027-05-01', 'approved', test_now - interval '1 day');

  -- (d) Rejected document (should not trigger alert)
  insert into public.compliance_documents(id, driver_id, doc_type, expiry_date, review_status, created_at)
  values(gen_random_uuid(), test_driver, 'insurance', '2026-11-10', 'rejected', test_now - interval '2 days');

  -- (e) Truck OR/CR Registration: expired on 2026-11-02 (-5 days < 0) -> ALERT
  insert into public.compliance_documents(id, truck_id, doc_type, expiry_date, review_status, created_at)
  values(gen_random_uuid(), test_truck, 'lto_registration', '2026-11-02', 'approved', test_now - interval '20 days');

  -- 5. Create maintenance records:
  -- (a) Scheduled maintenance due on 2026-11-09 (2 days -> critical <= 3) -> ALERT
  insert into public.maintenance_records(id, truck_id, kind, status, scheduled_date, description, created_by)
  values(gen_random_uuid(), test_truck, 'preventive', 'scheduled', '2026-11-09', 'Oil Change', admin_id);

  -- (b) Completed maintenance (should NOT trigger alert)
  insert into public.maintenance_records(id, truck_id, kind, status, scheduled_date, completed_date, description, created_by)
  values(gen_random_uuid(), test_truck, 'corrective', 'completed', '2026-11-01', '2026-11-01', 'Brake Check', admin_id);

  -- Set auth context to admin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  -- RUN 1: Produce notifications
  v_count := public.produce_compliance_notifications(test_now);

  -- We have 4 alerting items:
  -- 1) Driver's License (critical)
  -- 2) Medical Certificate (due soon)
  -- 3) Truck LTO Registration (expired)
  -- 4) Truck Maintenance (critical)
  -- Recipients: admin_id (opted-in) + staff_id (opted-in) = 2 recipients * 4 alerts = 8 notifications
  if v_count < 8 then
    raise exception 'Expected at least 8 notifications generated for 2 office users across 4 alerting items, got %', v_count;
  end if;

  select count(*) into n_admin from public.notifications where user_id = admin_id and type = 'compliance_expiry';
  select count(*) into n_staff from public.notifications where user_id = staff_id and type = 'compliance_expiry';
  select count(*) into n_optout from public.notifications where user_id = optout_id;
  select count(*) into n_cust from public.notifications where user_id = cust_id;

  if n_admin < 4 then raise exception 'Admin received fewer than 4 notifications: %', n_admin; end if;
  if n_staff < 4 then raise exception 'Staff received fewer than 4 notifications: %', n_staff; end if;
  if n_optout <> 0 then raise exception 'Opted-out office user received % notifications (expected 0)', n_optout; end if;
  if n_cust <> 0 then raise exception 'Customer user received % notifications (expected 0)', n_cust; end if;

  -- Verify alert titles exist
  if not exists(select 1 from public.notifications where user_id = admin_id and title like 'Critical Compliance: Driver''s License%') then
    raise exception 'Missing Critical Driver License notification';
  end if;
  if not exists(select 1 from public.notifications where user_id = admin_id and title like 'Compliance Due Soon: Medical Certificate%') then
    raise exception 'Missing Medical Certificate notification';
  end if;
  if not exists(select 1 from public.notifications where user_id = admin_id and title like 'Compliance Expired: OR/CR Registration%') then
    raise exception 'Missing Expired OR/CR notification';
  end if;
  if not exists(select 1 from public.notifications where user_id = admin_id and title like 'Critical Maintenance%') then
    raise exception 'Missing Critical Maintenance notification';
  end if;

  -- RUN 2 (IDEMPOTENCY): Calling immediately with the same timestamp must produce 0 duplicate notifications
  v_count := public.produce_compliance_notifications(test_now);
  if v_count <> 0 then
    raise exception 'Idempotency failed: second run produced % new notifications (expected 0)', v_count;
  end if;

  -- RUN 3 (READ NOTIFICATION DEDUPLICATION): Mark one notification as read, run again on the same day -> must still be 0
  update public.notifications set read_at = test_now where user_id = admin_id;
  v_count := public.produce_compliance_notifications(test_now);
  if v_count <> 0 then
    raise exception 'Same-day deduplication failed after read_at update: produced % new notifications (expected 0)', v_count;
  end if;

  -- RUN 4 (AUTHORIZATION): Customer user must be denied
  perform set_config('request.jwt.claims', jsonb_build_object('sub', cust_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.produce_compliance_notifications(test_now);
    raise exception 'Unauthorized customer was able to execute producer';
  exception when others then
    if sqlerrm not like '%Office access required%' and sqlstate <> '42501' then
      raise;
    end if;
  end;

end $$;

rollback;
select 'PASS: compliance & maintenance producer generates deduplicated in-app notifications for opted-in office users with full idempotency; all rolled back' as result;

