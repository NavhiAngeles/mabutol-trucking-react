-- Migration: 20261106224500_office_mobile_notifications.sql
-- Notify office staff/admin when mobile events occur:
-- 1. Customer bookings from mobile app
-- 2. Driver delivery messages
-- 3. Driver reported incidents
-- 4. Driver reported expenses
-- 5. Driver delivery milestones (route started, arrived at pickup, customer showed, cargo loaded)

-- 1. Mobile customer bookings
CREATE OR REPLACE FUNCTION public.notify_office_mobile_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  IF NEW.booking_source = 'mobile' OR NEW.customer_id IS NOT NULL THEN
    FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') LOOP
      PERFORM public.notify_user(
        r.id,
        'booking_confirmed'::public.notification_type,
        'New customer booking',
        'Customer requested booking for ' || coalesce(NEW.cargo_description, 'General Cargo') || ' (' || coalesce(NEW.tracking_number, 'Pending') || ').',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_mobile_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_office_mobile_booking ON public.shipments;
CREATE TRIGGER trg_notify_office_mobile_booking
  AFTER INSERT ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_office_mobile_booking();

-- 2. Driver delivery messages
CREATE OR REPLACE FUNCTION public.notify_office_driver_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; s_id uuid; s_tracking text;
BEGIN
  IF NEW.sender_role = 'driver' THEN
    SELECT d.shipment_id, s.tracking_number INTO s_id, s_tracking
    FROM public.deliveries d
    JOIN public.shipments s ON s.id = d.shipment_id
    WHERE d.id = NEW.delivery_id;

    FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') LOOP
      PERFORM public.notify_user(
        r.id,
        'message'::public.notification_type,
        'Driver message',
        'Driver (' || coalesce(s_tracking, 'Delivery') || '): ' || left(NEW.body, 120),
        s_id
      );
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_driver_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_office_driver_message ON public.delivery_messages;
CREATE TRIGGER trg_notify_office_driver_message
  AFTER INSERT ON public.delivery_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_office_driver_message();

-- 3. Driver reported incidents
CREATE OR REPLACE FUNCTION public.notify_office_driver_incident() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; s_tracking text;
BEGIN
  SELECT s.tracking_number INTO s_tracking FROM public.shipments s WHERE s.id = NEW.shipment_id;
  FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') LOOP
    PERFORM public.notify_user(
      r.id,
      'delay'::public.notification_type,
      'Delivery incident reported',
      'Incident (' || replace(NEW.category::text, '_', ' ') || ') on ' || coalesce(s_tracking, 'shipment') || ': ' || left(NEW.description, 100),
      NEW.shipment_id
    );
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_driver_incident() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_office_driver_incident ON public.delivery_incidents;
CREATE TRIGGER trg_notify_office_driver_incident
  AFTER INSERT ON public.delivery_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_office_driver_incident();

-- 4. Driver reported expenses
CREATE OR REPLACE FUNCTION public.notify_office_driver_expense() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; s_id uuid; s_tracking text;
BEGIN
  SELECT d.shipment_id, s.tracking_number INTO s_id, s_tracking
  FROM public.deliveries d
  JOIN public.shipments s ON s.id = d.shipment_id
  WHERE d.id = NEW.delivery_id;

  FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') LOOP
    PERFORM public.notify_user(
      r.id,
      'payment'::public.notification_type,
      'Delivery expense logged',
      'Driver submitted expense of PHP ' || NEW.amount::text || ' (' || replace(NEW.category::text, '_', ' ') || ') for ' || coalesce(s_tracking, 'shipment') || '.',
      s_id
    );
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_driver_expense() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_office_driver_expense ON public.delivery_expenses;
CREATE TRIGGER trg_notify_office_driver_expense
  AFTER INSERT ON public.delivery_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_office_driver_expense();

-- 5. Driver milestones on shipment_events
CREATE OR REPLACE FUNCTION public.notify_office_driver_milestone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; s_tracking text;
BEGIN
  IF NEW.event_type IN ('route_started', 'arrived_at_pickup', 'customer_showed', 'cargo_loaded') THEN
    SELECT tracking_number INTO s_tracking FROM public.shipments WHERE id = NEW.shipment_id;
    FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin', 'staff') LOOP
      PERFORM public.notify_user(
        r.id,
        'shipment_status'::public.notification_type,
        CASE NEW.event_type
          WHEN 'route_started' THEN 'Driver started trip'
          WHEN 'arrived_at_pickup' THEN 'Driver arrived at pickup'
          WHEN 'customer_showed' THEN 'Customer showed at pickup'
          WHEN 'cargo_loaded' THEN 'Cargo loaded — in transit'
          ELSE replace(NEW.event_type, '_', ' ')
        END,
        'Shipment ' || coalesce(s_tracking, '') || ' status updated by driver.',
        NEW.shipment_id
      );
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_office_driver_milestone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_office_driver_milestone ON public.shipment_events;
CREATE TRIGGER trg_notify_office_driver_milestone
  AFTER INSERT ON public.shipment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_office_driver_milestone();

