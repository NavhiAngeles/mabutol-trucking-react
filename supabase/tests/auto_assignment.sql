BEGIN;
DO $auth$
DECLARE actor uuid;
BEGIN
  SELECT id INTO actor FROM public.users WHERE is_active AND role::text IN ('admin','staff') LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'An active staff account is required for the RLS test'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
END;
$auth$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  customer uuid; vehicle uuid; driver uuid; truck uuid;
  other_driver uuid; other_truck uuid;
  first_booking uuid; second_booking uuid; pending_booking uuid; heavy_booking uuid; maintained_booking uuid;
  marker text := 'assignment-test-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.customers(name, customer_code) VALUES (marker,marker) RETURNING id INTO customer;
  INSERT INTO public.vehicle_types(name) VALUES(marker) RETURNING id INTO vehicle;
  INSERT INTO public.drivers(full_name,license_number) VALUES(marker,marker) RETURNING id INTO driver;
  INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,assigned_driver_id)
  VALUES(marker,vehicle,1000,driver) RETURNING id INTO truck;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg,status)
  VALUES(customer,marker||'-pending','Test','Test',vehicle,500,'pending') RETURNING id INTO pending_booking;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=pending_booking) THEN RAISE EXCEPTION 'Pending shipment assigned'; END IF;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-heavy','Test','Test',vehicle,1001) RETURNING id INTO heavy_booking;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=heavy_booking) THEN RAISE EXCEPTION 'Overweight assignment'; END IF;
  INSERT INTO public.maintenance_records(truck_id,status,scheduled_date) VALUES(truck,'in_progress',current_date);
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-maintenance','Test','Test',vehicle,500) RETURNING id INTO maintained_booking;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=maintained_booking) THEN RAISE EXCEPTION 'Maintenance assignment'; END IF;
  UPDATE public.maintenance_records SET status='completed' WHERE truck_id=truck;
  UPDATE public.drivers SET status='off_duty' WHERE id=driver;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-offduty','Test','Test',vehicle,500) RETURNING id INTO maintained_booking;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=maintained_booking) THEN RAISE EXCEPTION 'Off-duty assignment'; END IF;
  UPDATE public.drivers SET status='available' WHERE id=driver;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-first','Test','Test',vehicle,500) RETURNING id INTO first_booking;
  IF NOT EXISTS(SELECT 1 FROM public.deliveries a WHERE a.shipment_id=first_booking AND a.driver_id=driver AND a.truck_id=truck AND a.status='assigned')
  THEN RAISE EXCEPTION 'Available pair not assigned'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=first_booking AND status='assigned') THEN RAISE EXCEPTION 'Status sync failed'; END IF;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-second','Test','Test',vehicle,500) RETURNING id INTO second_booking;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=second_booking) THEN RAISE EXCEPTION 'Double assignment'; END IF;
  IF public.assign_shipment_resources(second_booking) IS NOT NULL THEN RAISE EXCEPTION 'Retry must respect reservation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=second_booking AND status='booked') THEN RAISE EXCEPTION 'No availability booking lost'; END IF;
  INSERT INTO public.drivers(full_name,license_number,status) VALUES(marker||'-other',marker||'-other','off_duty') RETURNING id INTO other_driver;
  INSERT INTO public.trucks(plate_number,vehicle_type_id,capacity_kg,status) VALUES(marker||'-other',vehicle,1000,'inactive') RETURNING id INTO other_truck;
  BEGIN
    INSERT INTO public.deliveries(shipment_id,truck_id,driver_id) VALUES(second_booking,other_truck,driver);
    RAISE EXCEPTION 'Driver uniqueness guard failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.deliveries(shipment_id,truck_id,driver_id) VALUES(second_booking,truck,other_driver);
    RAISE EXCEPTION 'Truck uniqueness guard failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.deliveries SET status='delivered' WHERE shipment_id=first_booking;
  IF public.assign_shipment_resources(second_booking) IS NULL THEN RAISE EXCEPTION 'Waiting booking not assigned after resources free'; END IF;
  IF public.assign_shipment_resources(second_booking) IS DISTINCT FROM
    (SELECT id FROM public.deliveries WHERE shipment_id=second_booking AND status<>'cancelled')
  THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
  UPDATE public.deliveries SET status='delivered' WHERE shipment_id=second_booking;
  INSERT INTO public.shipments(customer_id,tracking_number,pickup_address,dropoff_address,requested_vehicle_type_id,weight_kg)
  VALUES(customer,marker||'-reuse','Test','Test',vehicle,500) RETURNING id INTO second_booking;
  IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=second_booking) THEN RAISE EXCEPTION 'Completed resource not reusable'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'PASS: pending, capacity, maintenance, off-duty, assignment/status sync, no availability, reservation, reuse; fixtures rolled back' AS result;
