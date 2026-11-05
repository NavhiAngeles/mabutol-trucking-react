-- Fixed barrier systems are distinct from distance-based entry/exit tariffs.
-- Existing PDF reference rates remain unchanged and require explicit mappings.
ALTER TABLE public.toll_gate_rates
  ADD COLUMN pricing_scope text NOT NULL DEFAULT 'entry_exit',
  ADD CONSTRAINT toll_pricing_scope CHECK (
    pricing_scope = 'entry_exit' OR
    (pricing_scope = 'flat' AND highway IN ('NLEX_CONNECTOR','NLEX_HARBOR_LINK')));

-- Sources retrieved 2026-11-05:
-- https://nlex.com.ph/toll-table (operator CMS Class 2/3, effective 2026-01-20).
-- https://cms.nlex.com.ph/uploads/Class_2_part_2_bb13fb4786.png
-- https://cms.nlex.com.ph/uploads/Class_3_part_2_9a325e641e.png
-- Connector: same operator CMS explicitly publishes PHP299 / PHP418.
-- Harbor Link standalone: https://www.expressway.ph/toll-matrix/harbor-link
-- Skyway: https://www.expressway.ph/toll-matrix/skyway-stage-3
-- Map access points: OpenStreetMap road centerlines via OSRM; saved responses
-- in workspace outputs/toll-route-fix. These are motorway merge/diverge points,
-- not address pins or inferred city centers. Reverse fares confirmed by matrix.
INSERT INTO public.toll_gate_rates
 (gate_name,highway,vehicle_class,fee,pricing_scope,bidirectional)
SELECT v.*,true FROM (VALUES
 ('Caloocan to España / Magsaysay (fixed system)','NLEX_CONNECTOR','Class 2',299,'flat'),
 ('Caloocan to España / Magsaysay (fixed system)','NLEX_CONNECTOR','Class 3',418,'flat'),
 ('Karuhatan to C3 / R10 (standalone fixed system)','NLEX_HARBOR_LINK','Class 2',199,'flat'),
 ('Karuhatan to C3 / R10 (standalone fixed system)','NLEX_HARBOR_LINK','Class 3',238,'flat')
) AS v(gate_name,highway,vehicle_class,fee,pricing_scope)
WHERE NOT EXISTS (SELECT 1 FROM public.toll_gate_rates r
 WHERE r.highway=v.highway AND r.vehicle_class=v.vehicle_class AND r.pricing_scope='flat');

WITH entries(name,lat,lng,class2,class3) AS (VALUES
 ('Balagtas',14.833861,120.901574,340,408),
 ('Bocaue',14.809017,120.938594,263,315),
 ('Meycauayan',14.743141,120.973984,211,254)
), exits(name,lat,lng) AS (VALUES
 ('Balintawak',14.656763,121.000032),
 ('Karuhatan via Harbor Link',14.697036,120.998882)
), classes(name) AS (VALUES ('Class 2'),('Class 3'))
INSERT INTO public.toll_gate_rates
 (gate_name,highway,vehicle_class,fee,entry_lat,entry_lng,exit_lat,exit_lng,bidirectional)
SELECT e.name||' to '||x.name||' [2026 matrix]','NLEX',c.name,
 CASE WHEN c.name='Class 2' THEN e.class2 ELSE e.class3 END,
 e.lat,e.lng,x.lat,x.lng,true
FROM entries e CROSS JOIN exits x CROSS JOIN classes c
WHERE NOT EXISTS (SELECT 1 FROM public.toll_gate_rates r WHERE
 r.highway='NLEX' AND r.vehicle_class=c.name AND
 r.gate_name=e.name||' to '||x.name||' [2026 matrix]');

INSERT INTO public.toll_gate_rates
 (gate_name,highway,vehicle_class,fee,entry_lat,entry_lng,exit_lat,exit_lng,bidirectional)
SELECT 'Balintawak to Quirino [Stage 3 matrix]','SKYWAY',v.vehicle_class,v.fee,
 14.651917,120.997165,14.578408,120.997995,true
FROM (VALUES ('Class 2',528),('Class 3',792)) AS v(vehicle_class,fee)
WHERE NOT EXISTS (SELECT 1 FROM public.toll_gate_rates r WHERE
 r.highway='SKYWAY' AND r.vehicle_class=v.vehicle_class AND
 r.gate_name='Balintawak to Quirino [Stage 3 matrix]');
