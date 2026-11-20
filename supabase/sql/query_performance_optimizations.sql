-- Query performance & RLS InitPlan optimization migration
-- Adds composite/partial indexes for hot operational/office queries and wraps per-row
-- RLS helper calls in scalar subqueries (SELECT ...) so PostgreSQL caches them once per statement.

BEGIN;

-- ============================================================================
-- 1. Operational & Office Query Indexes
-- ============================================================================

-- Accelerates 24-hour live GPS tracking fetches ordered by id (DashboardTrackingMap / Fleet)
CREATE INDEX IF NOT EXISTS tracking_logs_recorded_at_id_idx
  ON public.tracking_logs USING btree (recorded_at DESC, id);

-- Accelerates compliance document lookups split by truck vs driver and sorted by created_at DESC
CREATE INDEX IF NOT EXISTS compliance_documents_truck_doctype_created_idx
  ON public.compliance_documents USING btree (truck_id, doc_type, created_at DESC)
  WHERE (truck_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS compliance_documents_driver_doctype_created_idx
  ON public.compliance_documents USING btree (driver_id, doc_type, created_at DESC)
  WHERE (driver_id IS NOT NULL);

-- Accelerates shipment list/report status + date filters and billing customer joins
CREATE INDEX IF NOT EXISTS shipments_status_created_at_idx
  ON public.shipments USING btree (status, created_at DESC);

CREATE INDEX IF NOT EXISTS shipments_mobile_pending_created_idx
  ON public.shipments USING btree (created_at DESC)
  WHERE ((booking_source = 'mobile'::text) AND (status = 'pending'::public.shipment_status));

CREATE INDEX IF NOT EXISTS shipments_billing_customer_id_idx
  ON public.shipments USING btree (billing_customer_id)
  WHERE (billing_customer_id IS NOT NULL);

-- Accelerates OfficeTools & DeliveryConversationInbox polling queries
CREATE INDEX IF NOT EXISTS deliveries_updated_at_idx
  ON public.deliveries USING btree (updated_at DESC);

CREATE INDEX IF NOT EXISTS delivery_incidents_unresolved_created_idx
  ON public.delivery_incidents USING btree (created_at DESC)
  WHERE (resolved_at IS NULL);

CREATE INDEX IF NOT EXISTS delivery_expenses_pending_created_idx
  ON public.delivery_expenses USING btree (created_at DESC)
  WHERE (status = 'pending'::text);

CREATE INDEX IF NOT EXISTS delivery_expenses_driver_id_idx
  ON public.delivery_expenses USING btree (driver_id);

CREATE INDEX IF NOT EXISTS maintenance_records_status_idx
  ON public.maintenance_records USING btree (status);

-- Covers OfficeTools recent notifications query (which fetches read + unread rows)
CREATE INDEX IF NOT EXISTS notifications_user_id_all_created_at_idx
  ON public.notifications USING btree (user_id, created_at DESC);

-- ============================================================================
-- 2. InitPlan RLS Policy Optimizations & Redundant Policy Removal
-- ============================================================================

-- compliance_documents
DROP POLICY IF EXISTS "driver reads own compliance" ON public.compliance_documents;
CREATE POLICY "driver reads own compliance" ON public.compliance_documents
  FOR SELECT TO authenticated
  USING ((driver_id = (SELECT public.my_driver_id())));

DROP POLICY IF EXISTS "staff full access" ON public.compliance_documents;
CREATE POLICY "staff full access" ON public.compliance_documents
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- customers
DROP POLICY IF EXISTS "customer reads self" ON public.customers;
CREATE POLICY "customer reads self" ON public.customers
  FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "staff full access" ON public.customers;
CREATE POLICY "staff full access" ON public.customers
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- deliveries
DROP POLICY IF EXISTS "driver reads own deliveries" ON public.deliveries;
CREATE POLICY "driver reads own deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING ((driver_id = (SELECT public.my_driver_id())));

DROP POLICY IF EXISTS "staff full access" ON public.deliveries;
CREATE POLICY "staff full access" ON public.deliveries
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- delivery_expenses
DROP POLICY IF EXISTS "driver_read_own_expenses" ON public.delivery_expenses;
CREATE POLICY "driver_read_own_expenses" ON public.delivery_expenses
  FOR SELECT TO authenticated
  USING ((driver_id = (SELECT public.my_driver_id())));

DROP POLICY IF EXISTS "staff_full_access_expenses" ON public.delivery_expenses;
CREATE POLICY "staff_full_access_expenses" ON public.delivery_expenses
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- delivery_incidents
DROP POLICY IF EXISTS "driver reads own incidents" ON public.delivery_incidents;
CREATE POLICY "driver reads own incidents" ON public.delivery_incidents
  FOR SELECT TO authenticated
  USING ((delivery_id IN (SELECT deliveries.id FROM public.deliveries WHERE (deliveries.driver_id = (SELECT public.my_driver_id())))));

DROP POLICY IF EXISTS "staff full access" ON public.delivery_incidents;
CREATE POLICY "staff full access" ON public.delivery_incidents
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- drivers
DROP POLICY IF EXISTS "driver reads self" ON public.drivers;
CREATE POLICY "driver reads self" ON public.drivers
  FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "staff full access" ON public.drivers;
CREATE POLICY "staff full access" ON public.drivers
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- fuel_logs
DROP POLICY IF EXISTS "driver reads own fuel" ON public.fuel_logs;
CREATE POLICY "driver reads own fuel" ON public.fuel_logs
  FOR SELECT TO authenticated
  USING ((driver_id = (SELECT public.my_driver_id())));

DROP POLICY IF EXISTS "staff full access" ON public.fuel_logs;
CREATE POLICY "staff full access" ON public.fuel_logs
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- maintenance_records
DROP POLICY IF EXISTS "staff full access" ON public.maintenance_records;
CREATE POLICY "staff full access" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- notifications
DROP POLICY IF EXISTS "own notifications read" ON public.notifications;
CREATE POLICY "own notifications read" ON public.notifications
  FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "own notifications update" ON public.notifications;
CREATE POLICY "own notifications update" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "own notifications delete" ON public.notifications;
CREATE POLICY "own notifications delete" ON public.notifications
  FOR DELETE TO authenticated
  USING ((user_id = (SELECT auth.uid())));

-- payments
DROP POLICY IF EXISTS "customer reads own payments" ON public.payments;
CREATE POLICY "customer reads own payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE ((s.id = payments.shipment_id) AND ((s.customer_id = (SELECT public.my_customer_id())) OR (s.billing_customer_id = (SELECT public.my_customer_id()))))
  )));

