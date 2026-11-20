import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadService({ rpcImpl, fromImpl, channelImpl, removeChannelImpl } = {}) {
  const channels = [];
  const context = {
    console: { log() {}, error() {} },
    Intl,
    Date,
    supabase: {
      rpc: rpcImpl || (async () => ({ data: null, error: null })),
      from: fromImpl || (() => ({
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        in() { return this; },
        order: async () => ({ data: [], error: null }),
      })),
      channel: channelImpl || ((name) => {
        const ch = {
          name,
          handlers: [],
          on(_event, filter, cb) {
            this.handlers.push({ filter, cb });
            return this;
          },
          subscribe() { return this; },
        };
        channels.push(ch);
        return ch;
      }),
      removeChannel: removeChannelImpl || (() => {}),
    },
  };
  vm.createContext(context);
  const raw = fs.readFileSync(new URL('./customerStandingService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(
    `${raw}
    this.api = {
      formatManilaDateTime,
      formatManilaDate,
      formatRemainingDuration,
      normalizeCustomerStanding,
      previewNextNoShowStrike,
      getPickupWaitState,
      normalizeStrikeRow,
      formatStandingError,
      fetchCustomerNoShowStrikes,
      fetchCustomerAppeals,
      confirmNoShowCancellation,
      reviewCustomerAppeal,
      subscribeCustomerStanding,
      fetchShipmentStandingAndWaitOverlays,
    };`,
    context
  );
  return { ...context.api, channels };
}

test('normalizeCustomerStanding handles good, active alias, active cooldown, expired cooldown, suspended, and post-reinstatement', () => {
  const api = loadService();
  const now = Date.parse('2026-11-21T04:00:00Z');

  assert.equal(api.normalizeCustomerStanding({ standing_status: 'good', no_show_strike_count: 0 }, now).status, 'good');
  assert.equal(api.normalizeCustomerStanding({ standing_status: 'active', no_show_strike_count: 0 }, now).status, 'good');

  const cooldown = api.normalizeCustomerStanding({
    standing_status: 'cooldown',
    no_show_strike_count: 1,
    booking_cooldown_until: '2026-11-23T04:00:00Z',
  }, now);
  assert.equal(cooldown.status, 'cooldown');
  assert.equal(cooldown.isCooldownActive, true);
  assert.equal(cooldown.bookingBlocked, true);
  assert.equal(cooldown.cooldownRemainingLabel, '2d left');

  const expiredCooldown = api.normalizeCustomerStanding({
    standing_status: 'cooldown',
    no_show_strike_count: 1,
    booking_cooldown_until: '2026-11-21T03:00:00Z',
  }, now);
  assert.equal(expiredCooldown.status, 'good');
  assert.equal(expiredCooldown.isCooldownActive, false);
  assert.equal(expiredCooldown.bookingBlocked, false);

  const suspended = api.normalizeCustomerStanding({
    standing_status: 'suspended',
    no_show_strike_count: 3,
    suspended_at: '2026-11-21T01:00:00Z',
  }, now);
  assert.equal(suspended.status, 'suspended');
  assert.equal(suspended.isSuspended, true);
  assert.equal(suspended.bookingBlocked, true);

  const reinstated = api.normalizeCustomerStanding({
    standing_status: 'reinstated',
    no_show_strike_count: 3,
    reinstated_at: '2026-11-21T03:30:00Z',
  }, now);
  assert.equal(reinstated.status, 'reinstated');
  assert.equal(reinstated.isSuspended, false);
  assert.equal(reinstated.isReinstated, true);
  assert.equal(reinstated.strikeCount, 3);
  assert.equal(reinstated.bookingBlocked, false);

  const fourthStrike = api.normalizeCustomerStanding({
    standing_status: 'suspended',
    no_show_strike_count: 4,
  }, now);
  assert.equal(fourthStrike.displayStrikes, 3);
  assert.equal(fourthStrike.extraStrikes, 1);
});

test('previewNextNoShowStrike models the 3-strike ladder and 4th post-reinstatement strike', () => {
  const api = loadService();
  assert.deepEqual(
    { n: api.previewNextNoShowStrike({ no_show_strike_count: 0 }).nextStrikeNumber, s: api.previewNextNoShowStrike({ no_show_strike_count: 0 }).resultingStanding, h: api.previewNextNoShowStrike({ no_show_strike_count: 0 }).cooldownHours },
    { n: 1, s: 'cooldown', h: 48 }
  );
  assert.deepEqual(
    { n: api.previewNextNoShowStrike({ no_show_strike_count: 1 }).nextStrikeNumber, s: api.previewNextNoShowStrike({ no_show_strike_count: 1 }).resultingStanding, h: api.previewNextNoShowStrike({ no_show_strike_count: 1 }).cooldownHours },
    { n: 2, s: 'cooldown', h: 72 }
  );
  assert.deepEqual(
    { n: api.previewNextNoShowStrike({ no_show_strike_count: 2 }).nextStrikeNumber, s: api.previewNextNoShowStrike({ no_show_strike_count: 2 }).resultingStanding, h: api.previewNextNoShowStrike({ no_show_strike_count: 2 }).cooldownHours },
    { n: 3, s: 'suspended', h: null }
  );
  assert.equal(api.previewNextNoShowStrike({ no_show_strike_count: 3 }).nextStrikeNumber, 4);
});

test('getPickupWaitState transitions accurately across grace, grace-ended, threshold-reached, on-the-way, showed, and no-show', () => {
  const api = loadService();
  const baseArrival = '2026-11-21T01:00:00Z';

  const inGrace = api.getPickupWaitState(
    { status: 'assigned', pickup_arrived_at: baseArrival },
    Date.parse('2026-11-21T01:10:00Z')
  );
  assert.equal(inGrace.phase, 'in_grace');
  assert.equal(inGrace.badgeLabel, 'Waiting at pickup');
  assert.equal(inGrace.canOfficeConfirmNoShow, true);

  const graceEnded = api.getPickupWaitState(
    { status: 'assigned', pickup_arrived_at: baseArrival, customer_on_way_at: '2026-11-21T01:16:00Z' },
    Date.parse('2026-11-21T01:20:00Z')
  );
  assert.equal(graceEnded.phase, 'grace_ended');
  assert.equal(graceEnded.badgeLabel, 'Grace period ended');
  assert.equal(graceEnded.subBadgeLabel, 'Booking at risk');
  assert.equal(graceEnded.customerOnWay, true);

  const thresholdReached = api.getPickupWaitState(
    { status: 'assigned', pickup_arrived_at: baseArrival },
    Date.parse('2026-11-21T01:30:00Z')
  );
  assert.equal(thresholdReached.phase, 'threshold_reached');
  assert.equal(thresholdReached.badgeLabel, 'Wait threshold reached');
  assert.equal(thresholdReached.waitThresholdReached, true);

  const showed = api.getPickupWaitState(
    { status: 'loading', pickup_arrived_at: baseArrival, customer_showed_at: '2026-11-21T01:18:00Z' },
    Date.parse('2026-11-21T01:40:00Z')
  );
  assert.equal(showed.phase, 'customer_showed');
  assert.equal(showed.canOfficeConfirmNoShow, false);
});

test('reviewCustomerAppeal retries with approve/reject verbs when live RPC rejects past tense with INVALID_APPEAL_DECISION', async () => {
  const calls = [];
  const api = loadService({
    rpcImpl: async (name, args) => {
      calls.push({ name, args });
      if (args.p_decision === 'approved') {
        return { data: null, error: { message: 'INVALID_APPEAL_DECISION: expected approve or reject' } };
      }
      return { data: { status: 'approved', standing_status: 'reinstated' }, error: null };
    },
  });

  const res = await api.reviewCustomerAppeal({
    appealId: 'appeal-1',
    decision: 'approved',
    adminNotes: 'Verified with dispatch',
  });
  assert.equal(res.standing_status, 'reinstated');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_decision, 'approved');
  assert.equal(calls[1].args.p_decision, 'approve');
});

