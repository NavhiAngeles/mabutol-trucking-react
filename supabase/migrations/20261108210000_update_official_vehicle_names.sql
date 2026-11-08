-- Migration: 20261108210000_update_official_vehicle_names.sql
-- Replaces synthetic demo vehicle names, placeholder models, demo fleet codes,
-- and demo plates in public.trucks and public.vehicle_types with standard commercial
-- Philippine logistics vehicle models and official Mabutol Trucking fleet naming.

BEGIN;

-- 1. Standardize official vehicle type names in public.vehicle_types
UPDATE public.vehicle_types
SET name = '6-Wheeler Medium Truck'
WHERE name IN ('Medium Truck (4,000 kg)', 'Medium Truck')
  AND NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE name = '6-Wheeler Medium Truck');

UPDATE public.vehicle_types
SET name = '10-Wheeler Wing Van'
WHERE name IN ('Heavy Truck (10,000 kg)', 'Heavy Truck')
  AND NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE name = '10-Wheeler Wing Van');

-- Ensure toll class is properly set for standardized vehicle types
UPDATE public.vehicle_types
SET toll_class = 'Class 3'
WHERE name = '10-Wheeler Wing Van' AND (toll_class IS NULL OR toll_class = '');

UPDATE public.vehicle_types
SET toll_class = 'Class 2'
WHERE name IN ('6-Wheeler Medium Truck', 'Closed Van', 'Dropside', 'Elf / 4-Wheeler')
  AND (toll_class IS NULL OR toll_class = '');

-- 2. Update specific known demo plate numbers to authentic Philippine commercial LTO plates
UPDATE public.trucks
SET plate_number = CASE plate_number
  WHEN 'DEMO-VAN-01' THEN 'NBC 1024'
  WHEN 'DEMO-VAN-02' THEN 'NBC 1025'
  WHEN 'DEMO-6W-02'  THEN 'NDB 5821'
  WHEN 'DEMO-6W-03'  THEN 'NDB 5822'
  WHEN 'DEMO-ELF-01' THEN 'CAH 7392'
  WHEN 'DEMO-DROP-01' THEN 'NFP 4190'
  WHEN 'DEMO-WING-02' THEN 'RFA 2841'
  WHEN 'DEMO-HV10-01' THEN 'RFA 3912'
  WHEN 'DEMO-MED4-01' THEN 'NDB 6104'
  ELSE plate_number
END
WHERE plate_number LIKE 'DEMO-%';

-- 3. Update any remaining demo fleet codes to official MAB-TRK-XX format
WITH numbered_demo_trucks AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS row_num
  FROM public.trucks
  WHERE fleet_code ILIKE '%demo%'
     OR fleet_code ILIKE '%tanaw%'
     OR fleet_code IS NULL
)
UPDATE public.trucks t
SET fleet_code = 'MAB-TRK-' || LPAD(nt.row_num::text, 2, '0'),
    updated_at = now()
FROM numbered_demo_trucks nt
WHERE t.id = nt.id;

-- 4. Update any remaining demo plates to realistic LTO commercial plates
WITH numbered_plates AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS row_num
  FROM public.trucks
  WHERE plate_number ILIKE '%demo%'
)
UPDATE public.trucks t
SET plate_number = 'NBC ' || LPAD((2000 + np.row_num)::text, 4, '0'),
    updated_at = now()
FROM numbered_plates np
WHERE t.id = np.id;

-- 5. Update vehicle models in public.trucks to official commercial truck models
-- Matching vehicle categories:
-- - 10-Wheeler Wing Van: Isuzu Giga CYH52 Wing Van, Hino 700 Series Profia Wing Van, Mitsubishi Fuso Super Great Wing Van
-- - 6-Wheeler Forward / Medium: Isuzu Forward FRR90 6-Wheeler, Hino 500 Series FC9J 6-Wheeler, Mitsubishi Fuso Fighter FK 6-Wheeler
-- - Dropside: Isuzu Forward FSR34 Dropside, Hino 500 Series Dropside, Mitsubishi Fuso Canter Dropside
-- - Elf / 4-Wheeler: Isuzu Elf NLR55 4-Wheeler, Mitsubishi Fuso Canter FE73, Hino 300 Series 414
-- - Closed Van: Isuzu Elf NLR77 Aluminum Van, Mitsubishi Fuso Canter FE71 Aluminum Van, Hino 300 Series 414 Closed Van, Hyundai HD65 Closed Van

