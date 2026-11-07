-- Reconcile shipments route and toll-pricing schema contract
-- Additive, idempotent schema updates for route geometry, toll fees, driver allowance, and actor fields.

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS route_geometry jsonb,
  ADD COLUMN IF NOT EXISTS route_source text,
  ADD COLUMN IF NOT EXISTS route_duration_minutes numeric,
  ADD COLUMN IF NOT EXISTS route_reason text,
  ADD COLUMN IF NOT EXISTS driver_allowance numeric,
  ADD COLUMN IF NOT EXISTS toll_fees numeric,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_route_source_check'
  ) THEN
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_route_source_check
      CHECK (route_source IS NULL OR route_source IN ('provider', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_driver_allowance_check'
  ) THEN
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_driver_allowance_check
      CHECK (driver_allowance IS NULL OR (driver_allowance >= 0 AND driver_allowance < 1000000000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_toll_fees_check'
  ) THEN
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_toll_fees_check
      CHECK (toll_fees IS NULL OR (toll_fees >= 0 AND toll_fees < 1000000000));
  END IF;
END $$;

COMMENT ON COLUMN public.shipments.route_geometry IS 'GeoJSON LineString route with embedded booking_pricing metadata.';
COMMENT ON COLUMN public.shipments.route_source IS 'Origin of route coordinates: provider or manual.';
COMMENT ON COLUMN public.shipments.route_duration_minutes IS 'Confirmed route travel duration in minutes.';
COMMENT ON COLUMN public.shipments.driver_allowance IS 'Planned driver trip allowance configured at booking.';
COMMENT ON COLUMN public.shipments.toll_fees IS 'Planned total toll fees confirmed at booking.';
COMMENT ON COLUMN public.shipments.created_by IS 'Actor who created the shipment booking.';

-- Ensure stamp_delivery_allowance uses shipment.driver_allowance if configured
CREATE OR REPLACE FUNCTION public.stamp_delivery_allowance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amount numeric;
BEGIN
 IF NEW.driver_allowance IS NULL THEN
  SELECT driver_allowance INTO amount FROM public.shipments WHERE id=NEW.shipment_id;
  IF amount IS NULL THEN
    SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='driver_allowance';
    IF amount IS NULL THEN SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='default_driver_allowance';END IF;
  END IF;
  IF amount IS NOT NULL AND NOT(amount>=0 AND amount<1000000000) THEN RAISE EXCEPTION 'INVALID_DRIVER_ALLOWANCE';END IF;
  NEW.driver_allowance:=coalesce(amount,500);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_delivery_allowance() FROM PUBLIC,anon,authenticated;

