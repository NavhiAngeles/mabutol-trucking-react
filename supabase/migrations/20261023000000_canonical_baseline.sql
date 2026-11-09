-- ==============================================================================
-- TANAW CANONICAL REPRODUCIBLE DATABASE BASELINE (SYS-15 / W06)
-- Automatically generated & verified from live tanaw-dev schema catalog.
-- Idempotent: safe to run on fresh Supabase project or existing environments.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "dblink" WITH SCHEMA extensions;

-- 2. CUSTOM ENUMS
DO $$ BEGIN
  CREATE TYPE public.compliance_doc_type AS ENUM ('drivers_license', 'medical_certificate', 'nbi_clearance', 'lto_registration', 'insurance', 'emission_test', 'roadworthiness_inspection', 'franchise_permit', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_status AS ENUM ('assigned', 'loading', 'in_transit', 'delivered', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM ('proof_of_delivery', 'receipt', 'waybill', 'other', 'signature');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.driver_status AS ENUM ('available', 'on_trip', 'off_duty', 'on_leave', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_category AS ENUM ('traffic', 'weather', 'late_loading', 'breakdown', 'accident', 'road_closure', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.location_kind AS ENUM ('hub', 'customer_site', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_kind AS ENUM ('preventive', 'repair', 'inspection', 'tire', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('shipment_status', 'booking_confirmed', 'assignment', 'delay', 'compliance_expiry', 'payment', 'message', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'bank_transfer', 'gcash', 'check', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'verified', 'rejected', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM ('pending', 'booked', 'assigned', 'loading', 'in_transit', 'delayed', 'review', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.truck_status AS ENUM ('available', 'on_trip', 'maintenance', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'staff', 'driver', 'customer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. TABLES & COLUMNS
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  email text,
  full_name text DEFAULT ''::text NOT NULL,
  phone text,
  role public.user_role DEFAULT 'customer'::user_role NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  default_capacity_kg numeric(10,2),
  is_active boolean DEFAULT true NOT NULL,
  toll_class text
);

CREATE TABLE IF NOT EXISTS public.cargo_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  requires_special_handling boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.helpers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  contact_number text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  sublabel text,
  address text,
  city text,
  province text DEFAULT 'Nueva Ecija'::text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  kind public.location_kind DEFAULT 'other'::location_kind NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  geog public.geography
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pricing_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  vehicle_type_id uuid,
  base_rate numeric(12,2) DEFAULT 0 NOT NULL,
  per_km_rate numeric(12,2) DEFAULT 0 NOT NULL,
  per_kg_rate numeric(12,2) DEFAULT 0 NOT NULL,
  min_charge numeric(12,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  effective_to date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.toll_gate_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  gate_name text NOT NULL,
  highway text NOT NULL,
  vehicle_class text DEFAULT 'Class 2'::text NOT NULL,
  fee numeric(12,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  entry_lat double precision,
  entry_lng double precision,
  exit_lat double precision,
  exit_lng double precision,
  bidirectional boolean DEFAULT false NOT NULL,
  pricing_scope text DEFAULT 'entry_exit'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  full_name text NOT NULL,
  contact_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  license_number text NOT NULL,
  date_hired date,
  status public.driver_status DEFAULT 'available'::driver_status NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.trucks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fleet_code text,
  plate_number text NOT NULL,
  model text,
  model_year smallint,
  vehicle_type_id uuid,
  capacity_kg numeric(10,2),
  status public.truck_status DEFAULT 'available'::truck_status NOT NULL,
  assigned_driver_id uuid,
  odometer_km numeric(10,1) DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.truck_cargo_categories (
  truck_id uuid NOT NULL,
  cargo_category_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.location_vehicle_types (
  location_id uuid NOT NULL,
  vehicle_type_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_code text DEFAULT ('CUST-'::text || lpad((nextval('customer_no_seq'::regclass))::text, 4, '0'::text)) NOT NULL,
  user_id uuid,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  city text,
  province text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  blocked_until timestamp with time zone,
  suspended_at timestamp with time zone,
  barangay text
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tracking_number text DEFAULT ((('SHP-NE-'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YY'::text)) || '-'::text) || lpad((nextval('shipment_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
  customer_id uuid NOT NULL,
  billing_customer_id uuid,
  status public.shipment_status DEFAULT 'booked'::shipment_status NOT NULL,
  booking_source text DEFAULT 'web'::text NOT NULL,
  cargo_category_id uuid,
  cargo_description text,
  weight_kg numeric(10,2),
  special_handling text,
  requested_vehicle_type_id uuid,
  pickup_location_id uuid,
  pickup_address text NOT NULL,
  pickup_lat numeric(9,6),
  pickup_lng numeric(9,6),
  dropoff_location_id uuid,
  dropoff_address text NOT NULL,
  dropoff_lat numeric(9,6),
  dropoff_lng numeric(9,6),
  distance_km numeric(8,2),
  scheduled_departure timestamp with time zone,
  estimated_arrival timestamp with time zone,
  actual_delivery_at timestamp with time zone,
  pricing_rate_id uuid,
  quoted_amount numeric(12,2),
  override_amount numeric(12,2),
  override_reason text,
  final_amount numeric(12,2),
  driver_notes text,
  cancelled_reason text,
  cancelled_at timestamp with time zone,
  created_by uuid,
  confirmed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  client_request_id uuid,
  route_source text,
  route_reason text,
  route_duration_minutes numeric,
  route_geometry jsonb
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  truck_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  status public.delivery_status DEFAULT 'assigned'::delivery_status NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  departed_at timestamp with time zone,
  arrived_at timestamp with time zone,
  odometer_start numeric(10,1),
  odometer_end numeric(10,1),
  recipient_name text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  driver_allowance numeric(10,2),
  route_started_at timestamp with time zone,
  pickup_arrived_at timestamp with time zone,
  pickup_arrival_lat numeric(9,6),
  pickup_arrival_lng numeric(9,6),
  grace_ends_at timestamp with time zone,
  auto_cancel_at timestamp with time zone,
  customer_showed_at timestamp with time zone,
  proof_attempt integer DEFAULT 0 NOT NULL,
  proof_review_status text DEFAULT 'awaiting_submission'::text NOT NULL,
  proof_review_reason text,
  proof_reviewed_by uuid,
  proof_reviewed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.delivery_helpers (
  delivery_id uuid NOT NULL,
  helper_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  delivery_id uuid,
  kind public.document_kind DEFAULT 'proof_of_delivery'::document_kind NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  recipient_name text,
  notes text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  proof_attempt integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_incidents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  category public.incident_category NOT NULL,
  description text,
  delay_minutes integer,
  latitude numeric(9,6),
  longitude numeric(9,6),
  reported_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.incident_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  incident_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  slot integer NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  category text NOT NULL,
  amount numeric(10,2) NOT NULL,
  receipt_path text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_reason text,
  description text
);

CREATE TABLE IF NOT EXISTS public.delivery_messages (
  id bigint NOT NULL,
  delivery_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL,
  request_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_message_reads (
  message_id bigint NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_route_plans (
  delivery_id uuid NOT NULL,
  truck_id uuid NOT NULL,
  version uuid DEFAULT gen_random_uuid() NOT NULL,
  pickup_lat numeric NOT NULL,
  pickup_lng numeric NOT NULL,
  dropoff_lat numeric NOT NULL,
  dropoff_lng numeric NOT NULL,
  profile jsonb NOT NULL,
  geometry jsonb NOT NULL,
  cargo_weight_kg numeric NOT NULL,
  distance_km numeric NOT NULL,
  duration_minutes numeric NOT NULL,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_route_eta (
  delivery_id uuid NOT NULL,
  plan_version uuid NOT NULL,
  leg text NOT NULL,
  eta_at timestamp with time zone NOT NULL,
  calculated_at timestamp with time zone NOT NULL,
  position_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  duration_seconds numeric NOT NULL,
  distance_m numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tracking_logs (
  id bigint NOT NULL,
  delivery_id uuid NOT NULL,
  truck_id uuid,
  driver_id uuid,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  speed_kph numeric(5,1),
  heading_deg numeric(5,1),
  accuracy_m numeric(7,1),
  signal text DEFAULT 'good'::text NOT NULL,
  is_buffered boolean DEFAULT false NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  client_sample_id uuid
);

CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_id uuid,
  truck_id uuid NOT NULL,
  driver_id uuid,
  liters numeric(8,2) NOT NULL,
  price_per_liter numeric(8,2),
  total_cost numeric(12,2),
  odometer_km numeric(10,1),
  station text,
  receipt_path text,
  logged_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  truck_id uuid NOT NULL,
  kind public.maintenance_kind DEFAULT 'preventive'::maintenance_kind NOT NULL,
  status public.maintenance_status DEFAULT 'scheduled'::maintenance_status NOT NULL,
  description text,
  scheduled_date date NOT NULL,
  completed_date date,
  odometer_km numeric(10,1),
  cost numeric(12,2),
  vendor text,
  next_due_date date,
  next_due_km numeric(10,1),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.compliance_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  driver_id uuid,
  truck_id uuid,
  doc_type public.compliance_doc_type NOT NULL,
  document_number text,
  issued_date date,
  expiry_date date,
  file_path text,
  review_status public.review_status DEFAULT 'pending_review'::review_status NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  remarks text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text,
  shipment_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL,
  type public.notification_type NOT NULL,
  channel text DEFAULT 'in_app'::text NOT NULL,
  enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id bigint NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shipment_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  delivery_id uuid,
  event_type text NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  actor_id uuid,
  meta jsonb
);

CREATE TABLE IF NOT EXISTS public.shipment_status_history (
  id bigint NOT NULL,
  shipment_id uuid NOT NULL,
  from_status public.shipment_status,
  to_status public.shipment_status NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  method public.payment_method DEFAULT 'cash'::payment_method NOT NULL,
  reference_number text,
  proof_path text,
  status public.payment_status DEFAULT 'pending'::payment_status NOT NULL,
  paid_at timestamp with time zone,
  verified_by uuid,
  verified_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customer_strikes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  rescinded_by uuid,
  rescinded_at timestamp with time zone,
  rescind_reason text
);

CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  type public.notification_type NOT NULL,
  state text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  attempted_at timestamp with time zone,
  provider_batch text
);

CREATE TABLE IF NOT EXISTS public.mobile_email_login_limits (
  bucket text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  attempts integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid DEFAULT auth.uid() NOT NULL,
  report_type text NOT NULL,
  frequency text NOT NULL,
  local_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  next_run_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  schedule_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  report_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_at timestamp with time zone NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  model_version integer DEFAULT 1 NOT NULL,
  status text NOT NULL,
  data jsonb,
  error_message text
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. CONSTRAINTS (Primary Keys, Foreign Keys, Unique, Checks)
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_default_capacity_kg_check CHECK (default_capacity_kg > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_name_key UNIQUE (name);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_toll_class_check CHECK (toll_class = ANY (ARRAY['Class 1'::text, 'Class 2'::text, 'Class 3'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.cargo_categories ADD CONSTRAINT cargo_categories_name_key UNIQUE (name);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.cargo_categories ADD CONSTRAINT cargo_categories_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.helpers ADD CONSTRAINT helpers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_latitude_check CHECK (latitude >= '-90'::integer::numeric AND latitude <= 90::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_longitude_check CHECK (longitude >= '-180'::integer::numeric AND longitude <= 180::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_base_rate_check CHECK (base_rate >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_check CHECK (effective_to IS NULL OR effective_to >= effective_from);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_min_charge_check CHECK (min_charge >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_per_kg_rate_check CHECK (per_kg_rate >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_per_km_rate_check CHECK (per_km_rate >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.pricing_rates ADD CONSTRAINT pricing_rates_vehicle_type_id_fkey FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.toll_gate_rates ADD CONSTRAINT toll_gate_rates_fee_check CHECK (fee >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.toll_gate_rates ADD CONSTRAINT toll_gate_rates_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.toll_gate_rates ADD CONSTRAINT toll_gate_route_points CHECK (entry_lat IS NULL AND entry_lng IS NULL AND exit_lat IS NULL AND exit_lng IS NULL OR entry_lat IS NOT NULL AND entry_lng IS NOT NULL AND exit_lat IS NOT NULL AND exit_lng IS NOT NULL AND entry_lat >= '-90'::integer::double precision AND entry_lat <= 90::double precision AND exit_lat >= '-90'::integer::double precision AND exit_lat <= 90::double precision AND entry_lng >= '-180'::integer::double precision AND entry_lng <= 180::double precision AND exit_lng >= '-180'::integer::double precision AND exit_lng <= 180::double precision);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.toll_gate_rates ADD CONSTRAINT toll_pricing_scope CHECK (pricing_scope = 'entry_exit'::text OR pricing_scope = 'flat'::text AND (highway = ANY (ARRAY['NLEX_CONNECTOR'::text, 'NLEX_HARBOR_LINK'::text])));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_license_number_key UNIQUE (license_number);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_capacity_kg_check CHECK (capacity_kg > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_fleet_code_key UNIQUE (fleet_code);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_model_year_check CHECK (model_year >= 1980 AND model_year <= 2100);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_plate_number_key UNIQUE (plate_number);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.trucks ADD CONSTRAINT trucks_vehicle_type_id_fkey FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.truck_cargo_categories ADD CONSTRAINT truck_cargo_categories_cargo_category_id_fkey FOREIGN KEY (cargo_category_id) REFERENCES cargo_categories(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.truck_cargo_categories ADD CONSTRAINT truck_cargo_categories_pkey PRIMARY KEY (truck_id, cargo_category_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.truck_cargo_categories ADD CONSTRAINT truck_cargo_categories_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.location_vehicle_types ADD CONSTRAINT location_vehicle_types_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.location_vehicle_types ADD CONSTRAINT location_vehicle_types_pkey PRIMARY KEY (location_id, vehicle_type_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.location_vehicle_types ADD CONSTRAINT location_vehicle_types_vehicle_type_id_fkey FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customers ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customers ADD CONSTRAINT customers_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_billing_customer_id_fkey FOREIGN KEY (billing_customer_id) REFERENCES customers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_booking_source_check CHECK (booking_source = ANY (ARRAY['web'::text, 'mobile'::text, 'phone'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_cargo_category_id_fkey FOREIGN KEY (cargo_category_id) REFERENCES cargo_categories(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_check CHECK (status <> 'cancelled'::shipment_status OR cancelled_at IS NOT NULL);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_distance_km_check CHECK (distance_km >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_dropoff_location_id_fkey FOREIGN KEY (dropoff_location_id) REFERENCES locations(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_override_amount_check CHECK (override_amount >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_pickup_location_id_fkey FOREIGN KEY (pickup_location_id) REFERENCES locations(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_pricing_rate_id_fkey FOREIGN KEY (pricing_rate_id) REFERENCES pricing_rates(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_quoted_amount_check CHECK (quoted_amount >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_requested_vehicle_type_id_fkey FOREIGN KEY (requested_vehicle_type_id) REFERENCES vehicle_types(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_route_source_check CHECK (route_source = ANY (ARRAY['provider'::text, 'manual'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_tracking_number_key UNIQUE (tracking_number);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipments ADD CONSTRAINT shipments_weight_kg_check CHECK (weight_kg > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_check CHECK (odometer_end IS NULL OR odometer_start IS NULL OR odometer_end >= odometer_start);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pickup_lat_check CHECK (pickup_arrival_lat IS NULL OR pickup_arrival_lat >= '-90'::integer::numeric AND pickup_arrival_lat <= 90::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pickup_lng_check CHECK (pickup_arrival_lng IS NULL OR pickup_arrival_lng >= '-180'::integer::numeric AND pickup_arrival_lng <= 180::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_proof_review_status_check CHECK (proof_review_status = ANY (ARRAY['awaiting_submission'::text, 'pending_review'::text, 'correction_requested'::text, 'approved'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_proof_reviewed_by_fkey FOREIGN KEY (proof_reviewed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_timer_coherence_check CHECK ((grace_ends_at IS NULL OR pickup_arrived_at IS NULL OR grace_ends_at >= pickup_arrived_at) AND (auto_cancel_at IS NULL OR grace_ends_at IS NULL OR auto_cancel_at >= grace_ends_at));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_helpers ADD CONSTRAINT delivery_helpers_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_helpers ADD CONSTRAINT delivery_helpers_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES helpers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_helpers ADD CONSTRAINT delivery_helpers_pkey PRIMARY KEY (delivery_id, helper_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_documents ADD CONSTRAINT delivery_documents_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_documents ADD CONSTRAINT delivery_documents_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_documents ADD CONSTRAINT delivery_documents_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_documents ADD CONSTRAINT delivery_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_incidents ADD CONSTRAINT delivery_incidents_delay_minutes_check CHECK (delay_minutes >= 0);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_incidents ADD CONSTRAINT delivery_incidents_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_incidents ADD CONSTRAINT delivery_incidents_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_incidents ADD CONSTRAINT delivery_incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_incidents ADD CONSTRAINT delivery_incidents_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_check CHECK (storage_path = (((((delivery_id::text || '/incident-'::text) || incident_id::text) || '-'::text) || slot::text) || '.jpg'::text));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES delivery_incidents(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_incident_id_slot_key UNIQUE (incident_id, slot);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_slot_check CHECK (slot >= 1 AND slot <= 3);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_storage_path_key UNIQUE (storage_path);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.incident_attachments ADD CONSTRAINT incident_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_amount_check CHECK (amount > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_category_check CHECK (category = ANY (ARRAY['fuel'::text, 'toll'::text, 'parking'::text, 'repair'::text, 'other'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_description_check CHECK (length(description) <= 200);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_expenses ADD CONSTRAINT delivery_expenses_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_body_check CHECK (length(btrim(body)) >= 1 AND length(btrim(body)) <= 2000);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_sender_id_request_id_key UNIQUE (sender_id, request_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_messages ADD CONSTRAINT delivery_messages_sender_role_check CHECK (sender_role = ANY (ARRAY['admin'::text, 'staff'::text, 'driver'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_message_reads ADD CONSTRAINT delivery_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES delivery_messages(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_message_reads ADD CONSTRAINT delivery_message_reads_pkey PRIMARY KEY (user_id, message_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_message_reads ADD CONSTRAINT delivery_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_check CHECK (pickup_lat <> dropoff_lat OR pickup_lng <> dropoff_lng);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_distance_km_check CHECK (distance_km > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_dropoff_lat_check CHECK (dropoff_lat >= '-90'::integer::numeric AND dropoff_lat <= 90::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_dropoff_lng_check CHECK (dropoff_lng >= '-180'::integer::numeric AND dropoff_lng <= 180::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_duration_minutes_check CHECK (duration_minutes > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_pickup_lat_check CHECK (pickup_lat >= '-90'::integer::numeric AND pickup_lat <= 90::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_pickup_lng_check CHECK (pickup_lng >= '-180'::integer::numeric AND pickup_lng <= 180::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_pkey PRIMARY KEY (delivery_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_reason_check CHECK (length(btrim(reason)) >= 5 AND length(btrim(reason)) <= 1000);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_plans ADD CONSTRAINT delivery_route_plans_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_check CHECK (expires_at > calculated_at AND expires_at <= (calculated_at + '00:02:00'::interval) AND expires_at <= (position_at + '00:02:00'::interval));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_distance_m_check CHECK (distance_m >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_duration_seconds_check CHECK (duration_seconds >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_leg_check CHECK (leg = ANY (ARRAY['pickup'::text, 'destination'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_route_eta ADD CONSTRAINT delivery_route_eta_pkey PRIMARY KEY (delivery_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_heading_deg_check CHECK (heading_deg >= 0::numeric AND heading_deg <= 360::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_latitude_check CHECK (latitude >= '-90'::integer::numeric AND latitude <= 90::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_longitude_check CHECK (longitude >= '-180'::integer::numeric AND longitude <= 180::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_signal_check CHECK (signal = ANY (ARRAY['good'::text, 'weak'::text, 'none'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_speed_kph_check CHECK (speed_kph >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tracking_logs ADD CONSTRAINT tracking_logs_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_liters_check CHECK (liters > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_price_per_liter_check CHECK (price_per_liter >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_total_cost_check CHECK (total_cost >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.fuel_logs ADD CONSTRAINT fuel_logs_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.maintenance_records ADD CONSTRAINT maintenance_records_cost_check CHECK (cost >= 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.maintenance_records ADD CONSTRAINT maintenance_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.maintenance_records ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.maintenance_records ADD CONSTRAINT maintenance_records_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_check CHECK (((driver_id IS NOT NULL)::integer + (truck_id IS NOT NULL)::integer) = 1);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_check1 CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.compliance_documents ADD CONSTRAINT compliance_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_channel_check CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, type, channel);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_event_type_check CHECK ((event_type = ANY (ARRAY['route_started'::text, 'arrived_at_pickup'::text, 'grace_period_ended'::text, 'on_my_way_pressed'::text, 'customer_showed'::text, 'no_show_confirmed'::text, 'cargo_loaded'::text, 'delivered'::text, 'office_quoted'::text, 'no_show_reported'::text, 'proof_submitted'::text, 'complete'::text, 'request_correction'::text, 'cancel_no_show'::text, 'incident_resolved'::text])) OR event_type = 'shipment_cancelled'::text OR (event_type = ANY (ARRAY['payment_recorded'::text, 'payment_verified'::text, 'payment_rejected'::text])));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_events ADD CONSTRAINT shipment_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.shipment_status_history ADD CONSTRAINT shipment_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_status_history ADD CONSTRAINT shipment_status_history_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipment_status_history ADD CONSTRAINT shipment_status_history_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0::numeric);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_check CHECK (status <> 'verified'::payment_status OR verified_by IS NOT NULL AND verified_at IS NOT NULL);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_rescinded_by_fkey FOREIGN KEY (rescinded_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_shipment_id_key UNIQUE (shipment_id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_strikes ADD CONSTRAINT customer_strikes_status_check CHECK (status = ANY (ARRAY['active'::text, 'under_appeal'::text, 'rescinded'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sms_outbox ADD CONSTRAINT sms_outbox_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.sms_outbox ADD CONSTRAINT sms_outbox_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.sms_outbox ADD CONSTRAINT sms_outbox_state_check CHECK (state = ANY (ARRAY['pending'::text, 'sending'::text, 'queued'::text, 'failed'::text, 'unknown'::text, 'skipped'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.sms_outbox ADD CONSTRAINT sms_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.mobile_email_login_limits ADD CONSTRAINT mobile_email_login_limits_pkey PRIMARY KEY (bucket);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_frequency_check CHECK (frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_schedules ADD CONSTRAINT report_schedules_report_type_check CHECK (report_type = ANY (ARRAY['Overview'::text, 'Shipments'::text, 'Drivers'::text, 'Revenue'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_check CHECK (period_start <= period_end);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_schedule_id_due_at_key UNIQUE (schedule_id, due_at);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES report_schedules(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_status_check CHECK (status = ANY (ARRAY['ready'::text, 'failed'::text]));
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_body_check CHECK (length(body) > 0);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_type_entity_id_idx ON public.activity_logs USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_logs_pkey ON public.activity_logs USING btree (id);
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON public.activity_logs USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS cargo_categories_name_key ON public.cargo_categories USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS cargo_categories_pkey ON public.cargo_categories USING btree (id);
CREATE INDEX IF NOT EXISTS compliance_documents_driver_id_idx ON public.compliance_documents USING btree (driver_id);
CREATE INDEX IF NOT EXISTS compliance_documents_expiry_date_idx ON public.compliance_documents USING btree (expiry_date);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_documents_pkey ON public.compliance_documents USING btree (id);
CREATE INDEX IF NOT EXISTS compliance_documents_truck_id_idx ON public.compliance_documents USING btree (truck_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_strikes_pkey ON public.customer_strikes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_strikes_shipment_id_key ON public.customer_strikes USING btree (shipment_id);
CREATE INDEX IF NOT EXISTS idx_customer_strikes_customer ON public.customer_strikes USING btree (customer_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON public.customers USING btree (customer_code);
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS customers_pkey ON public.customers USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key ON public.customers USING btree (user_id);
CREATE INDEX IF NOT EXISTS deliveries_driver_id_status_idx ON public.deliveries USING btree (driver_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_one_active_per_driver ON public.deliveries USING btree (driver_id) WHERE (status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status]));
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_one_active_per_shipment ON public.deliveries USING btree (shipment_id) WHERE (status <> 'cancelled'::delivery_status);
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_one_active_per_truck ON public.deliveries USING btree (truck_id) WHERE (status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status]));
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_pkey ON public.deliveries USING btree (id);
CREATE INDEX IF NOT EXISTS deliveries_truck_id_status_idx ON public.deliveries USING btree (truck_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_pending_no_show ON public.deliveries USING btree (auto_cancel_at) WHERE ((status = 'assigned'::delivery_status) AND (pickup_arrived_at IS NOT NULL) AND (customer_showed_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS delivery_documents_pkey ON public.delivery_documents USING btree (id);
CREATE INDEX IF NOT EXISTS delivery_documents_shipment_id_idx ON public.delivery_documents USING btree (shipment_id);
CREATE INDEX IF NOT EXISTS delivery_documents_storage_path_idx ON public.delivery_documents USING btree (storage_path);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_expenses_pkey ON public.delivery_expenses USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_helpers_pkey ON public.delivery_helpers USING btree (delivery_id, helper_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_incidents_pkey ON public.delivery_incidents USING btree (id);
CREATE INDEX IF NOT EXISTS delivery_incidents_shipment_id_idx ON public.delivery_incidents USING btree (shipment_id);
CREATE INDEX IF NOT EXISTS delivery_message_reads_message_idx ON public.delivery_message_reads USING btree (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_message_reads_pkey ON public.delivery_message_reads USING btree (user_id, message_id);
CREATE INDEX IF NOT EXISTS delivery_messages_driver_idx ON public.delivery_messages USING btree (driver_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_messages_pkey ON public.delivery_messages USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_messages_sender_id_request_id_key ON public.delivery_messages USING btree (sender_id, request_id);
CREATE INDEX IF NOT EXISTS delivery_messages_thread_idx ON public.delivery_messages USING btree (delivery_id, driver_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_route_eta_pkey ON public.delivery_route_eta USING btree (delivery_id);
CREATE INDEX IF NOT EXISTS delivery_route_plans_actor_idx ON public.delivery_route_plans USING btree (confirmed_by);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_route_plans_pkey ON public.delivery_route_plans USING btree (delivery_id);
CREATE INDEX IF NOT EXISTS delivery_route_plans_truck_idx ON public.delivery_route_plans USING btree (truck_id);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_license_number_key ON public.drivers USING btree (license_number);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_pkey ON public.drivers USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_key ON public.drivers USING btree (user_id);
CREATE INDEX IF NOT EXISTS fuel_logs_delivery_id_idx ON public.fuel_logs USING btree (delivery_id);
CREATE UNIQUE INDEX IF NOT EXISTS fuel_logs_pkey ON public.fuel_logs USING btree (id);
CREATE INDEX IF NOT EXISTS fuel_logs_truck_id_logged_at_idx ON public.fuel_logs USING btree (truck_id, logged_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS helpers_pkey ON public.helpers USING btree (id);
CREATE INDEX IF NOT EXISTS incident_attachments_delivery_idx ON public.incident_attachments USING btree (delivery_id);
CREATE UNIQUE INDEX IF NOT EXISTS incident_attachments_incident_id_slot_key ON public.incident_attachments USING btree (incident_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS incident_attachments_pkey ON public.incident_attachments USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS incident_attachments_storage_path_key ON public.incident_attachments USING btree (storage_path);
CREATE INDEX IF NOT EXISTS incident_attachments_uploader_idx ON public.incident_attachments USING btree (uploaded_by);
CREATE UNIQUE INDEX IF NOT EXISTS location_vehicle_types_pkey ON public.location_vehicle_types USING btree (location_id, vehicle_type_id);
CREATE INDEX IF NOT EXISTS locations_geog_idx ON public.locations USING gist (geog);
CREATE UNIQUE INDEX IF NOT EXISTS locations_pkey ON public.locations USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_records_pkey ON public.maintenance_records USING btree (id);
CREATE INDEX IF NOT EXISTS maintenance_records_truck_id_scheduled_date_idx ON public.maintenance_records USING btree (truck_id, scheduled_date);
CREATE UNIQUE INDEX IF NOT EXISTS messages_pkey ON public.messages USING btree (id);
CREATE INDEX IF NOT EXISTS messages_recipient_id_created_at_idx ON public.messages USING btree (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_shipment_id_idx ON public.messages USING btree (shipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS mobile_email_login_limits_pkey ON public.mobile_email_login_limits USING btree (bucket);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_pkey ON public.notification_preferences USING btree (user_id, type, channel);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_pkey ON public.notifications USING btree (id);
CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS payments_pkey ON public.payments USING btree (id);
CREATE INDEX IF NOT EXISTS payments_shipment_id_idx ON public.payments USING btree (shipment_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rates_pkey ON public.pricing_rates USING btree (id);
CREATE INDEX IF NOT EXISTS report_schedules_due_idx ON public.report_schedules USING btree (next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS report_schedules_owner_idx ON public.report_schedules USING btree (owner_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS report_schedules_pkey ON public.report_schedules USING btree (id);
CREATE INDEX IF NOT EXISTS report_snapshots_owner_idx ON public.report_snapshots USING btree (owner_id, generated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS report_snapshots_pkey ON public.report_snapshots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS report_snapshots_schedule_id_due_at_key ON public.report_snapshots USING btree (schedule_id, due_at);
CREATE INDEX IF NOT EXISTS idx_shipment_events_delivery ON public.shipment_events USING btree (delivery_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON public.shipment_events USING btree (shipment_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_pkey ON public.shipment_events USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_status_history_pkey ON public.shipment_status_history USING btree (id);
CREATE INDEX IF NOT EXISTS shipment_status_history_shipment_id_created_at_idx ON public.shipment_status_history USING btree (shipment_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_customer_client_req ON public.shipments USING btree (customer_id, client_request_id) WHERE (client_request_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS shipments_created_at_idx ON public.shipments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_customer_id_idx ON public.shipments USING btree (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS shipments_pkey ON public.shipments USING btree (id);
CREATE INDEX IF NOT EXISTS shipments_scheduled_departure_idx ON public.shipments USING btree (scheduled_departure);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON public.shipments USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS shipments_tracking_number_key ON public.shipments USING btree (tracking_number);
CREATE INDEX IF NOT EXISTS sms_outbox_pending ON public.sms_outbox USING btree (created_at) WHERE (state = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS sms_outbox_pkey ON public.sms_outbox USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_pkey ON public.system_settings USING btree (key);
CREATE UNIQUE INDEX IF NOT EXISTS toll_gate_rates_pkey ON public.toll_gate_rates USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_logs_client_sample_idx ON public.tracking_logs USING btree (delivery_id, client_sample_id);
CREATE INDEX IF NOT EXISTS tracking_logs_delivery_id_recorded_at_idx ON public.tracking_logs USING btree (delivery_id, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_logs_pkey ON public.tracking_logs USING btree (id);
CREATE INDEX IF NOT EXISTS tracking_logs_truck_id_recorded_at_idx ON public.tracking_logs USING btree (truck_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS tracking_logs_weak_signal ON public.tracking_logs USING btree (recorded_at) WHERE ((signal <> 'good'::text) OR is_buffered);
CREATE UNIQUE INDEX IF NOT EXISTS truck_cargo_categories_pkey ON public.truck_cargo_categories USING btree (truck_id, cargo_category_id);
CREATE UNIQUE INDEX IF NOT EXISTS trucks_fleet_code_key ON public.trucks USING btree (fleet_code);
CREATE UNIQUE INDEX IF NOT EXISTS trucks_pkey ON public.trucks USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS trucks_plate_number_key ON public.trucks USING btree (plate_number);
CREATE INDEX IF NOT EXISTS trucks_status_idx ON public.trucks USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_pkey ON public.users USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_types_name_key ON public.vehicle_types USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_types_pkey ON public.vehicle_types USING btree (id);

-- 6. VIEWS
CREATE OR REPLACE VIEW public.shipment_overview AS
SELECT s.id, s.tracking_number, s.status, s.cargo_description, cc.name AS cargo_category, s.pickup_address, s.dropoff_address, s.scheduled_departure, s.estimated_arrival, s.final_amount, c.name AS customer_name, dr.full_name AS driver_name, tr.fleet_code, tr.plate_number, COALESCE(p.paid, 0::numeric) AS amount_paid, COALESCE(s.final_amount, 0::numeric) - COALESCE(p.paid, 0::numeric) AS balance, CASE WHEN COALESCE(p.paid, 0::numeric) <= 0::numeric THEN 'unpaid'::text WHEN COALESCE(p.paid, 0::numeric) < COALESCE(s.final_amount, 0::numeric) THEN 'partial'::text ELSE 'paid'::text END AS payment_state FROM shipments s JOIN customers c ON c.id = s.customer_id LEFT JOIN cargo_categories cc ON cc.id = s.cargo_category_id LEFT JOIN deliveries d ON d.shipment_id = s.id AND d.status <> 'cancelled'::delivery_status LEFT JOIN drivers dr ON dr.id = d.driver_id LEFT JOIN trucks tr ON tr.id = d.truck_id LEFT JOIN LATERAL ( SELECT sum(payments.amount) AS paid FROM payments WHERE payments.shipment_id = s.id AND payments.status = 'verified'::payment_status) p ON true;

CREATE OR REPLACE VIEW public.available_trucks AS
SELECT id, fleet_code, plate_number, model, model_year, vehicle_type_id, capacity_kg, status, assigned_driver_id, odometer_km, notes, created_at, updated_at FROM trucks t WHERE status = 'available'::truck_status AND NOT (EXISTS ( SELECT 1 FROM deliveries d WHERE d.truck_id = t.id AND (d.status = ANY (ARRAY['loading'::delivery_status, 'in_transit'::delivery_status])))) AND NOT (EXISTS ( SELECT 1 FROM compliance_documents c WHERE c.truck_id = t.id AND c.expiry_date < CURRENT_DATE));

CREATE OR REPLACE VIEW public.compliance_status AS
SELECT cd.id, cd.driver_id, cd.truck_id, cd.doc_type, cd.document_number, cd.issued_date, cd.expiry_date, cd.file_path, cd.review_status, cd.reviewed_by, cd.reviewed_at, cd.remarks, cd.uploaded_by, cd.created_at, cd.updated_at, CASE WHEN cd.expiry_date IS NULL THEN 'no_expiry'::text WHEN cd.expiry_date < CURRENT_DATE THEN 'expired'::text WHEN cd.expiry_date <= (CURRENT_DATE + COALESCE(( SELECT (system_settings.value #>> '{}'::text[])::integer AS int4 FROM system_settings WHERE system_settings.key = 'compliance_threshold_days'::text), 30)) THEN 'expiring_soon'::text ELSE 'valid'::text END AS expiry_state, d.full_name AS driver_name, t.plate_number FROM compliance_documents cd LEFT JOIN drivers d ON d.id = cd.driver_id LEFT JOIN trucks t ON t.id = cd.truck_id;

CREATE OR REPLACE VIEW public.available_drivers AS
SELECT id, user_id, full_name, contact_number, emergency_contact_name, emergency_contact_number, license_number, date_hired, status, notes, created_at, updated_at FROM drivers dr WHERE status = 'available'::driver_status AND NOT (EXISTS ( SELECT 1 FROM deliveries d WHERE d.driver_id = dr.id AND (d.status = ANY (ARRAY['loading'::delivery_status, 'in_transit'::delivery_status])))) AND NOT (EXISTS ( SELECT 1 FROM compliance_documents c WHERE c.driver_id = dr.id AND c.expiry_date < CURRENT_DATE));

CREATE OR REPLACE VIEW public.latest_truck_positions AS
SELECT DISTINCT ON (tl.delivery_id) tl.delivery_id, d.shipment_id, s.tracking_number, tl.truck_id, tl.latitude, tl.longitude, tl.speed_kph, tl.signal, tl.recorded_at FROM tracking_logs tl JOIN deliveries d ON d.id = tl.delivery_id JOIN shipments s ON s.id = d.shipment_id WHERE d.status = ANY (ARRAY['loading'::delivery_status, 'in_transit'::delivery_status]) ORDER BY tl.delivery_id, tl.recorded_at DESC;

-- 7. STORAGE BUCKETS & POLICIES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('delivery-documents', 'delivery-documents', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('compliance-documents', 'compliance-documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]),
  ('account-avatars', 'account-avatars', false, 2097152, ARRAY['image/jpeg', 'image/png']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "account cleanup own unlinked avatar" ON storage.objects;
CREATE POLICY "account cleanup own unlinked avatar" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'account-avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (NOT (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.avatar_url = objects.name)))))))
;

DROP POLICY IF EXISTS "account read own avatar" ON storage.objects;
CREATE POLICY "account read own avatar" ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'account-avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
;

DROP POLICY IF EXISTS "account upload own avatar" ON storage.objects;
CREATE POLICY "account upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'account-avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
;

DROP POLICY IF EXISTS "fleet cleanup own unlinked upload" ON storage.objects;
CREATE POLICY "fleet cleanup own unlinked upload" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'compliance-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])) AND (NOT (EXISTS ( SELECT 1 FROM compliance_documents d WHERE (d.file_path = objects.name))))))
;

DROP POLICY IF EXISTS "fleet office read compliance" ON storage.objects;
CREATE POLICY "fleet office read compliance" ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'compliance-documents'::text) AND (get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text]))))
;

DROP POLICY IF EXISTS "fleet office upload compliance" ON storage.objects;
CREATE POLICY "fleet office upload compliance" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'compliance-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text]))))
;

-- 8. FUNCTIONS & RPCS
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT role::text FROM public.users WHERE id = auth.uid() AND is_active = true LIMIT 1; $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'staff') AND is_active = true); $function$
;

CREATE OR REPLACE FUNCTION public.require_active_office()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('admin','staff'))
 THEN RAISE EXCEPTION 'ACTIVE_OFFICE_REQUIRED' USING ERRCODE='42501'; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.my_driver_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT d.id FROM public.drivers d JOIN public.users u ON u.id = d.user_id WHERE d.user_id = auth.uid() AND u.is_active = true AND d.status <> 'inactive'::driver_status LIMIT 1; $function$
;

CREATE OR REPLACE FUNCTION public.my_customer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT c.id FROM public.customers c JOIN public.users u ON u.id = c.user_id WHERE c.user_id = auth.uid() AND c.is_active = true AND u.is_active = true LIMIT 1; $function$
;

CREATE OR REPLACE FUNCTION public.assign_shipment_resources(p_shipment uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  shipment public.shipments%ROWTYPE;
  candidate record;
  delivery_id uuid;
BEGIN
  IF current_user NOT IN ('postgres','service_role')
     AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('admin','staff')) THEN
    RAISE EXCEPTION 'Only admin or staff may assign deliveries' USING ERRCODE='42501';
  END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;
  SELECT id INTO delivery_id FROM public.deliveries WHERE shipment_id=shipment.id AND status<>'cancelled';
  IF FOUND THEN RETURN delivery_id; END IF;
  IF shipment.status<>'booked' THEN RAISE EXCEPTION 'Only booked shipments can be assigned'; END IF;
  IF shipment.requested_vehicle_type_id IS NULL OR shipment.weight_kg IS NULL OR shipment.weight_kg<=0 THEN
    RETURN NULL;
  END IF;
  SELECT t.id AS truck_id, d.id AS driver_id INTO candidate
  FROM public.trucks t
  JOIN public.drivers d ON (t.assigned_driver_id IS NULL OR t.assigned_driver_id = d.id)
  WHERE t.status = 'available' AND d.status = 'available'
    AND t.vehicle_type_id = shipment.requested_vehicle_type_id
    AND t.capacity_kg >= shipment.weight_kg
    AND (shipment.booking_source <> 'mobile' OR EXISTS(SELECT 1 FROM public.users u WHERE u.id=d.user_id AND u.is_active AND u.role='driver'))
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_records m WHERE m.truck_id = t.id AND m.status = 'in_progress')
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.truck_id = t.id AND a.status IN ('assigned','loading','in_transit'))
    AND NOT EXISTS (SELECT 1 FROM public.deliveries a WHERE a.driver_id = d.id AND a.status IN ('assigned','loading','in_transit'))
  ORDER BY (t.assigned_driver_id = d.id) DESC NULLS LAST, t.capacity_kg, t.id, d.id
  LIMIT 1
  FOR UPDATE OF t, d SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.deliveries (shipment_id, truck_id, driver_id, status, assigned_by)
    VALUES (shipment.id, candidate.truck_id, candidate.driver_id, 'assigned', auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO delivery_id;
  END IF;

  RETURN delivery_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_booked_shipment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status='booked' THEN
    PERFORM public.assign_shipment_resources(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_for_no_show(p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'OFFICE_REVIEW_REQUIRED' USING ERRCODE='42501';END $function$
;

CREATE OR REPLACE FUNCTION public.check_delivery_driver_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_driver_status driver_status;
BEGIN
    SELECT status INTO v_driver_status FROM public.drivers WHERE id = NEW.driver_id;
    IF v_driver_status IS NULL OR v_driver_status IN ('off_duty'::driver_status, 'on_leave'::driver_status, 'inactive'::driver_status) THEN
        RAISE EXCEPTION 'DRIVER_UNAVAILABLE: Assigned driver is off-duty, on-leave, or inactive';
    END IF;
    RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.claim_textbee_shipments()
 RETURNS TABLE(id uuid, phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE remaining integer;
BEGIN
 -- One worker at a time; reserve <=20 shipment texts/day, leaving OTP headroom.
 PERFORM pg_advisory_xact_lock(625102520);
 UPDATE public.sms_outbox q SET state='skipped' WHERE q.state='pending' AND (q.created_at<now()-interval '1 day' OR NOT EXISTS(
  SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
  JOIN public.notification_preferences p ON p.user_id=u.id AND p.type=q.type AND p.channel='sms' AND p.enabled
  JOIN public.customers c ON c.user_id=u.id JOIN public.shipments s ON s.customer_id=c.id AND s.id=q.shipment_id
  WHERE u.id=q.user_id AND u.is_active AND c.is_active AND a.phone_confirmed_at IS NOT NULL
   AND '+'||ltrim(a.phone,'+')=u.phone AND u.phone ~ '^\+639[0-9]{9}$'));
 SELECT greatest(0,20-count(*)) INTO remaining FROM public.sms_outbox WHERE attempted_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
 RETURN QUERY WITH selected AS (SELECT q.id FROM public.sms_outbox q WHERE q.state='pending' ORDER BY q.created_at LIMIT least(remaining,5) FOR UPDATE SKIP LOCKED),
 reserved AS (UPDATE public.sms_outbox q SET state='sending',attempted_at=now() FROM selected s WHERE q.id=s.id RETURNING q.id,q.user_id)
 SELECT r.id,u.phone FROM reserved r JOIN public.users u ON u.id=r.user_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.create_customer_for_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.role = 'customer'::public.user_role THEN

        INSERT INTO public.customers (
            user_id,
            name,
            email,
            phone
        )
        VALUES (
            NEW.id,
            NEW.full_name,
            NEW.email,
            NEW.phone
        )
        ON CONFLICT (user_id) DO NOTHING;

    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_shipment(p_client_request_id uuid DEFAULT NULL::uuid, p_pickup_location_id uuid DEFAULT NULL::uuid, p_pickup_address text DEFAULT NULL::text, p_pickup_lat numeric DEFAULT NULL::numeric, p_pickup_lng numeric DEFAULT NULL::numeric, p_dropoff_location_id uuid DEFAULT NULL::uuid, p_dropoff_address text DEFAULT NULL::text, p_dropoff_lat numeric DEFAULT NULL::numeric, p_dropoff_lng numeric DEFAULT NULL::numeric, p_requested_vehicle_type_id uuid DEFAULT NULL::uuid, p_cargo_category_id uuid DEFAULT NULL::uuid, p_cargo_description text DEFAULT NULL::text, p_weight_kg numeric DEFAULT NULL::numeric, p_special_handling text DEFAULT NULL::text, p_scheduled_departure timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF shipments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_customer_id uuid; v_has_cust_row boolean; v_blocked_until timestamptz; v_suspended_at timestamptz; v_existing_shipment public.shipments%ROWTYPE;
    v_pickup_addr text; v_pickup_lat numeric; v_pickup_lng numeric; v_dropoff_addr text; v_dropoff_lat numeric; v_dropoff_lng numeric;
    v_rate record; v_distance_km numeric(8,2) := 0.0; v_quoted_amount numeric(12,2) := 0.0; v_pricing_rate_id uuid := NULL; v_road_factor numeric := 1.3;
    v_sched_dep timestamptz; v_start_time time := '06:00'::time; v_end_time time := '20:00'::time; v_next_operating timestamptz; v_new_shipment public.shipments%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'UNAUTHORIZED', DETAIL = json_build_object('reason', 'Authentication required')::text; END IF;

    v_customer_id := public.my_customer_id();
    IF p_client_request_id IS NOT NULL AND v_customer_id IS NOT NULL THEN
        SELECT * INTO v_existing_shipment FROM public.shipments WHERE customer_id = v_customer_id AND client_request_id = p_client_request_id FOR UPDATE LIMIT 1;
        IF FOUND THEN RETURN NEXT v_existing_shipment; RETURN; END IF;
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.customers WHERE user_id = auth.uid()) INTO v_has_cust_row;
    IF NOT v_has_cust_row THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'NO_CUSTOMER_PROFILE', DETAIL = json_build_object('user_id', auth.uid())::text; END IF;
    IF v_customer_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'CUSTOMER_INACTIVE', DETAIL = json_build_object('user_id', auth.uid())::text; END IF;

    SELECT blocked_until, suspended_at INTO v_blocked_until, v_suspended_at FROM public.customers WHERE id = v_customer_id;
    IF v_suspended_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN010', MESSAGE = 'CUSTOMER_SUSPENDED', DETAIL = json_build_object('suspended_at', to_char(v_suspended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text; END IF;
    IF v_blocked_until IS NOT NULL AND v_blocked_until > now() THEN RAISE EXCEPTION USING ERRCODE = 'TN011', MESSAGE = 'CUSTOMER_BLOCKED', DETAIL = json_build_object('blocked_until', to_char(v_blocked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text; END IF;

    SELECT (value #>> '{}')::time INTO v_start_time FROM public.system_settings WHERE key = 'operating_hours_start';
    SELECT (value #>> '{}')::time INTO v_end_time FROM public.system_settings WHERE key = 'operating_hours_end';
    IF v_start_time IS NULL THEN v_start_time := '06:00'::time; END IF; IF v_end_time IS NULL THEN v_end_time := '20:00'::time; END IF;

    IF p_scheduled_departure IS NULL THEN
        IF (now() AT TIME ZONE 'Asia/Manila')::time < v_start_time THEN v_sched_dep := ((now() AT TIME ZONE 'Asia/Manila')::date + v_start_time) AT TIME ZONE 'Asia/Manila';
        ELSIF (now() AT TIME ZONE 'Asia/Manila')::time >= v_end_time THEN v_sched_dep := ((now() AT TIME ZONE 'Asia/Manila')::date + interval '1 day' + v_start_time) AT TIME ZONE 'Asia/Manila';
        ELSE v_sched_dep := now() + interval '1 hour'; END IF;
    ELSE
        v_sched_dep := p_scheduled_departure;
        IF v_sched_dep < (now() - interval '5 minutes') THEN RAISE EXCEPTION USING ERRCODE = 'TN012', MESSAGE = 'INVALID_SCHEDULE', DETAIL = json_build_object('scheduled_departure', to_char(v_sched_dep AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text; END IF;
        IF NOT public.is_within_operating_hours(v_sched_dep) THEN
            IF (v_sched_dep AT TIME ZONE 'Asia/Manila')::time >= v_end_time THEN v_next_operating := ((v_sched_dep AT TIME ZONE 'Asia/Manila')::date + interval '1 day' + v_start_time) AT TIME ZONE 'Asia/Manila';
            ELSE v_next_operating := ((v_sched_dep AT TIME ZONE 'Asia/Manila')::date + v_start_time) AT TIME ZONE 'Asia/Manila'; END IF;
            RAISE EXCEPTION USING ERRCODE = 'TN013', MESSAGE = 'OUTSIDE_OPERATING_HOURS', DETAIL = json_build_object('next_operating_window_start', to_char(v_next_operating AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text;
        END IF;
    END IF;

    IF p_requested_vehicle_type_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN008', MESSAGE = 'INVALID_VEHICLE_TYPE', DETAIL = json_build_object('reason', 'Vehicle type required')::text; END IF;
    IF p_weight_kg IS NULL OR p_weight_kg <= 0 THEN RAISE EXCEPTION USING ERRCODE = 'TN008', MESSAGE = 'INVALID_WEIGHT', DETAIL = json_build_object('weight_kg', p_weight_kg)::text; END IF;

    IF p_pickup_location_id IS NOT NULL THEN SELECT COALESCE(address, name), latitude, longitude INTO v_pickup_addr, v_pickup_lat, v_pickup_lng FROM public.locations WHERE id = p_pickup_location_id AND is_active = true;
    ELSE v_pickup_addr := p_pickup_address; v_pickup_lat := p_pickup_lat; v_pickup_lng := p_pickup_lng; END IF;
    IF v_pickup_addr IS NULL OR v_pickup_lat IS NULL OR v_pickup_lng IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN003', MESSAGE = 'MISSING_COORDINATES', DETAIL = json_build_object('field', 'pickup')::text; END IF;

    IF p_dropoff_location_id IS NOT NULL THEN SELECT COALESCE(address, name), latitude, longitude INTO v_dropoff_addr, v_dropoff_lat, v_dropoff_lng FROM public.locations WHERE id = p_dropoff_location_id AND is_active = true;
    ELSE v_dropoff_addr := p_dropoff_address; v_dropoff_lat := p_dropoff_lat; v_dropoff_lng := p_dropoff_lng; END IF;
    IF v_dropoff_addr IS NULL OR v_dropoff_lat IS NULL OR v_dropoff_lng IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN003', MESSAGE = 'MISSING_COORDINATES', DETAIL = json_build_object('field', 'dropoff')::text; END IF;

    SELECT (value #>> '{}')::numeric INTO v_road_factor FROM public.system_settings WHERE key = 'road_distance_factor';
    IF v_road_factor IS NULL THEN v_road_factor := 1.3; END IF;
    v_distance_km := ROUND((extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(v_pickup_lng::double precision, v_pickup_lat::double precision), 4326)::extensions.geography, extensions.ST_SetSRID(extensions.ST_MakePoint(v_dropoff_lng::double precision, v_dropoff_lat::double precision), 4326)::extensions.geography) / 1000.0 * v_road_factor)::numeric, 2);

    SELECT id, base_rate, per_km_rate, per_kg_rate, min_charge INTO v_rate FROM public.pricing_rates
    WHERE (vehicle_type_id = p_requested_vehicle_type_id OR vehicle_type_id IS NULL) AND is_active = true AND effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY (CASE WHEN vehicle_type_id IS NOT NULL THEN 1 ELSE 2 END), effective_from DESC LIMIT 1;

    IF v_rate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN008', MESSAGE = 'NO_PRICING_RATE', DETAIL = json_build_object('vehicle_type_id', p_requested_vehicle_type_id)::text; END IF;
    v_pricing_rate_id := v_rate.id;
    v_quoted_amount := GREATEST(v_rate.min_charge, v_rate.base_rate + (v_distance_km * v_rate.per_km_rate) + (p_weight_kg * v_rate.per_kg_rate));

    BEGIN
        INSERT INTO public.shipments (
            customer_id, status, booking_source, cargo_category_id, cargo_description, weight_kg, special_handling,
            requested_vehicle_type_id, pickup_location_id, pickup_address, pickup_lat, pickup_lng,
            dropoff_location_id, dropoff_address, dropoff_lat, dropoff_lng, distance_km, scheduled_departure,
            pricing_rate_id, quoted_amount, created_by, client_request_id
        ) VALUES (
            v_customer_id, 'pending', 'mobile', p_cargo_category_id, p_cargo_description, p_weight_kg, p_special_handling,
            p_requested_vehicle_type_id, p_pickup_location_id, v_pickup_addr, v_pickup_lat, v_pickup_lng,
            p_dropoff_location_id, v_dropoff_addr, v_dropoff_lat, v_dropoff_lng, v_distance_km,
            v_sched_dep, v_pricing_rate_id, v_quoted_amount, auth.uid(), p_client_request_id
        ) RETURNING * INTO v_new_shipment;
        RETURN NEXT v_new_shipment;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing_shipment FROM public.shipments WHERE customer_id = v_customer_id AND client_request_id = p_client_request_id LIMIT 1;
        IF FOUND THEN RETURN NEXT v_existing_shipment; RETURN; ELSE RAISE; END IF;
    END;
END; $function$
;

CREATE OR REPLACE FUNCTION public.customer_notify_on_my_way(p_shipment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_cust_id uuid; v_driver_user_id uuid; v_tracking_no text; v_delivery_id uuid; v_arrived timestamptz; v_showed timestamptz;
BEGIN
    v_cust_id := public.my_customer_id();
    IF v_cust_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'UNAUTHORIZED', DETAIL = json_build_object('reason', 'Active customer session required')::text; END IF;

    SELECT s.tracking_number, u.id, d.id, d.pickup_arrived_at, d.customer_showed_at
    INTO v_tracking_no, v_driver_user_id, v_delivery_id, v_arrived, v_showed
    FROM public.shipments s JOIN public.deliveries d ON d.shipment_id = s.id AND d.status <> 'cancelled'::delivery_status
    JOIN public.drivers dr ON dr.id = d.driver_id JOIN public.users u ON u.id = dr.user_id
    WHERE s.id = p_shipment_id AND s.customer_id = v_cust_id FOR UPDATE OF s;

    IF v_tracking_no IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN009', MESSAGE = 'SHIPMENT_NOT_FOUND', DETAIL = json_build_object('shipment_id', p_shipment_id)::text; END IF;
    IF v_arrived IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN008', MESSAGE = 'INVALID_TRANSITION', DETAIL = json_build_object('reason', 'Driver has not arrived at pickup yet')::text; END IF;
    IF v_showed IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN002', MESSAGE = 'ALREADY_DONE', DETAIL = json_build_object('customer_showed_at', to_char(v_showed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text; END IF;

    IF EXISTS (SELECT 1 FROM public.shipment_events WHERE shipment_id = p_shipment_id AND event_type = 'on_my_way_pressed') THEN RETURN; END IF;

    INSERT INTO public.shipment_events (shipment_id, delivery_id, event_type, actor_id) VALUES (p_shipment_id, v_delivery_id, 'on_my_way_pressed', auth.uid());
    PERFORM public.notify_user(v_driver_user_id, 'shipment_status'::notification_type, 'Customer On The Way', 'Customer for shipment ' || v_tracking_no || ' is on their way.', p_shipment_id);
END; $function$
;

CREATE OR REPLACE FUNCTION public.delivery_conversation(p_delivery uuid, p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;page jsonb;oldest bigint;more boolean;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF NOT FOUND OR coalesce(public.get_user_role(),'') NOT IN ('admin','staff','driver') OR
 (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'sender_id',m.sender_id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at) ORDER BY m.id),'[]'),min(m.id) INTO page,oldest
 FROM (SELECT * FROM public.delivery_messages WHERE delivery_id=d.id AND driver_id=d.driver_id AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 50)m;
 SELECT EXISTS(SELECT 1 FROM public.delivery_messages WHERE delivery_id=d.id AND driver_id=d.driver_id AND id<oldest) INTO more;
 RETURN jsonb_build_object('delivery_id',d.id,'driver_id',d.driver_id,'messages',page,'has_more',more,
 'can_send',d.status IN ('assigned','loading','in_transit','delivered') AND EXISTS(SELECT 1 FROM public.shipments s WHERE s.id=d.shipment_id AND s.status NOT IN ('completed','cancelled')));
END $function$
;

CREATE OR REPLACE FUNCTION public.delivery_conversation_unread()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('delivery_id',delivery_id,'driver_id',driver_id,'tracking_number',tracking_number,'unread',unread)),'[]') FROM (
 SELECT m.delivery_id,m.driver_id,s.tracking_number,count(*) unread FROM public.delivery_messages m
 JOIN public.deliveries d ON d.id=m.delivery_id JOIN public.shipments s ON s.id=d.shipment_id
 WHERE (m.sender_role='driver') IS DISTINCT FROM (public.get_user_role()='driver')
 AND NOT EXISTS(SELECT 1 FROM public.delivery_message_reads r WHERE r.message_id=m.id AND r.user_id=auth.uid()) GROUP BY m.delivery_id,m.driver_id,s.tracking_number)t;
$function$
;

CREATE OR REPLACE FUNCTION public.delivery_routing_context(p_delivery uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;
BEGIN
 IF coalesce(public.get_user_role(),'') NOT IN ('driver','admin','staff') THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF NOT FOUND OR (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('delivery',to_jsonb(d),'shipment',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'status',s.status,'pickup_lat',s.pickup_lat,'pickup_lng',s.pickup_lng,'dropoff_lat',s.dropoff_lat,'dropoff_lng',s.dropoff_lng,'route_geometry',s.route_geometry,'weight_kg',s.weight_kg),
 'plan',(SELECT to_jsonb(p) FROM public.delivery_route_plans p WHERE delivery_id=d.id),
 'eta',(SELECT to_jsonb(e) FROM public.delivery_route_eta e WHERE delivery_id=d.id),
 'position',(SELECT to_jsonb(p) FROM (SELECT latitude,longitude,accuracy_m,recorded_at FROM public.tracking_logs WHERE delivery_id=d.id ORDER BY recorded_at DESC,id DESC LIMIT 1)p));
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_arrive_at_pickup(p_delivery_id uuid, p_lat numeric, p_lng numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'arrive',jsonb_build_object('lat',p_lat,'lng',p_lng)); END $function$
;

CREATE OR REPLACE FUNCTION public.driver_confirm_cargo_loaded(p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'loaded'); END $function$
;

CREATE OR REPLACE FUNCTION public.driver_confirm_customer_showed(p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'showed'); END $function$
;

CREATE OR REPLACE FUNCTION public.driver_milestone(p_delivery uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE; lat numeric;lng numeric;radius numeric;distance numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.status IN ('completed','cancelled') OR d.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF p_action='start' THEN
  IF d.status<>'assigned' THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  IF d.route_started_at IS NOT NULL THEN RETURN;END IF;
  IF NOT public.is_within_operating_hours(now()) THEN RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';END IF;
  UPDATE public.deliveries SET route_started_at=now() WHERE id=d.id;
 ELSIF p_action='arrive' THEN
  IF d.status<>'assigned' OR d.route_started_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  IF d.pickup_arrived_at IS NOT NULL THEN RETURN;END IF;
  lat:=(p_data->>'lat')::numeric;lng:=(p_data->>'lng')::numeric;
  IF lat IS NULL OR lng IS NULL OR NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180)
  OR s.pickup_lat IS NULL OR s.pickup_lng IS NULL THEN RAISE EXCEPTION 'INVALID_COORDINATES';END IF;
  radius:=coalesce((SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key='no_show_arrival_radius_meters'),500);
  distance:=extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(lng::float8,lat::float8),4326)::extensions.geography,extensions.ST_SetSRID(extensions.ST_MakePoint(s.pickup_lng::float8,s.pickup_lat::float8),4326)::extensions.geography);
  IF distance>radius THEN RAISE EXCEPTION 'ARRIVAL_TOO_FAR';END IF;
  UPDATE public.deliveries SET pickup_arrived_at=now(),pickup_arrival_lat=lat,pickup_arrival_lng=lng,
    grace_ends_at=now()+coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='no_show_grace_minutes'),15)*interval '1 minute',
    auto_cancel_at=now()+coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='no_show_total_wait_minutes'),30)*interval '1 minute' WHERE id=d.id;
 ELSIF p_action='showed' THEN
  IF d.status='loading' AND d.customer_showed_at IS NOT NULL THEN RETURN;END IF;
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  UPDATE public.deliveries SET status='loading',customer_showed_at=now(),grace_ends_at=NULL,auto_cancel_at=NULL WHERE id=d.id;
 ELSIF p_action='loaded' THEN
  IF d.status='in_transit' THEN RETURN;END IF;
  IF d.status<>'loading' OR d.customer_showed_at IS NULL THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
  UPDATE public.deliveries SET status='in_transit' WHERE id=d.id;
 ELSIF p_action='no_show' THEN
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL OR d.auto_cancel_at IS NULL OR now()<d.auto_cancel_at THEN RAISE EXCEPTION 'WAIT_PERIOD_NOT_FINISHED';END IF;
  IF EXISTS(SELECT 1 FROM public.shipment_events WHERE delivery_id=d.id AND event_type='no_show_reported') THEN RETURN;END IF;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_DRIVER_ACTION'; END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id) VALUES(s.id,d.id,
 CASE p_action WHEN 'start' THEN 'route_started' WHEN 'arrive' THEN 'arrived_at_pickup' WHEN 'showed' THEN 'customer_showed' WHEN 'loaded' THEN 'cargo_loaded' ELSE 'no_show_reported' END,auth.uid());
 IF p_action IN ('arrive','no_show') THEN
  PERFORM public.notify_user(c.user_id,'shipment_status'::public.notification_type,CASE p_action WHEN 'arrive' THEN 'Driver arrived at pickup' ELSE 'Pickup attendance needs office review' END,'Open your shipment for the recorded update.',s.id) FROM public.customers c WHERE c.id=s.customer_id;
 END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_record_position(p_delivery uuid, p_sample uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;lat numeric;lng numeric;accuracy numeric; recorded timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND OR d.route_started_at IS NULL OR NOT(d.status IN ('assigned','loading','in_transit') OR (d.status='delivered' AND d.arrived_at>=now()-coalesce((SELECT (value #>> '{}')::int FROM public.system_settings WHERE key='buffered_tracking_window_minutes'),5)*interval '1 minute')) THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 lat:=(p_data->>'lat')::numeric;lng:=(p_data->>'lng')::numeric;accuracy:=(p_data->>'accuracy')::numeric;recorded:=(p_data->>'recorded_at')::timestamptz;
 IF p_sample IS NULL OR lat IS NULL OR NOT(lat BETWEEN -90 AND 90) OR lng IS NULL OR NOT(lng BETWEEN -180 AND 180)
 OR accuracy IS NULL OR NOT(accuracy>=0 AND accuracy<=10000) OR recorded IS NULL OR recorded<greatest(d.route_started_at,now()-interval '24 hours') OR recorded>now()+interval '1 minute'
 OR (d.status='delivered' AND recorded>d.arrived_at) THEN RAISE EXCEPTION 'INVALID_POSITION';END IF;
 INSERT INTO public.tracking_logs(delivery_id,truck_id,driver_id,latitude,longitude,accuracy_m,recorded_at,is_buffered,client_sample_id)
 VALUES(d.id,d.truck_id,d.driver_id,lat,lng,accuracy,recorded,coalesce((p_data->>'buffered')::boolean,false),p_sample) ON CONFLICT(delivery_id,client_sample_id) DO NOTHING;
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_report_incident(p_delivery uuid, p_request uuid, p_category incident_category, p_description text, p_delay integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE; result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND OR d.status NOT IN ('assigned','loading','in_transit') THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
 IF p_request IS NULL OR p_category IS NULL OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 2000 OR p_delay IS NULL OR p_delay NOT BETWEEN 0 AND 10080 THEN RAISE EXCEPTION 'INVALID_INCIDENT';END IF;
 SELECT id INTO result FROM public.delivery_incidents WHERE id=p_request AND delivery_id=d.id AND reported_by=auth.uid();IF FOUND THEN RETURN result;END IF;
 INSERT INTO public.delivery_incidents(id,delivery_id,shipment_id,category,description,delay_minutes,reported_by) VALUES(p_request,d.id,d.shipment_id,p_category,btrim(p_description),p_delay,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_report_incident_evidence(p_delivery uuid, p_request uuid, p_category incident_category, p_description text, p_delay integer, p_paths text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result uuid; path text; position integer:=0; existing public.delivery_incidents%ROWTYPE;
BEGIN
 IF public.get_user_role() IS DISTINCT FROM 'driver' THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 IF cardinality(p_paths)>3 OR p_paths IS NULL THEN RAISE EXCEPTION 'INVALID_INCIDENT_PHOTOS';END IF;
 SELECT * INTO existing FROM public.delivery_incidents WHERE id=p_request AND delivery_id=p_delivery AND reported_by=auth.uid();
 IF FOUND THEN
  IF existing.category IS DISTINCT FROM p_category OR existing.description IS DISTINCT FROM btrim(p_description) OR existing.delay_minutes IS DISTINCT FROM p_delay
   OR p_paths IS DISTINCT FROM ARRAY(SELECT storage_path FROM public.incident_attachments WHERE incident_id=p_request ORDER BY slot)
  THEN RAISE EXCEPTION 'INCIDENT_REQUEST_CONFLICT';END IF;
  RETURN existing.id;
 END IF;
 result:=public.driver_report_incident(p_delivery,p_request,p_category,p_description,p_delay);
 FOREACH path IN ARRAY p_paths LOOP
  position:=position+1;
  INSERT INTO public.incident_attachments(incident_id,delivery_id,slot,storage_path,uploaded_by)
  VALUES(result,p_delivery,position,path,auth.uid());
 END LOOP;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_set_delivery_status(p_delivery uuid, p_status delivery_status)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'USE_VALIDATED_DELIVERY_MILESTONES' USING ERRCODE='42501'; END $function$
;

CREATE OR REPLACE FUNCTION public.driver_start_route(p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN PERFORM public.driver_milestone(p_delivery_id,'start'); END $function$
;

CREATE OR REPLACE FUNCTION public.driver_submit_pod(p_delivery_id uuid, p_recipient_name text, p_photo_path text, p_signature_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE; attempt integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery_id AND driver_id=public.my_driver_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.shipments WHERE id=d.shipment_id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF d.status='delivered' AND EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND storage_path=p_photo_path)
 AND EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND storage_path=p_signature_path) THEN RETURN; END IF;
 IF NOT(d.status='in_transit' OR (d.status='delivered' AND d.proof_review_status='correction_requested')) THEN RAISE EXCEPTION 'INVALID_TRANSITION';END IF;
 IF length(btrim(coalesce(p_recipient_name,''))) NOT BETWEEN 2 AND 100 OR p_photo_path IS NULL OR p_signature_path IS NULL
 OR p_photo_path=p_signature_path OR p_photo_path NOT LIKE d.id::text||'/pod-photo-%' OR p_signature_path NOT LIKE d.id::text||'/signature-%'
 OR position('..' in p_photo_path)>0 OR position('..' in p_signature_path)>0 THEN RAISE EXCEPTION 'INVALID_POD_FILE';END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='delivery-documents' AND name IN (p_photo_path,p_signature_path) AND owner=auth.uid()
 AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp') AND (metadata->>'size')::bigint BETWEEN 1 AND 10485760)<>2 THEN RAISE EXCEPTION 'INVALID_POD_FILE';END IF;
 attempt:=d.proof_attempt+1;
 INSERT INTO public.delivery_documents(shipment_id,delivery_id,kind,storage_path,file_name,mime_type,recipient_name,uploaded_by,proof_attempt)
 SELECT d.shipment_id,d.id,CASE WHEN name=p_photo_path THEN 'proof_of_delivery'::public.document_kind ELSE 'signature'::public.document_kind END,name,storage.filename(name),metadata->>'mimetype',btrim(p_recipient_name),auth.uid(),attempt
 FROM storage.objects WHERE bucket_id='delivery-documents' AND name IN (p_photo_path,p_signature_path) AND owner=auth.uid();
 UPDATE public.deliveries SET recipient_name=btrim(p_recipient_name),status='delivered',proof_attempt=attempt,proof_review_status='pending_review',proof_review_reason=NULL,proof_reviewed_at=NULL,proof_reviewed_by=NULL WHERE id=d.id;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(d.shipment_id,d.id,'proof_submitted',auth.uid(),jsonb_build_object('attempt',attempt));
END $function$
;

CREATE OR REPLACE FUNCTION public.driver_trip_stats(p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(completed_trips_count integer, total_allowance numeric, on_time_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_driver_id uuid; v_completed_count integer; v_total_allowance numeric; v_eligible_count integer; v_on_time_count integer; v_on_time_rate numeric;
BEGIN
    v_driver_id := public.my_driver_id();
    IF v_driver_id IS NULL THEN RETURN QUERY SELECT 0::integer, 0.0::numeric, NULL::numeric; RETURN; END IF;

    SELECT COUNT(*)::integer, COALESCE(SUM(d.driver_allowance), 0.0)::numeric,
        COUNT(CASE WHEN s.estimated_arrival IS NOT NULL THEN 1 END)::integer,
        COUNT(CASE WHEN s.estimated_arrival IS NOT NULL AND d.arrived_at <= s.estimated_arrival THEN 1 END)::integer
    INTO v_completed_count, v_total_allowance, v_eligible_count, v_on_time_count
    FROM public.deliveries d JOIN public.shipments s ON s.id = d.shipment_id
    WHERE d.driver_id = v_driver_id AND d.arrived_at IS NOT NULL AND (p_period_start IS NULL OR d.arrived_at >= p_period_start) AND (p_period_end IS NULL OR d.arrived_at < p_period_end);

    IF v_eligible_count = 0 THEN v_on_time_rate := NULL; ELSE v_on_time_rate := (v_on_time_count::numeric / v_eligible_count::numeric); END IF;
    RETURN QUERY SELECT v_completed_count, v_total_allowance, v_on_time_rate;
END; $function$
;

CREATE OR REPLACE FUNCTION public.fleet_delete(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.get_user_role() not in ('admin', 'staff') or public.get_user_role() is null then
    raise exception 'Active office account required' using errcode = '42501';
  end if;

  if p_kind not in ('truck', 'driver') then
    raise exception 'Unsupported fleet record kind for deletion: %', p_kind;
  end if;

  if p_id is null then
    raise exception 'Record ID is required for deletion';
  end if;

  if p_kind = 'truck' then
    if not exists (select 1 from public.trucks where id = p_id) then
      raise exception 'Vehicle not found';
    end if;

    if exists (select 1 from public.deliveries where truck_id = p_id and status in ('assigned', 'loading', 'in_transit')) then
      raise exception 'Vehicle has an active delivery and cannot be removed.';
    end if;

    -- Delete linked cargo categories
    delete from public.truck_cargo_categories where truck_id = p_id;

    -- Delete linked compliance documents
    delete from public.compliance_documents where truck_id = p_id;

    -- Delete linked maintenance records
    delete from public.maintenance_records where truck_id = p_id;

    -- Delete delivery route plans if any
    delete from public.delivery_route_plans where truck_id = p_id;

    -- Delete the truck record
    delete from public.trucks where id = p_id;
    return true;

  elsif p_kind = 'driver' then
    if not exists (select 1 from public.drivers where id = p_id) then
      raise exception 'Driver not found';
    end if;

    if exists (select 1 from public.deliveries where driver_id = p_id and status in ('assigned', 'loading', 'in_transit')) then
      raise exception 'Driver has an active delivery and cannot be removed.';
    end if;

    -- Unassign from any truck
    update public.trucks set assigned_driver_id = null where assigned_driver_id = p_id;

    -- Delete linked compliance documents
    delete from public.compliance_documents where driver_id = p_id;

    -- Delete the driver record
    delete from public.drivers where id = p_id;
    return true;
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fleet_save(p_kind text, p_id uuid, p_data jsonb, p_categories uuid[] DEFAULT NULL::uuid[], p_documents jsonb DEFAULT '[]'::jsonb, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_id uuid := coalesce(p_id, gen_random_uuid());
 v_updated timestamptz;
 v_truck uuid;
 v_driver uuid;
 v_doc jsonb;
 v_path text;
 v_owner text;
begin
 if auth.uid() is null or public.get_user_role() not in ('admin','staff') or public.get_user_role() is null then
   raise exception 'Active office account required' using errcode='42501';
 end if;
 if p_kind not in ('truck','driver','maintenance','document') then raise exception 'Unsupported fleet record'; end if;
 if p_kind='truck' then
   if nullif(btrim(p_data->>'plate_number'),'') is null or nullif(btrim(p_data->>'model'),'') is null
     or nullif(p_data->>'vehicle_type_id','') is null or coalesce((p_data->>'capacity_kg')::numeric,0)<=0 then
     raise exception 'Plate, model, vehicle type and positive capacity are required';
   end if;
   select updated_at into v_updated from public.trucks where id=v_id for update;
   if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
   if exists(select 1 from public.deliveries where truck_id=v_id and status in ('assigned','loading','in_transit')) then raise exception 'Vehicle has an active delivery; finish it before changing the vehicle.'; end if;
   v_driver := nullif(p_data->>'assigned_driver_id','')::uuid;
   if v_driver is not null then
     perform 1 from public.drivers where id=v_driver and status='available' for update;
     if not found then raise exception 'Assigned driver must be available'; end if;
     if exists(select 1 from public.trucks where assigned_driver_id=v_driver and id<>v_id)
       or exists(select 1 from public.deliveries where driver_id=v_driver and status in ('assigned','loading','in_transit')) then raise exception 'Driver is already assigned or reserved'; end if;
   end if;
   if p_id is null then
     insert into public.trucks(id,plate_number,model,model_year,vehicle_type_id,capacity_kg,assigned_driver_id,status,notes)
       values(v_id,upper(btrim(p_data->>'plate_number')),btrim(p_data->>'model'),nullif(p_data->>'model_year','')::int,
        (p_data->>'vehicle_type_id')::uuid,(p_data->>'capacity_kg')::numeric,v_driver,
        coalesce(nullif(p_data->>'status',''),'available')::public.truck_status,p_data->>'notes');
   else
     update public.trucks set plate_number=upper(btrim(p_data->>'plate_number')),model=btrim(p_data->>'model'),
       model_year=nullif(p_data->>'model_year','')::int,vehicle_type_id=(p_data->>'vehicle_type_id')::uuid,
       capacity_kg=(p_data->>'capacity_kg')::numeric,assigned_driver_id=v_driver,
       status=(p_data->>'status')::public.truck_status,notes=p_data->>'notes' where id=v_id;
   end if;
   if p_categories is not null then
     delete from public.truck_cargo_categories where truck_id=v_id;
     insert into public.truck_cargo_categories(truck_id,cargo_category_id) select v_id,x from (select distinct unnest(p_categories) x)y;
   end if;
 elsif p_kind='driver' then
   if nullif(btrim(p_data->>'full_name'),'') is null or nullif(btrim(p_data->>'license_number'),'') is null then raise exception 'Driver name and license are required'; end if;
   v_truck := nullif(p_data->>'assigned_truck_id','')::uuid;
   if v_truck is not null then
     perform 1 from public.trucks where id=v_truck and assigned_driver_id is null and status='available' for update;
     if not found or exists(select 1 from public.deliveries where truck_id=v_truck and status in ('assigned','loading','in_transit'))
       or exists(select 1 from public.maintenance_records where truck_id=v_truck and status='in_progress') then raise exception 'Vehicle is no longer assignable'; end if;
   end if;
   select updated_at into v_updated from public.drivers where id=v_id for update;
   if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
   if exists(select 1 from public.deliveries where driver_id=v_id and status in ('assigned','loading','in_transit')) then raise exception 'Driver has an active delivery; finish it before changing the driver.'; end if;
   if p_id is null then
     if nullif(p_data->>'user_id','') is not null and not exists(select 1 from public.users where id=(p_data->>'user_id')::uuid and role='driver') then raise exception 'Driver account is invalid'; end if;
     insert into public.drivers(id,user_id,full_name,license_number,contact_number,date_hired,emergency_contact_number,status,notes)
       values(v_id,nullif(p_data->>'user_id','')::uuid,btrim(p_data->>'full_name'),btrim(p_data->>'license_number'),
        p_data->>'contact_number',nullif(p_data->>'date_hired','')::date,p_data->>'emergency_contact_number','available',p_data->>'notes');
   else
     update public.drivers set full_name=btrim(p_data->>'full_name'),license_number=btrim(p_data->>'license_number'),
       contact_number=p_data->>'contact_number',date_hired=nullif(p_data->>'date_hired','')::date,
       emergency_contact_number=p_data->>'emergency_contact_number',status=(p_data->>'status')::public.driver_status,notes=p_data->>'notes' where id=v_id;
   end if;
   if v_truck is not null then
     if exists(select 1 from public.trucks where assigned_driver_id=v_id and id<>v_truck) then raise exception 'Driver is already assigned to a vehicle'; end if;
     update public.trucks set assigned_driver_id=v_id where id=v_truck;
   end if;
 elsif p_kind='maintenance' then
   v_truck := (p_data->>'truck_id')::uuid;
   if v_truck is null or nullif(p_data->>'scheduled_date','') is null then raise exception 'Vehicle and scheduled date are required'; end if;
   perform 1 from public.trucks where id=v_truck for update;
   if not found then raise exception 'Vehicle not found'; end if;
   select updated_at into v_updated from public.maintenance_records where id=v_id for update;
   if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
   if p_data->>'status'='in_progress' and exists(select 1 from public.deliveries where truck_id=v_truck and status in ('assigned','loading','in_transit')) then raise exception 'Vehicle has an active delivery; cannot start maintenance'; end if;
   if p_data->>'status'='completed' and nullif(p_data->>'completed_date','') is null then raise exception 'Completion date is required'; end if;
   if nullif(p_data->>'completed_date','')::date < (p_data->>'scheduled_date')::date then raise exception 'Completion cannot precede scheduled date'; end if;
   if p_id is null then
     insert into public.maintenance_records(id,truck_id,kind,status,scheduled_date,completed_date,description,vendor,cost,created_by)
       values(v_id,v_truck,coalesce(p_data->>'kind','preventive')::public.maintenance_kind,
        coalesce(p_data->>'status','scheduled')::public.maintenance_status,(p_data->>'scheduled_date')::date,
        nullif(p_data->>'completed_date','')::date,p_data->>'description',p_data->>'vendor',nullif(p_data->>'cost','')::numeric,auth.uid());
   else
     update public.maintenance_records set kind=(p_data->>'kind')::public.maintenance_kind,status=(p_data->>'status')::public.maintenance_status,
       scheduled_date=(p_data->>'scheduled_date')::date,completed_date=nullif(p_data->>'completed_date','')::date,
       description=p_data->>'description',vendor=p_data->>'vendor',cost=nullif(p_data->>'cost','')::numeric where id=v_id and truck_id=v_truck;
     if not found then raise exception 'Maintenance vehicle cannot be changed'; end if;
   end if;
 elsif p_kind='document' then
   v_path := nullif(p_data->>'file_path','');
   select updated_at into v_updated from public.compliance_documents where id=v_id for update;
   if p_id is not null and (v_updated is null or p_expected is null or v_updated<>p_expected) then raise exception 'Record changed. Refresh and reopen before saving.'; end if;
   if v_path is not null and not exists(select 1 from public.compliance_documents where id=v_id and file_path=v_path) then
     if split_part(v_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='compliance-documents' and name=v_path) then raise exception 'Upload the document before saving'; end if;
   end if;
   if p_id is null then
     insert into public.compliance_documents(id,driver_id,truck_id,doc_type,document_number,issued_date,expiry_date,file_path,review_status,remarks,uploaded_by,reviewed_by,reviewed_at)
       values(v_id,nullif(p_data->>'driver_id','')::uuid,nullif(p_data->>'truck_id','')::uuid,(p_data->>'doc_type')::public.compliance_doc_type,
       p_data->>'document_number',nullif(p_data->>'issued_date','')::date,nullif(p_data->>'expiry_date','')::date,v_path,
       coalesce(p_data->>'review_status','pending_review')::public.review_status,p_data->>'remarks',auth.uid(),
       case when p_data->>'review_status' in ('approved','rejected') then auth.uid() end,
       case when p_data->>'review_status' in ('approved','rejected') then now() end);
   else
     update public.compliance_documents set document_number=p_data->>'document_number',issued_date=nullif(p_data->>'issued_date','')::date,
       expiry_date=nullif(p_data->>'expiry_date','')::date,file_path=v_path,review_status=(p_data->>'review_status')::public.review_status,
       remarks=p_data->>'remarks',reviewed_by=case when p_data->>'review_status' in ('approved','rejected') then auth.uid() end,
       reviewed_at=case when p_data->>'review_status' in ('approved','rejected') then now() end where id=v_id;
   end if;
 end if;
 for v_doc in select value from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) loop
   if p_kind not in ('truck','driver') then raise exception 'Nested documents only supported for vehicles/drivers'; end if;
   v_doc := v_doc - 'truck_id' - 'driver_id' || jsonb_build_object(case when p_kind='truck' then 'truck_id' else 'driver_id' end,v_id);
   perform public.fleet_save('document',null,v_doc,null,'[]'::jsonb,null);
 end loop;
 return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tracking_state(p_shipment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_cust_id uuid; v_result jsonb;
BEGIN
    v_cust_id := public.my_customer_id();
    IF v_cust_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'UNAUTHORIZED', DETAIL = json_build_object('reason', 'Active customer session required')::text; END IF;

    SELECT jsonb_build_object(
        'shipment_id', s.id, 'tracking_number', s.tracking_number, 'status', s.status,
        'pickup_arrived_at', to_char(d.pickup_arrived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'grace_ends_at', to_char(d.grace_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'auto_cancel_at', to_char(d.auto_cancel_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'server_now', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'driver_name', dr.full_name, 'truck_plate', tr.plate_number,
        'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type', e.event_type, 'occurred_at', to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'meta', e.meta)) FROM public.shipment_events e WHERE e.shipment_id = s.id), '[]'::jsonb),
        'status_history', COALESCE((SELECT jsonb_agg(jsonb_build_object('to_status', h.to_status, 'note', h.note, 'created_at', to_char(h.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) FROM public.shipment_status_history h WHERE h.shipment_id = s.id), '[]'::jsonb),
        'strikes', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', st.status, 'evidence', st.evidence, 'created_at', to_char(st.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) FROM public.customer_strikes st WHERE st.customer_id = v_cust_id), '[]'::jsonb)
    ) INTO v_result
    FROM public.shipments s LEFT JOIN public.deliveries d ON d.shipment_id = s.id AND d.status <> 'cancelled'::delivery_status
    LEFT JOIN public.drivers dr ON dr.id = d.driver_id LEFT JOIN public.trucks tr ON tr.id = d.truck_id
    WHERE s.id = p_shipment_id AND s.customer_id = v_cust_id;

    IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN009', MESSAGE = 'SHIPMENT_NOT_FOUND', DETAIL = json_build_object('shipment_id', p_shipment_id)::text; END IF;
    RETURN v_result;
END; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE assigned_role public.user_role := 'customer';
BEGIN
 IF coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role') IN ('admin','staff','driver') THEN
  assigned_role := coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role')::public.user_role;
 END IF;
 INSERT INTO public.users(id,email,full_name,phone,role)
 VALUES(new.id,nullif(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200),
  left(CASE WHEN nullif(new.phone,'') IS NOT NULL THEN '+'||ltrim(new.phone,'+') ELSE new.raw_user_meta_data->>'phone' END,30),assigned_role)
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=now();
 -- The existing users AFTER INSERT trigger creates the customer row first.
 -- Contact email is informational, never an Auth email or authorization claim.
 IF assigned_role = 'customer' THEN
  UPDATE public.customers
  SET email=coalesce(nullif(new.email,''),nullif(left(btrim(new.raw_user_meta_data->>'contact_email'),254),'')),
      address=nullif(left(btrim(new.raw_user_meta_data->>'address'),500),'')
  WHERE user_id=new.id;
 END IF;
 RETURN new;
END $function$
;

CREATE OR REPLACE FUNCTION public.is_within_operating_hours(p_ts timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_start_time time := '06:00'::time; v_end_time time := '20:00'::time; v_local_time time;
BEGIN
    SELECT (value #>> '{}')::time INTO v_start_time FROM public.system_settings WHERE key = 'operating_hours_start';
    SELECT (value #>> '{}')::time INTO v_end_time FROM public.system_settings WHERE key = 'operating_hours_end';
    IF v_start_time IS NULL THEN v_start_time := '06:00'::time; END IF;
    IF v_end_time IS NULL THEN v_end_time := '20:00'::time; END IF;
    v_local_time := (p_ts AT TIME ZONE 'Asia/Manila')::time;
    IF v_start_time <= v_end_time THEN RETURN v_local_time >= v_start_time AND v_local_time <= v_end_time;
    ELSE RETURN v_local_time >= v_start_time OR v_local_time <= v_end_time; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare 
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
begin
  insert into activity_logs (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    tg_op, 
    tg_table_name,
    coalesce(v_new->>'id', v_old->>'id', v_new->>'key', v_old->>'key'),
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
  );
  
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.manage_office_user(p_id uuid, p_full_name text, p_phone text, p_role text, p_is_active boolean, p_expected timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(872621004);
  if public.get_user_role() is distinct from 'admin' then raise exception 'Active administrator required'; end if;
  if p_role not in ('admin','staff') or p_role is null or p_is_active is null then raise exception 'Invalid office role or status'; end if;
  if p_full_name is null or length(btrim(p_full_name)) not between 1 and 200 or length(coalesce(p_phone,''))>40 then raise exception 'Invalid profile details'; end if;
  if p_expected is null then raise exception 'Reload the account before editing'; end if;
  update public.users set full_name=btrim(p_full_name),phone=nullif(btrim(p_phone),''),role=p_role::public.user_role,is_active=p_is_active
    where id=p_id and role in ('admin','staff') and updated_at=p_expected returning id into result;
  if result is null then raise exception 'Account changed or is not an office account. Reload and retry'; end if;
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.mobile_create_request(p_request_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; s public.shipments%ROWTYPE; lat1 numeric; lng1 numeric;lat2 numeric;lng2 numeric;handling text;
BEGIN
 -- Coordinate-less legacy request callers remain compatible; new UI always confirms coordinates.
 lat1:=(p_data->>'pickup_lat')::numeric; lng1:=(p_data->>'pickup_lng')::numeric;
 lat2:=(p_data->>'dropoff_lat')::numeric; lng2:=(p_data->>'dropoff_lng')::numeric;
 IF p_data ?| array['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'] AND
 (lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL OR NOT(lat1 BETWEEN -90 AND 90)
 OR NOT(lat2 BETWEEN -90 AND 90) OR NOT(lng1 BETWEEN -180 AND 180) OR NOT(lng2 BETWEEN -180 AND 180)
 OR (lat1=lat2 AND lng1=lng2)) THEN RAISE EXCEPTION 'INVALID_COORDINATES';END IF;
 handling:=coalesce(p_data->>'handling','None');
 IF handling NOT IN ('None','Fragile','Keep Dry','Temperature Sensitive','Perishable','Cold Chain (Refrigerated)') THEN RAISE EXCEPTION 'INVALID_HANDLING';END IF;
 result:=public.mobile_create_request_base(p_request_id,p_data);
 SELECT * INTO s FROM public.shipments WHERE id=(result->>'id')::uuid FOR UPDATE;
 IF s.pickup_lat IS NOT NULL AND (s.pickup_lat IS DISTINCT FROM lat1 OR s.pickup_lng IS DISTINCT FROM lng1 OR s.dropoff_lat IS DISTINCT FROM lat2 OR s.dropoff_lng IS DISTINCT FROM lng2 OR s.special_handling IS DISTINCT FROM handling)
 THEN RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';END IF;
 IF s.status='pending' AND s.pickup_lat IS NULL THEN UPDATE public.shipments SET pickup_lat=lat1,pickup_lng=lng1,dropoff_lat=lat2,dropoff_lng=lng2,special_handling=handling WHERE id=s.id;END IF;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_create_request_base(p_request_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE customer uuid; shipment public.shipments%ROWTYPE; vehicle public.vehicle_types%ROWTYPE;
  weight numeric; departure timestamptz; contact text; max_capacity numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role='customer') THEN
    RAISE EXCEPTION 'ACTIVE_CUSTOMER_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT id INTO customer FROM public.customers WHERE user_id=auth.uid() AND is_active;
  IF customer IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PROFILE_REQUIRED'; END IF;
  IF p_request_id IS NULL OR p_data IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text,0));
  SELECT * INTO shipment FROM public.shipments WHERE customer_id=customer AND client_request_id=p_request_id;
  IF FOUND THEN
    IF shipment.pickup_address IS DISTINCT FROM btrim(p_data->>'pickup')
       OR shipment.dropoff_address IS DISTINCT FROM btrim(p_data->>'dropoff')
       OR shipment.cargo_description IS DISTINCT FROM btrim(p_data->>'cargo')
       OR shipment.weight_kg IS DISTINCT FROM (p_data->>'weight')::numeric
       OR shipment.requested_vehicle_type_id IS DISTINCT FROM (p_data->>'vehicle_id')::uuid
       OR shipment.scheduled_departure IS DISTINCT FROM (p_data->>'departure')::timestamptz
       OR shipment.driver_notes IS DISTINCT FROM 'Contact: '||(p_data->>'contact')||E'\n'||coalesce(p_data->>'notes','') THEN
      RAISE EXCEPTION 'REQUEST_ALREADY_SAVED_REFRESH';
    END IF;
    RETURN jsonb_build_object('id',shipment.id,'tracking_number',shipment.tracking_number,'status',shipment.status);
  END IF;
  IF jsonb_typeof(p_data)<>'object' OR length(p_data::text)>10000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF length(btrim(coalesce(p_data->>'pickup','')))<5 OR length(p_data->>'pickup')>500
     OR length(btrim(coalesce(p_data->>'dropoff','')))<5 OR length(p_data->>'dropoff')>500
     OR lower(btrim(p_data->>'pickup'))=lower(btrim(p_data->>'dropoff'))
     OR length(btrim(coalesce(p_data->>'cargo','')))<3 OR length(p_data->>'cargo')>1000
     OR length(coalesce(p_data->>'notes',''))>2000 THEN RAISE EXCEPTION 'INVALID_BOOKING_DETAILS'; END IF;
  contact := p_data->>'contact';
  IF contact IS NULL OR contact !~ '^\+639[0-9]{9}$' THEN RAISE EXCEPTION 'INVALID_CONTACT'; END IF;
  weight := (p_data->>'weight')::numeric;
  IF weight IS NULL OR weight<=0 OR weight::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  SELECT * INTO vehicle FROM public.vehicle_types WHERE id=(p_data->>'vehicle_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_VEHICLE_TYPE'; END IF;
  SELECT max(capacity_kg) INTO max_capacity FROM public.trucks WHERE vehicle_type_id=vehicle.id;
  IF weight>coalesce(max_capacity,vehicle.default_capacity_kg,0) THEN RAISE EXCEPTION 'CAPACITY_EXCEEDED'; END IF;
  departure := (p_data->>'departure')::timestamptz;
  IF departure IS NULL OR departure<=now() OR departure>now()+interval '1 year' THEN RAISE EXCEPTION 'INVALID_DEPARTURE'; END IF;
  INSERT INTO public.shipments(customer_id,status,booking_source,cargo_description,weight_kg,
    requested_vehicle_type_id,pickup_address,dropoff_address,scheduled_departure,driver_notes,created_by,client_request_id)
  VALUES(customer,'pending','mobile',btrim(p_data->>'cargo'),weight,vehicle.id,btrim(p_data->>'pickup'),
    btrim(p_data->>'dropoff'),departure,'Contact: '||contact||E'\n'||coalesce(p_data->>'notes',''),auth.uid(),p_request_id)
  RETURNING * INTO shipment;
  RETURN jsonb_build_object('id',shipment.id,'tracking_number',shipment.tracking_number,'status',shipment.status);
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_delivery_evidence_file(p_shipment uuid, p_kind text, p_record uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE records jsonb; path text;
BEGIN
 records:=public.mobile_driver_evidence(p_shipment);
 IF p_kind='incident' THEN SELECT a->>'storage_path' INTO path FROM jsonb_array_elements(records->'incident_evidence') a WHERE a->>'id'=p_record::text;
 ELSIF p_kind='expense' THEN SELECT a->>'receipt_path' INTO path FROM jsonb_array_elements(records->'expenses') a WHERE a->>'id'=p_record::text;
 END IF;
 IF path IS NULL THEN RAISE EXCEPTION 'RECORDED_FILE_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN path;
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_driver_action(p_delivery uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN PERFORM public.driver_milestone(p_delivery,p_action); END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_driver_evidence(p_shipment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF public.get_user_role() NOT IN ('driver','admin','staff') OR public.get_user_role() IS NULL THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=p_shipment) THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('expenses',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id) FROM public.delivery_expenses e JOIN public.deliveries d ON d.id=e.delivery_id WHERE d.shipment_id=p_shipment),'[]'::jsonb),
 'incident_evidence',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.slot) FROM public.incident_attachments a JOIN public.deliveries d ON d.id=a.delivery_id WHERE d.shipment_id=p_shipment),'[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_driver_fuel_history(p_shipment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.logged_at DESC,f.id DESC),'[]'::jsonb) INTO result
 FROM public.fuel_logs f JOIN public.deliveries d ON d.id=f.delivery_id
 WHERE d.shipment_id=p_shipment AND d.driver_id=public.my_driver_id() AND f.driver_id=public.my_driver_id();
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_driver_history(p_period text DEFAULT 'This month'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb; start_at timestamptz; end_at timestamptz; driver uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN
  RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';
 END IF;
 driver:=public.my_driver_id();
 IF driver IS NULL THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR p_period NOT IN ('This month','Last month','All records') OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_HISTORY_QUERY'; END IF;
 IF p_period<>'All records' THEN
  start_at:=(date_trunc('month',now() AT TIME ZONE 'Asia/Manila') - CASE WHEN p_period='Last month' THEN interval '1 month' ELSE interval '0' END) AT TIME ZONE 'Asia/Manila';
  end_at:=((start_at AT TIME ZONE 'Asia/Manila')+interval '1 month') AT TIME ZONE 'Asia/Manila';
 END IF;
 WITH records AS MATERIALIZED (
  SELECT s.*,to_jsonb(d) AS own_delivery FROM public.shipments s
  JOIN LATERAL (SELECT * FROM public.deliveries WHERE shipment_id=s.id AND driver_id=driver ORDER BY assigned_at DESC,id DESC LIMIT 1)d ON true
  WHERE start_at IS NULL OR (coalesce(s.scheduled_departure,s.created_at)>=start_at AND coalesce(s.scheduled_departure,s.created_at)<end_at)
 ), page AS (
  SELECT * FROM records ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC OFFSET p_offset LIMIT p_limit
 )
 SELECT jsonb_build_object(
  'shipments',coalesce((SELECT jsonb_agg(to_jsonb(p)-'own_delivery' ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC) FROM page p),'[]'::jsonb),
  'driver_deliveries',coalesce((SELECT jsonb_agg(own_delivery ORDER BY coalesce(scheduled_departure,created_at) DESC,id DESC) FROM page),'[]'::jsonb),
  'total',count(*),'completed',count(*) FILTER(WHERE status='completed'),
  'allowance_missing',count(*) FILTER(WHERE status='completed' AND own_delivery->>'driver_allowance' IS NULL),
  'allowance_total',coalesce(sum((own_delivery->>'driver_allowance')::numeric) FILTER(WHERE status='completed'),0),
  'on_time_known',count(*) FILTER(WHERE status='completed' AND estimated_arrival IS NOT NULL AND own_delivery->>'arrived_at' IS NOT NULL),
  'on_time_count',count(*) FILTER(WHERE status='completed' AND (own_delivery->>'arrived_at')::timestamptz<=estimated_arrival),
  'revision',md5(coalesce(string_agg(md5(to_jsonb(records)::text),',' ORDER BY id),'')),
  'period',p_period,'offset',p_offset,'limit',p_limit,'as_of',now()
 ) INTO result FROM records;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_driver_log_fuel(p_request uuid, p_delivery uuid, p_liters numeric, p_price numeric, p_odometer numeric, p_station text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries; existing public.fuel_logs; result public.fuel_logs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='driver' AND is_active) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_delivery IS NULL OR p_liters IS NULL OR NOT(p_liters>0 AND p_liters<=10000) OR p_liters<>round(p_liters,2) OR p_price IS NULL OR NOT(p_price>0 AND p_price<=10000) OR p_price<>round(p_price,2) OR p_odometer IS NULL OR NOT(p_odometer>=0 AND p_odometer<=10000000) OR p_odometer<>round(p_odometer,1) OR length(coalesce(p_station,''))>200 OR round(p_liters*p_price,2)>1000000 THEN RAISE EXCEPTION 'INVALID_FUEL_RECORD'; END IF;
 -- Serialize retries for the same caller/request, including concurrent responses.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 SELECT * INTO existing FROM public.fuel_logs WHERE id=p_request;
 IF FOUND THEN
  IF existing.driver_id IS DISTINCT FROM public.my_driver_id() OR existing.delivery_id IS DISTINCT FROM p_delivery OR existing.liters IS DISTINCT FROM p_liters OR existing.price_per_liter IS DISTINCT FROM p_price OR existing.odometer_km IS DISTINCT FROM p_odometer OR existing.station IS DISTINCT FROM nullif(trim(p_station),'') THEN RAISE EXCEPTION 'FUEL_REQUEST_CONFLICT'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery AND driver_id=public.my_driver_id();
 IF NOT FOUND OR d.status NOT IN ('assigned','loading','in_transit','delivered') THEN RAISE EXCEPTION 'DELIVERY_CLOSED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.fuel_logs(id,delivery_id,driver_id,truck_id,liters,price_per_liter,total_cost,odometer_km,station)
 VALUES(p_request,d.id,d.driver_id,d.truck_id,p_liters,p_price,round(p_liters*p_price,2),p_odometer,nullif(trim(p_station),'')) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_save_profile(p_name text, p_phone text, p_address text, p_city text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 200 OR p_phone IS NULL OR p_phone !~ '^\+639[0-9]{9}$'
     OR length(coalesce(p_address,''))>500 OR length(coalesce(p_city,''))>100 THEN RAISE EXCEPTION 'INVALID_PROFILE'; END IF;
  UPDATE public.users SET full_name=btrim(p_name),phone=p_phone WHERE id=auth.uid();
  UPDATE public.customers SET name=btrim(p_name),phone=p_phone,address=btrim(p_address),city=btrim(p_city) WHERE user_id=auth.uid();
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_shipment_details(p_shipment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 result:=public.mobile_shipment_details_base(p_shipment);
 RETURN result||jsonb_build_object(
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM
  (SELECT id,kind,storage_path,file_name,mime_type,recipient_name,created_at,proof_attempt FROM public.delivery_documents WHERE shipment_id=p_shipment AND kind IN ('proof_of_delivery','signature'))d),'[]'::jsonb),
 'incidents',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at) FROM
  (SELECT id,category,description,delay_minutes,created_at,resolved_at FROM public.delivery_incidents WHERE shipment_id=p_shipment)i),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at) FROM
  (SELECT id,event_type,occurred_at,meta FROM public.shipment_events WHERE shipment_id=p_shipment ORDER BY occurred_at DESC LIMIT 200)e),'[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_shipment_details_base(p_shipment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id=p_shipment) THEN
    RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'shipment_id',p_shipment,
    'events',coalesce((SELECT jsonb_agg(e ORDER BY e.occurred_at) FROM
      (SELECT id,event_type,occurred_at FROM public.shipment_events WHERE shipment_id=p_shipment ORDER BY occurred_at DESC LIMIT 200)e),'[]'::jsonb),
    'history',coalesce((SELECT jsonb_agg(h ORDER BY h.created_at) FROM
      (SELECT id,from_status,to_status,note,created_at FROM public.shipment_status_history WHERE shipment_id=p_shipment ORDER BY created_at DESC LIMIT 200)h),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(d ORDER BY d.created_at) FROM
      (SELECT id,kind,storage_path,file_name,mime_type,recipient_name,created_at FROM public.delivery_documents
       WHERE shipment_id=p_shipment AND kind::text IN ('proof_of_delivery','signature') ORDER BY created_at DESC LIMIT 50)d),'[]'::jsonb),
    'position',(SELECT to_jsonb(p) FROM
      (SELECT l.latitude,l.longitude,l.accuracy_m,l.recorded_at FROM public.tracking_logs l
       JOIN public.deliveries d ON d.id=l.delivery_id WHERE d.shipment_id=p_shipment ORDER BY l.recorded_at DESC LIMIT 1)p)
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 result:=public.mobile_workspace_base();
 RETURN result||jsonb_build_object(
 'shipments',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC) FROM
  (SELECT id,tracking_number,status,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,cargo_description,weight_kg,special_handling,scheduled_departure,estimated_arrival,quoted_amount,final_amount,driver_notes,cancelled_reason,created_at,updated_at,distance_km,route_source,route_duration_minutes,route_geometry FROM public.shipments ORDER BY created_at DESC LIMIT 200)s),'[]'::jsonb),
 'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM
  (SELECT id,shipment_id,status,assigned_at,updated_at,departed_at,arrived_at,recipient_name,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at,proof_attempt,proof_review_status,proof_review_reason FROM public.deliveries ORDER BY assigned_at DESC LIMIT 200)d),'[]'::jsonb),
 'settings',coalesce((SELECT jsonb_object_agg(key,value) FROM public.system_settings WHERE key IN ('no_show_arrival_radius_meters','no_show_grace_minutes','no_show_total_wait_minutes','buffered_tracking_window_minutes')),'{}'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.mobile_workspace_base()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE me public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE id=auth.uid() AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'profile',jsonb_build_object('id',me.id,'full_name',me.full_name,'email',me.email,'phone',me.phone,'role',me.role),
    'customer',(SELECT to_jsonb(c) FROM (SELECT id,name,phone,address,city FROM public.customers WHERE user_id=me.id LIMIT 1)c),
    'vehicles',coalesce((SELECT jsonb_agg(v ORDER BY v.name) FROM (SELECT id,name,default_capacity_kg FROM public.vehicle_types WHERE is_active)v),'[]'::jsonb),
    'shipments',coalesce((SELECT jsonb_agg(s ORDER BY s.created_at DESC) FROM
      (SELECT id,tracking_number,status,pickup_address,dropoff_address,cargo_description,weight_kg,special_handling,
        scheduled_departure,estimated_arrival,quoted_amount,final_amount,driver_notes,cancelled_reason,created_at,updated_at
       FROM public.shipments ORDER BY created_at DESC LIMIT 200)s),'[]'::jsonb),
    'deliveries',coalesce((SELECT jsonb_agg(d) FROM (SELECT id,shipment_id,status,assigned_at,departed_at,arrived_at,recipient_name,route_started_at,pickup_arrived_at,customer_showed_at FROM public.deliveries ORDER BY assigned_at DESC LIMIT 200)d),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(d) FROM (SELECT id,shipment_id,kind,file_name,recipient_name,created_at FROM public.delivery_documents ORDER BY created_at DESC LIMIT 200)d),'[]'::jsonb),
    'notifications',coalesce((SELECT jsonb_agg(n ORDER BY n.created_at DESC) FROM (SELECT id,title,body,shipment_id,read_at,created_at FROM public.notifications WHERE user_id=me.id ORDER BY created_at DESC LIMIT 100)n),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.my_customer_shipment_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.shipments where customer_id = public.my_customer_id();
$function$
;

CREATE OR REPLACE FUNCTION public.my_driver_shipment_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select shipment_id from public.deliveries where driver_id = public.my_driver_id();
$function$
;

CREATE OR REPLACE FUNCTION public.nearby_locations(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 50000, p_vehicle_type_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, sublabel text, address text, city text, province text, latitude numeric, longitude numeric, kind location_kind, distance_m double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select l.id, l.name, l.sublabel, l.address, l.city, l.province,
         l.latitude, l.longitude, l.kind,
         st_distance(l.geog, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from public.locations l
  where l.is_active
    and st_dwithin(l.geog, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and (p_vehicle_type_id is null or exists (
      select 1 from public.location_vehicle_types lvt
      where lvt.location_id = l.id and lvt.vehicle_type_id = p_vehicle_type_id))
  order by distance_m
  limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_ph_phone(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE cleaned text := regexp_replace(coalesce(raw, ''), '[^0-9+]', '', 'g');
BEGIN
  IF cleaned ~ '^09[0-9]{9}$' THEN RETURN '+63' || substr(cleaned, 2);
  ELSIF cleaned ~ '^9[0-9]{9}$' THEN RETURN '+63' || cleaned;
  ELSIF cleaned ~ '^639[0-9]{9}$' THEN RETURN '+' || cleaned;
  ELSIF cleaned ~ '^\+639[0-9]{9}$' THEN RETURN cleaned;
  ELSE RETURN NULL;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.notify_delivery_proof_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE recipient uuid;
BEGIN
 IF NEW.proof_review_status IS NOT DISTINCT FROM OLD.proof_review_status THEN RETURN NULL;END IF;
 SELECT dr.user_id INTO recipient FROM public.drivers dr WHERE dr.id=NEW.driver_id;
 PERFORM public.notify_user(recipient,'shipment_status'::public.notification_type,'Delivery proof review updated',coalesce(NEW.proof_review_reason,replace(NEW.proof_review_status,'_',' ')),NEW.shipment_id);
 SELECT c.user_id INTO recipient FROM public.customers c JOIN public.shipments s ON s.customer_id=c.id WHERE s.id=NEW.shipment_id;
 PERFORM public.notify_user(recipient,'shipment_status'::public.notification_type,'Delivery proof updated','Open your shipment for its current proof and review status.',NEW.shipment_id);
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.notify_office_delivery_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r record;
BEGIN
 IF NEW.event_type NOT IN ('proof_submitted','no_show_reported') THEN RETURN NULL;END IF;
 FOR r IN SELECT id FROM public.users WHERE is_active AND role IN ('admin','staff') LOOP
  PERFORM public.notify_user(r.id,'shipment_status'::public.notification_type,
   CASE NEW.event_type WHEN 'proof_submitted' THEN 'Delivery proof needs review' ELSE 'Pickup no-show needs review' END,
   'Open the shipment to inspect its recorded evidence and decide.',NEW.shipment_id);
 END LOOP;
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid, p_type notification_type, p_title text, p_body text DEFAULT NULL::text, p_shipment uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF p_user IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notification_preferences WHERE user_id=p_user AND type=p_type AND channel='in_app' AND NOT enabled) THEN
  INSERT INTO public.notifications(user_id,type,title,body,shipment_id) VALUES(p_user,p_type,p_title,p_body,p_shipment);
 END IF;
 IF p_shipment IS NOT NULL AND p_type::text IN ('shipment_status','delay')
 AND EXISTS(SELECT 1 FROM public.notification_preferences WHERE user_id=p_user AND type=p_type AND channel='sms' AND enabled)
 AND EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=p_user AND u.is_active
  AND a.phone_confirmed_at IS NOT NULL AND '+'||ltrim(a.phone,'+')=u.phone AND u.phone ~ '^\+639[0-9]{9}$') THEN
  -- Coalesce rapid duplicate updates; notification body stays inside Tanaw.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_shipment::text||p_type::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.sms_outbox WHERE user_id=p_user AND shipment_id=p_shipment AND type=p_type AND created_at>now()-interval '1 minute') THEN
   INSERT INTO public.sms_outbox(user_id,shipment_id,type) VALUES(p_user,p_shipment,p_type);
  END IF;
 END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.office_cancel_shipment(p_shipment uuid, p_expected timestamp with time zone, p_expected_delivery uuid, p_reason text, p_financial_ack boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  s public.shipments%ROWTYPE; d public.deliveries%ROWTYPE;
  current_delivery public.deliveries%ROWTYPE; delivery_count integer:=0;
  payment_count bigint; previous_status text;
  is_overdue_departure boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')
  ) THEN RAISE EXCEPTION 'Only active admin or staff may cancel shipments' USING ERRCODE='42501'; END IF;

  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Enter a cancellation reason of 5 to 1000 characters';
  END IF;

  IF p_financial_ack IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Acknowledge that cancellation does not refund payments or change recorded charges';
  END IF;

  SELECT * INTO s FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found or access denied'; END IF;

  IF p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Shipment changed. Reload before cancelling.' USING ERRCODE='40001';
  END IF;

  IF s.status NOT IN ('pending','booked','assigned','delayed') THEN
    RAISE EXCEPTION 'Only pending, booked, unstarted assigned, or departure-delayed shipments can be cancelled here';
  END IF;

  FOR current_delivery IN SELECT * FROM public.deliveries
    WHERE shipment_id=s.id AND status<>'cancelled' ORDER BY id FOR UPDATE
  LOOP
    delivery_count:=delivery_count+1; d:=current_delivery;
  END LOOP;

  IF delivery_count>1 OR d.id IS DISTINCT FROM p_expected_delivery THEN
    RAISE EXCEPTION 'Assignment changed. Reload before cancelling.' USING ERRCODE='40001';
  END IF;

  -- 12-hour overdue departure without pickup arrival check:
  is_overdue_departure := (
    s.scheduled_departure IS NOT NULL
    AND now() >= (s.scheduled_departure + interval '12 hours')
    AND (d.id IS NULL OR (d.pickup_arrived_at IS NULL AND d.departed_at IS NULL AND d.status NOT IN ('loading','in_transit','delivered')))
  );

  IF is_overdue_departure THEN
    NULL; -- Overdue condition met: allow cancellation
  ELSIF s.status IN ('booked','assigned') THEN
    IF delivery_count>1 OR (delivery_count=1 AND (d.status<>'assigned' OR d.departed_at IS NOT NULL
      OR d.route_started_at IS NOT NULL OR d.pickup_arrived_at IS NOT NULL
      OR d.customer_showed_at IS NOT NULL OR d.grace_ends_at IS NOT NULL OR d.auto_cancel_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'Started trips cannot be cancelled here. Use the operational review workflow; no-show requires its separate review.';
    END IF;
  ELSIF delivery_count<>0 THEN
    RAISE EXCEPTION 'Shipment has an unexpected active delivery. Reload and review its lifecycle.';
  END IF;

  IF d.id IS NOT NULL THEN
    PERFORM 1 FROM public.drivers WHERE id=d.driver_id FOR UPDATE;
    PERFORM 1 FROM public.trucks WHERE id=d.truck_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.deliveries WHERE id<>d.id AND status IN ('assigned','loading','in_transit')
      AND (driver_id=d.driver_id OR truck_id=d.truck_id)) THEN
      RAISE EXCEPTION 'Resources are shared with another active delivery. Resolve the reservation conflict first.';
    END IF;
    UPDATE public.deliveries SET status='cancelled' WHERE id=d.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Delivery cancellation denied' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT count(*) INTO payment_count FROM public.payments WHERE shipment_id=s.id;
  previous_status:=s.status::text;
  UPDATE public.shipments SET status='cancelled',cancelled_reason=btrim(p_reason),cancelled_at=now()
  WHERE id=s.id RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment cancellation denied' USING ERRCODE='42501'; END IF;

  INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta)
  VALUES(s.id,d.id,'shipment_cancelled',auth.uid(),jsonb_build_object(
    'reason',btrim(p_reason),'previous_status',previous_status,'previous_delivery',d.id,
    'financial_policy','preserve_charges_and_payments_no_automatic_fee_or_refund',
    'financial_acknowledged',true,'payment_count_at_cancellation',payment_count,
    'financial_review_required',payment_count>0,
    'cancellation_rule',CASE WHEN is_overdue_departure THEN 'scheduled_departure_overdue_12h_no_pickup_arrival' ELSE 'pre_trip_unstarted' END));

  RETURN jsonb_build_object('id',s.id,'status',s.status,'updated_at',s.updated_at,
    'cancelled_at',s.cancelled_at,'delivery_id',d.id,'financial_review_required',payment_count>0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.office_create_customer(p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_barangay text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_province text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_name text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_address text;
  v_barangay text;
  v_city text;
  v_province text;
  v_notes text;
  v_customer public.customers%ROWTYPE;
BEGIN
  -- 1. Security Check: Only active office staff and administrators may register customers
  PERFORM public.require_active_office();

  -- 2. Validate and trim Name (mandatory, minimum 2 characters)
  v_name := btrim(coalesce(p_name, ''));
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Customer name is required and must be at least 2 characters.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Validate and trim Email (optional, but if provided must be valid and unique among active customers)
  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  ELSE
    IF v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Enter a valid email address.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE lower(btrim(email)) = v_email
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'A customer with email "%" already exists.', v_email
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 4. Validate and trim Phone (optional, but if provided must have 7-15 digits and be unique)
  v_phone := btrim(coalesce(p_phone, ''));
  IF v_phone = '' THEN
    v_phone := NULL;
  ELSE
    v_phone_digits := regexp_replace(v_phone, '\D', '', 'g');
    IF length(v_phone_digits) < 7 OR length(v_phone_digits) > 15 THEN
      RAISE EXCEPTION 'Enter a valid contact number (7–15 digits).'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE regexp_replace(phone, '\D', '', 'g') = v_phone_digits
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'A customer with phone number "%" already exists.', v_phone
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 5. Trim optional address and notes fields
  v_address := nullif(btrim(coalesce(p_address, '')), '');
  v_barangay := nullif(btrim(coalesce(p_barangay, '')), '');
  v_city := nullif(btrim(coalesce(p_city, '')), '');
  v_province := nullif(btrim(coalesce(p_province, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  -- 6. Insert new billing customer record (is_active = true)
  INSERT INTO public.customers (
    name,
    email,
    phone,
    address,
    barangay,
    city,
    province,
    notes,
    is_active
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    v_address,
    v_barangay,
    v_city,
    v_province,
    v_notes,
    true
  )
  RETURNING * INTO v_customer;

  -- 7. Record structured audit log in activity_logs
  BEGIN
    INSERT INTO public.activity_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'customer_created',
      'customer',
      v_customer.id::text,
      jsonb_build_object(
        'customer_id', v_customer.id,
        'customer_code', v_customer.customer_code,
        'name', v_customer.name,
        'email', v_customer.email,
        'phone', v_customer.phone
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN to_jsonb(v_customer);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.office_delivery_action(p_delivery uuid, p_expected timestamp with time zone, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE='40001';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF p_action='complete' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review'
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='proof_of_delivery')
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='signature')
  OR EXISTS(SELECT 1 FROM public.delivery_incidents WHERE delivery_id=d.id AND resolved_at IS NULL) THEN RAISE EXCEPTION 'PROOF_AND_INCIDENT_REVIEW_REQUIRED';END IF;
  UPDATE public.deliveries SET proof_review_status='approved',proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
  UPDATE public.shipments SET status='completed',actual_delivery_at=d.arrived_at WHERE id=s.id;
 ELSIF p_action='request_correction' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review' OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_PROOF_REVIEW';END IF;
  UPDATE public.deliveries SET proof_review_status='correction_requested',proof_review_reason=btrim(p_reason),proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
 ELSIF p_action='cancel_no_show' THEN
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL OR d.auto_cancel_at IS NULL OR now()<d.auto_cancel_at
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_NO_SHOW_REVIEW';END IF;
  UPDATE public.deliveries SET status='cancelled' WHERE id=d.id;
  UPDATE public.shipments SET status='cancelled',cancelled_reason=btrim(p_reason) WHERE id=s.id;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_OFFICE_ACTION';END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(s.id,d.id,p_action,auth.uid(),jsonb_build_object('reason',p_reason,'attempt',d.proof_attempt));
END $function$
;

CREATE OR REPLACE FUNCTION public.office_prepare_quote(p_shipment uuid, p_expected timestamp with time zone, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.shipments%ROWTYPE; rate public.pricing_rates%ROWTYPE; km numeric; minutes numeric;
 lat1 numeric; lng1 numeric; lat2 numeric; lng2 numeric; minimum numeric; surcharge numeric; charge numeric; handling text; handling_key text;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO s FROM public.shipments WHERE id=p_shipment FOR UPDATE;
 IF NOT FOUND OR s.status<>'pending' OR p_expected IS NULL OR s.updated_at IS DISTINCT FROM p_expected
 THEN RAISE EXCEPTION 'REQUEST_CHANGED_RELOAD' USING ERRCODE='40001'; END IF;
 km:=(p_data->>'distance_km')::numeric; minutes:=(p_data->>'duration_minutes')::numeric;
 lat1:=(p_data->>'pickup_lat')::numeric; lng1:=(p_data->>'pickup_lng')::numeric;
 lat2:=(p_data->>'dropoff_lat')::numeric; lng2:=(p_data->>'dropoff_lng')::numeric;
 IF km IS NULL OR NOT(km>0 AND km<20000) OR minutes IS NULL OR NOT(minutes>0 AND minutes<100000)
 OR lat1 IS NULL OR NOT(lat1 BETWEEN -90 AND 90) OR lat2 IS NULL OR NOT(lat2 BETWEEN -90 AND 90)
 OR lng1 IS NULL OR NOT(lng1 BETWEEN -180 AND 180) OR lng2 IS NULL OR NOT(lng2 BETWEEN -180 AND 180)
 OR (lat1=lat2 AND lng1=lng2) OR coalesce(p_data->>'source','') NOT IN ('provider','manual')
 OR (p_data->>'source'='manual' AND length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000)
 THEN RAISE EXCEPTION 'INVALID_ROUTE'; END IF;
 IF s.scheduled_departure IS NULL OR s.scheduled_departure<=now() THEN RAISE EXCEPTION 'INVALID_DEPARTURE'; END IF;
 SELECT * INTO rate FROM public.pricing_rates WHERE vehicle_type_id=s.requested_vehicle_type_id AND is_active
 AND effective_from<=(now() AT TIME ZONE 'Asia/Manila')::date
 AND (effective_to IS NULL OR effective_to>=(now() AT TIME ZONE 'Asia/Manila')::date)
 ORDER BY effective_from DESC,id LIMIT 1;
 SELECT (value #>> '{}')::numeric INTO minimum FROM public.system_settings WHERE key='minimum_booking_fee';
 handling:=coalesce(nullif(s.special_handling,''),'None');
 handling_key:=CASE handling WHEN 'None' THEN 'none' WHEN 'Fragile' THEN 'fragile' WHEN 'Keep Dry' THEN 'keepdry'
 WHEN 'Temperature Sensitive' THEN 'temp' WHEN 'Perishable' THEN 'perishable' WHEN 'Cold Chain (Refrigerated)' THEN 'cold' END;
 SELECT (value->>handling_key)::numeric INTO surcharge FROM public.system_settings WHERE key='handling_surcharges';
 IF rate.id IS NULL OR rate.per_km_rate IS NULL OR NOT(rate.per_km_rate>=0 AND rate.per_km_rate<1000000)
 OR rate.min_charge IS NULL OR NOT(rate.min_charge>=0 AND rate.min_charge<1000000000)
 OR minimum IS NULL OR NOT(minimum>=0 AND minimum<1000000000)
 OR surcharge IS NULL OR NOT(surcharge>=0 AND surcharge<1000000000) THEN RAISE EXCEPTION 'PRICING_CONFIGURATION_REQUIRED'; END IF;
 charge:=round(greatest(km*rate.per_km_rate,rate.min_charge,minimum)+surcharge*CASE WHEN handling_key='cold' THEN km ELSE 1 END,2);
 UPDATE public.shipments SET pickup_lat=lat1,pickup_lng=lng1,dropoff_lat=lat2,dropoff_lng=lng2,
 distance_km=km,route_duration_minutes=minutes,route_source=p_data->>'source',route_reason=left(p_data->>'reason',1000),
 route_geometry=CASE WHEN p_data->>'source'='provider' THEN p_data->'geometry' ELSE NULL END,
 pricing_rate_id=rate.id,quoted_amount=charge,override_amount=NULL,override_reason=NULL,
 estimated_arrival=scheduled_departure+minutes*interval '1 minute' WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.shipment_events(shipment_id,event_type,actor_id,meta) VALUES(s.id,'office_quoted',auth.uid(),jsonb_build_object('source',s.route_source,'amount',charge));
 RETURN jsonb_build_object('id',s.id,'updated_at',s.updated_at,'quoted_amount',charge);
END $function$
;

CREATE OR REPLACE FUNCTION public.office_record_payment(p_shipment_id uuid, p_amount numeric, p_method payment_method, p_reference text DEFAULT NULL::text, p_paid_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  s public.shipments%ROWTYPE;
  pay public.payments%ROWTYPE;
  v_ref text;
  v_notes text;
  v_paid_at timestamptz;
BEGIN
  PERFORM public.require_active_office();

  IF p_shipment_id IS NULL THEN
    RAISE EXCEPTION 'Shipment ID is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found' USING ERRCODE = 'P0002';
  END IF;

  IF s.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record payment for a cancelled shipment' USING ERRCODE = '22000';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Payment method is required' USING ERRCODE = '22023';
  END IF;

  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  v_paid_at := coalesce(p_paid_at, now());

  IF v_paid_at > now() + interval '1 day' THEN
    RAISE EXCEPTION 'Payment date cannot be in the future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (
    shipment_id,
    amount,
    method,
    status,
    reference_number,
    paid_at,
    notes,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    s.id,
    round(p_amount, 2),
    p_method,
    'pending',
    v_ref,
    v_paid_at,
    v_notes,
    auth.uid(),
    now(),
    now()
  )
  RETURNING * INTO pay;

  -- Record audit event in shipment_events
  INSERT INTO public.shipment_events (
    shipment_id,
    event_type,
    actor_id,
    meta
  )
  VALUES (
    s.id,
    'payment_recorded',
    auth.uid(),
    jsonb_build_object(
      'payment_id', pay.id,
      'amount', pay.amount,
      'method', pay.method,
      'status', pay.status,
      'reference_number', pay.reference_number,
      'paid_at', pay.paid_at
    )
  );

  RETURN jsonb_build_object(
    'id', pay.id,
    'shipment_id', pay.shipment_id,
    'amount', pay.amount,
    'method', pay.method,
    'status', pay.status,
    'reference_number', pay.reference_number,
    'paid_at', pay.paid_at,
    'notes', pay.notes,
    'created_by', pay.created_by,
    'created_at', pay.created_at,
    'updated_at', pay.updated_at
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.office_resolve_incident(p_incident uuid, p_expected timestamp with time zone, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE i public.delivery_incidents%ROWTYPE; d public.deliveries%ROWTYPE;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO i FROM public.delivery_incidents WHERE id=p_incident;
 SELECT * INTO d FROM public.deliveries WHERE id=i.delivery_id FOR UPDATE;
 IF d.id IS NULL OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE='40001';END IF;
 IF i.resolved_at IS NOT NULL THEN RETURN;END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_RESOLUTION';END IF;
 UPDATE public.delivery_incidents SET resolved_at=now() WHERE id=i.id;
 UPDATE public.deliveries SET updated_at=clock_timestamp() WHERE id=d.id;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_incidents WHERE shipment_id=i.shipment_id AND resolved_at IS NULL) THEN
 UPDATE public.shipments SET status=CASE d.status WHEN 'loading' THEN 'loading'::public.shipment_status WHEN 'in_transit' THEN 'in_transit'::public.shipment_status WHEN 'delivered' THEN 'review'::public.shipment_status ELSE status END WHERE id=i.shipment_id AND status='delayed';END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(i.shipment_id,d.id,'incident_resolved',auth.uid(),jsonb_build_object('incident',i.id,'reason',btrim(p_reason)));
END $function$
;

CREATE OR REPLACE FUNCTION public.office_review_expense(p_expense uuid, p_expected timestamp with time zone, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE expense public.delivery_expenses%ROWTYPE;
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','rejected') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_EXPENSE_REVIEW';END IF;
 SELECT * INTO expense FROM public.delivery_expenses WHERE id=p_expense FOR UPDATE;
 IF NOT FOUND OR expense.updated_at IS DISTINCT FROM p_expected OR expense.status<>'pending' THEN RAISE EXCEPTION 'STALE_EXPENSE_REVIEW';END IF;
 UPDATE public.delivery_expenses SET status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason) WHERE id=expense.id;
END $function$
;

CREATE OR REPLACE FUNCTION public.office_review_payment(p_payment_id uuid, p_expected timestamp with time zone, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  pay public.payments%ROWTYPE;
  v_action text;
  v_reason text;
  v_updated_notes text;
BEGIN
  PERFORM public.require_active_office();

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required' USING ERRCODE = '22023';
  END IF;

  v_action := lower(btrim(coalesce(p_action, '')));
  IF v_action NOT IN ('verify', 'reject') THEN
    RAISE EXCEPTION 'Invalid review action: must be verify or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002';
  END IF;

  -- Optimistic concurrency check
  IF p_expected IS NULL OR pay.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'PAYMENT_CHANGED_RELOAD' USING ERRCODE = '40001';
  END IF;

  IF pay.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment is not pending review (current status: %)', pay.status USING ERRCODE = '22000';
  END IF;

  IF v_action = 'reject' THEN
    v_reason := btrim(coalesce(p_reason, ''));
    IF length(v_reason) < 5 THEN
      RAISE EXCEPTION 'A rejection reason of at least 5 characters is required' USING ERRCODE = '22023';
    END IF;

    v_updated_notes := CASE
      WHEN pay.notes IS NULL OR pay.notes = '' THEN '[Rejected: ' || v_reason || ']'
      ELSE pay.notes || E'\n[Rejected: ' || v_reason || ']'
    END;

    UPDATE public.payments
    SET status = 'rejected',
        verified_by = auth.uid(),
        verified_at = now(),
        notes = v_updated_notes,
        updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;
  ELSE
    UPDATE public.payments
    SET status = 'verified',
        verified_by = auth.uid(),
        verified_at = now(),
        updated_at = now()
    WHERE id = pay.id
    RETURNING * INTO pay;
  END IF;

  -- Record audit event in shipment_events
  INSERT INTO public.shipment_events (
    shipment_id,
    event_type,
    actor_id,
    meta
  )
  VALUES (
    pay.shipment_id,
    CASE WHEN v_action = 'verify' THEN 'payment_verified' ELSE 'payment_rejected' END,
    auth.uid(),
    jsonb_build_object(
      'payment_id', pay.id,
      'amount', pay.amount,
      'method', pay.method,
      'status', pay.status,
      'action', v_action,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'verified_at', pay.verified_at
    )
  );

  RETURN jsonb_build_object(
    'id', pay.id,
    'shipment_id', pay.shipment_id,
    'amount', pay.amount,
    'method', pay.method,
    'status', pay.status,
    'reference_number', pay.reference_number,
    'paid_at', pay.paid_at,
    'notes', pay.notes,
    'created_by', pay.created_by,
    'verified_by', pay.verified_by,
    'verified_at', pay.verified_at,
    'created_at', pay.created_at,
    'updated_at', pay.updated_at
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.on_delivery_assigned_notify_driver()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_driver_user_id uuid; v_tracking_no text; v_pickup_addr text; v_dropoff_addr text;
BEGIN
    SELECT user_id INTO v_driver_user_id FROM public.drivers WHERE id = NEW.driver_id;
    SELECT tracking_number, pickup_address, dropoff_address INTO v_tracking_no, v_pickup_addr, v_dropoff_addr FROM public.shipments WHERE id = NEW.shipment_id;
    IF v_driver_user_id IS NOT NULL THEN
        PERFORM public.notify_user(v_driver_user_id, 'assignment'::notification_type, 'New Trip Assigned', 'Assigned to trip ' || COALESCE(v_tracking_no, '') || '. Pickup: ' || COALESCE(v_pickup_addr, '') || ', Destination: ' || COALESCE(v_dropoff_addr, ''), NEW.shipment_id);
    END IF;
    RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.on_incident_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_track text; v_cust uuid; r record; v_friendly_category text;
BEGIN
    SELECT s.tracking_number, c.user_id INTO v_track, v_cust FROM shipments s JOIN customers c ON c.id = s.customer_id WHERE s.id = NEW.shipment_id;
    UPDATE shipments SET status = 'delayed' WHERE id = NEW.shipment_id AND status IN ('loading', 'in_transit');
    v_friendly_category := CASE NEW.category
        WHEN 'traffic' THEN 'Traffic delay' WHEN 'weather' THEN 'Weather delay' WHEN 'breakdown' THEN 'Vehicle issue'
        WHEN 'late_loading' THEN 'Late loading' WHEN 'accident' THEN 'Accident reported' WHEN 'road_closure' THEN 'Road closure'
        ELSE 'Incident reported' END;
    PERFORM public.notify_user(v_cust, 'delay'::notification_type, 'Shipment ' || v_track || ' is delayed', v_friendly_category, NEW.shipment_id);
    FOR r IN SELECT id FROM users WHERE role IN ('admin', 'staff') AND is_active LOOP
        PERFORM public.notify_user(r.id, 'delay'::notification_type, 'Incident on ' || v_track || ': ' || NEW.category::text, NEW.description, NEW.shipment_id);
    END LOOP;
    RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION public.on_shipment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_customer_user uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into shipment_status_history (shipment_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());

    select user_id into v_customer_user from customers where id = new.customer_id;
    perform public.notify_user(
      v_customer_user,
      case new.status when 'booked' then 'booking_confirmed'::notification_type
                      when 'delayed' then 'delay'::notification_type
                      else 'shipment_status'::notification_type end,
      'Shipment ' || new.tracking_number || ' is now ' || replace(new.status::text, '_', ' '),
      null, new.id);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.prepare_delivery_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=NEW.delivery_id;
 IF NOT FOUND OR public.get_user_role() NOT IN ('admin','staff','driver') OR public.get_user_role() IS NULL
 OR (public.get_user_role()='driver' AND d.driver_id IS DISTINCT FROM public.my_driver_id()) THEN
 RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 IF NEW.driver_id IS DISTINCT FROM d.driver_id THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 NEW.driver_id:=d.driver_id;NEW.sender_id:=auth.uid();NEW.sender_role:=public.get_user_role();
 NEW.body:=btrim(NEW.body);NEW.created_at:=clock_timestamp();RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.process_no_shows()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN RETURN;END $function$
;

CREATE OR REPLACE FUNCTION public.protect_user_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new; -- Auth administrative cleanup/migrations have no client identity.
  end if;
  if tg_op='DELETE' then raise exception 'Use account deactivation to preserve operational records'; end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    perform pg_advisory_xact_lock(872621004);
    if coalesce(public.get_user_role(),'') <> 'admin' then raise exception 'Only active administrators may change access'; end if;
    if old.id=auth.uid() then raise exception 'You cannot change your own role or active status'; end if;
    if old.role='admin' and old.is_active and (new.role<>'admin' or not new.is_active)
      and (select count(*) from public.users where role='admin' and is_active)<=1 then
      raise exception 'The last active administrator must be retained';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.read_delivery_messages(p_delivery uuid, p_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.delivery_conversation(p_delivery);
 IF coalesce(cardinality(p_ids),0)>50 THEN RAISE EXCEPTION 'INVALID_MESSAGE_READ_BATCH';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids) i WHERE NOT EXISTS(SELECT 1 FROM public.delivery_messages m WHERE m.id=i AND m.delivery_id=p_delivery)) THEN RAISE EXCEPTION 'DELIVERY_CONVERSATION_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO public.delivery_message_reads(message_id,user_id)
 SELECT id,auth.uid() FROM public.delivery_messages WHERE delivery_id=p_delivery AND id=ANY(p_ids)
 AND (sender_role='driver') IS DISTINCT FROM (public.get_user_role()='driver') ON CONFLICT DO NOTHING;
END $function$
;

CREATE OR REPLACE FUNCTION public.rescind_strike(p_strike_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_cust_id uuid; v_strike_status text; v_remaining_count integer; v_latest_created timestamptz; v_block_hours_1 integer := 48; v_block_hours_2 integer := 72;
BEGIN
    IF public.get_user_role() NOT IN ('admin', 'staff') THEN RAISE EXCEPTION USING ERRCODE = 'TN001', MESSAGE = 'UNAUTHORIZED', DETAIL = json_build_object('reason', 'Staff or admin role required')::text; END IF;

    SELECT customer_id, status INTO v_cust_id, v_strike_status FROM public.customer_strikes WHERE id = p_strike_id FOR UPDATE;
    IF v_cust_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'TN014', MESSAGE = 'STRIKE_NOT_FOUND', DETAIL = json_build_object('strike_id', p_strike_id)::text; END IF;
    IF v_strike_status = 'rescinded' THEN RAISE EXCEPTION USING ERRCODE = 'TN002', MESSAGE = 'ALREADY_DONE', DETAIL = json_build_object('strike_id', p_strike_id, 'status', 'rescinded')::text; END IF;

    UPDATE public.customer_strikes SET status = 'rescinded', rescinded_by = auth.uid(), rescinded_at = now(), rescind_reason = p_reason WHERE id = p_strike_id;

    SELECT COUNT(*)::integer, MAX(created_at) INTO v_remaining_count, v_latest_created FROM public.customer_strikes WHERE customer_id = v_cust_id AND status IN ('active', 'under_appeal');
    SELECT (value #>> '{}')::integer INTO v_block_hours_1 FROM public.system_settings WHERE key = 'strike_block_hours_strike_1';
    SELECT (value #>> '{}')::integer INTO v_block_hours_2 FROM public.system_settings WHERE key = 'strike_block_hours_strike_2';
    IF v_block_hours_1 IS NULL THEN v_block_hours_1 := 48; END IF; IF v_block_hours_2 IS NULL THEN v_block_hours_2 := 72; END IF;

    IF v_remaining_count = 0 THEN UPDATE public.customers SET blocked_until = NULL, suspended_at = NULL WHERE id = v_cust_id;
    ELSIF v_remaining_count = 1 THEN UPDATE public.customers SET suspended_at = NULL, blocked_until = v_latest_created + (v_block_hours_1 || ' hours')::interval WHERE id = v_cust_id;
    ELSIF v_remaining_count = 2 THEN UPDATE public.customers SET suspended_at = NULL, blocked_until = v_latest_created + (v_block_hours_2 || ' hours')::interval WHERE id = v_cust_id;
    ELSIF v_remaining_count >= 3 THEN UPDATE public.customers SET suspended_at = v_latest_created, blocked_until = NULL WHERE id = v_cust_id; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.resolve_mobile_login_email(p_email text)
 RETURNS TABLE(phone text, limited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE normalized text:=lower(btrim(p_email)); used integer; candidate text; matches integer;
BEGIN
 IF normalized IS NULL OR length(normalized) NOT BETWEEN 3 AND 254 THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
 -- Shared cap bounds enumeration and storage growth; per-address cap bounds guesses.
 INSERT INTO public.mobile_email_login_limits AS l VALUES('global',now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 attempts=CASE WHEN l.window_start<now()-interval '5 minutes' THEN 1 ELSE l.attempts+1 END,
 window_start=CASE WHEN l.window_start<now()-interval '5 minutes' THEN now() ELSE l.window_start END
 RETURNING attempts INTO used;
 IF used>300 THEN RETURN QUERY SELECT NULL::text,true; RETURN; END IF;
 INSERT INTO public.mobile_email_login_limits AS l VALUES(md5(normalized),now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 attempts=CASE WHEN l.window_start<now()-interval '5 minutes' THEN 1 ELSE l.attempts+1 END,
 window_start=CASE WHEN l.window_start<now()-interval '5 minutes' THEN now() ELSE l.window_start END
 RETURNING attempts INTO used;
 IF used>10 THEN RETURN QUERY SELECT NULL::text,true; RETURN; END IF;
 -- Auth email owners have precedence over informational contact aliases.
 IF EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=normalized) THEN
  RETURN QUERY SELECT NULL::text,false; RETURN;
 END IF;
 -- Contact aliases are login identifiers, not verified email identities.
 -- Both branches require an active server profile and confirmed phone password login.
 SELECT count(*),min(alias.phone) INTO matches,candidate FROM (
  SELECT a.phone FROM public.customers c
  JOIN auth.users a ON a.id=c.user_id JOIN public.users u ON u.id=a.id
  WHERE lower(btrim(c.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND c.is_active AND u.role='customer' AND a.phone ~ '^639[0-9]{9}$'
  UNION ALL
  SELECT a.phone FROM public.users u JOIN auth.users a ON a.id=u.id
  JOIN public.drivers d ON d.user_id=u.id
  WHERE lower(btrim(u.email))=normalized AND nullif(a.email,'') IS NULL
  AND a.phone_confirmed_at IS NOT NULL AND a.banned_until IS NULL
  AND u.is_active AND u.role='driver' AND a.phone ~ '^639[0-9]{9}$'
 ) alias;
 RETURN QUERY SELECT CASE WHEN matches=1 THEN candidate ELSE NULL::text END,false;
END $function$
;

CREATE OR REPLACE FUNCTION public.review_booking_request(p_shipment uuid, p_expected_updated_at timestamp with time zone, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  request public.shipments%ROWTYPE;
  delivery_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role::text IN ('admin','staff')
  ) THEN
    RAISE EXCEPTION 'Only active admin or staff may review booking requests' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Choose approve or reject';
  END IF;
  SELECT * INTO request FROM public.shipments WHERE id=p_shipment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking request not found or access denied'; END IF;
  IF request.status <> 'pending' OR p_expected_updated_at IS NULL
     OR request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Request changed or was already reviewed. Reload before deciding.' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE shipment_id=request.id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Request already has a delivery. Reload before deciding.';
  END IF;
  IF p_decision='reject' THEN
    IF nullif(btrim(p_reason),'') IS NULL OR length(btrim(p_reason))>1000 THEN
      RAISE EXCEPTION 'Enter a rejection reason of 1 to 1000 characters';
    END IF;
    UPDATE public.shipments SET status='cancelled', cancelled_reason=btrim(p_reason)
    WHERE id=request.id RETURNING * INTO request;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE='42501'; END IF;
  ELSE
    -- Accept the displayed quote, without silently replacing it with today's rates.
    -- Incomplete or expired requests require correction before approval.
    IF nullif(btrim(request.pickup_address),'') IS NULL
       OR nullif(btrim(request.dropoff_address),'') IS NULL
       OR nullif(btrim(request.cargo_description),'') IS NULL
       OR request.scheduled_departure IS NULL OR request.scheduled_departure<=now()
       OR request.distance_km IS NULL OR request.distance_km<=0 OR request.distance_km::text IN ('NaN','Infinity','-Infinity')
       OR request.weight_kg IS NULL OR request.weight_kg<=0 OR request.weight_kg::text IN ('NaN','Infinity','-Infinity')
       OR request.quoted_amount IS NULL OR request.quoted_amount<0 OR request.quoted_amount::text IN ('NaN','Infinity','-Infinity')
       OR (request.override_amount IS NOT NULL AND (request.override_amount<0 OR request.override_amount::text IN ('NaN','Infinity','-Infinity')))
       OR NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE id=request.requested_vehicle_type_id AND is_active)
       OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id=request.customer_id AND is_active)
    THEN RAISE EXCEPTION 'Request needs valid cargo, route, future departure, active customer/vehicle type and quoted price before approval';
    END IF;
    UPDATE public.shipments SET status='booked', confirmed_by=auth.uid()
    WHERE id=request.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decision update denied' USING ERRCODE='42501'; END IF;
    delivery_id := public.assign_shipment_resources(request.id);
    SELECT * INTO request FROM public.shipments WHERE id=p_shipment;
  END IF;
  RETURN jsonb_build_object('id',request.id,'status',request.status,'delivery_id',delivery_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_pricing(p_rates jsonb, p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  setting_key text;
  rate public.pricing_rates%rowtype;
  changed integer := 0;
  affected integer;
begin
  if auth.uid() is null or public.get_user_role() is distinct from 'admin' then
    raise exception 'Only active administrators can save pricing.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'array'
     or jsonb_typeof(p_settings) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_settings)) <> 3
     or not (p_settings ?& array['minimum_booking_fee','driver_allowance','handling_surcharges']) then
    raise exception 'Invalid pricing payload.';
  end if;
  foreach setting_key in array array['minimum_booking_fee','driver_allowance'] loop
    if jsonb_typeof(p_settings->setting_key) is distinct from 'number'
       or (p_settings->>setting_key)::numeric < 0 then
      raise exception 'Invalid pricing amount: %', setting_key;
    end if;
  end loop;
  if jsonb_typeof(p_settings->'handling_surcharges') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_settings->'handling_surcharges')) <> 6
     or not ((p_settings->'handling_surcharges') ?& array['none','fragile','keepdry','temp','perishable','cold']) then
    raise exception 'Invalid handling surcharge configuration.';
  end if;
  for setting_key, item in select key, value from jsonb_each(p_settings->'handling_surcharges') loop
    if jsonb_typeof(item) is distinct from 'number' or item::text::numeric < 0 then
      raise exception 'Invalid handling surcharge: %', setting_key;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rates)) <>
     (select count(distinct value->>'id') from jsonb_array_elements(p_rates)) then
    raise exception 'Duplicate or missing pricing rate IDs.';
  end if;
  for item in select value from jsonb_array_elements(p_rates) order by value->>'id' loop
    if jsonb_typeof(item->'per_km_rate') is distinct from 'number'
       or jsonb_typeof(item->'expected_rate') is distinct from 'number'
       or (item->>'per_km_rate')::numeric < 0 then
      raise exception 'Invalid vehicle rate.';
    end if;
    select * into rate from public.pricing_rates where id = (item->>'id')::uuid for update;
    if not found or not rate.is_active
       or rate.vehicle_type_id is distinct from (item->>'vehicle_type_id')::uuid
       or rate.per_km_rate is distinct from (item->>'expected_rate')::numeric then
      raise exception 'Vehicle pricing changed or is unavailable. Reload and retry.';
    end if;
    update public.pricing_rates set per_km_rate = (item->>'per_km_rate')::numeric
      where id = rate.id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Vehicle pricing update was denied.'; end if;
    changed := changed + 1;
  end loop;
  for setting_key, item in select key, value from jsonb_each(p_settings) order by key loop
    insert into public.system_settings(key,value,updated_by)
    values (setting_key,item,auth.uid())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Pricing setting update was denied.'; end if;
  end loop;
  return jsonb_build_object('saved',true,'rates',changed,'settings',3);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_delivery_message(p_delivery uuid, p_request uuid, p_body text, p_driver uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;m public.delivery_messages%ROWTYPE;
BEGIN
 -- Serialize retries before consulting the idempotency key. No identity or recipient from the caller.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 PERFORM public.delivery_conversation(p_delivery);
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery;
 IF d.driver_id IS DISTINCT FROM p_driver THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 SELECT * INTO m FROM public.delivery_messages WHERE sender_id=auth.uid() AND request_id=p_request;
 IF FOUND THEN
 IF m.delivery_id<>p_delivery OR m.driver_id<>d.driver_id OR m.body IS DISTINCT FROM btrim(p_body) THEN RAISE EXCEPTION 'MESSAGE_RETRY_MISMATCH';END IF;
 ELSE
 INSERT INTO public.delivery_messages(delivery_id,driver_id,request_id,body) VALUES(p_delivery,p_driver,p_request,p_body) RETURNING * INTO m;
 END IF;
 RETURN jsonb_build_object('id',m.id::text,'sender_id',m.sender_id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at);
END $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.stamp_delivery_allowance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE amount numeric;
BEGIN
 IF NEW.driver_allowance IS NULL THEN
  SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='driver_allowance';
  IF amount IS NULL THEN SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='default_driver_allowance';END IF;
  IF amount IS NOT NULL AND NOT(amount>=0 AND amount<1000000000) THEN RAISE EXCEPTION 'INVALID_DRIVER_ALLOWANCE';END IF;
  NEW.driver_allowance:=coalesce(amount,500);
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.stamp_delivery_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'in_transit' and new.departed_at is null then
    new.departed_at := now();
  elsif new.status = 'delivered' and new.arrived_at is null then
    new.arrived_at := now();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.stamp_shipment_dates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'review' and old.status is distinct from 'review' and new.actual_delivery_at is null then
    new.actual_delivery_at := now();
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.stamp_shipment_estimated_arrival()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_avg_speed numeric := 30.0;
BEGIN
    IF NEW.estimated_arrival IS NULL AND NEW.scheduled_departure IS NOT NULL AND NEW.distance_km IS NOT NULL AND NEW.distance_km > 0 THEN
        SELECT (value #>> '{}')::numeric INTO v_avg_speed FROM public.system_settings WHERE key = 'average_speed_kph';
        IF v_avg_speed IS NULL OR v_avg_speed <= 0 THEN v_avg_speed := 30.0; END IF;
        NEW.estimated_arrival := NEW.scheduled_departure + (NEW.distance_km / v_avg_speed * interval '1 hour');
    END IF;
    RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.store_confirmed_delivery_route(p_actor uuid, p_delivery uuid, p_expected timestamp with time zone, p_shipment_expected timestamp with time zone, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;profile jsonb:=p_data->'profile';key text;value numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND is_active AND role IN ('admin','staff')) THEN RAISE EXCEPTION 'OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR d.updated_at IS DISTINCT FROM p_expected OR d.status NOT IN ('assigned','loading','in_transit') THEN RAISE EXCEPTION 'ASSIGNMENT_CHANGED_RELOAD';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.updated_at IS DISTINCT FROM p_shipment_expected OR s.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'SHIPMENT_CHANGED_RELOAD';END IF;
 IF p_data->>'truck_id' IS DISTINCT FROM d.truck_id::text OR p_data->>'confirmed' IS DISTINCT FROM 'true' OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'OFFICE_CONFIRMATION_REQUIRED';END IF;
 FOREACH key IN ARRAY ARRAY['height','width','length','weight','axleload'] LOOP
  value:=(profile->>key)::numeric;
  IF value IS NULL OR NOT(value>0 AND value<=CASE key WHEN 'height' THEN 10 WHEN 'width' THEN 10 WHEN 'length' THEN 50 WHEN 'weight' THEN 200 ELSE 100 END) THEN RAISE EXCEPTION 'VERIFIED_TRUCK_PROFILE_REQUIRED';END IF;
 END LOOP;
 IF jsonb_typeof(profile->'hazmat') IS DISTINCT FROM 'boolean' OR (profile->>'axleload')::numeric>(profile->>'weight')::numeric OR (profile->>'weight')::numeric*1000<=coalesce(s.weight_kg,0) THEN RAISE EXCEPTION 'INVALID_LOADED_TRUCK_WEIGHT';END IF;
 IF coalesce(p_data->'geometry'->>'type','')<>'FeatureCollection' OR jsonb_array_length(p_data->'geometry'->'features')<1 THEN RAISE EXCEPTION 'ROAD_GEOMETRY_REQUIRED';END IF;
 INSERT INTO public.delivery_route_plans(delivery_id,truck_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,profile,geometry,cargo_weight_kg,distance_km,duration_minutes,confirmed_by,reason)
 VALUES(d.id,d.truck_id,(p_data->>'pickup_lat')::numeric,(p_data->>'pickup_lng')::numeric,(p_data->>'dropoff_lat')::numeric,(p_data->>'dropoff_lng')::numeric,profile,p_data->'geometry',s.weight_kg,(p_data->>'distance_km')::numeric,(p_data->>'duration_minutes')::numeric,p_actor,btrim(p_data->>'reason'))
 ON CONFLICT(delivery_id) DO UPDATE SET truck_id=excluded.truck_id,version=gen_random_uuid(),pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,dropoff_lat=excluded.dropoff_lat,dropoff_lng=excluded.dropoff_lng,profile=excluded.profile,geometry=excluded.geometry,cargo_weight_kg=excluded.cargo_weight_kg,distance_km=excluded.distance_km,duration_minutes=excluded.duration_minutes,confirmed_by=excluded.confirmed_by,confirmed_at=now(),reason=excluded.reason;
 UPDATE public.shipments SET pickup_lat=(p_data->>'pickup_lat')::numeric,pickup_lng=(p_data->>'pickup_lng')::numeric,dropoff_lat=(p_data->>'dropoff_lat')::numeric,dropoff_lng=(p_data->>'dropoff_lng')::numeric,route_geometry=p_data->'geometry',distance_km=(p_data->>'distance_km')::numeric,route_duration_minutes=(p_data->>'duration_minutes')::numeric,route_source='provider',route_reason=btrim(p_data->>'reason') WHERE id=s.id;
 -- The promised/scheduled estimated_arrival and all prices are deliberately retained.
 DELETE FROM public.delivery_route_eta WHERE delivery_id=d.id;
 RETURN (SELECT to_jsonb(p) FROM public.delivery_route_plans p WHERE delivery_id=d.id);
END $function$
;

CREATE OR REPLACE FUNCTION public.store_delivery_route_eta(p_actor uuid, p_delivery uuid, p_version uuid, p_leg text, p_position timestamp with time zone, p_seconds numeric, p_distance numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE d public.deliveries%ROWTYPE;p public.delivery_route_plans%ROWTYPE;s public.shipments%ROWTYPE;sample public.tracking_logs%ROWTYPE;stamp timestamptz:=clock_timestamp();result public.delivery_route_eta%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_actor AND u.is_active AND (u.role IN ('admin','staff') OR (u.role='driver' AND EXISTS(SELECT 1 FROM public.drivers dr WHERE dr.id=d.driver_id AND dr.user_id=u.id AND dr.status<>'inactive')))) THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.delivery_route_plans WHERE delivery_id=d.id;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id;
 SELECT * INTO sample FROM public.tracking_logs WHERE delivery_id=d.id ORDER BY recorded_at DESC,id DESC LIMIT 1;
 IF d.id IS NULL OR p.version IS DISTINCT FROM p_version OR p.truck_id IS DISTINCT FROM d.truck_id OR d.route_started_at IS NULL OR d.status NOT IN ('assigned','in_transit') OR s.status IN ('completed','cancelled')
 OR p_leg IS DISTINCT FROM (CASE WHEN d.status='in_transit' THEN 'destination' ELSE 'pickup' END) OR (p_leg='pickup' AND d.pickup_arrived_at IS NOT NULL)
 OR sample.recorded_at IS DISTINCT FROM p_position OR sample.recorded_at<stamp-interval '2 minutes' OR sample.recorded_at>stamp OR sample.accuracy_m>100 OR sample.accuracy_m IS NULL
 OR p.cargo_weight_kg IS DISTINCT FROM s.weight_kg OR p.pickup_lat IS DISTINCT FROM s.pickup_lat OR p.pickup_lng IS DISTINCT FROM s.pickup_lng OR p.dropoff_lat IS DISTINCT FROM s.dropoff_lat OR p.dropoff_lng IS DISTINCT FROM s.dropoff_lng OR p.geometry IS DISTINCT FROM s.route_geometry
 THEN RAISE EXCEPTION 'ETA_CONTEXT_CHANGED';END IF;
 IF p_seconds IS NULL OR p_distance IS NULL OR NOT(p_seconds BETWEEN 0 AND 604800 AND p_distance BETWEEN 0 AND 20000000) THEN RAISE EXCEPTION 'INVALID_ETA';END IF;
 INSERT INTO public.delivery_route_eta(delivery_id,plan_version,leg,eta_at,calculated_at,position_at,expires_at,duration_seconds,distance_m)
 VALUES(d.id,p.version,p_leg,stamp+p_seconds*interval '1 second',stamp,p_position,least(stamp+interval '2 minutes',p_position+interval '2 minutes'),p_seconds,p_distance)
 ON CONFLICT(delivery_id) DO UPDATE SET plan_version=excluded.plan_version,leg=excluded.leg,eta_at=excluded.eta_at,calculated_at=excluded.calculated_at,position_at=excluded.position_at,expires_at=excluded.expires_at,duration_seconds=excluded.duration_seconds,distance_m=excluded.distance_m RETURNING * INTO result;
 RETURN to_jsonb(result);
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_driver_phone_to_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_norm text;
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.contact_number IS NOT NULL THEN
    v_norm := public.normalize_ph_phone(NEW.contact_number);
    IF v_norm IS NOT NULL THEN
      UPDATE auth.users
      SET phone = v_norm,
          phone_confirmed_at = coalesce(phone_confirmed_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id
        AND (phone IS DISTINCT FROM v_norm OR phone_confirmed_at IS NULL);

      UPDATE public.users
      SET phone = v_norm,
          updated_at = now()
      WHERE id = NEW.user_id
        AND (phone IS DISTINCT FROM v_norm);
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

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
end $function$
;

-- 9. TRIGGERS
DROP TRIGGER IF EXISTS trg_compliance_documents_audit ON public.compliance_documents;
CREATE TRIGGER trg_compliance_documents_audit AFTER INSERT OR DELETE OR UPDATE ON compliance_documents FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_compliance_documents_updated ON public.compliance_documents;
CREATE TRIGGER trg_compliance_documents_updated BEFORE UPDATE ON compliance_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_audit ON public.customers;
CREATE TRIGGER trg_customers_audit AFTER INSERT OR DELETE OR UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_customers_updated ON public.customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notify_delivery_proof_review ON public.deliveries;
CREATE TRIGGER notify_delivery_proof_review AFTER UPDATE OF proof_review_status ON deliveries FOR EACH ROW EXECUTE FUNCTION notify_delivery_proof_review();

DROP TRIGGER IF EXISTS trg_check_delivery_driver_availability ON public.deliveries;
CREATE TRIGGER trg_check_delivery_driver_availability BEFORE INSERT OR UPDATE OF driver_id ON deliveries FOR EACH ROW EXECUTE FUNCTION check_delivery_driver_availability();

DROP TRIGGER IF EXISTS trg_deliveries_audit ON public.deliveries;
CREATE TRIGGER trg_deliveries_audit AFTER INSERT OR DELETE OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_deliveries_notify_driver ON public.deliveries;
CREATE TRIGGER trg_deliveries_notify_driver AFTER INSERT ON deliveries FOR EACH ROW EXECUTE FUNCTION on_delivery_assigned_notify_driver();

DROP TRIGGER IF EXISTS trg_deliveries_sync ON public.deliveries;
CREATE TRIGGER trg_deliveries_sync AFTER INSERT OR UPDATE OF status ON deliveries FOR EACH ROW EXECUTE FUNCTION sync_from_delivery();

DROP TRIGGER IF EXISTS trg_deliveries_timestamps ON public.deliveries;
CREATE TRIGGER trg_deliveries_timestamps BEFORE INSERT OR UPDATE OF status ON deliveries FOR EACH ROW EXECUTE FUNCTION stamp_delivery_timestamps();

DROP TRIGGER IF EXISTS trg_deliveries_updated ON public.deliveries;
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stamp_delivery_allowance ON public.deliveries;
CREATE TRIGGER trg_stamp_delivery_allowance BEFORE INSERT ON deliveries FOR EACH ROW EXECUTE FUNCTION stamp_delivery_allowance();

DROP TRIGGER IF EXISTS trg_delivery_expenses_audit ON public.delivery_expenses;
CREATE TRIGGER trg_delivery_expenses_audit AFTER INSERT OR DELETE OR UPDATE ON delivery_expenses FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_delivery_expenses_updated ON public.delivery_expenses;
CREATE TRIGGER trg_delivery_expenses_updated BEFORE UPDATE ON delivery_expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_created ON public.delivery_incidents;
CREATE TRIGGER trg_incident_created AFTER INSERT ON delivery_incidents FOR EACH ROW EXECUTE FUNCTION on_incident_created();

DROP TRIGGER IF EXISTS prepare_delivery_message ON public.delivery_messages;
CREATE TRIGGER prepare_delivery_message BEFORE INSERT ON delivery_messages FOR EACH ROW EXECUTE FUNCTION prepare_delivery_message();

DROP TRIGGER IF EXISTS trg_drivers_audit ON public.drivers;
CREATE TRIGGER trg_drivers_audit AFTER INSERT OR DELETE OR UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_drivers_updated ON public.drivers;
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sync_driver_phone_to_auth ON public.drivers;
CREATE TRIGGER trg_sync_driver_phone_to_auth AFTER INSERT OR UPDATE OF contact_number, user_id ON drivers FOR EACH ROW EXECUTE FUNCTION sync_driver_phone_to_auth();

DROP TRIGGER IF EXISTS trg_helpers_updated ON public.helpers;
CREATE TRIGGER trg_helpers_updated BEFORE UPDATE ON helpers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_records_updated ON public.maintenance_records;
CREATE TRIGGER trg_maintenance_records_updated BEFORE UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_audit ON public.payments;
CREATE TRIGGER trg_payments_audit AFTER INSERT OR DELETE OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_payments_updated ON public.payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_rates_audit ON public.pricing_rates;
CREATE TRIGGER trg_pricing_rates_audit AFTER INSERT OR DELETE OR UPDATE ON pricing_rates FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_pricing_rates_updated ON public.pricing_rates;
CREATE TRIGGER trg_pricing_rates_updated BEFORE UPDATE ON pricing_rates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS prepare_report_schedule ON public.report_schedules;
CREATE TRIGGER prepare_report_schedule BEFORE INSERT OR UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION private.prepare_report_schedule();

DROP TRIGGER IF EXISTS notify_office_delivery_review ON public.shipment_events;
CREATE TRIGGER notify_office_delivery_review AFTER INSERT ON shipment_events FOR EACH ROW EXECUTE FUNCTION notify_office_delivery_review();

DROP TRIGGER IF EXISTS trg_shipments_audit ON public.shipments;
CREATE TRIGGER trg_shipments_audit AFTER INSERT OR DELETE OR UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_shipments_dates ON public.shipments;
CREATE TRIGGER trg_shipments_dates BEFORE UPDATE OF status ON shipments FOR EACH ROW EXECUTE FUNCTION stamp_shipment_dates();

DROP TRIGGER IF EXISTS trg_shipments_status_ins ON public.shipments;
CREATE TRIGGER trg_shipments_status_ins AFTER INSERT ON shipments FOR EACH ROW EXECUTE FUNCTION on_shipment_status_change();

DROP TRIGGER IF EXISTS trg_shipments_status_upd ON public.shipments;
CREATE TRIGGER trg_shipments_status_upd AFTER UPDATE OF status ON shipments FOR EACH ROW EXECUTE FUNCTION on_shipment_status_change();

DROP TRIGGER IF EXISTS trg_shipments_updated ON public.shipments;
CREATE TRIGGER trg_shipments_updated BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shipments_zz_auto_assign ON public.shipments;
CREATE TRIGGER trg_shipments_zz_auto_assign AFTER INSERT ON shipments FOR EACH ROW EXECUTE FUNCTION auto_assign_booked_shipment();

DROP TRIGGER IF EXISTS trg_stamp_shipment_estimated_arrival ON public.shipments;
CREATE TRIGGER trg_stamp_shipment_estimated_arrival BEFORE INSERT OR UPDATE OF scheduled_departure, distance_km ON shipments FOR EACH ROW EXECUTE FUNCTION stamp_shipment_estimated_arrival();

DROP TRIGGER IF EXISTS trg_system_settings_audit ON public.system_settings;
CREATE TRIGGER trg_system_settings_audit AFTER INSERT OR DELETE OR UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_system_settings_updated ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_trucks_audit ON public.trucks;
CREATE TRIGGER trg_trucks_audit AFTER INSERT OR DELETE OR UPDATE ON trucks FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_trucks_updated ON public.trucks;
CREATE TRIGGER trg_trucks_updated BEFORE UPDATE ON trucks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_audit ON public.users;
CREATE TRIGGER trg_users_audit AFTER INSERT OR DELETE OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION log_activity();

DROP TRIGGER IF EXISTS trg_users_create_customer ON public.users;
CREATE TRIGGER trg_users_create_customer AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION create_customer_for_user();

DROP TRIGGER IF EXISTS trg_users_protect ON public.users;
CREATE TRIGGER trg_users_protect BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_user_privileges();

DROP TRIGGER IF EXISTS trg_users_updated ON public.users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_preserve_operational_records ON public.users;
CREATE TRIGGER users_preserve_operational_records BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_user_privileges();

-- 10. ROW LEVEL SECURITY & POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toll_gate_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_cargo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_eta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_email_login_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads activity" ON public.activity_logs;
CREATE POLICY "admin reads activity" ON public.activity_logs FOR SELECT TO authenticated
  USING ((get_user_role() = 'admin'::text))
;

DROP POLICY IF EXISTS "read reference" ON public.cargo_categories;
CREATE POLICY "read reference" ON public.cargo_categories FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "staff full access" ON public.cargo_categories;
CREATE POLICY "staff full access" ON public.cargo_categories FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver reads own compliance" ON public.compliance_documents;
CREATE POLICY "driver reads own compliance" ON public.compliance_documents FOR SELECT TO authenticated
  USING ((driver_id = my_driver_id()))
;

DROP POLICY IF EXISTS "staff full access" ON public.compliance_documents;
CREATE POLICY "staff full access" ON public.compliance_documents FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "customer_read_own_strikes" ON public.customer_strikes;
CREATE POLICY "customer_read_own_strikes" ON public.customer_strikes FOR SELECT TO authenticated
  USING ((customer_id = my_customer_id()))
;

DROP POLICY IF EXISTS "staff_full_access_strikes" ON public.customer_strikes;
CREATE POLICY "staff_full_access_strikes" ON public.customer_strikes FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "customer reads self" ON public.customers;
CREATE POLICY "customer reads self" ON public.customers FOR SELECT TO authenticated
  USING ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "staff full access" ON public.customers;
CREATE POLICY "staff full access" ON public.customers FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "customer reads own deliveries" ON public.deliveries;
CREATE POLICY "customer reads own deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING ((shipment_id IN ( SELECT my_customer_shipment_ids() AS my_customer_shipment_ids)))
;

DROP POLICY IF EXISTS "driver reads own deliveries" ON public.deliveries;
CREATE POLICY "driver reads own deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING ((driver_id = my_driver_id()))
;

DROP POLICY IF EXISTS "staff full access" ON public.deliveries;
CREATE POLICY "staff full access" ON public.deliveries FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "active customer recorded proof metadata" ON public.delivery_documents;
CREATE POLICY "active customer recorded proof metadata" ON public.delivery_documents FOR SELECT TO authenticated
  USING ((((kind)::text = ANY (ARRAY['proof_of_delivery'::text, 'signature'::text])) AND (EXISTS ( SELECT 1
   FROM ((users u
     JOIN customers c ON ((c.user_id = u.id)))
     JOIN shipments s ON ((s.customer_id = c.id)))
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND c.is_active AND (s.id = delivery_documents.shipment_id))))))
;

DROP POLICY IF EXISTS "customer reads own POD" ON public.delivery_documents;
CREATE POLICY "customer reads own POD" ON public.delivery_documents FOR SELECT TO authenticated
  USING (((kind = 'proof_of_delivery'::document_kind) AND (EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = delivery_documents.shipment_id) AND (s.customer_id = my_customer_id()))))))
;

DROP POLICY IF EXISTS "driver reads own docs" ON public.delivery_documents;
CREATE POLICY "driver reads own docs" ON public.delivery_documents FOR SELECT TO authenticated
  USING ((delivery_id IN ( SELECT deliveries.id
   FROM deliveries
  WHERE (deliveries.driver_id = my_driver_id()))))
;

DROP POLICY IF EXISTS "staff full access" ON public.delivery_documents;
CREATE POLICY "staff full access" ON public.delivery_documents FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver_insert_own_expenses" ON public.delivery_expenses;
CREATE POLICY "driver_insert_own_expenses" ON public.delivery_expenses FOR INSERT TO authenticated
  WITH CHECK (((get_user_role() = 'driver'::text) AND (driver_id = my_driver_id()) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (review_reason IS NULL) AND ((amount >= 0.01) AND (amount <= (1000000)::numeric)) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_expenses.delivery_id) AND (d.driver_id = my_driver_id()) AND (d.status = ANY (ARRAY['in_transit'::delivery_status, 'delivered'::delivery_status]))))) AND ((receipt_path IS NULL) OR ((receipt_path ~~ ((delivery_id)::text || '/receipt-%'::text)) AND private.driver_owns_evidence_image(receipt_path)))))
;

DROP POLICY IF EXISTS "driver_read_own_expenses" ON public.delivery_expenses;
CREATE POLICY "driver_read_own_expenses" ON public.delivery_expenses FOR SELECT TO authenticated
  USING ((driver_id = my_driver_id()))
;

DROP POLICY IF EXISTS "staff_full_access_expenses" ON public.delivery_expenses;
CREATE POLICY "staff_full_access_expenses" ON public.delivery_expenses FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver reads own delivery helpers" ON public.delivery_helpers;
CREATE POLICY "driver reads own delivery helpers" ON public.delivery_helpers FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_helpers.delivery_id) AND (d.driver_id = my_driver_id())))))
;

DROP POLICY IF EXISTS "staff full access" ON public.delivery_helpers;
CREATE POLICY "staff full access" ON public.delivery_helpers FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver reads own incidents" ON public.delivery_incidents;
CREATE POLICY "driver reads own incidents" ON public.delivery_incidents FOR SELECT TO authenticated
  USING ((delivery_id IN ( SELECT deliveries.id
   FROM deliveries
  WHERE (deliveries.driver_id = my_driver_id()))))
;

DROP POLICY IF EXISTS "driver reports incident" ON public.delivery_incidents;
CREATE POLICY "driver reports incident" ON public.delivery_incidents FOR INSERT TO authenticated
  WITH CHECK (((reported_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_incidents.delivery_id) AND (d.driver_id = my_driver_id()) AND (d.shipment_id = delivery_incidents.shipment_id))))))
;

DROP POLICY IF EXISTS "staff full access" ON public.delivery_incidents;
CREATE POLICY "staff full access" ON public.delivery_incidents FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "mark only received authorized messages" ON public.delivery_message_reads;
CREATE POLICY "mark only received authorized messages" ON public.delivery_message_reads FOR INSERT TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM delivery_messages m
  WHERE ((m.id = delivery_message_reads.message_id) AND ((m.sender_role = 'driver'::text) IS DISTINCT FROM (( SELECT get_user_role() AS get_user_role) = 'driver'::text)))))))
;

DROP POLICY IF EXISTS "own authorized message receipts" ON public.delivery_message_reads;
CREATE POLICY "own authorized message receipts" ON public.delivery_message_reads FOR SELECT TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM delivery_messages m
  WHERE (m.id = delivery_message_reads.message_id)))))
;

DROP POLICY IF EXISTS "current delivery participants read messages" ON public.delivery_messages;
CREATE POLICY "current delivery participants read messages" ON public.delivery_messages FOR SELECT TO authenticated
  USING (((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'staff'::text, 'driver'::text])) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_messages.delivery_id) AND (d.driver_id = delivery_messages.driver_id) AND ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'staff'::text])) OR (d.driver_id = ( SELECT my_driver_id() AS my_driver_id))))))))
;

DROP POLICY IF EXISTS "current participants send as themselves" ON public.delivery_messages;
CREATE POLICY "current participants send as themselves" ON public.delivery_messages FOR INSERT TO authenticated
  WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (sender_role = ( SELECT get_user_role() AS get_user_role)) AND (EXISTS ( SELECT 1
   FROM (deliveries d
     JOIN shipments s ON ((s.id = d.shipment_id)))
  WHERE ((d.id = delivery_messages.delivery_id) AND (d.driver_id = delivery_messages.driver_id) AND (d.status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status, 'delivered'::delivery_status])) AND (s.status <> ALL (ARRAY['completed'::shipment_status, 'cancelled'::shipment_status])) AND ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'staff'::text])) OR (d.driver_id = ( SELECT my_driver_id() AS my_driver_id))))))))
;

DROP POLICY IF EXISTS "authorized delivery eta" ON public.delivery_route_eta;
CREATE POLICY "authorized delivery eta" ON public.delivery_route_eta FOR SELECT TO authenticated
  USING (((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])) OR ((get_user_role() = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_route_eta.delivery_id) AND (d.driver_id = my_driver_id())))))))
;

DROP POLICY IF EXISTS "authorized delivery route plan" ON public.delivery_route_plans;
CREATE POLICY "authorized delivery route plan" ON public.delivery_route_plans FOR SELECT TO authenticated
  USING (((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])) OR ((get_user_role() = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_route_plans.delivery_id) AND (d.driver_id = my_driver_id())))))))
;

DROP POLICY IF EXISTS "driver reads self" ON public.drivers;
CREATE POLICY "driver reads self" ON public.drivers FOR SELECT TO authenticated
  USING ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "staff full access" ON public.drivers;
CREATE POLICY "staff full access" ON public.drivers FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver logs fuel" ON public.fuel_logs;
CREATE POLICY "driver logs fuel" ON public.fuel_logs FOR INSERT TO authenticated
  WITH CHECK (((driver_id = my_driver_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'driver'::user_role) AND users.is_active))) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = fuel_logs.delivery_id) AND (d.driver_id = my_driver_id()) AND (d.truck_id = fuel_logs.truck_id) AND (d.status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status, 'delivered'::delivery_status]))))) AND (liters > (0)::numeric) AND (liters <= (10000)::numeric) AND (price_per_liter > (0)::numeric) AND (price_per_liter <= (10000)::numeric) AND (odometer_km >= (0)::numeric) AND (odometer_km <= (10000000)::numeric) AND (total_cost = round((liters * price_per_liter), 2)) AND (total_cost <= (1000000)::numeric) AND ((station IS NULL) OR (length(station) <= 200)) AND (receipt_path IS NULL)))
;

DROP POLICY IF EXISTS "driver reads own fuel" ON public.fuel_logs;
CREATE POLICY "driver reads own fuel" ON public.fuel_logs FOR SELECT TO authenticated
  USING ((driver_id = my_driver_id()))
;

DROP POLICY IF EXISTS "staff full access" ON public.fuel_logs;
CREATE POLICY "staff full access" ON public.fuel_logs FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "staff full access" ON public.helpers;
CREATE POLICY "staff full access" ON public.helpers FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "assigned driver links own incident photo" ON public.incident_attachments;
CREATE POLICY "assigned driver links own incident photo" ON public.incident_attachments FOR INSERT TO authenticated
  WITH CHECK (((uploaded_by = auth.uid()) AND (get_user_role() = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM (delivery_incidents i
     JOIN deliveries d ON ((d.id = i.delivery_id)))
  WHERE ((i.id = incident_attachments.incident_id) AND (i.delivery_id = incident_attachments.delivery_id) AND (i.reported_by = auth.uid()) AND (d.driver_id = my_driver_id()) AND (d.status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status])) AND private.driver_owns_evidence_image(incident_attachments.storage_path))))))
;

DROP POLICY IF EXISTS "authorized incident evidence read" ON public.incident_attachments;
CREATE POLICY "authorized incident evidence read" ON public.incident_attachments FOR SELECT TO authenticated
  USING (((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])) OR ((get_user_role() = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = incident_attachments.delivery_id) AND (d.driver_id = my_driver_id())))))))
;

DROP POLICY IF EXISTS "read_location_vehicle_types" ON public.location_vehicle_types;
CREATE POLICY "read_location_vehicle_types" ON public.location_vehicle_types FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "staff_manage_location_vehicle_types" ON public.location_vehicle_types;
CREATE POLICY "staff_manage_location_vehicle_types" ON public.location_vehicle_types FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "read reference" ON public.locations;
CREATE POLICY "read reference" ON public.locations FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "staff full access" ON public.locations;
CREATE POLICY "staff full access" ON public.locations FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "staff full access" ON public.maintenance_records;
CREATE POLICY "staff full access" ON public.maintenance_records FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "mark message read" ON public.messages;
CREATE POLICY "mark message read" ON public.messages FOR UPDATE TO authenticated
  USING ((recipient_id = auth.uid()))
  WITH CHECK ((recipient_id = auth.uid()))
;

DROP POLICY IF EXISTS "read own messages" ON public.messages;
CREATE POLICY "read own messages" ON public.messages FOR SELECT TO authenticated
  USING (((sender_id = auth.uid()) OR (recipient_id = auth.uid())))
;

DROP POLICY IF EXISTS "send messages" ON public.messages;
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK ((sender_id = auth.uid()))
;

DROP POLICY IF EXISTS "own preferences" ON public.notification_preferences;
CREATE POLICY "own preferences" ON public.notification_preferences FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "own notifications delete" ON public.notifications;
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated
  USING ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "own notifications read" ON public.notifications;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated
  USING ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "own notifications update" ON public.notifications;
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()))
;

DROP POLICY IF EXISTS "customer reads own payments" ON public.payments;
CREATE POLICY "customer reads own payments" ON public.payments FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = payments.shipment_id) AND ((s.customer_id = my_customer_id()) OR (s.billing_customer_id = my_customer_id()))))))
;

DROP POLICY IF EXISTS "customer submits payment" ON public.payments;
CREATE POLICY "customer submits payment" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (((status = 'pending'::payment_status) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = payments.shipment_id) AND (s.customer_id = my_customer_id()))))))
;

DROP POLICY IF EXISTS "payments_customer_select" ON public.payments;
CREATE POLICY "payments_customer_select" ON public.payments FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (shipments s
     JOIN customers c ON ((c.id = s.customer_id)))
  WHERE ((s.id = payments.shipment_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))))
;

DROP POLICY IF EXISTS "payments_insert_office" ON public.payments;
CREATE POLICY "payments_insert_office" ON public.payments FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active = true) AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role]))))))
;

DROP POLICY IF EXISTS "payments_select_office" ON public.payments;
CREATE POLICY "payments_select_office" ON public.payments FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active = true) AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role]))))))
;

DROP POLICY IF EXISTS "payments_update_office" ON public.payments;
CREATE POLICY "payments_update_office" ON public.payments FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active = true) AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active = true) AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role]))))))
;

DROP POLICY IF EXISTS "staff full access" ON public.payments;
CREATE POLICY "staff full access" ON public.payments FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "admin manages rates" ON public.pricing_rates;
CREATE POLICY "admin manages rates" ON public.pricing_rates FOR ALL TO authenticated
  USING ((get_user_role() = 'admin'::text))
  WITH CHECK ((get_user_role() = 'admin'::text))
;

DROP POLICY IF EXISTS "read active rates" ON public.pricing_rates;
CREATE POLICY "read active rates" ON public.pricing_rates FOR SELECT TO authenticated
  USING ((is_active OR (get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text]))))
;

DROP POLICY IF EXISTS "own_schedules_create" ON public.report_schedules;
CREATE POLICY "own_schedules_create" ON public.report_schedules FOR INSERT TO authenticated
  WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role])))))))
;

DROP POLICY IF EXISTS "own_schedules_read" ON public.report_schedules;
CREATE POLICY "own_schedules_read" ON public.report_schedules FOR SELECT TO authenticated
  USING (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role])))))))
;

DROP POLICY IF EXISTS "own_schedules_toggle" ON public.report_schedules;
CREATE POLICY "own_schedules_toggle" ON public.report_schedules FOR UPDATE TO authenticated
  USING (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role])))))))
  WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role])))))))
;

DROP POLICY IF EXISTS "own_snapshots_read" ON public.report_snapshots;
CREATE POLICY "own_snapshots_read" ON public.report_snapshots FOR SELECT TO authenticated
  USING (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role])))))))
;

DROP POLICY IF EXISTS "customer_read_own_events" ON public.shipment_events;
CREATE POLICY "customer_read_own_events" ON public.shipment_events FOR SELECT TO authenticated
  USING ((shipment_id IN ( SELECT my_customer_shipment_ids() AS my_customer_shipment_ids)))
;

DROP POLICY IF EXISTS "driver_read_own_events" ON public.shipment_events;
CREATE POLICY "driver_read_own_events" ON public.shipment_events FOR SELECT TO authenticated
  USING ((delivery_id IN ( SELECT deliveries.id
   FROM deliveries
  WHERE (deliveries.driver_id = my_driver_id()))))
;

DROP POLICY IF EXISTS "staff_full_access_events" ON public.shipment_events;
CREATE POLICY "staff_full_access_events" ON public.shipment_events FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "customer reads own history" ON public.shipment_status_history;
CREATE POLICY "customer reads own history" ON public.shipment_status_history FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_status_history.shipment_id) AND (s.customer_id = my_customer_id())))))
;

