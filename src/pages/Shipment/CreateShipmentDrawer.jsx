import { useEffect, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import "./createShipment.css";
import TruckTrackingMap from "./TruckTrackingMap";
import AddressAutocomplete from "./AddressAutocomplete";
import { LUZON_BOUNDS } from "../../config/mapBound";
import { departureLimits, parsePhilippineDeparture, validateDeparture } from "./departureSchedule";

const HUBS = [
  {
    label: "MICT Manila",
    value:
      "Manila International Container Terminal, MICT South Access Road, Port of Manila, Manila 1012, Metro Manila",
  },
  {
    label: "North Harbor",
    value:
      "Manila North Harbor, Tondo, Manila 1012, Metro Manila",
  },
  {
    label: "South Harbor",
    value:
      "Manila South Harbor, Port Area, Manila, Metro Manila",
  },
  {
    label: "Subic Port",
    value:
      "Subic Bay International Terminal, San Bernardino Road, Subic Bay Freeport Zone, Zambales 2222",
  },
];

const VEHICLES = [
  {
    id: "4-wheeler-closed",
    name: "4-Wheeler Closed Van",
    maxWeight: 2000,
    fleetCode: "T-102",
    typeTag: "ENCLOSED",
    isEnclosed: true,
    iconClass: "las la-truck-pickup",
  },
  {
    id: "6-wheeler-forward",
    name: "6-Wheeler Forward",
    maxWeight: 5000,
    fleetCode: "T-305",
    typeTag: "OPEN DROPSIDE",
    isEnclosed: false,
    iconClass: "las la-truck",
  },
  {
    id: "10-wheeler-wing",
    name: "10-Wheeler Wing Van",
    maxWeight: 15000,
    fleetCode: "T-402",
    typeTag: "ENCLOSED WING",
    isEnclosed: true,
    iconClass: "las la-dolly-flatbed",
  },
  {
    id: "10-wheeler-flatbed",
    name: "10-Wheeler Flatbed",
    maxWeight: 12000,
    fleetCode: "T-409",
    typeTag: "OPEN FLATBED",
    isEnclosed: false,
    iconClass: "las la-truck-loading",
  },
];

const INITIAL_FORM = {
  pickupLocation: "",
  destination: "",
  pickupBuilding: "",
  pickupUnit: "",
  pickupGate: "",
  pickupLandmark: "",
  destinationBuilding: "",
  destinationUnit: "",
  destinationGate: "",
  destinationLandmark: "",
  departureDate: "",
  departureTime: "",
  billingCustomer: "",
  cargoDescription: "",
  weight: "",
  specialHandling: "None",
  selectedVehicle: "",
  driverNotes: "",
  distanceKm: "",
  estimatedMinutes: "",
  usesTollRoad: false,
  baseRate: "",
  handlingCharge: "0",
  overrideAmount: "",
  tollCost: "0",
  driverAllowance: "0",
};

const detailedAddress = (form, type) => {
  const address = type === "pickup" ? form.pickupLocation : form.destination;
  const details = ["Building", "Unit", "Gate", "Landmark"]
    .filter(key => form[`${type}${key}`].trim())
    .map(key => `${key}: ${form[`${type}${key}`].trim()}`);
  return [address.trim(), ...details].join("; ");
};

const currency = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const customerName = (customer) =>
  customer?.company_name ||
  customer?.business_name ||
  customer?.full_name ||
  customer?.name ||
  String(customer?.id ?? "Unknown");

const isValidMoney = (value) =>
  value !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;

const validCoordinate = (point) =>
  point &&
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  point.lat >= -90 &&
  point.lat <= 90 &&
  point.lng >= -180 &&
  point.lng <= 180;

export default function CreateShipmentDrawer({
  isOpen,
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [scheduleClock, setScheduleClock] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => setScheduleClock(Date.now());
    const initialRefresh = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isOpen]);

  const [pickerMode, setPickerMode] = useState(null);

  const [confirmedPickup, setConfirmedPickup] =
    useState(null);

  const [confirmedDestination, setConfirmedDestination] =
    useState(null);

  const [isResolvingAddress, setIsResolvingAddress] =
    useState(false);

  const [addressError, setAddressError] = useState("");

  // PHASE 4 ROUTING STATE
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [fullRouteViewRequest, setFullRouteViewRequest] = useState(0);

  const [isCalculatingRoute, setIsCalculatingRoute] =
    useState(false);

  const [routeError, setRouteError] = useState("");

  const [currentStep, setCurrentStep] = useState(1);

  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] =
    useState(false);

  const [customerError, setCustomerError] = useState("");

  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [showSuccessModal, setShowSuccessModal] =
    useState(false);

  const [createdShipment, setCreatedShipment] =
    useState(null);

  const lookupControllerRef = useRef(null);
  const lookupIdRef = useRef(0);
  const lookupBusyRef = useRef(false);

  const routeControllerRef = useRef(null);
  const routeIdRef = useRef(0);

  // UPDATE FORM FIELDS
  const update = (field, value) => {
    if (field === "pickupLocation" || field === "destination") {
      routeIdRef.current += 1;
      routeControllerRef.current?.abort();
      setRouteGeoJSON(null);
      setRouteError("");
      setIsCalculatingRoute(false);
    }
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(["pickupLocation", "destination"].includes(field) ? { distanceKm: "", estimatedMinutes: "" } : {}),
    }));

    if (field === "pickupLocation") {
      setConfirmedPickup(null);
    }

    if (field === "destination") {
      setConfirmedDestination(null);
    }

    setSaveError("");
    setAddressError("");
  };

  // CANCEL ADDRESS LOOKUP
  const cancelAddressLookup = () => {
    lookupIdRef.current += 1;

    lookupControllerRef.current?.abort();
    lookupControllerRef.current = null;

    lookupBusyRef.current = false;
    setIsResolvingAddress(false);
  };

  // PHASE 3: REVERSE GEOCODING
  const selectAddress = (type, feature, address = feature.place_name) => {
    const coordinates = { lng: feature.center?.[0], lat: feature.center?.[1] };
    if (!validCoordinate(coordinates)) return;
    cancelAddressLookup();
    update(type === "pickup" ? "pickupLocation" : "destination", address);
    if (type === "pickup") setConfirmedPickup(coordinates);
    else setConfirmedDestination(coordinates);
    setPickerMode(null);
  };

  const handleSelectHub = async (event) => {
    const hub = HUBS.find(item => item.label === event.currentTarget.dataset.hub);
    if (!hub) return;
    cancelAddressLookup();
    update("pickupLocation", hub.value);
    setPickerMode(null);

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
    if (!apiKey) {
      setAddressError("Unable to locate this pickup. Please confirm it on the map.");
      return;
    }

    const requestId = ++lookupIdRef.current;
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    lookupBusyRef.current = true;
    setIsResolvingAddress(true);

    try {
      const query = new URLSearchParams({
        key: apiKey,
        country: "ph",
        language: "en",
        limit: "1",
        bbox: LUZON_BOUNDS.flat().join(","),
      });
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(hub.value)}.json?${query}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error("Pickup lookup failed.");
      const data = await response.json();
      const center = data.features?.[0]?.center;
      const coordinates = { lng: center?.[0], lat: center?.[1] };
      if (!validCoordinate(coordinates)) {
        throw new Error("No pickup coordinates were found.");
      }
      if (requestId !== lookupIdRef.current) return;
      selectAddress("pickup", { ...data.features[0], center: [coordinates.lng, coordinates.lat] }, hub.value);
    } catch (error) {
      if (controller.signal.aborted || requestId !== lookupIdRef.current) return;
      console.error("Default pickup lookup error:", error);
      setAddressError("Unable to locate this pickup. Please confirm it on the map.");
    } finally {
      if (requestId === lookupIdRef.current) {
        setIsResolvingAddress(false);
        lookupBusyRef.current = false;
        lookupControllerRef.current = null;
      }
    }
  };

  const handleConfirmLocation = async ({
    type,
    lat,
    lng,
  }) => {
    if (lookupBusyRef.current) return;

    if (
      type !== "pickup" &&
      type !== "destination"
    ) {
      return;
    }

    if (!validCoordinate({ lat, lng })) {
      setAddressError("Invalid map coordinates.");
      return;
    }

    const apiKey =
      import.meta.env.VITE_MAPTILER_API_KEY;

    if (!apiKey) {
      setAddressError("Missing MapTiler API key.");
      return;
    }

    lookupBusyRef.current = true;
    setIsResolvingAddress(true);
    setAddressError("");

    const requestId = ++lookupIdRef.current;

    const controller = new AbortController();
    lookupControllerRef.current = controller;

    const coordinates = { lat, lng };

    const fallbackAddress =
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    const enteredAddress = (type === "pickup" ? form.pickupLocation : form.destination).trim();
    let resolvedAddress = enteredAddress || fallbackAddress;
    let warning = "";

    try {
      const url =
        "https://api.maptiler.com/geocoding/" +
        `${lng},${lat}.json` +
        `?key=${encodeURIComponent(apiKey)}` +
        "&language=en&limit=1";

      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Address lookup failed (${response.status}).`
        );
      }

      const data = await response.json();
      const feature = data.features?.[0];

      if (
        typeof feature?.place_name === "string" &&
        feature.place_name.trim()
      ) {
        resolvedAddress = enteredAddress || feature.place_name.trim();
      } else {
        warning =
          "No address was found. Your exact map pin was saved; you can enter an address or landmark.";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(
        "Reverse geocoding error:",
        error
      );

      warning =
        "Address lookup failed. Your exact map pin was saved; you can enter an address or landmark.";
    } finally {
      if (requestId === lookupIdRef.current) {
        if (type === "pickup") {
          update("pickupLocation", resolvedAddress);

          setConfirmedPickup(coordinates);
        } else {
          update("destination", resolvedAddress);

          setConfirmedDestination(coordinates);
        }

        setAddressError(warning);
        setPickerMode(null);

        setIsResolvingAddress(false);
        lookupBusyRef.current = false;
        lookupControllerRef.current = null;
      }
    }
  };

  const handleCancelPicker = () => {
    if (lookupBusyRef.current) return;

    setPickerMode(null);
  };

  // PHASE 4: CALCULATE ROUTE USING SUPABASE EDGE FUNCTION
  useEffect(() => {
    // Invalidate all previous route requests.
    routeIdRef.current += 1;

    routeControllerRef.current?.abort();
    routeControllerRef.current = null;

    // Remove the previous route and calculations.
    setRouteGeoJSON(null);
    setRouteError("");
    setIsCalculatingRoute(false);

    setForm((previous) => ({
      ...previous,
      distanceKm: "",
      estimatedMinutes: "",
    }));

    // Both locations must have confirmed coordinates.
    if (
      !isOpen ||
      !validCoordinate(confirmedPickup) ||
      !validCoordinate(confirmedDestination)
    ) {
      return;
    }

    const requestId = routeIdRef.current;

    const controller = new AbortController();
    routeControllerRef.current = controller;

    const calculateRoute = async () => {
      setIsCalculatingRoute(true);
      setRouteError("");

      console.log(
        "Requesting truck route from Supabase:",
        {
          pickup: confirmedPickup,
          destination: confirmedDestination,
        }
      );

      try {
        // The browser contacts Supabase, not OpenRouteService.
        // The deployed Edge Function contacts OpenRouteService.
        const { data, error } = await supabase.functions.invoke(
          "calculate-route",
          {
            body: {
              pickup: confirmedPickup,
              destination: confirmedDestination,
            },
            signal: controller.signal,
          }
        );

        if (error) {
          let message = error.message;

          if (error.context) {
            try {
              const details = await error.context.json();
              message = details.error || message;
            } catch {
              // Keep the original error message.
            }
          }

          throw new Error(message);
        }

        if (requestId !== routeIdRef.current) return;

        if (data?.roadOnlyVerified !== true) {
          throw new Error("A road-only truck route could not be verified. Please try again later.");
        }

        setRouteGeoJSON(data.geojson);

        setForm((previous) => ({
          ...previous,
          distanceKm: String(data.distanceKm),
          estimatedMinutes: String(data.estimatedMinutes),
        }));

        setRouteError("");
      } catch (error) {
        if (
          error.name === "AbortError" ||
          controller.signal.aborted
        ) {
          return;
        }

        if (requestId !== routeIdRef.current) {
          return;
        }

        console.error(
          "Route calculation error:",
          error
        );

        setRouteGeoJSON(null);

        setRouteError(
          error.message ||
          "Unable to calculate driving route."
        );
      } finally {
        if (requestId === routeIdRef.current) {
          setIsCalculatingRoute(false);
          routeControllerRef.current = null;
        }
      }
    };

    calculateRoute();

    return () => {
      controller.abort();
    };
  }, [
    confirmedPickup,
    confirmedDestination,
    isOpen,
  ]);

  // LOAD CUSTOMERS FROM SUPABASE
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadCustomers = async () => {
      setLoadingCustomers(true);
      setCustomerError("");

      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .limit(500);

        if (cancelled) return;

        if (error) {
          setCustomers([]);
          setCustomerError(error.message);
        } else {
          setCustomers(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          setCustomers([]);

          setCustomerError(
            error.message ||
            "Failed to load customers."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    };

    loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // CLEANUP PENDING REQUESTS
  useEffect(() => {
    return () => {
      lookupIdRef.current += 1;
      lookupControllerRef.current?.abort();

      routeIdRef.current += 1;
      routeControllerRef.current?.abort();
    };
  }, []);

  const selectedCustomer = customers.find(
    (customer) =>
      String(customer.id) ===
      String(form.billingCustomer)
  );

  const selectedVehicle = VEHICLES.find(
    (vehicle) =>
      vehicle.id === form.selectedVehicle
  );

  // FINANCIAL CALCULATIONS
  const baseRate = Number(form.baseRate) || 0;

  const handlingCharge =
    Number(form.handlingCharge) || 0;

  const suggestedCharge =
    baseRate + handlingCharge;

  const finalCharge =
    form.overrideAmount.trim() === ""
      ? suggestedCharge
      : Number(form.overrideAmount);

  const tollCost = Number(form.tollCost) || 0;

  const driverAllowance =
    Number(form.driverAllowance) || 0;

  const operationalCost =
    tollCost + driverAllowance;

  const estimatedProfit =
    finalCharge - operationalCost;

  // RESET DRAWER
  const reset = () => {
    cancelAddressLookup();

    routeIdRef.current += 1;
    routeControllerRef.current?.abort();
    routeControllerRef.current = null;

    setForm(INITIAL_FORM);

    setPickerMode(null);
    setConfirmedPickup(null);
    setConfirmedDestination(null);

    setRouteGeoJSON(null);
    setIsCalculatingRoute(false);
    setRouteError("");

    setAddressError("");
    setCurrentStep(1);
    setSaveError("");

    setCreatedShipment(null);
    setShowSuccessModal(false);
  };

  const handleCloseAll = () => {
    if (isSaving) return;

    reset();
    onClose?.();
  };

  // VALIDATE ROUTE STEP
  const validateRoute = () => {
    if (!form.pickupLocation.trim()) {
      return "Pickup location is required.";
    }

    if (!form.destination.trim()) {
      return "Destination is required.";
    }

    const departureError = validateDeparture(form.departureDate, form.departureTime);
    if (departureError) return departureError;

    if (!selectedCustomer) {
      return "Select a registered customer.";
    }

    return "";
  };

  // VALIDATE CARGO STEP
  const validateCargo = () => {
    const weight = Number(form.weight);

    if (!form.cargoDescription.trim()) {
      return "Cargo description is required.";
    }

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      return "Enter a valid cargo weight.";
    }

    if (!selectedVehicle) {
      return "Select a vehicle type.";
    }

    if (weight > selectedVehicle.maxWeight) {
      return "Cargo exceeds the selected vehicle capacity.";
    }

    return "";
  };

  // VALIDATE FINANCIAL DATA
  const validateFinance = () => {
    if (
      !isValidMoney(form.baseRate) ||
      !isValidMoney(form.handlingCharge) ||
      !isValidMoney(form.tollCost) ||
      !isValidMoney(form.driverAllowance)
    ) {
      return "Enter valid non-negative financial amounts.";
    }

    if (
      form.overrideAmount.trim() !== "" &&
      !isValidMoney(form.overrideAmount)
    ) {
      return "Enter a valid override amount.";
    }

    if (
      form.distanceKm !== "" &&
      (!Number.isFinite(
        Number(form.distanceKm)
      ) ||
        Number(form.distanceKm) < 0)
    ) {
      return "Enter a valid route distance.";
    }

    if (
      form.estimatedMinutes !== "" &&
      (!Number.isFinite(
        Number(form.estimatedMinutes)
      ) ||
        Number(form.estimatedMinutes) < 0)
    ) {
      return "Enter a valid estimated travel time.";
    }

    return "";
  };

  // NEXT STEP
  const handleNext = () => {
    if (
      isResolvingAddress ||
      isCalculatingRoute
    ) {
      setSaveError(
        "Wait for the location or route calculation to finish."
      );
      return;
    }

    const error =
      currentStep === 1
        ? validateRoute()
        : validateCargo();

    if (error) {
      setSaveError(error);
      return;
    }

    setSaveError("");

    setCurrentStep((step) =>
      Math.min(step + 1, 3)
    );
  };

  // CREATE SHIPMENT IN SUPABASE
  const handleCreateShipment = async () => {
    if (
      isSaving ||
      isResolvingAddress ||
      isCalculatingRoute
    ) {
      return;
    }

    const error =
      validateRoute() ||
      validateCargo() ||
      validateFinance();

    if (error) {
      setSaveError(error);
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const departureError = validateDeparture(form.departureDate, form.departureTime);
      if (departureError) throw new Error(departureError);
      const departure = parsePhilippineDeparture(form.departureDate, form.departureTime);

      const shipmentData = {
        customer_id: selectedCustomer.id,

        pickup_address:
          detailedAddress(form, "pickup"),

        dropoff_address:
          detailedAddress(form, "destination"),

        scheduled_departure:
          departure.toISOString(),

        cargo_description:
          form.cargoDescription.trim(),

        weight_kg: Number(form.weight),

        quoted_amount: suggestedCharge,

        override_amount:
          form.overrideAmount.trim() !== ""
            ? Number(form.overrideAmount)
            : null,

        status: "booked",
        booking_source: "web",
      };

      const {
        data,
        error: insertError,
      } = await supabase
        .from("shipments")
        .insert(shipmentData)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      setCreatedShipment(data);
      setShowSuccessModal(true);

      onCreated?.(data);
    } catch (error) {
      console.error(
        "Create shipment error:",
        error
      );

      setSaveError(
        error.message ||
        "Failed to create shipment."
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const scheduleLimits = departureLimits(scheduleClock);
  const scheduleError = form.departureDate || form.departureTime
    ? validateDeparture(form.departureDate, form.departureTime, scheduleClock)
    : "";
  const sameDay = form.departureDate === scheduleLimits.today;
  const noFutureTimeToday = sameDay && scheduleLimits.earliestDate !== scheduleLimits.today;

  const hasValidRoute = routeGeoJSON?.features?.some(feature =>
    feature.geometry?.type === "LineString" &&
    feature.geometry.coordinates?.length >= 2 &&
    feature.geometry.coordinates.every(point =>
      Array.isArray(point) && validCoordinate({ lng: point[0], lat: point[1] })
    )
  ) && validCoordinate(confirmedPickup) && validCoordinate(confirmedDestination) && !isCalculatingRoute;

  const renderAddressDetails = (type) => (
    <details className="location-details">
      <summary>Optional address details</summary>
      <div className="location-details-fields">
        {[ ["Building", "Building or warehouse name"], ["Unit", "Unit / floor number"], ["Gate", "Gate / entrance number"], ["Landmark", "Nearby landmark"] ].map(([key, label]) => (
          <label key={key} className="location-detail-label">
            {label}
            <input type="text" value={form[`${type}${key}`]} maxLength={200}
              onChange={event => update(`${type}${key}`, event.target.value)} placeholder={`${label} (optional)`} />
          </label>
        ))}
      </div>
    </details>
  );

  // STEP 1: ROUTE AND SCHEDULE
  const renderRouteStep = () => (
    <div className="step-scroll-content">
      {/* PICKUP */}
      <div className="form-group">
        <label className="input-title">
          PICK-UP LOCATION
        </label>

        <AddressAutocomplete
            iconClass="las la-circle-notch input-icon input-blue-icon"
            placeholder="Search pickup address or landmark"
            value={form.pickupLocation}
            disabled={isResolvingAddress}
            onSelect={feature => selectAddress("pickup", feature)}
            onChange={(value) =>
              update(
                "pickupLocation",
                value
              )
            }
          />

        <button
          type="button"
          className="view-map-text-btn"
          disabled={isResolvingAddress}
          onClick={() =>
            setPickerMode((previous) =>
              previous === "pickup"
                ? null
                : "pickup"
            )
          }
        >
          <i className="las la-map-marker" />

          {pickerMode === "pickup"
            ? " Exit Pickup Picker"
            : confirmedPickup ? " Adjust Pickup Pin on Map" : " Pick Pickup on Map"}
        </button>

        {confirmedPickup && (
          <p className="field-info-text">
            <i className="las la-check-circle" />{" "}
            Pickup location confirmed.
            {` (${confirmedPickup.lat.toFixed(6)}, ${confirmedPickup.lng.toFixed(6)})`}
          </p>
        )}

        <div className="hub-pills-row">
          {HUBS.map((hub) => (
            <button
              key={hub.label}
              data-hub={hub.label}
              type="button"
              disabled={isResolvingAddress}
              className={`hub-pill ${form.pickupLocation === hub.value
                  ? "active"
                  : ""
                }`}
              onClick={handleSelectHub}
            >
              {hub.label}
            </button>
          ))}
        </div>
        <p className="field-info-text">Can't find the address? Pick the exact truck entrance on the map.</p>
        {renderAddressDetails("pickup")}
      </div>

      {/* DESTINATION */}
      <div className="form-group">
        <label className="input-title">
          DESTINATION
        </label>

        <AddressAutocomplete
            iconClass="las la-map-marker input-icon input-orange-icon"
            placeholder="Search delivery address or landmark"
            value={form.destination}
            disabled={isResolvingAddress}
            onSelect={feature => selectAddress("destination", feature)}
            onChange={(value) =>
              update(
                "destination",
                value
              )
            }
          />

        <button
          type="button"
          className="view-map-text-btn"
          disabled={isResolvingAddress}
          onClick={() =>
            setPickerMode((previous) =>
              previous === "destination"
                ? null
                : "destination"
            )
          }
        >
          <i className="las la-map-marker" />

          {pickerMode === "destination"
            ? " Exit Destination Picker"
            : confirmedDestination ? " Adjust Delivery Pin on Map" : " Pick Destination on Map"}
        </button>

        {confirmedDestination && (
          <p className="field-info-text">
            <i className="las la-check-circle" />{" "}
            Destination location confirmed.
            {` (${confirmedDestination.lat.toFixed(6)}, ${confirmedDestination.lng.toFixed(6)})`}
          </p>
        )}
        <p className="field-info-text">Can't find the address? Pick the exact delivery entrance on the map.</p>
        {renderAddressDetails("destination")}
      </div>

      {/* ROUTE SUMMARY */}
      <div className="route-summary-card">
        <div className="summary-header">
          <h3>Route Summary</h3>

          {form.usesTollRoad && (
            <span className="toll-badge">
              TOLL ROAD
            </span>
          )}
        </div>

        <div className="summary-timeline">
          <div className="timeline-node blue-node">
            {detailedAddress(form, "pickup") ||
              "Pickup location"}
          </div>

          <div className="timeline-node orange-node">
            {detailedAddress(form, "destination") ||
              "Destination"}
          </div>
        </div>

        <div className="summary-footer-metrics">
          <div>
            <span className="metric-label">
              DISTANCE
            </span>

            <strong className="metric-val">
              {form.distanceKm !== ""
                ? `${form.distanceKm} km`
                : "Not set"}
            </strong>
          </div>

          <div>
            <span className="metric-label">
              EST. TIME
            </span>

            <strong className="metric-val">
              {form.estimatedMinutes !== ""
                ? `${form.estimatedMinutes} min`
                : "Not set"}
            </strong>
          </div>

          <button
            type="button"
            className="view-map-text-btn"
            disabled={!hasValidRoute}
            title={
              hasValidRoute
                ? "Show the full driving route and both locations"
                : "Calculate a valid driving route first"
            }
            onClick={() => {
              setPickerMode(null);
              setFullRouteViewRequest(previous => previous + 1);
            }}
          >
            <i className="las la-map" />{" "}
            View Full Route
          </button>
        </div>
      </div>

      {/* ROUTE STATUS */}
      {isCalculatingRoute && (
        <p className="field-info-text">
          <i className="las la-spinner la-spin" />{" "}
          Calculating truck route...
        </p>
      )}

      {routeGeoJSON &&
        !isCalculatingRoute && (
          <p
            className="field-info-text"
            style={{
              color: "#15803d",
            }}
          >
            <i className="las la-check-circle" />{" "}
            Driving route calculated successfully.
          </p>
        )}

      {routeError && (
        <p
          role="alert"
          style={{
            color: "#b91c1c",
            fontSize: "13px",
          }}
        >
          <i className="las la-exclamation-triangle" />{" "}
          {routeError}
        </p>
      )}

      {/* DISTANCE AND TIME */}
      <div className="form-grid-2x2">
        <div className="form-group">
          <label className="input-title">
            DISTANCE (KM)
          </label>

          <div className="input-search-wrapper">
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Distance"
              value={form.distanceKm}
              onChange={(e) =>
                update(
                  "distanceKm",
                  e.target.value
                )
              }
            />
          </div>
        </div>

        <div className="form-group">
          <label className="input-title">
            EST. TRAVEL TIME (MIN)
          </label>

          <div className="input-search-wrapper">
            <input
              type="number"
              min="0"
              placeholder="Minutes"
              value={form.estimatedMinutes}
              onChange={(e) =>
                update(
                  "estimatedMinutes",
                  e.target.value
                )
              }
            />
          </div>
        </div>
      </div>

      {/* TOLL ROAD */}
      <div className="form-group">
        <label className="input-title">
          TOLL ROAD
        </label>

        <label className="field-info-text">
          <input
            type="checkbox"
            checked={form.usesTollRoad}
            onChange={(e) =>
              update(
                "usesTollRoad",
                e.target.checked
              )
            }
          />{" "}
          Route uses a toll road
        </label>
      </div>

      {/* DEPARTURE DATE AND TIME */}
      <div className="form-grid-2x2">
        <div className="form-group">
          <label className="input-title">
            SCHEDULE DEPARTURE
          </label>

          <div className="input-search-wrapper">
            <i className="las la-calendar input-icon" />

            <input
              type="date"
              value={form.departureDate}
              min={scheduleLimits.today}
              aria-invalid={Boolean(scheduleError)}
              aria-describedby={scheduleError ? "departure-schedule-error" : "departure-timezone"}
              onChange={(e) =>
                update(
                  "departureDate",
                  e.target.value
                )
              }
            />
          </div>
        </div>

        <div className="form-group">
          <label className="input-title">
            DEPARTURE TIME
          </label>

          <div className="input-search-wrapper">
            <i className="las la-clock input-icon" />

            <input
              type="time"
              value={form.departureTime}
              disabled={noFutureTimeToday}
              step={60}
              min={sameDay ? (noFutureTimeToday ? "23:59" : scheduleLimits.earliestTime) : undefined}
              aria-invalid={Boolean(scheduleError)}
              aria-describedby={scheduleError ? "departure-schedule-error" : "departure-timezone"}
              onChange={(e) =>
                update(
                  "departureTime",
                  e.target.value
                )
              }
            />
          </div>
        </div>
      </div>

      {/* CUSTOMER */}
      <p id="departure-timezone" className="field-info-text">Departure uses Philippine time (Asia/Manila).</p>
      {noFutureTimeToday && <p className="field-info-text">No future departure times remain today. Select a later date.</p>}
      {scheduleError && (
        <p id="departure-schedule-error" role="alert" style={{ color: "#b91c1c", fontSize: "13px" }}>
          {scheduleError}
        </p>
      )}
      <div className="form-group">
        <label className="input-title">
          CUSTOMER BILLING
        </label>

        <div className="select-dropdown-wrapper">
          <select
            value={form.billingCustomer}
            disabled={loadingCustomers}
            onChange={(e) =>
              update(
                "billingCustomer",
                e.target.value
              )
            }
          >
            <option value="">
              {loadingCustomers
                ? "Loading customers..."
                : "Select registered customer"}
            </option>

            {customers.map((customer) => (
              <option
                key={customer.id}
                value={customer.id}
              >
                {customerName(customer)}
              </option>
            ))}
          </select>

          <i className="las la-angle-down custom-select-arrow" />
        </div>

        <p className="field-info-text">
          <i className="las la-info-circle" />{" "}
          Registered customer accounts from Supabase.
        </p>

        {customerError && (
          <p
            role="alert"
            style={{
              color: "#b91c1c",
            }}
          >
            {customerError}
          </p>
        )}
      </div>
    </div>
  );

  // STEP 2: CARGO AND VEHICLE
  const renderCargoStep = () => (
    <div className="step-scroll-content">
      {/* CARGO DESCRIPTION */}
      <div className="form-group">
        <label className="input-title">
          CARGO DESCRIPTION
        </label>

        <textarea
          className="form-textarea"
          rows={2}
          placeholder="Enter cargo description"
          value={form.cargoDescription}
          onChange={(e) =>
            update(
              "cargoDescription",
              e.target.value
            )
          }
        />
      </div>

      {/* WEIGHT */}
      <div className="form-group">
        <label className="input-title">
          TOTAL WEIGHT
        </label>

        <div className="input-search-wrapper">
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Weight"
            value={form.weight}
            onChange={(e) =>
              update("weight", e.target.value)
            }
          />

          <span className="trailing-unit">
            kg
          </span>
        </div>
      </div>

      {/* SPECIAL HANDLING */}
      <div className="form-group">
        <label className="input-title">
          SPECIAL HANDLING
        </label>

        <div className="handling-badges-row">
          {[
            "None",
            "Fragile",
            "Keep Dry",
            "Temperature Sensitive",
          ].map((tag) => (
            <button
              key={tag}
              type="button"
              className={`handling-badge-btn ${form.specialHandling === tag
                  ? "active"
                  : ""
                }`}
              onClick={() =>
                update(
                  "specialHandling",
                  tag
                )
              }
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* DRIVER NOTES */}
      <div className="form-group">
        <label className="input-title">
          NOTES TO DRIVER
        </label>

        <textarea
          className="form-textarea"
          rows={2}
          placeholder="Driver instructions"
          value={form.driverNotes}
          onChange={(e) =>
            update(
              "driverNotes",
              e.target.value
            )
          }
        />
      </div>

      {/* VEHICLE SELECTION */}
      <div className="form-group">
        <div className="vehicle-header-row">
          <label className="input-title">
            SELECT VEHICLE
          </label>

          <span className="weight-filter-label">
            Filtered by weight (
            {Number(
              form.weight || 0
            ).toLocaleString()}{" "}
            kg)
          </span>
        </div>

        <div className="vehicle-selection-grid">
          {VEHICLES.map((truck) => {
            const overweight =
              Number(form.weight) >
              truck.maxWeight;

            const selected =
              form.selectedVehicle ===
              truck.id;

            return (
              <div
                key={truck.id}
                role="button"
                tabIndex={
                  overweight ? -1 : 0
                }
                className={`vehicle-card ${overweight
                    ? "disabled"
                    : "searchable"
                  } ${selected && !overweight
                    ? "active"
                    : ""
                  }`}
                onClick={() => {
                  if (!overweight) {
                    update(
                      "selectedVehicle",
                      truck.id
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    !overweight &&
                    (e.key === "Enter" ||
                      e.key === " ")
                  ) {
                    e.preventDefault();

                    update(
                      "selectedVehicle",
                      truck.id
                    );
                  }
                }}
              >
                <div className="vehicle-card-icon">
                  <i
                    className={
                      truck.iconClass
                    }
                  />
                </div>

                <div className="vehicle-card-details">
                  <div className="vehicle-title-line">
                    <h4>
                      {truck.name}
                    </h4>

                    <span className="vehicle-fleet-id-tag">
                      Fleet:{" "}
                      {truck.fleetCode}
                    </span>
                  </div>

                  <p>
                    Up to{" "}
                    {truck.maxWeight.toLocaleString()}{" "}
                    kg
                  </p>

                  <span
                    className={`vehicle-tag ${truck.isEnclosed
                        ? "blue-tag"
                        : "grey-tag"
                      }`}
                  >
                    {truck.typeTag}
                  </span>
                </div>

                {overweight ? (
                  <div className="error-alert-text">
                    <i className="las la-exclamation-circle" />{" "}
                    Exceeds weight
                  </div>
                ) : selected ? (
                  <i className="las la-check-circle select-check-icon" />
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="field-info-text">
          These are sample vehicle types,
          not verified fleet availability
          or actual assignments.
        </p>
      </div>
    </div>
  );

  // STEP 3: REVIEW AND CONFIRMATION
  const renderReviewStep = () => (
    <div className="step-scroll-content">
      <div className="review-alert-banner">
        <i className="las la-exclamation-triangle alert-banner-icon" />

        <p>
          Review the shipment information
          and financial estimates before
          confirming. Actual driver and
          vehicle assignments are not yet
          connected.
        </p>
      </div>

      {/* ROUTE */}
      <div className="review-section">
        <label className="review-section-title">
          ROUTE
        </label>

        <div className="review-timeline-display">
          <div className="review-node blue-dot">
            <strong>
              {detailedAddress(form, "pickup")}
            </strong>
            <span>Pick-up</span>
          </div>

          <div className="review-node orange-dot">
            <strong>
              {detailedAddress(form, "destination")}
            </strong>
            <span>Destination</span>
          </div>
        </div>

        <div className="review-inline-pills">
          <span className="info-inline-pill">
            {form.distanceKm
              ? `${form.distanceKm} km`
              : "Distance not set"}
          </span>

          <span className="info-inline-pill">
            {form.estimatedMinutes
              ? `${form.estimatedMinutes} min`
              : "Travel time not set"}
          </span>

          {form.usesTollRoad && (
            <span className="info-inline-pill highlight-orange">
              TOLL ROAD
            </span>
          )}
        </div>
      </div>

      {/* SCHEDULE AND CUSTOMER */}
      <div className="review-section-split">
        <div>
          <label className="review-section-title">
            SCHEDULE
          </label>

          <div className="review-data-text">
            <i className="las la-calendar" />{" "}
            {form.departureDate}{" "}
            <i className="las la-clock" />{" "}
            {form.departureTime}
          </div>
        </div>

        <div>
          <label className="review-section-title">
            CUSTOMER
          </label>

          <div className="review-data-text">
            <strong>
              {customerName(
                selectedCustomer
              )}
            </strong>

            <span className="blue-status-tag">
              REGISTERED
            </span>
          </div>
        </div>
      </div>

      {/* CARGO */}
      <div className="review-section">
        <label className="review-section-title">
          CARGO
        </label>

        <div className="review-data-row align-center">
          <strong className="font-bold">
            <i className="las la-weight-hanging" />{" "}
            {form.weight} kg
          </strong>

          <span className="blue-status-tag">
            {form.specialHandling}
          </span>
        </div>

        <p className="review-sub-notes">
          {form.cargoDescription}
        </p>

        <p className="review-sub-notes">
          Notes:{" "}
          {form.driverNotes || "None"}
        </p>
      </div>

      {/* VEHICLE */}
      <div className="review-section">
        <label className="review-section-title">
          VEHICLE
        </label>

        <div className="assigned-entity-card">
          <div className="entity-icon-box">
            <i className="las la-truck" />
          </div>

          <div className="entity-info-box">
            <h4>
              {selectedVehicle?.name ||
                "Not selected"}
            </h4>

            <p>
              {selectedVehicle?.fleetCode
                ? `Sample fleet: ${selectedVehicle.fleetCode}`
                : "No fleet selected"}
            </p>
          </div>

          <span className="auto-assign-tag">
            Not yet assigned
          </span>
        </div>
      </div>

      {/* DRIVER */}
      <div className="review-section">
        <label className="review-section-title">
          DRIVER
        </label>

        <div className="assigned-entity-card">
          <div className="entity-avatar-box">
            <i className="las la-user" />
          </div>

          <div className="entity-info-box">
            <h4>Unassigned</h4>

            <p>
              Driver availability and
              compliance have not been
              verified.
            </p>
          </div>

          <span className="auto-assign-tag">
            Pending assignment
          </span>
        </div>
      </div>

      {/* SHIPMENT CHARGE */}
      <div className="financial-statement-card cost-charge-blue">
        <div className="financial-header-row">
          <h3>Shipment Charge</h3>

          <span className="financial-badge-tag orange-bg">
            WHAT CUSTOMER PAYS
          </span>
        </div>

        <div className="financial-data-row">
          <span>Base Rate</span>

          <input
            type="number"
            min="0"
            step="0.01"
            className="override-text-field"
            value={form.baseRate}
            placeholder="0.00"
            onChange={(e) =>
              update(
                "baseRate",
                e.target.value
              )
            }
          />
        </div>

        <div className="financial-data-row">
          <span>
            Special Handling (
            {form.specialHandling})
          </span>

          <input
            type="number"
            min="0"
            step="0.01"
            className="override-text-field"
            value={form.handlingCharge}
            onChange={(e) =>
              update(
                "handlingCharge",
                e.target.value
              )
            }
          />
        </div>

        <div className="financial-total-row">
          <span>
            Total Suggested Charge
          </span>

          <span className="total-price-text">
            {currency(
              suggestedCharge
            )}
          </span>
        </div>

        <div className="override-input-group">
          <label className="override-label">
            Override Amount (₱)
          </label>

          <input
            type="number"
            min="0"
            step="0.01"
            className="override-text-field"
            placeholder={`Suggested: ${suggestedCharge.toFixed(
              2
            )}`}
            value={form.overrideAmount}
            onChange={(e) =>
              update(
                "overrideAmount",
                e.target.value
              )
            }
          />

          <p className="field-info-text">
            Leave blank to use the
            suggested charge.
          </p>
        </div>
      </div>

      {/* TRIP ESTIMATE */}
      <div className="financial-statement-card operational-grey">
        <div className="financial-header-row">
          <h3>Trip Estimate</h3>

          <span className="financial-badge-tag grey-bg">
            DRIVER TRIP ALLOWANCE
          </span>
        </div>

        <div className="financial-data-row">
          <span>Tolls (₱)</span>

          <input
            type="number"
            min="0"
            step="0.01"
            className="override-text-field"
            value={form.tollCost}
            onChange={(e) =>
              update(
                "tollCost",
                e.target.value
              )
            }
          />
        </div>

        <div className="financial-data-row">
          <span>Allowance (₱)</span>

          <input
            type="number"
            min="0"
            step="0.01"
            className="override-text-field"
            value={form.driverAllowance}
            onChange={(e) =>
              update(
                "driverAllowance",
                e.target.value
              )
            }
          />
        </div>

        <div className="financial-total-row">
          <span>
            TOTAL OPERATIONAL COST
          </span>

          <span className="total-price-text-sm">
            {currency(
              operationalCost
            )}
          </span>
        </div>
      </div>

      {/* PROFIT */}
      <div className="financial-statement-card profit-panel-white">
        <div className="financial-header-row border-none no-margin">
          <label className="review-section-title">
            ESTIMATED PROFIT
          </label>
        </div>

        <div className="financial-data-row">
          <span>
            {form.overrideAmount.trim()
              ? "Final Shipment Charge"
              : "Total Suggested Charge"}
          </span>

          <span>
            {currency(finalCharge)}
          </span>
        </div>

        <div className="financial-data-row">
          <span>
            Total Operational Cost
          </span>

          <span>
            -{currency(
              operationalCost
            )}
          </span>
        </div>

        <div className="financial-total-row border-dashed">
          <span className="profit-final-label">
            TOTAL ESTIMATED PROFIT
          </span>

          <span
            className="total-profit-highlight"
            style={{
              color:
                estimatedProfit < 0
                  ? "#dc2626"
                  : undefined,
            }}
          >
            {currency(
              estimatedProfit
            )}
          </span>
        </div>

        <p className="field-info-text">
          Estimate only. Actual operating
          costs may differ.
        </p>
      </div>
    </div>
  );

  // MAIN DRAWER
  return (
    <div
      className="drawer-overlay"
      onClick={handleCloseAll}
    >
      <div
        className="drawer-container"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        {/* LEFT PANEL */}
        <div className="drawer-form-panel">
          {/* HEADER */}
          <div className="drawer-fixed-header-block">
            <div className="drawer-header">
              <button
                type="button"
                className="back-link-btn"
                onClick={handleCloseAll}
                disabled={isSaving}
              >
                <i className="las la-arrow-left" />{" "}
                BACK TO SHIPMENTS
              </button>

              <h2>
                Create New Shipment
              </h2>
            </div>

            {/* STEPPER */}
            <div className="stepper-wrapper">
              <div
                className={`step-item ${currentStep >= 1
                    ? "active"
                    : ""
                  } ${currentStep > 1
                    ? "checked"
                    : ""
                  }`}
              >
                <span className="step-num">
                  {currentStep > 1
                    ? "✓"
                    : "1"}
                </span>

                {currentStep === 1 && (
                  <span className="step-label">
                    Route & Schedule
                  </span>
                )}
              </div>

              <div
                className={`step-line ${currentStep >= 2
                    ? "active-line"
                    : ""
                  }`}
              />

              <div
                className={`step-item ${currentStep >= 2
                    ? "active"
                    : ""
                  } ${currentStep > 2
                    ? "checked"
                    : ""
                  }`}
              >
                <span className="step-num">
                  {currentStep > 2
                    ? "✓"
                    : "2"}
                </span>

                {currentStep === 2 && (
                  <span className="step-label">
                    Cargo & Vehicle
                  </span>
                )}
              </div>

              <div
                className={`step-line ${currentStep === 3
                    ? "active-line"
                    : ""
                  }`}
              />

              <div
                className={`step-item ${currentStep === 3
                    ? "active"
                    : ""
                  }`}
              >
                <span className="step-num">
                  3
                </span>

                {currentStep === 3 && (
                  <span className="step-label">
                    Review & Confirmation
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* STEP CONTENT */}
          <div className="drawer-form-body-scrollable">
            {currentStep === 1 &&
              renderRouteStep()}

            {currentStep === 2 &&
              renderCargoStep()}

            {currentStep === 3 &&
              renderReviewStep()}

            {/* SAVE ERROR */}
            {saveError && (
              <div
                className="review-alert-banner"
                role="alert"
                style={{
                  margin: "12px",
                  color: "#b91c1c",
                }}
              >
                <i className="las la-exclamation-circle" />

                <p>{saveError}</p>
              </div>
            )}

            {/* ADDRESS ERROR */}
            {addressError && (
              <div
                role="alert"
                style={{
                  margin: "12px",
                  padding: "12px",
                  background: "#fff7ed",
                  color: "#9a3412",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                <i className="las la-exclamation-triangle" />{" "}
                {addressError}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="drawer-footer-wrapper-fixed">
            {currentStep < 3 ? (
              <div className="drawer-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    if (
                      currentStep > 1
                    ) {
                      setSaveError("");

                      setCurrentStep(
                        currentStep - 1
                      );
                    } else {
                      handleCloseAll();
                    }
                  }}
                >
                  {currentStep > 1
                    ? "Back"
                    : "Cancel"}
                </button>

                <button
                  type="button"
                  className="btn-submit"
                  disabled={
                    isResolvingAddress ||
                    isCalculatingRoute
                  }
                  onClick={handleNext}
                >
                  {currentStep === 1
                    ? "Cargo & Vehicle"
                    : "Review & Confirm"}{" "}

                  <i className="las la-arrow-right" />
                </button>
              </div>
            ) : (
              <div className="drawer-review-footer-block">
                <button
                  type="button"
                  className="btn-full-confirm"
                  onClick={
                    handleCreateShipment
                  }
                  disabled={
                    isSaving ||
                    isResolvingAddress ||
                    isCalculatingRoute
                  }
                >
                  <i
                    className={
                      isSaving
                        ? "las la-spinner la-spin"
                        : "las la-check-circle"
                    }
                  />{" "}

                  {isSaving
                    ? "Saving Shipment..."
                    : "Confirm Shipment Booking"}
                </button>

                <span className="footer-notice-subtext">
                  Shipment will be saved
                  to Supabase. Driver
                  notification is not
                  enabled yet.
                </span>

                <button
                  type="button"
                  className="btn-discard-action"
                  onClick={handleCloseAll}
                  disabled={isSaving}
                >
                  Cancel and discard
                  shipment
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT MAP PANEL */}
        <div className="drawer-map-panel">
          <TruckTrackingMap
            pickupLocation={
              form.pickupLocation
            }
            pickerMode={pickerMode}
            onConfirmLocation={
              handleConfirmLocation
            }
            onCancelPicker={
              handleCancelPicker
            }
            confirmedPickup={
              confirmedPickup
            }
            confirmedDestination={
              confirmedDestination
            }
            isResolvingAddress={
              isResolvingAddress
            }
            routeGeoJSON={
              routeGeoJSON
            }
            fullRouteViewRequest={fullRouteViewRequest}
            isCalculatingRoute={
              isCalculatingRoute
            }
            routeError={routeError}
          />
        </div>

        {/* SUCCESS MODAL */}
        {showSuccessModal && (
          <div className="alert-modal-backdrop">
            <div
              className="alert-modal-card"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div className="alert-success-icon-ring">
                <i className="las la-check" />
              </div>

              <h2>
                Shipment Booked Successfully
              </h2>

              <p className="alert-modal-subtitle">
                The shipment was saved
                to Supabase.
              </p>

              <div className="alert-meta-summary-box">
                <div className="meta-row">
                  <span className="meta-lbl">
                    SHIPMENT ID
                  </span>

                  <strong className="meta-val color-blue">
                    {createdShipment?.tracking_number ||
                      createdShipment?.id ||
                      "—"}
                  </strong>
                </div>

                <div className="meta-row">
                  <span className="meta-lbl">
                    CUSTOMER
                  </span>

                  <strong className="meta-val">
                    {customerName(
                      selectedCustomer
                    )}
                  </strong>
                </div>

                <div className="meta-row">
                  <span className="meta-lbl">
                    DRIVER
                  </span>

                  <strong className="meta-val">
                    Unassigned
                  </strong>
                </div>

                <div className="meta-row">
                  <span className="meta-lbl">
                    NET VALUE
                  </span>

                  <strong className="meta-val">
                    {currency(
                      createdShipment?.final_amount ??
                      finalCharge
                    )}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="btn-alert-dismiss"
                onClick={
                  handleCloseAll
                }
              >
                Go back to Shipment Overview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