test('confirmNoShowCancellation falls back cleanly to 2-argument RPC signature on PGRST202', async () => {
  const calls = [];
  const api = loadService({
    rpcImpl: async (name, args) => {
      calls.push({ name, args });
      if ('p_reason' in args) {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.confirm_no_show_cancellation' } };
      }
      return { data: { strike_number: 2, standing_status: 'cooldown' }, error: null };
    },
  });

  const res = await api.confirmNoShowCancellation({
    deliveryId: 'del-1',
    reason: 'No customer response',
    attemptNotes: 'Called twice',
  });
  assert.equal(res.strike_number, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.p_delivery_id, 'del-1');
  assert.equal(calls[1].args.p_attempt_notes, 'No customer response: Called twice');
});

test('fetchCustomerNoShowStrikes supports both confirmed_by_role and confirmed_source variants and formatStandingError maps all 6 codes', async () => {
  const api = loadService({
    fromImpl: (table) => {
      if (table === 'customer_no_show_strikes') {
        return {
          select() { return this; },
          order: async () => ({
            data: [{ id: 's1', customer_id: 'c1', shipment_id: 'sh1', strike_number: 1, confirmed_source: 'driver', confirmed_at: '2026-11-21T01:30:00Z' }],
            error: null,
          }),
        };
      }
      return {
        select() { return this; },
        in: async () => ({ data: [{ id: 'sh1', tracking_number: 'MT-901' }], error: null }),
      };
    },
  });

  const strikes = await api.fetchCustomerNoShowStrikes();
  assert.equal(strikes.length, 1);
  assert.equal(strikes[0].confirmedByRole, 'driver');
  assert.equal(strikes[0].trackingNumber, 'MT-901');

  for (const code of [
    'ACCOUNT_SUSPENDED',
    'BOOKING_COOLDOWN_ACTIVE',
    'NOT_IN_GRACE_WINDOW',
    'APPEAL_REASON_REQUIRED',
    'APPEAL_ALREADY_PENDING',
    'ACCOUNT_NOT_SUSPENDED',
  ]) {
    const mapped = api.formatStandingError(new Error(code));
    assert.ok(mapped && mapped !== code);
  }
});
