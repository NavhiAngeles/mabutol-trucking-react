-- Shared atomic assignment for initial bookings and staff retries.
CREATE OR REPLACE FUNCTION public.assign_shipment_resources(p_shipment uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  shipment public.shipments%ROWTYPE;
  candidate record;
  delivery_id uuid;
BEGIN
  IF current_user NOT IN ('postgres','service_role')
     AND coalesce(public.get_user_role(),'') NOT IN ('admin','staff') THEN
    RAISE EXCEPTION 'Only admin or staff may assign deliveries' USING ERRCODE='42501';
  END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;
  SELECT id INTO delivery_id FROM public.deliveries WHERE shipment_id=shipment.id AND status<>'cancelled';
  IF FOUND THEN RETURN delivery_id; END IF;
  IF shipment.status<>'booked' THEN RAISE EXCEPTION 'Only booked shipments can be assigned'; END IF;
  IF shipment.requested_vehicle_type_id IS NULL OR shipment.weight_kg IS NULL OR shipment.weight_kg<=0 THEN
    RETURN NULL;
  END IF;
  SELECT t.id AS truck_id, d.id AS driver_id INTO candidate
  FROM public.trucks t
  JOIN public.drivers d ON (t.assigned_driver_id IS NULL OR t.assigned_driver_id = d.id)
  WHERE t.status = 'available' AND d.status = 'available'
    AND t.vehicle_type_id = shipment.requested_vehicle_type_id
    AND t.capacity_kg >= shipment.weight_kg
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_records m WHERE m.truck_id = t.id AND m.status = 'in_progress')
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.truck_id = t.id AND a.status IN ('assigned','loading','in_transit'))
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.driver_id = d.id AND a.status IN ('assigned','loading','in_transit'))
  ORDER BY (t.assigned_driver_id = d.id) DESC NULLS LAST, t.capacity_kg, t.id, d.id
  LIMIT 1
  FOR UPDATE OF t, d SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.deliveries (shipment_id, truck_id, driver_id, status, assigned_by)
    VALUES (shipment.id, candidate.truck_id, candidate.driver_id, 'assigned', auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO delivery_id;
  END IF;

  RETURN delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_shipment_resources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_shipment_resources(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_assign_booked_shipment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.status='booked' THEN
    PERFORM public.assign_shipment_resources(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_assign_booked_shipment() FROM PUBLIC;
