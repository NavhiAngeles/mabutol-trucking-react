-- The actual HGV provider exits NLEX at the northern Balintawak ramp,
-- about 422m north of the cloverleaf reference. Keep the 350m matching
-- tolerance and correct our newly inserted access mapping instead.
-- Public route evidence: workspace outputs/toll-route-fix/server-route.json.
UPDATE public.toll_gate_rates
SET exit_lat=14.66056,exit_lng=121.00011,updated_at=now()
WHERE highway='NLEX'
 AND gate_name IN ('Balagtas to Balintawak [2026 matrix]',
                  'Bocaue to Balintawak [2026 matrix]',
                  'Meycauayan to Balintawak [2026 matrix]')
 AND vehicle_class IN ('Class 2','Class 3')
 AND exit_lat=14.656763 AND exit_lng=121.000032;