DROP POLICY IF EXISTS "driver reads own history" ON public.shipment_status_history;
CREATE POLICY "driver reads own history" ON public.shipment_status_history FOR SELECT TO authenticated
  USING ((shipment_id IN ( SELECT deliveries.shipment_id
   FROM deliveries
  WHERE (deliveries.driver_id = my_driver_id()))))
;

DROP POLICY IF EXISTS "staff reads history" ON public.shipment_status_history;
CREATE POLICY "staff reads history" ON public.shipment_status_history FOR SELECT TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "Staff read shipments" ON public.shipments;
CREATE POLICY "Staff read shipments" ON public.shipments FOR SELECT TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "customer reads own shipments" ON public.shipments;
CREATE POLICY "customer reads own shipments" ON public.shipments FOR SELECT TO authenticated
  USING (((customer_id = my_customer_id()) OR (billing_customer_id = my_customer_id())))
;

DROP POLICY IF EXISTS "driver reads assigned shipments" ON public.shipments;
CREATE POLICY "driver reads assigned shipments" ON public.shipments FOR SELECT TO authenticated
  USING ((id IN ( SELECT my_driver_shipment_ids() AS my_driver_shipment_ids)))
;

DROP POLICY IF EXISTS "staff full access" ON public.shipments;
CREATE POLICY "staff full access" ON public.shipments FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "admin writes settings" ON public.system_settings;
CREATE POLICY "admin writes settings" ON public.system_settings FOR ALL TO authenticated
  USING ((get_user_role() = 'admin'::text))
  WITH CHECK ((get_user_role() = 'admin'::text))
