-- Expand verified expressway entry/exit plaza coordinates and exact Class 2 & 3 tariffs
-- for South Luzon corridors (SLEX, Skyway, STAR, CALAX, CAVITEX, MCX) and unmapped presets.
-- Coordinates represent actual expressway merge/plaza access points from OSM route geometry,
-- not city-centre centroids, within the 350m matching threshold.

-- 1. Upgrade existing [PDF reference] rows in toll_gate_rates if present
UPDATE public.toll_gate_rates
SET entry_lat = 14.417500, entry_lng = 121.042800,
    exit_lat = 14.208500, exit_lng = 121.144500,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'SLEX'
  AND gate_name LIKE '%Alabang to Calamba%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.208500, entry_lng = 121.144500,
    exit_lat = 14.113000, exit_lng = 121.163500,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'SLEX'
  AND gate_name LIKE '%Calamba to Sto. Tomas%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.113000, entry_lng = 121.163500,
    exit_lat = 13.782000, exit_lng = 121.077000,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'STAR'
  AND gate_name LIKE '%Sto. Tomas to Batangas%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.305600, entry_lng = 121.087200,
    exit_lat = 14.221500, exit_lng = 120.984000,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'CALAX'
  AND gate_name LIKE '%Mamplasan%Silang%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.508500, entry_lng = 120.986800,
    exit_lat = 14.438500, exit_lng = 120.908000,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'CAVITEX'
  AND gate_name LIKE '%Paranaque to%Kawit%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.417000, entry_lng = 121.043000,
    exit_lat = 14.558500, exit_lng = 121.008000,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'SKYWAY'
  AND gate_name LIKE '%Alabang to Buendia%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.558500, entry_lng = 121.008000,
    exit_lat = 14.651917, exit_lng = 120.997165,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'SKYWAY'
  AND gate_name LIKE '%Buendia%Balintawak%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.379500, entry_lng = 121.045000,
    exit_lat = 14.382000, exit_lng = 121.011000,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'MCX'
  AND gate_name LIKE '%Susana Heights to Daang Hari%'
  AND entry_lat IS NULL;

UPDATE public.toll_gate_rates
SET entry_lat = 14.882000, entry_lng = 120.468000,
    exit_lat = 15.481536, exit_lng = 120.678335,
    bidirectional = true,
    updated_at = now()
WHERE highway = 'SCTEX'
  AND gate_name LIKE '%Dinalupihan to Tarlac%'
  AND entry_lat IS NULL;

-- 2. Insert verified rates if not already present
WITH rates(gate_name, highway, vehicle_class, fee, entry_lat, entry_lng, exit_lat, exit_lng, bidirectional) AS (VALUES
  -- SLEX
  ('TR1 & TR2: Alabang to Calamba', 'SLEX', 'Class 2', 274, 14.417500, 121.042800, 14.208500, 121.144500, true),
  ('TR1 & TR2: Alabang to Calamba', 'SLEX', 'Class 3', 411, 14.417500, 121.042800, 14.208500, 121.144500, true),
  ('TR3: Calamba to Sto. Tomas (Batangas)', 'SLEX', 'Class 2', 74, 14.208500, 121.144500, 14.113000, 121.163500, true),
  ('TR3: Calamba to Sto. Tomas (Batangas)', 'SLEX', 'Class 3', 111, 14.208500, 121.144500, 14.113000, 121.163500, true),
  ('TR1-TR3: Alabang to Sto. Tomas (Batangas)', 'SLEX', 'Class 2', 348, 14.417500, 121.042800, 14.113000, 121.163500, true),
  ('TR1-TR3: Alabang to Sto. Tomas (Batangas)', 'SLEX', 'Class 3', 522, 14.417500, 121.042800, 14.113000, 121.163500, true),
  -- STAR
  ('Sto. Tomas to Batangas City Port', 'STAR', 'Class 2', 242, 14.113000, 121.163500, 13.782000, 121.077000, true),
  ('Sto. Tomas to Batangas City Port', 'STAR', 'Class 3', 363, 14.113000, 121.163500, 13.782000, 121.077000, true),
  -- CALAX
  ('Mamplasan (SLEX) to Silang Interchange', 'CALAX', 'Class 2', 234, 14.305600, 121.087200, 14.221500, 120.984000, true),
  ('Mamplasan (SLEX) to Silang Interchange', 'CALAX', 'Class 3', 351, 14.305600, 121.087200, 14.221500, 120.984000, true),
  -- CAVITEX
  ('R-1: Paranaque to Kawit', 'CAVITEX', 'Class 2', 253, 14.508500, 120.986800, 14.438500, 120.908000, true),
  ('R-1: Paranaque to Kawit', 'CAVITEX', 'Class 3', 379, 14.508500, 120.986800, 14.438500, 120.908000, true),
  ('R-1: Paranaque to Zapote', 'CAVITEX', 'Class 2', 73, 14.508500, 120.986800, 14.471000, 120.965000, true),
  ('R-1: Paranaque to Zapote', 'CAVITEX', 'Class 3', 110, 14.508500, 120.986800, 14.471000, 120.965000, true),
  -- SKYWAY
  ('Stage 1 & 2: Alabang to Buendia', 'SKYWAY', 'Class 2', 329, 14.417000, 121.043000, 14.558500, 121.008000, true),
  ('Stage 1 & 2: Alabang to Buendia', 'SKYWAY', 'Class 3', 493, 14.417000, 121.043000, 14.558500, 121.008000, true),
  ('Stage 3: Buendia (Makati) to Balintawak (QC)', 'SKYWAY', 'Class 2', 528, 14.558500, 121.008000, 14.651917, 120.997165, true),
  ('Stage 3: Buendia (Makati) to Balintawak (QC)', 'SKYWAY', 'Class 3', 792, 14.558500, 121.008000, 14.651917, 120.997165, true),
  -- MCX
  ('SLEX Susana Heights to Daang Hari', 'MCX', 'Class 2', 92, 14.379500, 121.045000, 14.382000, 121.011000, true),
  ('SLEX Susana Heights to Daang Hari', 'MCX', 'Class 3', 138, 14.379500, 121.045000, 14.382000, 121.011000, true),
  -- SCTEX
  ('Dinalupihan to Tarlac (La Paz)', 'SCTEX', 'Class 2', 561, 14.882000, 120.468000, 15.481536, 120.678335, true),
  ('Dinalupihan to Tarlac (La Paz)', 'SCTEX', 'Class 3', 841, 14.882000, 120.468000, 15.481536, 120.678335, true)
)
INSERT INTO public.toll_gate_rates
  (gate_name, highway, vehicle_class, fee, entry_lat, entry_lng, exit_lat, exit_lng, bidirectional)
SELECT gate_name, highway, vehicle_class, fee, entry_lat, entry_lng, exit_lat, exit_lng, bidirectional
FROM rates r
WHERE NOT EXISTS (
  SELECT 1 FROM public.toll_gate_rates existing
  WHERE existing.highway = r.highway
    AND existing.vehicle_class = r.vehicle_class
    AND (
      existing.gate_name = r.gate_name
      OR (
        existing.entry_lat IS NOT NULL
        AND abs(existing.entry_lat - r.entry_lat) < 0.005
        AND abs(existing.entry_lng - r.entry_lng) < 0.005
        AND abs(existing.exit_lat - r.exit_lat) < 0.005
        AND abs(existing.exit_lng - r.exit_lng) < 0.005
      )
    )
);
