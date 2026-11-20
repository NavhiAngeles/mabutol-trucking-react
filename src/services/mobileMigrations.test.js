import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INITIAL_VEHICLE_FORM,
  isVehicleFormDirty,
  validateTruckHgvSpecs,
  validateVehicleStep1,
  validateVehicleSubmit,
} from '../pages/Fleet/fleetDraftHelpers.js';

function readMigration(filename) {
  return fs.readFileSync(
    new URL(`../../supabase/migrations/${filename}`, import.meta.url),
    'utf8'
  );
}

test('mobile backend migrations C03, D05, C10, FTL-01, C11 contain required schema, RLS, and RPCs', () => {
  const m1 = readMigration('20261120130000_mobile_c03_c11_profile_avatar_push_tokens.sql');
  const m2 = readMigration('20261120140000_mobile_d05_hgv_truck_dimensions.sql');
  const m3 = readMigration('20261120150000_mobile_c10_customer_shipment_cancellation.sql');
  const m4 = readMigration('20261120160000_mobile_ftl01_booking_quote_acceptance_workspace.sql');
  const dts = fs.readFileSync(
    new URL('../types/database.d.ts', import.meta.url),
    'utf8'
  );

  // C03 + C11 profile & push tokens
  for (const token of [
    'ADD COLUMN IF NOT EXISTS barangay text',
    'DROP FUNCTION IF EXISTS public.mobile_save_profile(text, text, text, text)',
    'public.mobile_save_profile(',
    'p_barangay text DEFAULT NULL',
    'p_province text DEFAULT NULL',
    'CREATE TABLE IF NOT EXISTS public.user_push_tokens',
    'public.mobile_register_push_token(',
    'public.mobile_unregister_push_token(',
    'trg_notifications_fcm_push',
    "SET search_path = ''",
  ]) {
    assert.ok(m1.includes(token), `C03/C11 migration missing: ${token}`);
  }

  // D05 HGV truck dimensions + fleet_save & delivery_routing_context
  for (const token of [
    'height_m numeric(4,2)',
    'width_m numeric(4,2)',
    'length_m numeric(5,2)',
    'tare_weight_kg numeric(10,2)',
    'gross_weight_kg numeric(10,2)',
    'axle_count smallint DEFAULT 2',
    'default_height_m numeric(4,2)',
    'default_width_m numeric(4,2)',
    'default_length_m numeric(5,2)',
    'CREATE OR REPLACE FUNCTION public.fleet_save(',
    'CREATE OR REPLACE FUNCTION public.delivery_routing_context(',
    "'tare_weight_kg', tr.tare_weight_kg",
    "'axle_count', coalesce(tr.axle_count, 2)",
  ]) {
    assert.ok(m2.includes(token), `D05 migration missing: ${token}`);
  }

  // C10 customer cancellation
  for (const token of [
    'quote_accepted',
    'guard_customer_shipment_update',
    'log_customer_shipment_cancellation',
    'SECURITY INVOKER',
    'app.skip_customer_cancel_log',
    'customer cancels own eligible shipment',
    'public.mobile_cancel_shipment(',
    'DRIVER_ALREADY_EN_ROUTE',
    'CANCELLATION_REASON_REQUIRED',
  ]) {
    assert.ok(m3.includes(token), `C10 migration missing: ${token}`);
  }

  // FTL-01 + unified workspace + office_cancel_shipment
  for (const token of [
    'public.mobile_workspace_base()',
    'public.mobile_workspace()',
    "'avatar_url', me.avatar_url",
    'barangay, city, province',
    "'driver_trucks'",
    'truck_id',
    'linehaul_amount',
    'mobilization_fee',
    'quote_expires_at',
    'public.mobile_create_request_base(',
    'public.mobile_create_request(',
    "'replayed', true",
    "result - 'replayed'",
    "interval '14 days'",
    'min_lead_time_hours',
    'public.mobile_accept_shipment_quote(p_shipment uuid)',
    'CREATE OR REPLACE FUNCTION public.office_cancel_shipment(',
    "s.status NOT IN ('pending', 'quoted', 'booked', 'assigned', 'delayed')",
  ]) {
    assert.ok(m4.includes(token), `FTL-01/workspace migration missing: ${token}`);
  }

  // Ensure deadhead_km is NOT exposed in mobile_workspace() SQL statements
  const m4WithoutComments = m4.replace(/--.*$/gm, '');
  assert.ok(!m4WithoutComments.includes('deadhead_km'), 'mobile_workspace() must never expose deadhead_km');

  // Verify database.d.ts updated
  for (const token of [
    'default_height_m?: number | null',
    'default_width_m?: number | null',
    'default_length_m?: number | null',
    'height_m?: number | null',
    'width_m?: number | null',
    'length_m?: number | null',
    'tare_weight_kg?: number | null',
    'gross_weight_kg?: number | null',
    'axle_count?: number | null',
  ]) {
    assert.ok(dts.includes(token), `database.d.ts missing: ${token}`);
  }
});