;

DROP POLICY IF EXISTS "read settings" ON public.system_settings;
CREATE POLICY "read settings" ON public.system_settings FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "Authenticated users can view toll gates" ON public.toll_gate_rates;
CREATE POLICY "Authenticated users can view toll gates" ON public.toll_gate_rates FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "admin manages toll gates" ON public.toll_gate_rates;
CREATE POLICY "admin manages toll gates" ON public.toll_gate_rates FOR ALL TO authenticated
  USING ((get_user_role() = 'admin'::text))
  WITH CHECK ((get_user_role() = 'admin'::text))
;

DROP POLICY IF EXISTS "active started tracking only" ON public.tracking_logs;
CREATE POLICY "active started tracking only" ON public.tracking_logs FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((users u
     JOIN drivers dr ON ((dr.user_id = u.id)))
     JOIN deliveries d ON ((d.driver_id = dr.id)))
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND u.is_active AND (u.role = 'driver'::user_role) AND (d.id = tracking_logs.delivery_id) AND (d.route_started_at IS NOT NULL)))))
;

DROP POLICY IF EXISTS "customer sees live tracking" ON public.tracking_logs;
CREATE POLICY "customer sees live tracking" ON public.tracking_logs FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (deliveries d
     JOIN shipments s ON ((s.id = d.shipment_id)))
  WHERE ((d.id = tracking_logs.delivery_id) AND (s.customer_id = my_customer_id()) AND (s.status = ANY (ARRAY['assigned'::shipment_status, 'loading'::shipment_status, 'in_transit'::shipment_status, 'delayed'::shipment_status]))))))
