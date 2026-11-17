-- Correct the already-applied Dev function: final_amount is generated.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='office_edit_shipment' AND pg_get_function_identity_arguments(p.oid)='p_shipment uuid, p_expected timestamp with time zone, p_data jsonb';
 IF definition IS NULL THEN RAISE EXCEPTION 'office_edit_shipment function is missing';END IF;
 definition:=replace(definition,', final_amount =\n        CASE\n            WHEN material THEN NULL::numeric\n            ELSE shipments.final_amount\n        END, estimated_arrival =\n        CASE\n            WHEN material THEN NULL::timestamp with time zone\n            ELSE shipments.estimated_arrival\n        END','');
 definition:=replace(definition,',final_amount=CASE WHEN material THEN NULL ELSE final_amount END,estimated_arrival=CASE WHEN material THEN NULL ELSE estimated_arrival END','');
 IF definition LIKE '%final_amount=%' THEN RAISE EXCEPTION 'Generated-column correction did not match function source';END IF;
 EXECUTE definition;
END $migration$;
