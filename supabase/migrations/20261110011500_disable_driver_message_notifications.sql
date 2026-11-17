-- Migration: 20261110011500_disable_driver_message_notifications.sql
-- Disable automatic notifications table insertion for driver messages,
-- as driver messages are now displayed and notified exclusively in the dedicated Drivers Message topbar UI.

DROP TRIGGER IF EXISTS trg_notify_office_driver_message ON public.delivery_messages;

