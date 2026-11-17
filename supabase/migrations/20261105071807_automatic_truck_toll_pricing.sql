-- Explicit user-approved type mapping; never infer toll class from cargo weight.
ALTER TABLE public.vehicle_types ADD COLUMN toll_class text
  CHECK (toll_class IN ('Class 1','Class 2','Class 3'));
UPDATE public.vehicle_types SET toll_class = CASE
  WHEN name IN ('Heavy Truck (10,000 kg)','10-Wheeler Wing Van') THEN 'Class 3'
  WHEN name IN ('Closed Van','Dropside','Elf / 4-Wheeler','Medium Truck (4,000 kg)','6-Wheeler') THEN 'Class 2'
  ELSE NULL END;

-- A highway-level representative fare cannot identify an actual entry/exit.
-- Existing rates remain intact and unconfigured until real plaza points are set.
ALTER TABLE public.toll_gate_rates
  ADD COLUMN entry_lat double precision,
  ADD COLUMN entry_lng double precision,
  ADD COLUMN exit_lat double precision,
  ADD COLUMN exit_lng double precision,
  ADD COLUMN bidirectional boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT toll_gate_route_points CHECK (
    (entry_lat IS NULL AND entry_lng IS NULL AND exit_lat IS NULL AND exit_lng IS NULL)
    OR (entry_lat IS NOT NULL AND entry_lng IS NOT NULL AND exit_lat IS NOT NULL AND exit_lng IS NOT NULL
      AND entry_lat BETWEEN -90 AND 90 AND exit_lat BETWEEN -90 AND 90
      AND entry_lng BETWEEN -180 AND 180 AND exit_lng BETWEEN -180 AND 180));
COMMENT ON COLUMN public.vehicle_types.toll_class IS 'Configured toll class for booking vehicle type; independent of cargo capacity.';
COMMENT ON COLUMN public.toll_gate_rates.entry_lat IS 'Toll entry plaza coordinate for exact automatic route matching; null means manual reference only.';
COMMENT ON COLUMN public.toll_gate_rates.bidirectional IS 'True only when the same entry-exit tariff is confirmed for the reverse direction.';
