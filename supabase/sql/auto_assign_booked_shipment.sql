-- Automatic assignment for confirmed bookings. Existing delivery sync updates shipment status.
-- Rollback: DROP TRIGGER trg_shipments_zz_auto_assign ON public.shipments;
--           DROP FUNCTION public.auto_assign_booked_shipment();
--           DROP INDEX public.deliveries_one_active_per_driver;
--           DROP INDEX public.deliveries_one_active_per_truck;
CREATE UNIQUE INDEX deliveries_one_active_per_driver ON public.deliveries(driver_id) WHERE status IN ('assigned','loading','in_transit');
CREATE UNIQUE INDEX deliveries_one_active_per_truck ON public.deliveries(truck_id) WHERE status IN ('assigned','loading','in_transit');
CREATE OR REPLACE FUNCTION public.auto_assign_booked_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  candidate record;
BEGIN
  IF NEW.status <> 'booked' OR NEW.requested_vehicle_type_id IS NULL
     OR NEW.weight_kg IS NULL OR NEW.weight_kg <= 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE shipment_id = NEW.id AND status <> 'cancelled') THEN
    RETURN NULL;
  END IF;

  SELECT t.id AS truck_id, d.id AS driver_id INTO candidate
  FROM public.trucks t
  JOIN public.drivers d ON (t.assigned_driver_id IS NULL OR t.assigned_driver_id = d.id)
  WHERE t.status = 'available' AND d.status = 'available'
    AND t.vehicle_type_id = NEW.requested_vehicle_type_id
    AND t.capacity_kg >= NEW.weight_kg
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_records m WHERE m.truck_id = t.id AND m.status = 'in_progress')
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.truck_id = t.id AND a.status IN ('assigned','loading','in_transit'))
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.driver_id = d.id AND a.status IN ('assigned','loading','in_transit'))
  ORDER BY (t.assigned_driver_id = d.id) DESC NULLS LAST, t.capacity_kg, t.id, d.id
  LIMIT 1
  FOR UPDATE OF t, d SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.deliveries (shipment_id, truck_id, driver_id, status, assigned_by)
    VALUES (NEW.id, candidate.truck_id, candidate.driver_id, 'assigned', auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_assign_booked_shipment() FROM PUBLIC;
CREATE TRIGGER trg_shipments_zz_auto_assign
AFTER INSERT ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_booked_shipment();
