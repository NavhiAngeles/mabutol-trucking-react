-- Remove the stale route_geometry assignment introduced by the first Dev correction.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='office_edit_shipment' AND pg_get_function_identity_arguments(p.oid)='p_shipment uuid, p_expected timestamp with time zone, p_data jsonb';
 IF definition IS NULL THEN RAISE EXCEPTION 'office_edit_shipment function is missing';END IF;
 definition:=replace(definition,',route_geometry=CASE WHEN material THEN NULL ELSE route_geometry END','');
 definition:=replace(definition,', route_geometry =\n        CASE\n            WHEN material THEN NULL::jsonb\n            ELSE shipments.route_geometry\n        END','');
 IF definition LIKE '%route_geometry=%' OR definition LIKE '%final_amount=%' THEN RAISE EXCEPTION 'Live-schema correction did not match function source';END IF;
 EXECUTE definition;
END $migration$;
