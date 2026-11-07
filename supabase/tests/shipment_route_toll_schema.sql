-- Test suite: Reconcile shipments route and toll-pricing schema contract
-- Rollback only: verifies additive columns, route geometry, embedded toll pricing, allowance, and actor persistence.

BEGIN;

DO $test$
DECLARE
  admin_user uuid := gen_random_uuid();
  customer_id uuid;
  vehicle_id uuid;
  shipment_id uuid;
  delivery_id uuid;
  loaded_shipment record;
  loaded_delivery record;
  test_geom jsonb := jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_build_array(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(jsonb_build_array(120.96, 14.6), jsonb_build_array(121.1, 14.8)))
      )
    ),
    'booking_pricing', jsonb_build_object(
      'version', 1,
      'toll_preference', 'expressway',
      'toll_amount', 211,
      'toll_class', 'Class 2',
      'toll_rates', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'highway', 'NLEX', 'gate_name', 'Balintawak', 'vehicle_class', 'Class 2', 'fee', 211)
      )
    )
  );
BEGIN
  -- Setup test admin caller
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (admin_user, 'route-toll-test-admin@example.invalid', '{"role":"admin"}', '{}');
  UPDATE public.users SET role = 'admin', is_active = true WHERE id = admin_user;

  PERFORM set_config('request.jwt.claim.sub', admin_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', admin_user, 'role', 'authenticated')::text, true);

  -- Retrieve fixtures
  SELECT id INTO customer_id FROM public.customers WHERE is_active LIMIT 1;
  IF customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone, address, is_active)
    VALUES ('Schema Test Customer', '+639123456789', 'Manila', true)
    RETURNING id INTO customer_id;
  END IF;

  SELECT id INTO vehicle_id FROM public.vehicle_types WHERE is_active LIMIT 1;
  IF vehicle_id IS NULL THEN
    INSERT INTO public.vehicle_types (name, default_capacity_kg, is_active)
    VALUES ('Test Truck Type', 4000, true)
    RETURNING id INTO vehicle_id;
  END IF;

  -- 1. Insert shipment booking with route, toll, allowance, and actor metadata
  INSERT INTO public.shipments (
    customer_id,
    status,
    booking_source,
    pickup_address,
    dropoff_address,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    distance_km,
    route_source,
    route_duration_minutes,
    route_geometry,
    driver_allowance,
    toll_fees,
    created_by,
    cargo_description,
    weight_kg,
    requested_vehicle_type_id,
    quoted_amount,
    scheduled_departure
  ) VALUES (
    customer_id,
    'booked',
    'web',
    'Balagtas, Bulacan',
    'Star City, Pasay',
    14.833861,
    120.901574,
    14.5583,
    120.9856,
    42.5,
    'provider',
    55,
    test_geom,
    750,
    211,
    admin_user,
    'Palletized cargo',
    2500,
    vehicle_id,
    4500,
    now() + interval '1 day'
  ) RETURNING id INTO shipment_id;

  -- 2. Verify stored shipment fields match contract exactly
  SELECT * INTO loaded_shipment FROM public.shipments WHERE id = shipment_id;
  IF loaded_shipment.id IS NULL THEN
    RAISE EXCEPTION 'Shipment insertion failed';
  END IF;

  IF loaded_shipment.route_source <> 'provider' THEN
    RAISE EXCEPTION 'route_source mismatch: expected provider, got %', loaded_shipment.route_source;
  END IF;

  IF loaded_shipment.route_duration_minutes <> 55 THEN
    RAISE EXCEPTION 'route_duration_minutes mismatch: expected 55, got %', loaded_shipment.route_duration_minutes;
  END IF;

  IF (loaded_shipment.route_geometry->'booking_pricing'->>'version')::int <> 1 THEN
    RAISE EXCEPTION 'route_geometry booking_pricing version mismatch';
  END IF;

  IF (loaded_shipment.route_geometry->'booking_pricing'->>'toll_amount')::numeric <> 211 THEN
    RAISE EXCEPTION 'route_geometry booking_pricing toll_amount mismatch: expected 211, got %',
      loaded_shipment.route_geometry->'booking_pricing'->>'toll_amount';
  END IF;

  IF loaded_shipment.toll_fees <> 211 THEN
    RAISE EXCEPTION 'toll_fees mismatch: expected 211, got %', loaded_shipment.toll_fees;
  END IF;

  IF loaded_shipment.driver_allowance <> 750 THEN
    RAISE EXCEPTION 'driver_allowance mismatch: expected 750, got %', loaded_shipment.driver_allowance;
  END IF;

  IF loaded_shipment.created_by <> admin_user THEN
    RAISE EXCEPTION 'created_by mismatch: expected %, got %', admin_user, loaded_shipment.created_by;
  END IF;

  -- 3. Verify delivery inherits shipment driver_allowance via stamp_delivery_allowance
  INSERT INTO public.deliveries (
    shipment_id,
    status
  ) VALUES (
    shipment_id,
    'assigned'
  ) RETURNING id INTO delivery_id;

  SELECT * INTO loaded_delivery FROM public.deliveries WHERE id = delivery_id;
  IF loaded_delivery.driver_allowance <> 750 THEN
    RAISE EXCEPTION 'delivery failed to inherit booked driver_allowance: expected 750, got %', loaded_delivery.driver_allowance;
  END IF;

  RAISE NOTICE 'shipment route and toll-pricing schema verification passed';
END;
$test$;

ROLLBACK;

