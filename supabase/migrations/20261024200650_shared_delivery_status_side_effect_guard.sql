CREATE OR REPLACE FUNCTION public.sync_from_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ship shipment_status;
begin
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  v_ship := case new.status when 'assigned'   then 'assigned'
                            when 'loading'    then 'loading'
                            when 'in_transit' then 'in_transit'
                            when 'delivered'  then 'review'
                            else null end;
  if v_ship is not null then
    update shipments set status = v_ship
     where id = new.shipment_id and status not in ('completed', 'cancelled') and status <> v_ship;
  end if;

  if new.status in ('loading', 'in_transit') then
    update trucks  set status = 'on_trip' where id = new.truck_id  and status = 'available';
    update drivers set status = 'on_trip' where id = new.driver_id and status = 'available';
elsif new.status in ('delivered', 'cancelled') then
  update trucks 
  set status = case 
    when exists (
      select 1 from maintenance_records 
      where truck_id = new.truck_id and status = 'in_progress'
    ) then 'maintenance'::truck_status
    else 'available'::truck_status
  end
  where id = new.truck_id and status = 'on_trip';

  update drivers set status = 'available' where id = new.driver_id and status = 'on_trip';
end if;
  if new.status = 'in_transit' and new.departed_at is null then
    update deliveries set departed_at = now() where id = new.id;
  elsif new.status = 'delivered' and new.arrived_at is null then
    update deliveries set arrived_at = now() where id = new.id;
  end if;
  return null;
end $function$;

-- Office review notifications are trigger side effects, not a public arbitrary-recipient API.
CREATE FUNCTION public.notify_office_delivery_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;
BEGIN
 IF NEW.event_type NOT IN ('proof_submitted','no_show_reported') THEN RETURN NULL;END IF;
 FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin','staff') LOOP
  PERFORM public.notify_user(r.id,'shipment_status'::public.notification_type,
   CASE NEW.event_type WHEN 'proof_submitted' THEN 'Delivery proof needs review' ELSE 'Pickup no-show needs review' END,
   'Open the shipment to inspect its recorded evidence and decide.',NEW.shipment_id);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_delivery_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_office_delivery_review AFTER INSERT ON public.shipment_events FOR EACH ROW EXECUTE FUNCTION public.notify_office_delivery_review();

