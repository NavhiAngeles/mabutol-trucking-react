-- ==============================================================================
-- Rollback / Read-Only Verification Test Suite for Database Baseline (SYS-15 / W06)
-- Verifies the completeness, constraints, enums, views, RLS policies, and storage
-- buckets on tanaw-dev. Fully compatible with --read-only transaction inspection.
-- ==============================================================================

WITH
expected_tables AS (
  SELECT unnest(ARRAY[
    'activity_logs', 'cargo_categories', 'compliance_documents', 'customer_strikes',
    'customers', 'deliveries', 'delivery_documents', 'delivery_expenses',
    'delivery_helpers', 'delivery_incidents', 'delivery_message_reads',
    'delivery_messages', 'delivery_route_eta', 'delivery_route_plans', 'drivers',
    'fuel_logs', 'helpers', 'incident_attachments', 'location_vehicle_types',
    'locations', 'maintenance_records', 'messages', 'mobile_email_login_limits',
    'notification_preferences', 'notifications', 'payments', 'pricing_rates',
    'report_schedules', 'report_snapshots', 'shipment_events',
    'shipment_status_history', 'shipments', 'sms_outbox', 'system_settings',
    'toll_gate_rates', 'tracking_logs', 'truck_cargo_categories', 'trucks',
    'users', 'vehicle_types'
  ]::text[]) AS table_name
),
actual_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
),
missing_tables AS (
  SELECT et.table_name FROM expected_tables et
  LEFT JOIN actual_tables at ON at.table_name = et.table_name
  WHERE at.table_name IS NULL
),
rls_disabled AS (
  SELECT et.table_name FROM expected_tables et
  JOIN pg_tables pt ON pt.schemaname = 'public' AND pt.tablename = et.table_name
  WHERE NOT pt.rowsecurity
),
expected_enums AS (
  SELECT unnest(ARRAY[
    'compliance_doc_type', 'delivery_status', 'document_kind', 'driver_status',
    'incident_category', 'location_kind', 'maintenance_kind', 'maintenance_status',
    'notification_type', 'payment_method', 'payment_status', 'review_status',
    'shipment_status', 'truck_status', 'user_role'
  ]::text[]) AS enum_name
),
actual_enums AS (
  SELECT t.typname AS enum_name
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
),
missing_enums AS (
  SELECT ee.enum_name FROM expected_enums ee
  LEFT JOIN actual_enums ae ON ae.enum_name = ee.enum_name
  WHERE ae.enum_name IS NULL
),
expected_views AS (
  SELECT unnest(ARRAY[
    'available_drivers', 'available_trucks', 'compliance_status',
    'latest_truck_positions', 'shipment_overview'
  ]::text[]) AS view_name
),
actual_views AS (
  SELECT table_name AS view_name
  FROM information_schema.views
  WHERE table_schema = 'public'
),
missing_views AS (
  SELECT ev.view_name FROM expected_views ev
  LEFT JOIN actual_views av ON av.view_name = ev.view_name
  WHERE av.view_name IS NULL
),
expected_buckets AS (
  SELECT unnest(ARRAY[
    'delivery-documents', 'compliance-documents', 'account-avatars'
  ]::text[]) AS bucket_id
),
actual_buckets AS (
  SELECT id AS bucket_id FROM storage.buckets
),
missing_buckets AS (
  SELECT eb.bucket_id FROM expected_buckets eb
  LEFT JOIN actual_buckets ab ON ab.bucket_id = eb.bucket_id
  WHERE ab.bucket_id IS NULL
)
SELECT json_build_object(
  'status', CASE
    WHEN (SELECT count(*) FROM missing_tables) = 0
     AND (SELECT count(*) FROM rls_disabled) = 0
     AND (SELECT count(*) FROM missing_enums) = 0
     AND (SELECT count(*) FROM missing_views) = 0
     AND (SELECT count(*) FROM missing_buckets) = 0
    THEN 'passed'
    ELSE 'failed'
  END,
  'missing_tables', (SELECT coalesce(json_agg(table_name), '[]'::json) FROM missing_tables),
  'rls_disabled_tables', (SELECT coalesce(json_agg(table_name), '[]'::json) FROM rls_disabled),
  'missing_enums', (SELECT coalesce(json_agg(enum_name), '[]'::json) FROM missing_enums),
  'missing_views', (SELECT coalesce(json_agg(view_name), '[]'::json) FROM missing_views),
  'missing_buckets', (SELECT coalesce(json_agg(bucket_id), '[]'::json) FROM missing_buckets),
  'verified_tables_count', (SELECT count(*) FROM expected_tables) - (SELECT count(*) FROM missing_tables),
  'verified_enums_count', (SELECT count(*) FROM expected_enums) - (SELECT count(*) FROM missing_enums),
  'verified_views_count', (SELECT count(*) FROM expected_views) - (SELECT count(*) FROM missing_views),
  'verified_buckets_count', (SELECT count(*) FROM expected_buckets) - (SELECT count(*) FROM missing_buckets),
  'total_rls_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'total_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
) AS verification_result;
