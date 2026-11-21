import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { deliveryWorkflowService } from '../../services/deliveryWorkflowService';
import {
  calculateFtlQuote,
  fetchRankedTrucksForShipment,
  formatProjectedAvailability,
  formatScheduleFeasibility,
  submitOfficeQuotation,
} from '../../services/ftlQuotationService';
import { getTollGates } from '../../services/tollGateService';
import { automaticTollQuote } from '../../services/tollPricing';
import {
  calculateEstimatedArrival,
  resolveVehicleLoadingBufferMinutes,
} from './departureSchedule';
import VisualRoutePinPicker from '../../components/LocationPicker/VisualRoutePinPicker';

const service = deliveryWorkflowService();
const VALIDITY_PRESETS = [6, 12, 24, 48];

const formatPhp = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? 'Unavailable'
    : new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(Number(value));

const formatManilaDateTime = (iso) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'Unavailable';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function OfficeQuoteForm({
  request,
  onQuoted,
  onRouteCalculated,
  onEditDeparture,
  disabled = false,
  actorUserId = null,
}) {
  const auth = useAuth();
  const effectiveActorId = actorUserId ?? auth?.user?.id ?? null;

  const [form, setForm] = useState(() => ({
    pickup_lat: request.pickup_lat ?? '',
    pickup_lng: request.pickup_lng ?? '',
    dropoff_lat: request.dropoff_lat ?? '',
    dropoff_lng: request.dropoff_lng ?? '',
    distance_km: request.distance_km ?? '',
    duration_minutes: request.route_duration_minutes ?? '',
    source: request.route_source || 'provider',
    reason: request.route_reason || '',
    geometry: request.route_geometry || null,
  }));

  const [rankedTrucks, setRankedTrucks] = useState([]);
  const [trucksLoading, setTrucksLoading] = useState(false);
  const [trucksError, setTrucksError] = useState('');
  const [selectedTruckId, setSelectedTruckId] = useState(null);

  const [deadheadKmInput, setDeadheadKmInput] = useState(() =>
    request.deadhead_km != null ? String(request.deadhead_km) : '0'
  );
  const [tollAmountInput, setTollAmountInput] = useState(() =>
    request.toll_amount != null
      ? String(request.toll_amount)
      : request.toll_fees != null
        ? String(request.toll_fees)
        : '0'
  );
  const [matchedTollSummary, setMatchedTollSummary] = useState('');
  const [mobilizationOverride, setMobilizationOverride] = useState(() =>
    request.status === 'quoted' && request.mobilization_fee != null
      ? String(request.mobilization_fee)
      : null
  );
  const [overrideEnabled, setOverrideEnabled] = useState(() =>
    request.override_amount != null
  );
  const [overrideAmountInput, setOverrideAmountInput] = useState(() =>
    request.override_amount != null ? String(request.override_amount) : ''
  );
  const [overrideReason, setOverrideReason] = useState(() =>
    request.override_reason || ''
  );
  const [quoteValidHours, setQuoteValidHours] = useState(12);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [submittedAttempt, setSubmittedAttempt] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const requestId = request.id ?? null;
  const requestVehicle = request.vehicle ?? null;
  const requestPricingRate = request.pricing_rate ?? null;
  const requestVehicleTypeId = request.requested_vehicle_type_id ?? null;
  const requestRouteGeometry = request.route_geometry ?? null;
  const requestHasSavedToll = request.toll_amount != null || request.toll_fees != null;
  const loadingBufferMinutes = resolveVehicleLoadingBufferMinutes(requestVehicle);

  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadRankedTrucks = useCallback(async () => {
    if (!requestId) return;
    setTrucksLoading(true);
    setTrucksError('');
    try {
      const candidates = await fetchRankedTrucksForShipment(requestId);
      setRankedTrucks(candidates);
    } catch (err) {
      setTrucksError(
        err?.message || 'Unable to load ranked truck availability.'
      );
    } finally {
      setTrucksLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void loadRankedTrucks();
      }
    });
    return () => {
      active = false;
    };
  }, [loadRankedTrucks]);

  const detectExpresswayTolls = useCallback(
    async (geometry) => {
      if (!geometry || !requestVehicle?.toll_class) return;
      try {
        const gates = await getTollGates();
        const quote = automaticTollQuote(true, requestVehicle, geometry, gates);
        if (quote && Number.isFinite(quote.total)) {
          setTollAmountInput(String(quote.total));
          if (quote.rates?.length) {
            const corridors = [
              ...new Set(quote.rates.map((r) => r.highway).filter(Boolean)),
            ];
            setMatchedTollSummary(
              `Matched ${corridors.join(', ')} (${quote.vehicleClass})`
            );
          }
        }
      } catch {
        setMatchedTollSummary(
          'No automatic expressway match; adjust toll fee manually if applicable.'
        );
      }
    },
    [requestVehicle]
  );

  useEffect(() => {
    if (!requestRouteGeometry || requestHasSavedToll) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void detectExpresswayTolls(requestRouteGeometry);
      }
    });
    return () => {
      active = false;
    };
  }, [detectExpresswayTolls, requestRouteGeometry, requestHasSavedToll]);

  const change = (key, value) =>
    setForm((previous) => {
      const next = {
        ...previous,
        [key]: value,
        ...(key.includes('_lat') || key.includes('_lng')
          ? { distance_km: '', duration_minutes: '', geometry: null }
          : {}),
      };
      if (key === 'distance_km' && Number(value) > 0) {
        onRouteCalculated?.({
          distance_km: Number(value),
          duration_minutes: Number(next.duration_minutes),
        });
      }
      return next;
    });

  const selectedTruck = useMemo(
    () => rankedTrucks.find((t) => t.truck_id === selectedTruckId) || null,
    [rankedTrucks, selectedTruckId]
  );

  const handleSelectCandidateTruck = (candidate) => {
    if (busy || disabled) return;
    setSelectedTruckId(candidate.truck_id);
    setDeadheadKmInput(String(candidate.estimated_deadhead_km ?? 0));
    setMobilizationOverride(null);
    setError('');
  };

  const activeRate = useMemo(() => {
    if (!requestPricingRate) return null;
    return {
      id: requestPricingRate.id || 'active-rate',
      vehicle_type_id: requestVehicleTypeId || '',
      base_rate: Number(requestPricingRate.base_rate ?? 0),
      per_km_rate: Number(requestPricingRate.per_km_rate ?? 0),
      per_kg_rate: Number(requestPricingRate.per_kg_rate ?? 0),
      min_charge: Number(requestPricingRate.min_charge ?? 0),
      free_deadhead_km: Number(requestPricingRate.free_deadhead_km ?? 30),
      deadhead_per_km_rate: Number(
        requestPricingRate.deadhead_per_km_rate ?? 0
      ),
    };
  }, [requestPricingRate, requestVehicleTypeId]);

  const parsedDistanceKm = Number(form.distance_km);
  const hasDistance = Number.isFinite(parsedDistanceKm) && parsedDistanceKm > 0;
  const tollValue = Number(tollAmountInput);
  const deadheadValue = Number(deadheadKmInput);
  const isTollInvalid =
    tollAmountInput === '' || !Number.isFinite(tollValue) || tollValue < 0;
  const isDeadheadInvalid =
    deadheadKmInput === '' || !Number.isFinite(deadheadValue) || deadheadValue < 0;
  const isMobInvalid =
    mobilizationOverride !== null &&
    (mobilizationOverride === '' ||
      !Number.isFinite(Number(mobilizationOverride)) ||
      Number(mobilizationOverride) < 0);
  const isOverrideAmountInvalid =
    overrideEnabled &&
    (overrideAmountInput === '' ||
      !Number.isFinite(Number(overrideAmountInput)) ||
      Number(overrideAmountInput) < 0);
  const isOverrideReasonInvalid =
    overrideEnabled && overrideReason.trim().length < 3;

  const quoteBreakdown = useMemo(() => {
    if (!activeRate || !hasDistance) return null;
    if (isTollInvalid || isDeadheadInvalid || isMobInvalid || isOverrideAmountInvalid) {
      return null;
    }
    try {
      return calculateFtlQuote({
        rate: activeRate,
        distanceKm: parsedDistanceKm,
        weightKg: Number(request.weight_kg ?? 0),
        tollAmount: tollValue,
        deadheadKm: deadheadValue,
        overrideMobilizationFee:
          mobilizationOverride !== null ? Number(mobilizationOverride) : undefined,
        overrideTotalAmount: overrideEnabled ? Number(overrideAmountInput) : null,
        minimumBookingFee: Number(request.minimum_booking_fee ?? 0),
      });
    } catch {
      return null;
    }
  }, [
    activeRate,
    hasDistance,
    isTollInvalid,
    isDeadheadInvalid,
    isMobInvalid,
    isOverrideAmountInvalid,
    parsedDistanceKm,
    request.weight_kg,
    request.minimum_booking_fee,
    tollValue,
    deadheadValue,
    mobilizationOverride,
    overrideEnabled,
    overrideAmountInput,
  ]);

  const estimatedArrivalIso = useMemo(
    () =>
      calculateEstimatedArrival(
        request.scheduled_departure,
        Number(form.duration_minutes),
        loadingBufferMinutes
      ),
    [request.scheduled_departure, form.duration_minutes, loadingBufferMinutes]
  );

  const estimatedExpiryIso = useMemo(() => {
    const hrs = Number(quoteValidHours);
    if (!Number.isFinite(hrs) || hrs <= 0) return null;
    return new Date(clockMs + hrs * 60 * 60 * 1000).toISOString();
  }, [clockMs, quoteValidHours]);

  const runCalculateRoute = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const calculated = await service.calculateRoute(form);
      setForm(calculated);
      onRouteCalculated?.({
        distance_km: calculated.distance_km,
        duration_minutes: calculated.duration_minutes,
      });
      await detectExpresswayTolls(calculated.geometry);
    } catch (err) {
      setError(
        err?.message || 'Provider routing is unavailable. Retry or verify manually.'
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const handleSubmitQuote = async () => {
    if (lock.current || disabled) return;
    setSubmittedAttempt(true);
    setError('');

    let validatedRoute;
    try {
      validatedRoute = service.routeData(form);
    } catch (routeErr) {
      setError(routeErr.message);
      return;
    }

    if (form.source === 'provider' && !form.geometry) {
      setError('Calculate the provider road route before submitting the quote.');
      return;
    }

    const departureMs = Date.parse(request.scheduled_departure || '');
    if (!Number.isFinite(departureMs) || departureMs <= Date.now()) {
      setError('INVALID_DEPARTURE');
      return;
    }

    if (!activeRate?.id) {
      setError('PRICING_CONFIGURATION_REQUIRED');
      return;
    }

    if (!quoteBreakdown) {
      setError('Review highlighted quotation fields and enter valid non-negative values.');
      return;
    }

    if (isOverrideReasonInvalid) {
      setError('Enter an override reason of at least 3 characters when overriding the total.');
      return;
    }

    const validHrs = Number(quoteValidHours);
    if (!Number.isFinite(validHrs) || validHrs <= 0 || validHrs > 720) {
      setError('Quote validity must be between 1 and 720 hours.');
      return;
    }

    lock.current = true;
    setBusy(true);
    try {
      await submitOfficeQuotation({
        shipmentId: request.id,
        actorUserId: effectiveActorId,
        pricingRateId: activeRate.id,
        quotedStatusEnum: 'quoted',
        breakdown: quoteBreakdown,
        overrideReason: overrideEnabled ? overrideReason.trim() : null,
        quoteValidHours: validHrs,
        selectedTruck,
        routeUpdates: {
          pickup_lat: validatedRoute.pickup_lat,
          pickup_lng: validatedRoute.pickup_lng,
          dropoff_lat: validatedRoute.dropoff_lat,
          dropoff_lng: validatedRoute.dropoff_lng,
          distance_km: validatedRoute.distance_km,
          route_duration_minutes: validatedRoute.duration_minutes,
          route_source: validatedRoute.source,
          route_reason: validatedRoute.reason,
          route_geometry: validatedRoute.geometry,
          estimated_arrival: estimatedArrivalIso,
        },
      });
      onQuoted?.();
    } catch (err) {
      setError(
        err?.message || 'Could not save quotation. Reload the request before retrying.'
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      className="delivery-workflow-panel ftl-quotation-builder"
      aria-label="Prepare FTL route, truck ranking, and quotation"
    >
      <div className="ftl-builder-header">
        <div>
          <h3>Quotation Builder &amp; Fleet Ranking</h3>
          <p>
            Customer linehaul is anchored to verified pickup and destination pins only. Empty truck deadhead is tracked separately as an optional mobilization surcharge.
          </p>
        </div>
        {estimatedArrivalIso && (
          <div className="ftl-eta-callout">
            <span className="ftl-eta-label">Estimated Arrival (PHT)</span>
            <strong className="ftl-tabular">{formatManilaDateTime(estimatedArrivalIso)}</strong>
            <span className="ftl-eta-sub ftl-tabular">
              Drive {Math.round(Number(form.duration_minutes))}m + {loadingBufferMinutes}m buffer
            </span>
          </div>
        )}
      </div>

      {/* ZONE 1: PICKUP -> DROPOFF ROUTE */}
      <div className="ftl-zone-card">
        <div className="ftl-zone-head">
          <h4>1. Pickup-to-Destination Route (Linehaul Anchor)</h4>
          <span className="ftl-zone-step-tag">Linehaul Basis</span>
        </div>

        <VisualRoutePinPicker
          idPrefix="quote"
          origin={{
            lat: form.pickup_lat,
            lng: form.pickup_lng,
            label: 'Pickup (Origin)',
            badge: 'P',
            addressHint: request.pickup_address || 'Address not specified',
          }}
          destination={{
            lat: form.dropoff_lat,
            lng: form.dropoff_lng,
            label: 'Destination (Drop-off)',
            badge: 'D',
            addressHint: request.dropoff_address || 'Address not specified',
          }}
          routeGeometry={form.geometry}
          disabled={busy || disabled}
          onChangePoint={(slot, point) => {
            setForm((previous) => ({
              ...previous,
              ...(slot === 'origin'
                ? { pickup_lat: point.lat, pickup_lng: point.lng }
                : { dropoff_lat: point.lat, dropoff_lng: point.lng }),
              distance_km: '',
              duration_minutes: '',
              geometry: null,
            }));
          }}
        />

        <div className="ftl-route-controls-row">
          <label htmlFor="quote-route-source">
            Route source
            <select
              id="quote-route-source"
              value={form.source}
              disabled={busy || disabled}
              onChange={(event) => change('source', event.target.value)}
            >
              <option value="provider">Provider road route</option>
              <option value="manual">Verified manual road route</option>
            </select>
          </label>
          <div className="ftl-route-calc-action">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={runCalculateRoute}
            >
              Calculate provider route
            </button>
          </div>
        </div>

        <div className="delivery-workflow-grid">
          <label htmlFor="quote-distance_km">
            Road distance (km)
            <input
              id="quote-distance_km"
              type="number"
              min="0.1"
              step="any"
              className="ftl-tabular"
              value={form.distance_km}
              readOnly={form.source === 'provider'}
              disabled={busy || disabled}
              onChange={(event) => change('distance_km', event.target.value)}
            />
          </label>
          <label htmlFor="quote-duration_minutes">
            Travel duration (minutes)
            <input
              id="quote-duration_minutes"
              type="number"
              min="1"
              step="any"
              className="ftl-tabular"
              value={form.duration_minutes}
              readOnly={form.source === 'provider'}
              disabled={busy || disabled}
              onChange={(event) => change('duration_minutes', event.target.value)}
            />
          </label>
        </div>

        {form.source === 'manual' && (
          <label htmlFor="quote-manual-reason">
            <span>Manual route verification reason</span>
            <span className="ftl-field-hint">Required (5 to 1,000 characters) for manual routes.</span>
            <textarea
              id="quote-manual-reason"
              maxLength={1000}
              value={form.reason}
              disabled={busy || disabled}
              onChange={(event) => change('reason', event.target.value)}
            />
          </label>
        )}
      </div>

      {/* ZONE 2: RANKED CANDIDATE TRUCKS */}
      <div className="ftl-zone-card">
        <div className="ftl-zone-head">
          <div>
            <h4>2. Ranked Candidate Trucks (Deadhead &amp; Schedule Check)</h4>
            <p className="ftl-field-hint">
              Ordered by pickup schedule feasibility, projected deadhead distance from next available drop-off or base, and earliest readiness.
            </p>
          </div>
          <button
            type="button"
            className="ftl-inline-refresh-btn"
            disabled={trucksLoading || busy || disabled}
            onClick={() => void loadRankedTrucks()}
          >
            {trucksLoading ? 'Ranking fleet…' : 'Refresh fleet ranking'}
          </button>
        </div>

        {trucksLoading && rankedTrucks.length === 0 && (
          <p role="status" className="ftl-truck-status-msg">
            Evaluating fleet availability and deadhead distance to pickup…
          </p>
        )}

        {trucksError && (
          <div role="alert" className="delivery-ops-alert is-error">
            Unable to load candidate trucks: {trucksError} You can still enter deadhead kilometers manually below.
          </div>
        )}

        {!trucksLoading && !trucksError && rankedTrucks.length === 0 && (
          <p className="delivery-ops-empty">
            No active trucks match this vehicle type right now. You can leave deadhead at 0 km or enter an estimated repositioning distance below.
          </p>
        )}

        {rankedTrucks.length > 0 && (
          <div
            className="ftl-truck-list"
            role="radiogroup"
            aria-label="Candidate trucks ranked by pickup feasibility and deadhead distance"
          >
            {rankedTrucks.map((candidate, index) => {
              const isSelected = selectedTruckId === candidate.truck_id;
              const feasibility = formatScheduleFeasibility(candidate);
              const isTopFeasible = index === 0 && candidate.can_make_pickup;
              const freeThreshold = activeRate?.free_deadhead_km ?? 30;
              const candidateExcess = Math.max(
                0,
                candidate.estimated_deadhead_km - freeThreshold
              );

              return (
                <button
                  key={candidate.truck_id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={busy || disabled}
                  className={`ftl-truck-card${isSelected ? ' is-selected' : ''}${isTopFeasible ? ' is-recommended' : ''
                    }`}
                  onClick={() => handleSelectCandidateTruck(candidate)}
                >
                  <div className="ftl-truck-card-main">
                    <div className="ftl-truck-identity">
                      <span className="ftl-truck-code ftl-tabular">
                        {candidate.fleet_code || candidate.plate_number}
                      </span>
                      {candidate.fleet_code && (
                        <span className="ftl-truck-plate ftl-tabular">
                          {candidate.plate_number}
                        </span>
                      )}
                      {isTopFeasible && (
                        <span className="ftl-top-match-badge">Best Match</span>
                      )}
                    </div>
                    <span className="ftl-truck-driver">
                      Driver: <strong>{candidate.driver_name || 'Unassigned'}</strong>
                    </span>
                    <span className="ftl-truck-projected">
                      {formatProjectedAvailability(candidate)}
                    </span>
                  </div>

                  <div className="ftl-truck-metrics">
                    <div className="ftl-truck-deadhead">
                      <span className="ftl-metric-caption">Deadhead</span>
                      <strong className="ftl-tabular">
                        {candidate.estimated_deadhead_km.toFixed(1)} km
                      </strong>
                      {candidateExcess > 0 ? (
                        <span className="ftl-excess-tag ftl-tabular">
                          +{candidateExcess.toFixed(1)} km excess
                        </span>
                      ) : (
                        <span className="ftl-within-tag">Within free zone</span>
                      )}
                    </div>

                    <div className="ftl-truck-feasibility">
                      <span
                        className={`ftl-feasibility-badge is-${feasibility.tone}`}
                      >
                        {feasibility.label}
                      </span>
                      <span className="ftl-feasibility-detail ftl-tabular">
                        {feasibility.detail}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="ftl-deadhead-manual-row">
          <label htmlFor="quote-deadhead-km">
            <span>Selected deadhead distance (km)</span>
            <span className="ftl-field-hint">
              Auto-filled when you pick a candidate truck above; free zone is {activeRate?.free_deadhead_km ?? 30} km.
            </span>
            <input
              id="quote-deadhead-km"
              type="number"
              min="0"
              step="0.1"
              className="ftl-tabular"
              value={deadheadKmInput}
              disabled={busy || disabled}
              aria-invalid={submittedAttempt && isDeadheadInvalid ? 'true' : 'false'}
              aria-describedby={submittedAttempt && isDeadheadInvalid ? 'quote-deadhead-error' : undefined}
              onChange={(event) => {
                setDeadheadKmInput(event.target.value);
                setMobilizationOverride(null);
              }}
            />
          </label>
          {submittedAttempt && isDeadheadInvalid && (
            <p id="quote-deadhead-error" className="ftl-inline-error">
              Error: Enter a valid non-negative deadhead distance in kilometers.
            </p>
          )}
        </div>
      </div>

      {/* ZONE 3: ITEMIZED QUOTATION BREAKDOWN */}
      <div className="ftl-zone-card">
        <div className="ftl-zone-head">
          <h4>3. Itemized FTL Quotation</h4>
          <span className="ftl-zone-step-tag">Customer Offer</span>
        </div>

        {!activeRate && (
          <div role="alert" className="delivery-ops-alert is-error">
            Active pricing rates are missing for {request.vehicle?.name || 'this vehicle type'}. Configure them in Settings &gt; Pricing before submitting an official quote.
          </div>
        )}

        <div className="ftl-quote-ledger">
          <div className="ftl-ledger-row">
            <div className="ftl-ledger-label">
              <strong>Linehaul Amount (Pickup to Destination)</strong>
              <span>
                {activeRate
                  ? `Base ${formatPhp(activeRate.base_rate)} + ${parsedDistanceKm || 0} km x ${formatPhp(activeRate.per_km_rate)} + ${Number(request.weight_kg || 0).toLocaleString('en-PH')} kg x ${formatPhp(activeRate.per_kg_rate)}`
                  : 'Waiting for active vehicle rate'}
              </span>
            </div>
            <strong className="ftl-ledger-amount ftl-tabular">
              {quoteBreakdown ? formatPhp(quoteBreakdown.linehaulAmount) : 'Unavailable'}
            </strong>
          </div>

          <div className="ftl-ledger-input-row">
            <label htmlFor="quote-toll-amount">
              <span>Expressway Toll Amount (₱)</span>
              <span className="ftl-field-hint">
                {matchedTollSummary ||
                  'Pre-filled from matched expressways when available; editable by dispatcher.'}
              </span>
              <input
                id="quote-toll-amount"
                type="number"
                min="0"
                step="0.01"
                className="ftl-tabular"
                value={tollAmountInput}
                disabled={busy || disabled}
                aria-invalid={submittedAttempt && isTollInvalid ? 'true' : 'false'}
                aria-describedby={submittedAttempt && isTollInvalid ? 'quote-toll-error' : undefined}
                onChange={(event) => setTollAmountInput(event.target.value)}
              />
            </label>
            {submittedAttempt && isTollInvalid && (
              <p id="quote-toll-error" className="ftl-inline-error">
                Error: Enter a valid non-negative toll fee amount in PHP.
              </p>
            )}
          </div>

          <div className="ftl-ledger-input-row">
            <label htmlFor="quote-mobilization-fee">
              <span>Mobilization Fee (₱)</span>
              <span className="ftl-field-hint ftl-tabular">
                {activeRate
                  ? `Excess deadhead: ${quoteBreakdown ? quoteBreakdown.excessDeadheadKm.toFixed(1) : '0.0'} km at ${formatPhp(activeRate.deadhead_per_km_rate)}/km · Suggested: ${quoteBreakdown ? formatPhp(quoteBreakdown.suggestedMobilizationFee) : formatPhp(0)}`
                  : 'Excess deadhead surcharge (optional)'}
              </span>
              <div className="ftl-mobilization-control">
                <input
                  id="quote-mobilization-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  className="ftl-tabular"
                  value={
                    mobilizationOverride !== null
                      ? mobilizationOverride
                      : quoteBreakdown
                        ? String(quoteBreakdown.suggestedMobilizationFee)
                        : '0'
                  }
                  disabled={busy || disabled}
                  aria-invalid={submittedAttempt && isMobInvalid ? 'true' : 'false'}
                  aria-describedby={submittedAttempt && isMobInvalid ? 'quote-mob-error' : undefined}
                  onChange={(event) => setMobilizationOverride(event.target.value)}
                />
                <button
                  type="button"
                  className="ftl-secondary-mini-btn"
                  disabled={busy || disabled}
                  onClick={() => setMobilizationOverride('0')}
                >
                  Waive fee (₱0)
                </button>
                {mobilizationOverride !== null && (
                  <button
                    type="button"
                    className="ftl-secondary-mini-btn"
                    disabled={busy || disabled}
                    onClick={() => setMobilizationOverride(null)}
                  >
                    Use suggested
                  </button>
                )}
              </div>
            </label>
            {submittedAttempt && isMobInvalid && (
              <p id="quote-mob-error" className="ftl-inline-error">
                Error: Enter a valid non-negative mobilization fee amount in PHP.
              </p>
            )}
          </div>

          <div className="ftl-ledger-row is-subtotal">
            <span>Calculated Quoted Total</span>
            <strong className="ftl-ledger-amount ftl-tabular">
              {quoteBreakdown ? formatPhp(quoteBreakdown.quotedAmount) : 'Unavailable'}
            </strong>
          </div>

          <div className="ftl-override-block">
            <label className="ftl-checkbox-row" htmlFor="quote-override-toggle">
              <input
                id="quote-override-toggle"
                type="checkbox"
                checked={overrideEnabled}
                disabled={busy || disabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setOverrideEnabled(checked);
                  if (checked && overrideAmountInput === '' && quoteBreakdown) {
                    setOverrideAmountInput(String(quoteBreakdown.quotedAmount));
                  }
                  if (!checked) {
                    setOverrideAmountInput('');
                    setOverrideReason('');
                  }
                }}
              />
              <span>Apply manual admin price override</span>
            </label>

            {overrideEnabled && (
              <div className="ftl-override-inputs">
                <label htmlFor="quote-override-amount">
                  <span>Override Final Charge (₱)</span>
                  <span className="ftl-field-hint">Replaces calculated total billed to the customer.</span>
                  <input
                    id="quote-override-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="ftl-tabular"
                    value={overrideAmountInput}
                    disabled={busy || disabled}
                    aria-invalid={submittedAttempt && isOverrideAmountInvalid ? 'true' : 'false'}
                    aria-describedby={submittedAttempt && isOverrideAmountInvalid ? 'quote-override-amt-error' : undefined}
                    onChange={(event) => setOverrideAmountInput(event.target.value)}
                  />
                </label>
                {submittedAttempt && isOverrideAmountInvalid && (
                  <p id="quote-override-amt-error" className="ftl-inline-error">
                    Error: Enter a valid non-negative override total amount.
                  </p>
                )}

                <label htmlFor="quote-override-reason">
                  <span>Override reason (required)</span>
                  <span className="ftl-field-hint">Explain why the standard tariff calculation was adjusted (minimum 3 characters).</span>
                  <textarea
                    id="quote-override-reason"
                    maxLength={500}
                    value={overrideReason}
                    disabled={busy || disabled}
                    aria-invalid={submittedAttempt && isOverrideReasonInvalid ? 'true' : 'false'}
                    aria-describedby={submittedAttempt && isOverrideReasonInvalid ? 'quote-override-reason-error' : undefined}
                    onChange={(event) => setOverrideReason(event.target.value)}
                  />
                </label>
                {submittedAttempt && isOverrideReasonInvalid && (
                  <p id="quote-override-reason-error" className="ftl-inline-error">
                    Error: Enter an override reason of at least 3 characters.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="ftl-validity-block">
            <label htmlFor="quote-valid-hours">
              <span>Quote validity window (hours)</span>
              <span className="ftl-field-hint">
                {estimatedExpiryIso
                  ? `Expires on ${formatManilaDateTime(estimatedExpiryIso)} (PHT)`
                  : 'Default is 12 hours from submission.'}
              </span>
            </label>
            <div className="ftl-validity-controls">
              <div className="ftl-validity-presets" role="group" aria-label="Quote validity presets">
                {VALIDITY_PRESETS.map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    disabled={busy || disabled}
                    className={`ftl-preset-btn${Number(quoteValidHours) === hrs ? ' is-active' : ''}`}
                    onClick={() => setQuoteValidHours(hrs)}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
              <input
                id="quote-valid-hours"
                type="number"
                min="1"
                max="720"
                step="1"
                className="ftl-tabular ftl-valid-hours-input"
                value={quoteValidHours}
                disabled={busy || disabled}
                onChange={(event) => setQuoteValidHours(event.target.value)}
              />
            </div>
          </div>

          <div className="ftl-ledger-row is-final">
            <div>
              <strong>Final Customer Charge</strong>
              <span>Written explicitly to shipments.final_amount</span>
            </div>
            <strong className="ftl-final-price ftl-tabular">
              {quoteBreakdown ? formatPhp(quoteBreakdown.finalAmount) : 'Unavailable'}
            </strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="quote-form-error-banner" role="alert">
          <span className="quote-form-error-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <div className="quote-form-error-body">
            <strong>Cannot submit quotation:</strong>
            <p>
              {error.includes('INVALID_DEPARTURE')
                ? 'The scheduled departure date and time for this booking is in the past. Shipments cannot be quoted or approved for past departures. Please update the departure date/time before saving.'
                : error.includes('REQUEST_CHANGED_RELOAD')
                  ? 'This booking was modified in another session. Please reload the request before saving.'
                  : error.includes('PRICING_CONFIGURATION_REQUIRED')
                    ? 'Pricing configuration is missing for this vehicle category. Please configure active pricing in Settings > Pricing.'
                    : error}
            </p>
            {error.includes('INVALID_DEPARTURE') && onEditDeparture && (
              <button
                type="button"
                className="btn-update-departure-error"
                onClick={onEditDeparture}
              >
                Update departure date &amp; time
              </button>
            )}
          </div>
        </div>
      )}

      {Boolean(
        form.distance_km &&
        (form.source !== 'provider' || form.geometry) &&
        (request.quoted_amount == null || !(request.distance_km > 0))
      ) && (
          <div className="quote-action-prompt" role="status">
            <span className="quote-action-prompt-dot" aria-hidden="true">●</span>
            <span>
              Route verified ({form.distance_km} km). Review the itemized breakdown above and click{' '}
              <strong>&ldquo;Submit official quote&rdquo;</strong> to send this FTL quote for confirmation.
            </span>
          </div>
        )}

      <button
        type="button"
        className="btn-primary"
        disabled={
          busy ||
          disabled ||
          !activeRate ||
          (form.source === 'provider' && !form.geometry)
        }
        onClick={handleSubmitQuote}
      >
        {busy ? 'Submitting quotation…' : 'Submit official quote'}
      </button>
    </section>
  );
}