test('D06 driver payment verification gate migration and Payment types are complete', () => {
  const m5 = readMigration('20261120170000_mobile_d06_driver_payment_verification_gate.sql');
  const dts = fs.readFileSync(
    new URL('../types/database.d.ts', import.meta.url),
    'utf8'
  );

  for (const token of [
    'ADD COLUMN IF NOT EXISTS client_request_id uuid',
    'ADD COLUMN IF NOT EXISTS rejection_reason text',
    'payments_shipment_client_request_uidx',
    'driver reads assigned shipment payments',
    'ALTER PUBLICATION supabase_realtime ADD TABLE public.payments',
    'driver uploads payment receipt for loading delivery',
    'authorized users read recorded payment receipts',
    'public.driver_record_payment(',
    'FROM storage.objects o',
    'public.review_shipment_payment(',
    'public.office_review_payment(',
    'public.driver_milestone(',
    'public.driver_set_delivery_status(',
    'PAYMENT_VERIFICATION_REQUIRED',
    'public.mobile_delivery_evidence_file(',
    "p_kind = 'payment'",
    'public.mobile_workspace()',
    'public.mobile_shipment_details(',
    "SET search_path = ''",
  ]) {
    assert.ok(m5.includes(token), `D06 migration missing: ${token}`);
  }

  for (const token of [
    'export interface Payment',
    'proof_path: string | null;',
    'rejection_reason?: string | null;',
    'client_request_id?: string | null;',
  ]) {
    assert.ok(dts.includes(token), `database.d.ts missing: ${token}`);
  }
});

test('D05 vehicle draft helpers track HGV dirtiness and validate dimensions/weights safely', () => {
  assert.equal(isVehicleFormDirty(INITIAL_VEHICLE_FORM, 1, false), false);
  for (const key of ['heightM', 'widthM', 'lengthM', 'tareWeightKg', 'grossWeightKg', 'axleCount']) {
    assert.equal(isVehicleFormDirty({ ...INITIAL_VEHICLE_FORM, [key]: '3' }, 1, false), true, key);
  }

  const baseVehicle = {
    ...INITIAL_VEHICLE_FORM,
    plateNumber: 'NBC-1024',
    model: 'Isuzu Giga',
    type: 'vt-1',
    capacity: '6000',
  };
  assert.equal(validateVehicleStep1(baseVehicle), null);
  assert.equal(validateVehicleSubmit(baseVehicle), null);

  assert.equal(validateTruckHgvSpecs({
    heightM: '3.45',
    widthM: '2.3',
    lengthM: '8.1',
    tareWeightKg: '4200',
    grossWeightKg: '10200',
    axleCount: '3',
  }), null);

  assert.match(validateTruckHgvSpecs({ heightM: '10.5' }), /height/i);
  assert.match(validateTruckHgvSpecs({ widthM: '0' }), /width/i);
  assert.match(validateTruckHgvSpecs({ lengthM: '55' }), /length/i);
  assert.match(validateTruckHgvSpecs({ tareWeightKg: '-1' }), /Tare weight/i);
  assert.match(validateTruckHgvSpecs({ grossWeightKg: '0' }), /Gross vehicle weight/i);
  assert.match(validateTruckHgvSpecs({ tareWeightKg: '5000', grossWeightKg: '4500' }), /less than tare weight/i);
  assert.match(validateTruckHgvSpecs({ axleCount: '1' }), /Axle count/i);
  assert.match(validateTruckHgvSpecs({ axleCount: '2.5' }), /Axle count/i);
  assert.match(validateVehicleStep1({ ...baseVehicle, heightM: '12' }), /height/i);
  assert.match(validateVehicleSubmit({ ...baseVehicle, axleCount: '25' }), /Axle count/i);
});

test('C12 migration defines customer no-show strikes, cooldown/suspension standing, appeals RLS/realtime, and privacy-safe RPC contracts', () => {
  const c12 = readMigration('20261121000000_mobile_c12_no_show_strikes_appeals.sql');
  const dts = fs.readFileSync(
    new URL('../types/database.d.ts', import.meta.url),
    'utf8'
  );

  for (const token of [
    'no_show_strike_count',
    'booking_cooldown_until',
    'standing_status',
    'customer_on_way_at',
    'no_show_confirmed_at',
    'cancellation_type',
    'public.customer_no_show_strikes',
    'public.customer_appeals',
    'supabase_realtime',
    'public.customer_notify_on_the_way(',
    'public.confirm_no_show_cancellation(',
    'public.customer_submit_suspension_appeal(',
    'public.office_review_customer_appeal(',
    'public.mobile_create_request_base(',
    'public.mobile_workspace_base(',
    'ACCOUNT_SUSPENDED',
    'BOOKING_COOLDOWN_ACTIVE',
    'NOT_IN_GRACE_WINDOW',
    'APPEAL_REASON_REQUIRED',
    'APPEAL_ALREADY_PENDING',
    'ACCOUNT_NOT_SUSPENDED',
    "SET search_path = ''",
  ]) {
    assert.ok(c12.includes(token), `C12 migration missing: ${token}`);
  }

  const c12WithoutComments = c12
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
  assert.equal(c12WithoutComments.includes('deadhead_km'), false, 'C12 mobile_workspace SQL must never expose deadhead_km');

  for (const token of [
    'export type CustomerStandingStatus',
    'export interface CustomerNoShowStrike',
    'export interface CustomerAppeal',
    'cancellation_type?: CancellationType | null;',
    'no_show_strike_count: number;',
  ]) {
    assert.ok(dts.includes(token), `database.d.ts missing: ${token}`);
  }
});
