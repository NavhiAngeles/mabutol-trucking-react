export type ShipmentStatus =
  | 'pending'
  | 'quoted'
  | 'booked'
  | 'assigned'
  | 'loading'
  | 'in_transit'
  | 'delayed'
  | 'review'
  | 'completed'
  | 'cancelled';

export type CustomerStandingStatus = 'good' | 'active' | 'cooldown' | 'suspended' | 'reinstated';

export type CancellationType = 'no_show' | 'customer' | 'admin' | 'office' | 'system';

export type CustomerAppealStatus = 'pending' | 'approved' | 'rejected';

export interface Customer {
  id: string;
  customer_code: string;
  user_id: string | null;
  name: string;
  contact_person?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  barangay?: string | null;
  city: string | null;
  province: string | null;
  notes?: string | null;
  is_active: boolean;
  no_show_strike_count: number;
  booking_cooldown_until: string | null;
  standing_status: CustomerStandingStatus;
  suspended_at: string | null;
  suspension_reason: string | null;
  reinstated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  shipment_id: string;
  truck_id: string;
  driver_id: string;
  status: 'assigned' | 'loading' | 'in_transit' | 'delivered' | 'cancelled';
  assigned_at: string;
  route_started_at?: string | null;
  pickup_arrived_at?: string | null;
  grace_ends_at?: string | null;
  auto_cancel_at?: string | null;
  customer_on_way_at?: string | null;
  customer_showed_at?: string | null;
  no_show_confirmed_at?: string | null;
  departed_at?: string | null;
  arrived_at?: string | null;
  updated_at?: string;
}

export interface CustomerNoShowStrike {
  id: string;
  customer_id: string;
  shipment_id: string;
  delivery_id: string | null;
  strike_number: number;
  confirmed_at: string;
  confirmed_by: string | null;
  confirmed_by_role?: 'driver' | 'admin' | 'staff' | 'system';
  confirmed_source?: 'driver' | 'office' | 'system';
  reason: string;
  attempt_notes: string | null;
  created_at: string;
  shipment?: {
    tracking_number?: string | null;
    pickup_address?: string | null;
    dropoff_address?: string | null;
  } | null;
}

export interface CustomerAppeal {
  id: string;
  customer_id: string;
  user_id?: string | null;
  strike_count_at_appeal?: number;
  status: CustomerAppealStatus;
  reason: string;
  contact_number: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: Partial<Customer> | null;
  reviewer?: {
    full_name?: string | null;
  } | null;
}

export interface VehicleType {
  id: string;
  name: string;
  description: string | null;
  default_capacity_kg: number;
  toll_class: string | null;
  min_lead_time_hours: number;
  loading_buffer_minutes: number;
  default_height_m?: number | null;
  default_width_m?: number | null;
  default_length_m?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PricingRate {
  id: string;
  name: string;
  vehicle_type_id: string;
  base_rate: number;
  per_km_rate: number;
  per_kg_rate: number;
  min_charge: number;
  free_deadhead_km: number;
  deadhead_per_km_rate: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Shipment {
  id: string;
  tracking_number: string | null;
  customer_id: string | null;
  billing_customer_id?: string | null;
  status: ShipmentStatus;
  booking_source: string | null;
  cargo_category_id: string | null;
  cargo_description: string | null;
  weight_kg: number | null;
  special_handling: string | null;
  requested_vehicle_type_id: string | null;
  pricing_rate_id: string | null;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | null;
  route_duration_minutes: number | null;
  route_source?: string | null;
  route_reason?: string | null;
  route_geometry?: Record<string, unknown> | null;
  scheduled_departure: string | null;
  estimated_arrival: string | null;
  actual_delivery_at: string | null;
  linehaul_amount: number | null;
  toll_amount: number;
  mobilization_fee: number;
  deadhead_km: number;
  quoted_amount: number | null;
  override_amount: number | null;
  override_reason: string | null;
  final_amount: number | null;
  quote_expires_at: string | null;
  driver_allowance?: number | null;
  toll_fees?: number | null;
  driver_notes: string | null;
  cancellation_type?: CancellationType | null;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  confirmed_by?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Truck {
  id: string;
  fleet_code: string | null;
  plate_number: string;
  model: string | null;
  model_year: number | null;
  capacity_kg: number;
  vehicle_type_id: string | null;
  assigned_driver_id: string | null;
  height_m?: number | null;
  width_m?: number | null;
  length_m?: number | null;
  tare_weight_kg?: number | null;
  gross_weight_kg?: number | null;
  axle_count?: number | null;
  status: string;
  odometer_km: number | null;
  notes: string | null;
  home_base_location_id: string | null;
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  next_available_address: string | null;
  next_available_lat: number | null;
  next_available_lng: number | null;
  next_available_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RankedTruckCandidate {
  truck_id: string;
  fleet_code: string | null;
  plate_number: string;
  vehicle_type_id: string | null;
  vehicle_type_name: string | null;
  truck_status: string;
  assigned_driver_id: string | null;
  driver_name: string | null;
  projected_location_label: string;
  projected_lat: number | null;
  projected_lng: number | null;
  available_at: string;
  estimated_deadhead_km: number;
  can_make_pickup: boolean;
  schedule_gap_minutes: number;
}

export interface QuoteBreakdown {
  linehaulAmount: number;
  tollAmount: number;
  deadheadKm: number;
  excessDeadheadKm: number;
  suggestedMobilizationFee: number;
  mobilizationFee: number;
  quotedAmount: number;
  finalAmount: number;
}

export interface ShipmentEvent {
  id: string;
  shipment_id: string;
  delivery_id?: string | null;
  event_type: string;
  actor_id: string | null;
  meta: Record<string, unknown> | null;
  occurred_at: string;
}

export interface SubmitOfficeQuotationParams {
  shipmentId: string;
  actorUserId: string | null;
  pricingRateId: string;
  quotedStatusEnum?: ShipmentStatus;
  breakdown: QuoteBreakdown;
  overrideReason?: string | null;
  quoteValidHours?: number;
  routeUpdates?: Record<string, unknown> | null;
  selectedTruck?: RankedTruckCandidate | null;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'gcash' | 'check' | 'other';

export type PaymentStatus = 'pending' | 'verified' | 'rejected' | 'refunded';

export interface Payment {
  id: string;
  shipment_id: string;
  amount: number;
  method: PaymentMethod;
  reference_number: string | null;
  proof_path: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason?: string | null;
  notes: string | null;
  created_by: string | null;
  client_request_id?: string | null;
  created_at: string;
  updated_at: string;
}
