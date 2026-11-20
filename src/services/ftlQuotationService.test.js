import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadFtlService(supabaseMock) {
  const source = fs
    .readFileSync(new URL('./ftlQuotationService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '');
  const context = vm.createContext({
    supabase: supabaseMock,
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Boolean,
    Error,
  });
  vm.runInContext(
    `${source}\nthis.api = { calculateFtlQuote, fetchRankedTrucksForShipment, formatProjectedAvailability, formatScheduleFeasibility, submitOfficeQuotation };`,
    context
  );
  return context.api;
}

const sampleRate = {
  id: 'rate-10w',
  vehicle_type_id: 'vt-10w',
  base_rate: 1500,
  per_km_rate: 85,
  per_kg_rate: 0.5,
  min_charge: 6000,
  free_deadhead_km: 30,
  deadhead_per_km_rate: 40,
};

test('calculateFtlQuote keeps linehaul strictly pickup-to-dropoff regardless of truck deadhead km', () => {
  const { calculateFtlQuote } = loadFtlService({});

  const zeroDeadhead = calculateFtlQuote({
    rate: sampleRate,
    distanceKm: 100,
    weightKg: 8000,
    tollAmount: 750,
    deadheadKm: 0,
  });

  // 1500 + (100 * 85) + (8000 * 0.5) = 1500 + 8500 + 4000 = 14000
  assert.equal(zeroDeadhead.linehaulAmount, 14000);
  assert.equal(zeroDeadhead.excessDeadheadKm, 0);
  assert.equal(zeroDeadhead.suggestedMobilizationFee, 0);
  assert.equal(zeroDeadhead.mobilizationFee, 0);
  assert.equal(zeroDeadhead.quotedAmount, 14750);
  assert.equal(zeroDeadhead.finalAmount, 14750);

  const highDeadhead = calculateFtlQuote({
    rate: sampleRate,
    distanceKm: 100,
    weightKg: 8000,
    tollAmount: 750,
    deadheadKm: 75,
  });

  // Linehaul NEVER increases due to truck deadhead
  assert.equal(highDeadhead.linehaulAmount, 14000);
  assert.equal(highDeadhead.deadheadKm, 75);
  assert.equal(highDeadhead.excessDeadheadKm, 45);
  assert.equal(highDeadhead.suggestedMobilizationFee, 1800);
  assert.equal(highDeadhead.mobilizationFee, 1800);
  assert.equal(highDeadhead.quotedAmount, 16550);
  assert.equal(highDeadhead.finalAmount, 16550);
});

test('calculateFtlQuote enforces minimum floor and supports dispatcher mobilization waiver + admin override', () => {
  const { calculateFtlQuote } = loadFtlService({});

  const floored = calculateFtlQuote({
    rate: sampleRate,
    distanceKm: 10,
    weightKg: 500,
    tollAmount: 0,
    deadheadKm: 50,
    overrideMobilizationFee: 0,
    minimumBookingFee: 6500,
  });

  assert.equal(floored.linehaulAmount, 6500);
  assert.equal(floored.excessDeadheadKm, 20);
  assert.equal(floored.suggestedMobilizationFee, 800);
  assert.equal(floored.mobilizationFee, 0);
  assert.equal(floored.quotedAmount, 6500);
  assert.equal(floored.finalAmount, 6500);

  const overridden = calculateFtlQuote({
    rate: sampleRate,
    distanceKm: 10,
    weightKg: 500,
    tollAmount: 200,
    deadheadKm: 50,
    overrideTotalAmount: 7250,
  });

  assert.equal(overridden.quotedAmount, 7000);
  assert.equal(overridden.finalAmount, 7250);
});

test('fetchRankedTrucksForShipment calls RPC and sorts by feasibility then deadhead_km', async () => {
  const rpcCalls = [];
  const client = {
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return {
        data: [
          {
            truck_id: 't-late',
            fleet_code: 'MAB-TRK-03',
            plate_number: 'NBC 1003',
            can_make_pickup: false,
            estimated_deadhead_km: 10,
            schedule_gap_minutes: -25,
            available_at: '2026-11-21T06:00:00Z',
            projected_location_label: 'Cabanatuan City',
            truck_status: 'on_trip',
          },
          {
            truck_id: 't-far-ready',
            fleet_code: 'MAB-TRK-02',
            plate_number: 'NBC 1002',
            can_make_pickup: true,
            estimated_deadhead_km: 45,
            schedule_gap_minutes: 60,
            available_at: '2026-11-21T03:00:00Z',
            projected_location_label: 'Penaranda Base',
            truck_status: 'available',
          },
          {
            truck_id: 't-chained-best',
            fleet_code: 'MAB-TRK-01',
            plate_number: 'NBC 1001',
            driver_name: 'Ramon Santos',
            can_make_pickup: true,
            estimated_deadhead_km: 12.4,
            schedule_gap_minutes: 95,
            available_at: '2026-11-21T05:30:00Z',
            projected_location_label: 'Balagtas',
            truck_status: 'on_trip',
          },
        ],
        error: null,
      };
    },
  };

  const {
    fetchRankedTrucksForShipment,
    formatProjectedAvailability,
    formatScheduleFeasibility,
  } = loadFtlService(client);

  const ranked = await fetchRankedTrucksForShipment('shp-99', client);
  assert.equal(rpcCalls[0].name, 'get_ranked_trucks_for_shipment');
  assert.equal(rpcCalls[0].args.p_shipment_id, 'shp-99');
  assert.deepEqual(
    ranked.map((r) => r.truck_id),
    ['t-chained-best', 't-far-ready', 't-late']
  );

  const projText = formatProjectedAvailability(
    ranked[0],
    Date.parse('2026-11-21T04:00:00Z')
  );
  assert.match(projText, /^Finishing unload in Balagtas · Available 1:30 PM/);

  const readyBadge = formatScheduleFeasibility(ranked[0]);
  assert.equal(readyBadge.label, 'On-time / Ready');
  assert.equal(readyBadge.detail, '+1h 35m buffer');

  const lateBadge = formatScheduleFeasibility(ranked[2]);
  assert.equal(lateBadge.label, 'Tight / Late by 25m');
});

test('submitOfficeQuotation writes itemized fields, final_amount, quote_expires_at, and office_quoted event', async () => {
  const updates = [];
  const events = [];
  const client = {
    from(table) {
      if (table === 'shipments') {
        return {
          update(payload) {
            updates.push(payload);
            return {
              async eq(col, val) {
                updates[updates.length - 1]._where = { col, val };
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'shipment_events') {
        return {
          async insert(payload) {
            events.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const { calculateFtlQuote, submitOfficeQuotation } = loadFtlService(client);
  const breakdown = calculateFtlQuote({
    rate: sampleRate,
    distanceKm: 100,
    weightKg: 8000,
    tollAmount: 750,
    deadheadKm: 75,
  });

  // Override requires non-empty reason
  await assert.rejects(
    submitOfficeQuotation(
      {
        shipmentId: 'shp-1',
        actorUserId: 'usr-admin',
        pricingRateId: 'rate-10w',
        quotedStatusEnum: 'quoted',
        breakdown: { ...breakdown, finalAmount: 15000 },
        overrideReason: ' ',
      },
      client
    ),
    /override reason/i
  );

  const beforeMs = Date.now();
  const result = await submitOfficeQuotation(
    {
      shipmentId: 'shp-1',
      actorUserId: 'usr-admin',
      pricingRateId: 'rate-10w',
      quotedStatusEnum: 'quoted',
      breakdown,
      quoteValidHours: 12,
      selectedTruck: {
        truck_id: 't-chained-best',
        fleet_code: 'MAB-TRK-01',
        plate_number: 'NBC 1001',
      },
    },
    client
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'quoted');
  assert.equal(updates[0].pricing_rate_id, 'rate-10w');
  assert.equal(updates[0].linehaul_amount, 14000);
  assert.equal(updates[0].toll_amount, 750);
  assert.equal(updates[0].mobilization_fee, 1800);
  assert.equal(updates[0].deadhead_km, 75);
  assert.equal(updates[0].quoted_amount, 16550);
  assert.equal(updates[0].final_amount, 16550);
  assert.equal(updates[0].override_amount, null);
  const expiresMs = Date.parse(updates[0].quote_expires_at);
  assert.ok(expiresMs >= beforeMs + 11.9 * 3600000 && expiresMs <= beforeMs + 12.1 * 3600000);

  assert.equal(events.length, 1);
  assert.equal(events[0].shipment_id, 'shp-1');
  assert.equal(events[0].event_type, 'office_quoted');
  assert.equal(events[0].actor_id, 'usr-admin');
  assert.equal(events[0].meta.linehaul_amount, 14000);
  assert.equal(events[0].meta.toll_amount, 750);
  assert.equal(events[0].meta.mobilization_fee, 1800);
  assert.equal(events[0].meta.deadhead_km, 75);
  assert.equal(events[0].meta.quoted_amount, 16550);
  assert.equal(events[0].meta.final_amount, 16550);
  assert.equal(events[0].meta.quote_expires_at, result.quoteExpiresAt);
});

test('SQL migration and TypeScript database definitions cover all FTL alignment objects', () => {
  const migrationSql = fs.readFileSync(
    new URL('../../supabase/migrations/20261120120000_ftl_alignment_chained_dispatch.sql', import.meta.url),
    'utf8'
  );
  const dts = fs.readFileSync(
    new URL('../types/database.d.ts', import.meta.url),
    'utf8'
  );

  for (const token of [
    'ALTER TYPE public.shipment_status ADD VALUE IF NOT EXISTS \'quoted\'',
    'min_lead_time_hours',
    'loading_buffer_minutes',
    'free_deadhead_km',
    'deadhead_per_km_rate',
    'linehaul_amount',
    'toll_amount',
    'mobilization_fee',
    'deadhead_km',
    'quote_expires_at',
    'home_base_location_id',
    'current_lat',
    'current_lng',
    'last_location_at',
    'next_available_address',
    'next_available_lat',
    'next_available_lng',
    'next_available_at',
    'trg_sync_truck_availability_on_delivery',
    'trg_sync_truck_eta_from_route',
    'trg_sync_truck_gps_from_tracking',
    'public.get_ranked_trucks_for_shipment(p_shipment_id uuid)',
    'extensions.ST_Distance',
    'SET search_path = \'\'',
  ]) {
    assert.ok(migrationSql.includes(token), `Migration missing ${token}`);
  }

  for (const token of [
    'min_lead_time_hours: number',
    'loading_buffer_minutes: number',
    'free_deadhead_km: number',
    'deadhead_per_km_rate: number',
    'linehaul_amount: number | null',
    'toll_amount: number',
    'mobilization_fee: number',
    'deadhead_km: number',
    'quote_expires_at: string | null',
    'home_base_location_id: string | null',
    'current_lat: number | null',
    'current_lng: number | null',
    'last_location_at: string | null',
    'next_available_address: string | null',
    'next_available_lat: number | null',
    'next_available_lng: number | null',
    'next_available_at: string | null',
  ]) {
    assert.ok(dts.includes(token), `database.d.ts missing ${token}`);
  }
});