;

DROP POLICY IF EXISTS "driver reads own tracking" ON public.tracking_logs;
CREATE POLICY "driver reads own tracking" ON public.tracking_logs FOR SELECT TO authenticated
  USING ((driver_id = my_driver_id()))
;

DROP POLICY IF EXISTS "driver writes own tracking" ON public.tracking_logs;
CREATE POLICY "driver writes own tracking" ON public.tracking_logs FOR INSERT TO authenticated
  WITH CHECK (((driver_id = my_driver_id()) AND (recorded_at <= (now() + '00:01:00'::interval)) AND (recorded_at >= ( SELECT deliveries.assigned_at
   FROM deliveries
  WHERE (deliveries.id = tracking_logs.delivery_id))) AND ((truck_id IS NULL) OR (truck_id = ( SELECT deliveries.truck_id
   FROM deliveries
  WHERE (deliveries.id = tracking_logs.delivery_id)))) AND (delivery_id IN ( SELECT deliveries.id
   FROM deliveries
  WHERE ((deliveries.driver_id = my_driver_id()) AND ((deliveries.status = ANY (ARRAY['assigned'::delivery_status, 'loading'::delivery_status, 'in_transit'::delivery_status])) OR ((deliveries.status = 'delivered'::delivery_status) AND (deliveries.arrived_at >= (now() - ((COALESCE(( SELECT ((system_settings.value #>> '{}'::text[]))::integer AS int4
           FROM system_settings
          WHERE (system_settings.key = 'buffered_tracking_window_minutes'::text)), 5) || ' minutes'::text))::interval)))))))))
;

DROP POLICY IF EXISTS "staff reads tracking" ON public.tracking_logs;
CREATE POLICY "staff reads tracking" ON public.tracking_logs FOR SELECT TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "read reference" ON public.truck_cargo_categories;
CREATE POLICY "read reference" ON public.truck_cargo_categories FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "staff full access" ON public.truck_cargo_categories;
CREATE POLICY "staff full access" ON public.truck_cargo_categories FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "Staff read trucks" ON public.trucks;
CREATE POLICY "Staff read trucks" ON public.trucks FOR SELECT TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "driver reads own truck" ON public.trucks;
CREATE POLICY "driver reads own truck" ON public.trucks FOR SELECT TO authenticated
  USING (((assigned_driver_id = my_driver_id()) OR (id IN ( SELECT deliveries.truck_id
   FROM deliveries
  WHERE (deliveries.driver_id = my_driver_id())))))
;

DROP POLICY IF EXISTS "staff full access" ON public.trucks;
CREATE POLICY "staff full access" ON public.trucks FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;
CREATE POLICY "Admins can view all profiles" ON public.users FOR SELECT TO authenticated
  USING (is_admin())
;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated
  USING ((auth.uid() = id))
;

DROP POLICY IF EXISTS "Users read own or staff read all" ON public.users;
CREATE POLICY "Users read own or staff read all" ON public.users FOR SELECT TO authenticated
  USING (((auth.uid() = id) OR (get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text]))))
