-- Migration: 20261121103000_luzon_standard_ftl_toll_gates.sql
-- Synchronizes all 23 standard Luzon, Philippines FTL expressway corridors (46 Class 2 & Class 3 rows)
-- across NLEX, SCTEX, TPLEX, NLEX Connector, NLEX Harbor Link, Skyway, SLEX, STAR, CALAX, CAVITEX, and MCX.

BEGIN;

WITH standard_tolls(
  gate_name, highway, vehicle_class, fee, pricing_scope,
  entry_lat, entry_lng, exit_lat, exit_lng, bidirectional
) AS (
  VALUES
    -- North & Central Luzon Corridors (NLEX, SCTEX, TPLEX, Connector, Harbor Link)
    ('Pulilan to Balintawak', 'NLEX', 'Class 2', 436, 'entry_exit', 14.862450, 120.858766, 14.660560, 121.000110, true),
    ('Pulilan to Balintawak', 'NLEX', 'Class 3', 523, 'entry_exit', 14.862450, 120.858766, 14.660560, 121.000110, true),
    ('Sta. Rita to Balintawak', 'NLEX', 'Class 2', 394, 'entry_exit', 14.849200, 120.880500, 14.660560, 121.000110, true),
    ('Sta. Rita to Balintawak', 'NLEX', 'Class 3', 473, 'entry_exit', 14.849200, 120.880500, 14.660560, 121.000110, true),
    ('San Fernando to Balintawak', 'NLEX', 'Class 2', 636, 'entry_exit', 15.052800, 120.699700, 14.660560, 121.000110, true),
    ('San Fernando to Balintawak', 'NLEX', 'Class 3', 763, 'entry_exit', 15.052800, 120.699700, 14.660560, 121.000110, true),
    ('Balagtas to Balintawak', 'NLEX', 'Class 2', 340, 'entry_exit', 14.833861, 120.901574, 14.660560, 121.000110, true),
    ('Balagtas to Balintawak', 'NLEX', 'Class 3', 408, 'entry_exit', 14.833861, 120.901574, 14.660560, 121.000110, true),
    ('Bocaue to Balintawak', 'NLEX', 'Class 2', 263, 'entry_exit', 14.809017, 120.938594, 14.660560, 121.000110, true),
    ('Bocaue to Balintawak', 'NLEX', 'Class 3', 315, 'entry_exit', 14.809017, 120.938594, 14.660560, 121.000110, true),
    ('Meycauayan to Balintawak', 'NLEX', 'Class 2', 211, 'entry_exit', 14.743141, 120.973984, 14.660560, 121.000110, true),
    ('Meycauayan to Balintawak', 'NLEX', 'Class 3', 254, 'entry_exit', 14.743141, 120.973984, 14.660560, 121.000110, true),
    ('Pulilan to Mabalacat (Mabiga)', 'NLEX', 'Class 2', 595, 'entry_exit', 14.862450, 120.858766, 15.195258, 120.597682, true),
    ('Pulilan to Mabalacat (Mabiga)', 'NLEX', 'Class 3', 713, 'entry_exit', 14.862450, 120.858766, 15.195258, 120.597682, true),
    ('Mabalacat (Mabiga) to Tarlac (La Paz)', 'SCTEX', 'Class 2', 460, 'entry_exit', 15.200188, 120.575940, 15.481536, 120.678335, true),
    ('Mabalacat (Mabiga) to Tarlac (La Paz)', 'SCTEX', 'Class 3', 689, 'entry_exit', 15.200188, 120.575940, 15.481536, 120.678335, true),
    ('Dinalupihan to Tarlac (La Paz)', 'SCTEX', 'Class 2', 561, 'entry_exit', 14.882000, 120.468000, 15.481536, 120.678335, true),
    ('Dinalupihan to Tarlac (La Paz)', 'SCTEX', 'Class 3', 841, 'entry_exit', 14.882000, 120.468000, 15.481536, 120.678335, true),
    ('Tipo (Subic) to Tarlac (La Paz)', 'SCTEX', 'Class 2', 651, 'entry_exit', 14.843500, 120.327800, 15.481536, 120.678335, true),
    ('Tipo (Subic) to Tarlac (La Paz)', 'SCTEX', 'Class 3', 976, 'entry_exit', 14.843500, 120.327800, 15.481536, 120.678335, true),
    ('Tarlac (La Paz) to Rosario (Baguio)', 'TPLEX', 'Class 2', 778, 'entry_exit', 15.481536, 120.678335, 16.225156, 120.498208, true),
    ('Tarlac (La Paz) to Rosario (Baguio)', 'TPLEX', 'Class 3', 933, 'entry_exit', 15.481536, 120.678335, 16.225156, 120.498208, true),
    ('Caloocan to España / Magsaysay', 'NLEX_CONNECTOR', 'Class 2', 299, 'flat', NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, true),
    ('Caloocan to España / Magsaysay', 'NLEX_CONNECTOR', 'Class 3', 418, 'flat', NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, true),
    ('Karuhatan to C3 / R10', 'NLEX_HARBOR_LINK', 'Class 2', 199, 'flat', NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, true),
    ('Karuhatan to C3 / R10', 'NLEX_HARBOR_LINK', 'Class 3', 238, 'flat', NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, true),

    -- South Luzon & Metro Manila Corridors (SLEX, STAR, CALAX, CAVITEX, SKYWAY, MCX)
    ('TR1 & TR2: Alabang to Calamba', 'SLEX', 'Class 2', 274, 'entry_exit', 14.417500, 121.042800, 14.208500, 121.144500, true),
    ('TR1 & TR2: Alabang to Calamba', 'SLEX', 'Class 3', 411, 'entry_exit', 14.417500, 121.042800, 14.208500, 121.144500, true),
    ('TR3: Calamba to Sto. Tomas (Batangas)', 'SLEX', 'Class 2', 74, 'entry_exit', 14.208500, 121.144500, 14.113000, 121.163500, true),
    ('TR3: Calamba to Sto. Tomas (Batangas)', 'SLEX', 'Class 3', 111, 'entry_exit', 14.208500, 121.144500, 14.113000, 121.163500, true),
    ('TR1-TR3: Alabang to Sto. Tomas (Batangas)', 'SLEX', 'Class 2', 348, 'entry_exit', 14.417500, 121.042800, 14.113000, 121.163500, true),
    ('TR1-TR3: Alabang to Sto. Tomas (Batangas)', 'SLEX', 'Class 3', 522, 'entry_exit', 14.417500, 121.042800, 14.113000, 121.163500, true),
    ('Sto. Tomas to Batangas City Port', 'STAR', 'Class 2', 242, 'entry_exit', 14.113000, 121.163500, 13.782000, 121.077000, true),
    ('Sto. Tomas to Batangas City Port', 'STAR', 'Class 3', 363, 'entry_exit', 14.113000, 121.163500, 13.782000, 121.077000, true),
    ('Mamplasan (SLEX) to Silang Interchange', 'CALAX', 'Class 2', 234, 'entry_exit', 14.305600, 121.087200, 14.221500, 120.984000, true),
    ('Mamplasan (SLEX) to Silang Interchange', 'CALAX', 'Class 3', 351, 'entry_exit', 14.305600, 121.087200, 14.221500, 120.984000, true),
    ('R-1: Paranaque to Kawit', 'CAVITEX', 'Class 2', 253, 'entry_exit', 14.508500, 120.986800, 14.438500, 120.908000, true),
    ('R-1: Paranaque to Kawit', 'CAVITEX', 'Class 3', 379, 'entry_exit', 14.508500, 120.986800, 14.438500, 120.908000, true),
    ('R-1: Paranaque to Zapote', 'CAVITEX', 'Class 2', 73, 'entry_exit', 14.508500, 120.986800, 14.471000, 120.965000, true),
    ('R-1: Paranaque to Zapote', 'CAVITEX', 'Class 3', 110, 'entry_exit', 14.508500, 120.986800, 14.471000, 120.965000, true),
    ('Stage 1 & 2: Alabang to Buendia', 'SKYWAY', 'Class 2', 329, 'entry_exit', 14.417000, 121.043000, 14.558500, 121.008000, true),
    ('Stage 1 & 2: Alabang to Buendia', 'SKYWAY', 'Class 3', 493, 'entry_exit', 14.417000, 121.043000, 14.558500, 121.008000, true),
    ('Stage 3: Buendia (Makati) to Balintawak (QC)', 'SKYWAY', 'Class 2', 528, 'entry_exit', 14.558500, 121.008000, 14.651917, 120.997165, true),
    ('Stage 3: Buendia (Makati) to Balintawak (QC)', 'SKYWAY', 'Class 3', 792, 'entry_exit', 14.558500, 121.008000, 14.651917, 120.997165, true),
    ('SLEX Susana Heights to Daang Hari', 'MCX', 'Class 2', 92, 'entry_exit', 14.379500, 121.045000, 14.382000, 121.011000, true),
    ('SLEX Susana Heights to Daang Hari', 'MCX', 'Class 3', 138, 'entry_exit', 14.379500, 121.045000, 14.382000, 121.011000, true)
),
updated_existing AS (
  UPDATE public.toll_gate_rates t
  SET
    fee = s.fee,
    pricing_scope = s.pricing_scope,
    entry_lat = s.entry_lat,
    entry_lng = s.entry_lng,
    exit_lat = s.exit_lat,
    exit_lng = s.exit_lng,
    bidirectional = s.bidirectional,
    updated_at = now()
  FROM standard_tolls s
  WHERE upper(trim(t.highway)) = s.highway
    AND trim(t.vehicle_class) = s.vehicle_class
    AND (
      lower(trim(regexp_replace(t.gate_name, '\s*(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$', '', 'gi'))) = lower(s.gate_name)
      OR (
        t.entry_lat IS NOT NULL AND s.entry_lat IS NOT NULL
        AND abs(t.entry_lat - s.entry_lat) < 0.005
        AND abs(t.entry_lng - s.entry_lng) < 0.005
        AND abs(t.exit_lat - s.exit_lat) < 0.005
        AND abs(t.exit_lng - s.exit_lng) < 0.005
      )
    )
  RETURNING t.highway, t.vehicle_class, t.gate_name
)
INSERT INTO public.toll_gate_rates
  (gate_name, highway, vehicle_class, fee, pricing_scope, entry_lat, entry_lng, exit_lat, exit_lng, bidirectional)
SELECT
  s.gate_name, s.highway, s.vehicle_class, s.fee, s.pricing_scope,
  s.entry_lat, s.entry_lng, s.exit_lat, s.exit_lng, s.bidirectional
FROM standard_tolls s
WHERE NOT EXISTS (
  SELECT 1 FROM public.toll_gate_rates existing
  WHERE upper(trim(existing.highway)) = s.highway
    AND trim(existing.vehicle_class) = s.vehicle_class
    AND (
      lower(trim(regexp_replace(existing.gate_name, '\s*(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$', '', 'gi'))) = lower(s.gate_name)
      OR (
        existing.entry_lat IS NOT NULL AND s.entry_lat IS NOT NULL
        AND abs(existing.entry_lat - s.entry_lat) < 0.005
        AND abs(existing.entry_lng - s.entry_lng) < 0.005
        AND abs(existing.exit_lat - s.exit_lat) < 0.005
        AND abs(existing.exit_lng - s.exit_lng) < 0.005
      )
    )
);

COMMIT;