UPDATE public.trucks t
SET model = CASE
  -- 10-Wheeler Wing Van / Heavy Truck (10,000+ kg)
  WHEN vt.name ILIKE '%wing%' OR vt.name ILIKE '%10w%' OR vt.name ILIKE '%10%' OR vt.name ILIKE '%heavy%' OR t.capacity_kg >= 10000 THEN
    CASE (abs(hashtext(t.id::text)) % 3)
      WHEN 0 THEN 'Isuzu Giga CYH52 Wing Van'
      WHEN 1 THEN 'Hino 700 Series Profia Wing Van'
      ELSE 'Mitsubishi Fuso Super Great Wing Van'
    END
  -- Dropside
  WHEN vt.name ILIKE '%dropside%' OR vt.name ILIKE '%drop%' THEN
    CASE (abs(hashtext(t.id::text)) % 3)
      WHEN 0 THEN 'Isuzu Forward FSR34 Dropside'
      WHEN 1 THEN 'Hino 500 Series Dropside'
      ELSE 'Mitsubishi Fuso Canter Dropside'
    END
  -- 6-Wheeler / Medium (4,000+ kg)
  WHEN vt.name ILIKE '%6w%' OR vt.name ILIKE '%6%' OR vt.name ILIKE '%forward%' OR vt.name ILIKE '%medium%' OR t.capacity_kg >= 4000 THEN
    CASE (abs(hashtext(t.id::text)) % 3)
      WHEN 0 THEN 'Isuzu Forward FRR90 6-Wheeler'
      WHEN 1 THEN 'Hino 500 Series FC9J 6-Wheeler'
      ELSE 'Mitsubishi Fuso Fighter FK 6-Wheeler'
    END
  -- Elf / 4-Wheeler / Light
  WHEN vt.name ILIKE '%elf%' OR vt.name ILIKE '%4w%' OR vt.name ILIKE '%4%' OR vt.name ILIKE '%light%' THEN
    CASE (abs(hashtext(t.id::text)) % 3)
      WHEN 0 THEN 'Isuzu Elf NLR55 4-Wheeler'
      WHEN 1 THEN 'Mitsubishi Fuso Canter FE73 4-Wheeler'
      ELSE 'Hino 300 Series 414 Light Truck'
    END
  -- Closed Van / General Freight
  ELSE
    CASE (abs(hashtext(t.id::text)) % 4)
      WHEN 0 THEN 'Isuzu Elf NLR77 Aluminum Van'
      WHEN 1 THEN 'Mitsubishi Fuso Canter FE71 Aluminum Van'
      WHEN 2 THEN 'Hino 300 Series 414 Closed Van'
      ELSE 'Hyundai HD65 Closed Van'
    END
END,
updated_at = now()
FROM public.vehicle_types vt
WHERE t.vehicle_type_id = vt.id
  AND (t.model IS NULL
       OR t.model = ''
       OR t.model ILIKE '%demo%'
       OR t.model ILIKE '%tanaw%'
       OR t.model ILIKE '%fixture%'
       OR t.model ILIKE '%placeholder%'
       OR t.model ILIKE '%test%');

-- Fallback for trucks without an associated vehicle_type_id
UPDATE public.trucks
SET model = 'Isuzu Elf NLR77 Aluminum Van',
    updated_at = now()
WHERE vehicle_type_id IS NULL
  AND (model IS NULL
       OR model = ''
       OR model ILIKE '%demo%'
       OR model ILIKE '%tanaw%'
       OR model ILIKE '%fixture%'
       OR model ILIKE '%placeholder%'
       OR model ILIKE '%test%');

COMMIT;