;

DROP POLICY IF EXISTS "Users update own or admin update all" ON public.users;
CREATE POLICY "Users update own or admin update all" ON public.users FOR UPDATE TO authenticated
  USING (((auth.uid() = id) OR (get_user_role() = 'admin'::text)))
  WITH CHECK (((auth.uid() = id) OR (get_user_role() = 'admin'::text)))
;

DROP POLICY IF EXISTS "admin manage users" ON public.users;
CREATE POLICY "admin manage users" ON public.users FOR ALL TO authenticated
  USING ((get_user_role() = 'admin'::text))
  WITH CHECK ((get_user_role() = 'admin'::text))
;

DROP POLICY IF EXISTS "read own profile" ON public.users;
CREATE POLICY "read own profile" ON public.users FOR SELECT TO authenticated
  USING ((id = auth.uid()))
;

DROP POLICY IF EXISTS "staff read users" ON public.users;
CREATE POLICY "staff read users" ON public.users FOR SELECT TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

DROP POLICY IF EXISTS "update own profile" ON public.users;
CREATE POLICY "update own profile" ON public.users FOR UPDATE TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()))
;

DROP POLICY IF EXISTS "read reference" ON public.vehicle_types;
CREATE POLICY "read reference" ON public.vehicle_types FOR SELECT TO authenticated
  USING (true)
;

DROP POLICY IF EXISTS "staff full access" ON public.vehicle_types;
CREATE POLICY "staff full access" ON public.vehicle_types FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'staff'::text])))
;

-- 11. REFERENCE SEED DATA (Vehicle types, Toll gates, etc.)
INSERT INTO public.vehicle_types (name, default_capacity_kg, toll_class)
VALUES
  ('10-Wheeler Wing Van', 12000.00, 'Class 3'),
  ('6-Wheeler', 6000.00, 'Class 2'),
  ('Closed Van', 3000.00, 'Class 2'),
  ('Dropside', 8000.00, 'Class 2'),
  ('Elf / 4-Wheeler', 2500.00, 'Class 2'),
  ('Heavy Truck (10,000 kg)', 10000.00, 'Class 3'),
  ('Medium Truck (4,000 kg)', 4000.00, 'Class 2')
ON CONFLICT (name) DO UPDATE SET
  default_capacity_kg = EXCLUDED.default_capacity_kg,
  toll_class = EXCLUDED.toll_class;

