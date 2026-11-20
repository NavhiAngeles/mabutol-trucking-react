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

export interface VehicleType {
  id: string;
  name: string;
  description: string | null;
  default_capacity_kg: number;
  toll_class: string | null;
  min_lead_time_hours: number;
  loading_buffer_minutes: number;
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
