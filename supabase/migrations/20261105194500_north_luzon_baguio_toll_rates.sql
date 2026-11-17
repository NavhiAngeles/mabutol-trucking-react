-- Exact northbound corridor rates used by the Balagtas/Pulilan to Baguio route.
-- NLEX/SCTEX: operator matrix effective 2026-01-20 and SCTEX final tranche
-- effective 2025-09-09. TPLEX: published 2026 La Paz-Rosario matrix.
-- Coordinates are actual motorway merge/transition points from OSM route geometry,
-- not city-centre pins. Existing reference rows are retained unchanged.
WITH rates(gate_name,highway,vehicle_class,fee,entry_lat,entry_lng,exit_lat,exit_lng) AS (VALUES
  ('Pulilan to Mabalacat (Mabiga) [2026 matrix]','NLEX','Class 2',595,14.862450,120.858766,15.195258,120.597682),
  ('Pulilan to Mabalacat (Mabiga) [2026 matrix]','NLEX','Class 3',713,14.862450,120.858766,15.195258,120.597682),
  ('Mabalacat (Mabiga) to Tarlac (La Paz) [2025 matrix]','SCTEX','Class 2',460,15.200188,120.575940,15.481536,120.678335),
  ('Mabalacat (Mabiga) to Tarlac (La Paz) [2025 matrix]','SCTEX','Class 3',689,15.200188,120.575940,15.481536,120.678335),
  ('Tarlac (La Paz) to Rosario (Baguio) [2026 matrix]','TPLEX','Class 2',778,15.481536,120.678335,16.225156,120.498208),
  ('Tarlac (La Paz) to Rosario (Baguio) [2026 matrix]','TPLEX','Class 3',933,15.481536,120.678335,16.225156,120.498208)
)
INSERT INTO public.toll_gate_rates
  (gate_name,highway,vehicle_class,fee,entry_lat,entry_lng,exit_lat,exit_lng,bidirectional)
SELECT gate_name,highway,vehicle_class,fee,entry_lat,entry_lng,exit_lat,exit_lng,true
FROM rates r
WHERE NOT EXISTS (
  SELECT 1 FROM public.toll_gate_rates existing
  WHERE existing.gate_name=r.gate_name
    AND existing.highway=r.highway
    AND existing.vehicle_class=r.vehicle_class
);
