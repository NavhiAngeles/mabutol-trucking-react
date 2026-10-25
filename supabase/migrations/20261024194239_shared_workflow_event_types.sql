-- Preserve legacy event labels and add only the shared workflow's audited events.
ALTER TABLE public.shipment_events DROP CONSTRAINT shipment_events_event_type_check;
ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK(event_type IN
 ('route_started','arrived_at_pickup','grace_period_ended','on_my_way_pressed','customer_showed','no_show_confirmed','cargo_loaded','delivered',
 'office_quoted','no_show_reported','proof_submitted','complete','request_correction','cancel_no_show','incident_resolved'));
