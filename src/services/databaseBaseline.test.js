import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

describe('SYS-15 / W06: Reproducible Database Baseline Verification', () => {
  const baselineSqlPath = path.resolve(process.cwd(), 'supabase/sql/database_baseline.sql');
  const baselineMigrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261023000000_canonical_baseline.sql');
  const rollbackTestPath = path.resolve(process.cwd(), 'supabase/tests/database_baseline_rollback.sql');

  it('must contain database_baseline.sql and 20261023000000_canonical_baseline.sql', () => {
    assert.ok(fs.existsSync(baselineSqlPath), 'database_baseline.sql must exist');
    assert.ok(fs.existsSync(baselineMigrationPath), '20261023000000_canonical_baseline.sql must exist');
    assert.ok(fs.existsSync(rollbackTestPath), 'database_baseline_rollback.sql must exist');

    const sqlContent = fs.readFileSync(baselineSqlPath, 'utf8');
    const migrationContent = fs.readFileSync(baselineMigrationPath, 'utf8');

    assert.strictEqual(sqlContent, migrationContent, 'Baseline SQL and Canonical Baseline Migration must match');
    assert.ok(sqlContent.length > 50000, 'Baseline SQL must be substantial');
  });

  it('must define all 15 custom Postgres enum types safely with duplicate_object protection', () => {
    const sqlContent = fs.readFileSync(baselineSqlPath, 'utf8');
    const expectedEnums = [
      'compliance_doc_type', 'delivery_status', 'document_kind', 'driver_status',
      'incident_category', 'location_kind', 'maintenance_kind', 'maintenance_status',
      'notification_type', 'payment_method', 'payment_status', 'review_status',
      'shipment_status', 'truck_status', 'user_role'
    ];

    for (const enumName of expectedEnums) {
      assert.ok(
        sqlContent.includes(`CREATE TYPE public.${enumName}`),
        `Must define enum public.${enumName}`
      );
    }
    assert.ok(sqlContent.includes('WHEN duplicate_object THEN NULL;'), 'Must have exception handling for duplicate types');
  });

  it('must define all 40 public base tables with CREATE TABLE IF NOT EXISTS', () => {
    const sqlContent = fs.readFileSync(baselineSqlPath, 'utf8');
    const expectedTables = [
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
    ];

    for (const tableName of expectedTables) {
      assert.ok(
        sqlContent.includes(`CREATE TABLE IF NOT EXISTS public.${tableName}`),
        `Must define table public.${tableName} with IF NOT EXISTS`
      );
      assert.ok(
        sqlContent.includes(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;`),
        `Must enable RLS on table public.${tableName}`
      );
    }
  });

  it('must define all 5 canonical views with CREATE OR REPLACE VIEW', () => {
    const sqlContent = fs.readFileSync(baselineSqlPath, 'utf8');
    const expectedViews = [
      'available_drivers', 'available_trucks', 'compliance_status',
      'latest_truck_positions', 'shipment_overview'
    ];

    for (const viewName of expectedViews) {
      assert.ok(
        sqlContent.includes(`CREATE OR REPLACE VIEW public.${viewName}`),
        `Must define view public.${viewName}`
      );
    }
  });

  it('must provision all 3 storage buckets and their security policies', () => {
    const sqlContent = fs.readFileSync(baselineSqlPath, 'utf8');
    const expectedBuckets = ['delivery-documents', 'compliance-documents', 'account-avatars'];

    for (const bucket of expectedBuckets) {
      assert.ok(sqlContent.includes(`'${bucket}'`), `Must declare bucket '${bucket}'`);
    }
    assert.ok(sqlContent.includes('INSERT INTO storage.buckets'), 'Must seed storage.buckets');
    assert.ok(sqlContent.includes('ON CONFLICT (id) DO UPDATE'), 'Must be idempotent for storage.buckets');
  });

  it('must include rollback verification test query in database_baseline_rollback.sql', () => {
    const rollbackSql = fs.readFileSync(rollbackTestPath, 'utf8');
    assert.ok(rollbackSql.includes("'status', CASE"), 'Must contain status case statement');
    assert.ok(rollbackSql.includes('missing_tables'), 'Must check missing tables');
    assert.ok(rollbackSql.includes('missing_enums'), 'Must check missing enums');
    assert.ok(rollbackSql.includes('missing_views'), 'Must check missing views');
    assert.ok(rollbackSql.includes('missing_buckets'), 'Must check missing storage buckets');
    assert.ok(rollbackSql.includes('rls_disabled'), 'Must check RLS enablement');
  });
});
