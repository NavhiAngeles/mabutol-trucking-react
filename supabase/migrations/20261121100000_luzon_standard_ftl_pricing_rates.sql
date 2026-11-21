-- Migration: 20261121100000_luzon_standard_ftl_pricing_rates.sql
-- Aligns active truck pricing rates, deadhead mobilization tariffs, vehicle lead times,
-- and fixed trip fees with standard Luzon, Philippines Full Truckload (FTL) benchmarks.

BEGIN;

-- 1. Elf / 4-Wheeler (up to 2,500 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 55,
  min_charge = 3500,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 30,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* 'elf|4[\s-]*wheel');

UPDATE public.vehicle_types
SET min_lead_time_hours = 12, loading_buffer_minutes = 120, updated_at = now()
WHERE is_active = true AND (name ~* 'elf|4[\s-]*wheel');

-- 2. Closed Van (up to 3,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 65,
  min_charge = 4000,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 35,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* 'closed\s*van|l300|canter');

UPDATE public.vehicle_types
SET min_lead_time_hours = 12, loading_buffer_minutes = 120, updated_at = now()
WHERE is_active = true AND (name ~* 'closed\s*van|l300|canter');

-- 3. Medium Truck (4,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 75,
  min_charge = 4500,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 40,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* 'medium\s*truck|4[,\s]*000');

UPDATE public.vehicle_types
SET min_lead_time_hours = 24, loading_buffer_minutes = 150, updated_at = now()
WHERE is_active = true AND (name ~* 'medium\s*truck|4[,\s]*000');

-- 4. 6-Wheeler (up to 6,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 85,
  min_charge = 5500,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 45,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* '6[\s-]*wheel');

UPDATE public.vehicle_types
SET min_lead_time_hours = 24, loading_buffer_minutes = 180, updated_at = now()
WHERE is_active = true AND (name ~* '6[\s-]*wheel');

-- 5. Dropside (up to 8,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 95,
  min_charge = 6500,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 50,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* 'dropside|flat[\s-]*bed');

UPDATE public.vehicle_types
SET min_lead_time_hours = 24, loading_buffer_minutes = 180, updated_at = now()
WHERE is_active = true AND (name ~* 'dropside|flat[\s-]*bed');

-- 6. Heavy Truck (10,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 110,
  min_charge = 8000,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 55,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* 'heavy\s*truck|10[,\s]*000');

UPDATE public.vehicle_types
SET min_lead_time_hours = 24, loading_buffer_minutes = 210, updated_at = now()
WHERE is_active = true AND (name ~* 'heavy\s*truck|10[,\s]*000');

-- 7. 10-Wheeler Wing Van (up to 12,000 kg)
UPDATE public.pricing_rates pr
SET
  per_km_rate = 130,
  min_charge = 9500,
  free_deadhead_km = 30,
  deadhead_per_km_rate = 65,
  updated_at = now()
FROM public.vehicle_types vt
WHERE pr.vehicle_type_id = vt.id
  AND pr.is_active = true
  AND (vt.name ~* '10[\s-]*wheel|wing\s*van');

UPDATE public.vehicle_types
SET min_lead_time_hours = 24, loading_buffer_minutes = 240, updated_at = now()
WHERE is_active = true AND (name ~* '10[\s-]*wheel|wing\s*van');

-- 8. Standard Luzon FTL Fixed Trip Fees
INSERT INTO public.system_settings (key, value, updated_at)
VALUES
  ('minimum_booking_fee', '3500'::jsonb, now()),
  ('driver_allowance', '800'::jsonb, now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

COMMIT;