DROP POLICY IF EXISTS "customer submits payment" ON public.payments;
CREATE POLICY "customer submits payment" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (((status = 'pending'::public.payment_status) AND (created_by = (SELECT auth.uid())) AND (EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE ((s.id = payments.shipment_id) AND (s.customer_id = (SELECT public.my_customer_id())))
  ))));

DROP POLICY IF EXISTS "staff full access" ON public.payments;
CREATE POLICY "staff full access" ON public.payments
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- shipments (drop redundant SELECT policy covered by "staff full access")
DROP POLICY IF EXISTS "Staff read shipments" ON public.shipments;

DROP POLICY IF EXISTS "customer reads own shipments" ON public.shipments;
CREATE POLICY "customer reads own shipments" ON public.shipments
  FOR SELECT TO authenticated
  USING (((customer_id = (SELECT public.my_customer_id())) OR (billing_customer_id = (SELECT public.my_customer_id()))));

DROP POLICY IF EXISTS "staff full access" ON public.shipments;
CREATE POLICY "staff full access" ON public.shipments
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

-- tracking_logs
DROP POLICY IF EXISTS "staff reads tracking" ON public.tracking_logs;
CREATE POLICY "staff reads tracking" ON public.tracking_logs
  FOR SELECT TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

DROP POLICY IF EXISTS "driver reads own tracking" ON public.tracking_logs;
CREATE POLICY "driver reads own tracking" ON public.tracking_logs
  FOR SELECT TO authenticated
  USING ((driver_id = (SELECT public.my_driver_id())));

DROP POLICY IF EXISTS "customer sees live tracking" ON public.tracking_logs;
CREATE POLICY "customer sees live tracking" ON public.tracking_logs
  FOR SELECT TO authenticated
  USING ((EXISTS (
    SELECT 1 FROM (public.deliveries d JOIN public.shipments s ON ((s.id = d.shipment_id)))
    WHERE ((d.id = tracking_logs.delivery_id)
      AND (s.customer_id = (SELECT public.my_customer_id()))
      AND (s.status = ANY (ARRAY['assigned'::public.shipment_status, 'loading'::public.shipment_status, 'in_transit'::public.shipment_status, 'delayed'::public.shipment_status])))
  )));

-- trucks (drop redundant SELECT policy covered by "staff full access")
DROP POLICY IF EXISTS "Staff read trucks" ON public.trucks;

DROP POLICY IF EXISTS "driver reads own truck" ON public.trucks;
CREATE POLICY "driver reads own truck" ON public.trucks
  FOR SELECT TO authenticated
  USING (((assigned_driver_id = (SELECT public.my_driver_id())) OR (id IN (SELECT deliveries.truck_id FROM public.deliveries WHERE (deliveries.driver_id = (SELECT public.my_driver_id()))))));

DROP POLICY IF EXISTS "staff full access" ON public.trucks;
CREATE POLICY "staff full access" ON public.trucks
  FOR ALL TO authenticated
  USING (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'staff'::text])));

COMMIT;
