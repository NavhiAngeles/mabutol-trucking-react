import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabaseClient";
import "./createShipment.css";
import { createShipment, formatDuration } from "../../services/shipmentService";
import { shipmentRouteFields } from "../../services/shipmentRoute";
import { calculateFallbackTruckRoute } from "../../services/truckRouteFallback";
import TruckTrackingMap from "./TruckTrackingMap";
import AddressAutocomplete from "./AddressAutocomplete";
import CustomerCombobox from "./CustomerCombobox";
import TollPricingPanel from "./TollPricingPanel";
import ShipmentDiscardDialog from "./ShipmentDiscardDialog";
import {
  DEFAULT_FTL_MIN_LEAD_TIME_HOURS,
  FTL_MAX_ADVANCE_DAYS,
  calculateEstimatedArrival,
  departureLimits,
  parsePhilippineDeparture,
  resolveVehicleLeadTimeHours,
  resolveVehicleLoadingBufferMinutes,
  validateDeparture,
} from "./departureSchedule";
import { fetchPricingData } from "../../services/pricingService";
import { HANDLING_OPTIONS, handlingCost } from "../../services/handlingPricing";
import {
  vehicleBaseRate,
  vehicleCanCarry,
  classifyVehicleWeightFit,
  pricingDate,
  bookingDefaults,
} from "../../services/vehiclePricing";
import { useCustomerDirectory } from "../../viewmodels/CustomerViewModel";
import { fetchBillingCustomers } from "../../services/customerService";
import { getTollGates } from "../../services/tollGateService";
import {
  automaticTollQuote,
  vehicleTollClass,
  sameTollQuote,
  withBookingPricing,
} from "../../services/tollPricing";
import VehicleSilhouette from "../../components/VehicleSilhouette/VehicleSilhouette";

const SafeVehicleSilhouette =
  typeof VehicleSilhouette !== "undefined" ? VehicleSilhouette : () => null;

const HUBS = [
  {
    label: "MICT Manila",
    value:
      "Manila International Container Terminal, MICT South Access Road, Port of Manila, Manila 1012, Metro Manila",
    coords: { lat: 14.6033, lng: 120.9574 },
  },
  {
    label: "North Harbor",
    value:
      "Manila North Harbor, Radial Road 10, Tondo, Manila 1012, Metro Manila",
    coords: { lat: 14.6132, lng: 120.9636 },
  },
  {
    label: "South Harbor",
    value:
      "Manila South Harbor, Bonifacio Drive, Port Area, Manila, Metro Manila",
    coords: { lat: 14.5869, lng: 120.9718 },
  },
  {
    label: "Subic Port",
    value:
      "Subic Bay International Terminal, San Bernardino Road, Subic Bay Freeport Zone, Zambales 2222",
    coords: { lat: 14.8147, lng: 120.2712 },
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
  overrideAmount: "",
  driverAllowance: "0",
};

const STEPS = [
  { number: 1, label: "Client & Route" },
  { number: 2, label: "Cargo & Schedule" },
  { number: 3, label: "Review & Pricing" },
];

const detailedAddress = (form, type) => {
  const address = type === "pickup" ? form.pickupLocation : form.destination;
  const details = ["Building", "Unit", "Gate", "Landmark"]
    .filter((key) => form[`${type}${key}`].trim())
    .map((key) => `${key}: ${form[`${type}${key}`].trim()}`);
  return [address.trim(), ...details].join("; ");
};

const currency = (value) =>
  value == null
    ? "Unavailable"
    : `₱${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const formatRouteErrorMessage = (message) => {
  const text = String(message || "").trim();
  if (!text) return "";
  if (
    /error sending request for url|tcp connect error|connection refused|os error 111|failed to send a request to the edge function|failed to fetch|networkerror|timed out|timeout|econnrefused|\b(502|503|504)\b/i.test(
      text
    )
  ) {
    return "Truck routing service (OpenRouteService) is temporarily unreachable. Wait a moment and retry, or adjust your pins.";
  }
  return text;
};

const customerName = (customer) =>
  customer?.company_name ||
  customer?.business_name ||
  customer?.full_name ||
  customer?.name ||
  String(customer?.id ?? "Unknown");

const isValidMoney = (value) =>
  value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

const validCoordinate = (point) =>
  point &&
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  point.lat >= -90 &&
  point.lat <= 90 &&
  point.lng >= -180 &&
  point.lng <= 180;

const addPhilippineDays = (ymd, days) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

function getSchedulePresets(nowMs, minLeadTimeHours) {
  const limits = departureLimits(nowMs, {
    minLeadTimeHours,
    maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
  });
  const candidates = [
    {
      id: "earliest",
      label: `Earliest (+${minLeadTimeHours}h)`,
      date: limits.earliestDate,
      time: limits.earliestTime,
    },
    {
      id: "tomorrow-8am",
      label: "Tomorrow 8:00 AM",
      date: addPhilippineDays(limits.today, 1),
      time: "08:00",
    },
    {
      id: "plus2-8am",
      label: "+2 Days 8:00 AM",
      date: addPhilippineDays(limits.today, 2),
      time: "08:00",
    },
    {
      id: "plus3-8am",
      label: "+3 Days 8:00 AM",
      date: addPhilippineDays(limits.today, 3),
      time: "08:00",
    },
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.date) return false;
    const key = `${candidate.date} ${candidate.time}`;
    if (seen.has(key)) return false;
    if (
      validateDeparture(candidate.date, candidate.time, nowMs, {
        minLeadTimeHours,
        maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
      }) !== ""
    ) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatPhilippineDateTime(dateStr, timeStr) {
  const parsed = parsePhilippineDeparture(dateStr, timeStr);
  if (!parsed) return `${dateStr} ${timeStr}`.trim() || "Not scheduled";
  return `${parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} PHT`;
}

export default function CreateShipmentDrawer({ isOpen, onClose, onCreated }) {
  const { user } = useAuth();
  const drawerTitleId = useId();
  const successTitleId = useId();

  const [form, setForm] = useState(INITIAL_FORM);
  const [baselineForm, setBaselineForm] = useState(INITIAL_FORM);

  const [tollRates, setTollRates] = useState([]);
  const [tollRatesError, setTollRatesError] = useState("");
  const [tollRatesLoading, setTollRatesLoading] = useState(true);
  const [tollReload, setTollReload] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getTollGates()
      .then((rates) => {
        if (!cancelled) {
          setTollRates(rates);
          setTollRatesError("");
          setTollRatesLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTollRates([]);
          setTollRatesError(error.message || "Unable to load toll rates.");
          setTollRatesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, tollReload]);

  const [pricingDefaults, setPricingDefaults] = useState(null);
  const allowanceEdited = useRef(false);
  const scheduleEdited = useRef(false);
  const pickupGroupRef = useRef(null);
  const destinationGroupRef = useRef(null);
  const draftInitial = useRef(INITIAL_FORM);

  const [scheduleClock, setScheduleClock] = useState(() => Date.now());
  const [handlingRates, setHandlingRates] = useState(null);
  const [handlingPricingError, setHandlingPricingError] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const currentPricingDate = pricingDate(scheduleClock);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchPricingData()
      .then((data) => {
        if (cancelled) return;
        const defaults = bookingDefaults(data.settings);
        setPricingDefaults(defaults);
        if (!allowanceEdited.current) {
          draftInitial.current = { ...INITIAL_FORM, driverAllowance: String(defaults.driverAllowance) };
          setForm(previous => ({ ...previous, driverAllowance: String(defaults.driverAllowance) }));
        }
        setHandlingRates(data.settings.handling_surcharges || null);
        if (!scheduleEdited.current) {
          const earliest = departureLimits(Date.now(), {
            minLeadTimeHours: DEFAULT_FTL_MIN_LEAD_TIME_HOURS,
            maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
          });
          draftInitial.current = {
            ...draftInitial.current,
            departureDate: earliest.earliestDate,
            departureTime: earliest.earliestTime,
          };
          setForm((previous) => ({
            ...previous,
            departureDate: earliest.earliestDate,
            departureTime: earliest.earliestTime,
          }));
        }
        setBaselineForm({ ...draftInitial.current });
        setVehicles(data.vehicles);
        setHandlingPricingError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setHandlingRates(null);
        setPricingDefaults(null);
        setVehicles([]);
        setHandlingPricingError(
          error.message || "Unable to load vehicle and handling prices."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentPricingDate]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      const now = Date.now();
      setScheduleClock(now);
      if (!scheduleEdited.current) {
        const earliest = departureLimits(now, {
          minLeadTimeHours: DEFAULT_FTL_MIN_LEAD_TIME_HOURS,
          maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
        });
        setForm((previous) => {
          if (previous.departureDate && previous.departureTime) return previous;
          draftInitial.current = {
            ...draftInitial.current,
            departureDate: earliest.earliestDate,
            departureTime: earliest.earliestTime,
          };
          setBaselineForm({ ...draftInitial.current });
          return {
            ...previous,
            departureDate: earliest.earliestDate,
            departureTime: earliest.earliestTime,
          };
        });
      }
    };
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
  const [mobilePane, setMobilePane] = useState("form");
  const [confirmedPickup, setConfirmedPickup] = useState(null);
  const [confirmedDestination, setConfirmedDestination] = useState(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");

  // ROUTING STATE
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [fullRouteViewRequest, setFullRouteViewRequest] = useState(0);
  const [routeRetryToken, setRouteRetryToken] = useState(0);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const handleRetryRoute = () => setRouteRetryToken((previous) => previous + 1);
  const displayRouteError = formatRouteErrorMessage(routeError);

  const [currentStep, setCurrentStep] = useState(1);
  const [touched, setTouched] = useState({});
  const [stepSubmitted, setStepSubmitted] = useState({
    1: false,
    2: false,
    3: false,
  });
  const [liveErrorAnnouncement, setLiveErrorAnnouncement] = useState("");

  const {
    customers,
    loading: loadingCustomers,
    error: customerError,
  } = useCustomerDirectory({ enabled: isOpen, billingOnly: true });

  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdShipment, setCreatedShipment] = useState(null);

  const lookupControllerRef = useRef(null);
  const lookupIdRef = useRef(0);
  const lookupBusyRef = useRef(false);

  const routeControllerRef = useRef(null);
  const routeIdRef = useRef(0);

  const drawerRef = useRef(null);
  const launcherRef = useRef(null);
  const formBodyRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const successDialogRef = useRef(null);
  const announceTimerRef = useRef(null);
  const prevStepRef = useRef(1);

  useEffect(() => {
    if (isOpen) {
      launcherRef.current = document.activeElement;
      if (drawerRef.current) {
        drawerRef.current.focus();
      }
    } else if (launcherRef.current) {
      if (launcherRef.current.isConnected) {
        launcherRef.current.focus();
      }
      launcherRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (launcherRef.current?.isConnected) {
        launcherRef.current.focus();
        launcherRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const dialog = successDialogRef.current;
    if (!dialog) return;
    if (showSuccessModal) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [showSuccessModal]);

  useEffect(() => {
    if (!isOpen) {
      prevStepRef.current = 1;
      return;
    }
    if (prevStepRef.current !== currentStep) {
      prevStepRef.current = currentStep;
      if (formBodyRef.current) {
        formBodyRef.current.scrollTop = 0;
      }
      stepHeadingRef.current?.focus();
    }
  }, [currentStep, isOpen]);

  useEffect(() => {
    return () => {
      clearTimeout(announceTimerRef.current);
    };
  }, []);

  const handleKeyDown = (event) => {
    if (showDiscardDialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseAll();
      return;
    }
    if (event.key !== "Tab") return;

    const modal = drawerRef.current?.querySelector(".alert-modal-card");
    const container = modal || drawerRef.current;
    if (!container) return;

    const focusable = Array.from(
      container.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (el) =>
        el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        el === document.activeElement
    );

    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (
        document.activeElement === first ||
        document.activeElement === container ||
        !container.contains(document.activeElement)
      ) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (
        document.activeElement === last ||
        document.activeElement === container ||
        !container.contains(document.activeElement)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  // UPDATE FORM FIELDS
  const update = (field, value) => {
    if (field === "driverAllowance") allowanceEdited.current = true;
    if (field === "departureDate" || field === "departureTime") {
      scheduleEdited.current = true;
    }
    if (["pickupLocation", "destination", "usesTollRoad"].includes(field)) {
      routeIdRef.current += 1;
      routeControllerRef.current?.abort();
      setRouteGeoJSON(null);
      setRouteError("");
      setRouteNotice("");
      setIsCalculatingRoute(false);
    }
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(["pickupLocation", "destination", "usesTollRoad"].includes(field)
        ? { distanceKm: "", estimatedMinutes: "" }
        : {}),
    }));

    if (field === "pickupLocation") {
      setConfirmedPickup(null);
    }

    if (field === "destination") {
      setConfirmedDestination(null);
    }

    setSaveError("");
    setAddressError("");
    setLiveErrorAnnouncement("");
  };

  // CANCEL ADDRESS LOOKUP
  const cancelAddressLookup = () => {
    lookupIdRef.current += 1;

    lookupControllerRef.current?.abort();
    lookupControllerRef.current = null;

    lookupBusyRef.current = false;
    setIsResolvingAddress(false);
  };

  // REVERSE GEOCODING / ADDRESS SELECTION
  const selectAddress = (type, feature, address = feature.place_name) => {
    const coordinates = { lng: feature.center?.[0], lat: feature.center?.[1] };
    if (!validCoordinate(coordinates)) return;
    cancelAddressLookup();
    update(type === "pickup" ? "pickupLocation" : "destination", address);
    if (type === "pickup") setConfirmedPickup(coordinates);
    else setConfirmedDestination(coordinates);
    setPickerMode(null);
    setMobilePane("form");
  };

  const handleSelectHub = (type, hub) => {
    if (!hub) return;
    selectAddress(
      type,
      { center: [hub.coords.lng, hub.coords.lat], place_name: hub.value },
      hub.value
    );
    setTouched((previous) => ({
      ...previous,
      [type === "pickup" ? "pickupLocation" : "destination"]: true,
    }));
  };

  const handleSwapLocations = () => {
    if (isResolvingAddress || isSaving) return;
    cancelAddressLookup();
    routeIdRef.current += 1;
    routeControllerRef.current?.abort();
    setRouteGeoJSON(null);
    setRouteError("");
    setRouteNotice("");
    setIsCalculatingRoute(false);
    setSaveError("");
    setAddressError("");

    const nextPickup = confirmedDestination;
    const nextDestination = confirmedPickup;
    setConfirmedPickup(nextPickup);
    setConfirmedDestination(nextDestination);
    setForm((previous) => ({
      ...previous,
      pickupLocation: previous.destination,
      destination: previous.pickupLocation,
      pickupBuilding: previous.destinationBuilding,
      destinationBuilding: previous.pickupBuilding,
      pickupUnit: previous.destinationUnit,
      destinationUnit: previous.pickupUnit,
      pickupGate: previous.destinationGate,
      destinationGate: previous.pickupGate,
      pickupLandmark: previous.destinationLandmark,
      destinationLandmark: previous.pickupLandmark,
      distanceKm: "",
      estimatedMinutes: "",
    }));
  };

  const handleConfirmLocation = async ({ type, lat, lng }) => {
    if (lookupBusyRef.current) return;

    if (type !== "pickup" && type !== "destination") {
      return;
    }

    if (!validCoordinate({ lat, lng })) {
      setAddressError("Invalid map coordinates.");
      return;
    }

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

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

    const fallbackAddress = "Pinned map location (no street address found)";

    const enteredAddress = (
      type === "pickup" ? form.pickupLocation : form.destination
    ).trim();
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
        throw new Error(`Address lookup failed (${response.status}).`);
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
          "No street address was found at this pin. Your exact pin was saved; add a landmark or warehouse name below if helpful.";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error("Reverse geocoding error:", error);

      warning =
        "Address lookup failed. Your exact pin was saved; you can edit the address text manually.";
    } finally {
      if (requestId === lookupIdRef.current) {
        if (type === "pickup") {
          update("pickupLocation", resolvedAddress);
          setConfirmedPickup(coordinates);
          setTouched((previous) => ({ ...previous, pickupLocation: true }));
        } else {
          update("destination", resolvedAddress);
          setConfirmedDestination(coordinates);
          setTouched((previous) => ({ ...previous, destination: true }));
        }

        setAddressError(warning);
        setPickerMode(null);
        setMobilePane("form");

        setIsResolvingAddress(false);
        lookupBusyRef.current = false;
        lookupControllerRef.current = null;
      }
    }
  };

  const handleCancelPicker = () => {
    if (lookupBusyRef.current) return;

    setPickerMode(null);
    setMobilePane("form");
  };

  // CALCULATE ROUTE USING SUPABASE EDGE FUNCTION
  useEffect(() => {
    routeIdRef.current += 1;

    routeControllerRef.current?.abort();
    routeControllerRef.current = null;

    const requestId = routeIdRef.current;
    const controller = new AbortController();
    routeControllerRef.current = controller;

    const calculateRoute = async () => {
      setIsCalculatingRoute(true);
      setRouteError("");
      setRouteNotice("");

      console.log("Requesting truck route from Supabase:", {
        pickup: confirmedPickup,
        destination: confirmedDestination,
      });

      const invokeEdgeFunction = async (usesToll) => {
        const body = {
          pickup: confirmedPickup,
          destination: confirmedDestination,
          ...(usesToll !== undefined ? { usesTollRoad: usesToll } : {}),
        };
        const { data, error } = await supabase.functions.invoke(
          "calculate-route",
          {
            body,
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

          if (
            typeof calculateFallbackTruckRoute === "function" &&
            /error sending request for url|tcp connect error|connection refused|os error 111|temporarily unreachable|failed to send a request to the edge function|failed to fetch|networkerror|timed out|timeout|econnrefused|\b(502|503|504)\b/i.test(
              String(message || "")
            )
          ) {
            try {
              return await calculateFallbackTruckRoute({
                pickup: confirmedPickup,
                destination: confirmedDestination,
                usesTollRoad: usesToll,
                signal: controller.signal,
              });
            } catch (fallbackError) {
              message = fallbackError?.message || message;
            }
          }

          if (
            typeof message === "string" &&
            message.includes("Select the port's truck entrance or access road")
          ) {
            const locText =
              `${form.pickupLocation} ${form.destination}`.toLowerCase();
            const isPort = /port|harbor|harbour|pier|wharf|dock/.test(locText);
            if (!isPort) {
              message =
                "No direct road-only truck route was returned. If this pin is placed near a river, waterway, or unpaved crossing, please adjust the pin to the nearest paved highway or bridge access road.";
            }
          }

          throw new Error(message);
        }
        return data;
      };

      try {
        let activeUsesTollRoad = form.usesTollRoad;
        let notice = "";
        let data = null;

        if (activeUsesTollRoad) {
          try {
            data = await invokeEdgeFunction(true);
          } catch (tollError) {
            const errText = String(tollError?.message || "").toLowerCase();
            const noExpresswayAvailable =
              errText.includes("substantial toll expressway travel") ||
              errText.includes("uncheck toll road") ||
              errText.includes("could not verify a toll expressway route") ||
              errText.includes("no route with substantial");

            if (noExpresswayAvailable) {
              console.warn(
                "No toll expressway corridor available; falling back to ordinary road route.",
                tollError.message
              );
              activeUsesTollRoad = false;
              notice =
                "No toll expressway available for this corridor (e.g. Maharlika Highway / Cagayan Valley). Routed via ordinary national highways.";
              try {
                data = await invokeEdgeFunction(false);
              } catch (ordinaryError) {
                const ordText = String(
                  ordinaryError?.message || ""
                ).toLowerCase();
                if (
                  ordText.includes("avoiding toll roads") ||
                  ordText.includes("enable toll road")
                ) {
                  data = await invokeEdgeFunction(undefined);
                } else {
                  throw ordinaryError;
                }
              }
            } else {
              throw tollError;
            }
          }
        } else {
          try {
            data = await invokeEdgeFunction(false);
          } catch (ordinaryError) {
            const ordText = String(ordinaryError?.message || "").toLowerCase();
            if (
              ordText.includes("avoiding toll roads") ||
              ordText.includes("enable toll road")
            ) {
              console.warn(
                "Ordinary road contains minor toll access links; querying standard route.",
                ordinaryError.message
              );
              data = await invokeEdgeFunction(undefined);
            } else {
              throw ordinaryError;
            }
          }
        }

        if (requestId !== routeIdRef.current) return;

        if (data?.roadOnlyVerified !== true) {
          throw new Error(
            "A road-only truck route could not be verified. Please try again later."
          );
        }
        if (
          activeUsesTollRoad &&
          (data.tollPreference !== "expressway" || data.usesTollRoad !== true)
        ) {
          throw new Error(
            "The routing service did not confirm the selected toll-road option. Recalculate after the routing service is updated."
          );
        }
        if (
          activeUsesTollRoad &&
          !data.geojson?.features?.some(
            (feature) =>
              feature.properties?.expressway?.verified === true &&
              feature.properties.expressway.distanceKm > 0
          )
        ) {
          throw new Error(
            "The service did not verify substantial expressway travel. Recalculate after the routing service is updated."
          );
        }
        if (
          !Number.isFinite(data.distanceKm) ||
          data.distanceKm < 0 ||
          !data.geojson?.features?.some(
            (feature) =>
              feature.geometry?.type === "LineString" &&
              feature.geometry.coordinates?.length >= 2 &&
              feature.geometry.coordinates.every(
                (point) =>
                  Array.isArray(point) &&
                  validCoordinate({ lng: point[0], lat: point[1] })
              )
          )
        ) {
          throw new Error(
            "The routing service returned an invalid route or distance. Please select the locations again."
          );
        }

        setRouteGeoJSON(data.geojson);
        setRouteNotice(notice);

        setForm((previous) => ({
          ...previous,
          usesTollRoad: activeUsesTollRoad,
          distanceKm: String(data.distanceKm),
          estimatedMinutes: String(data.estimatedMinutes),
        }));

        setRouteError("");
      } catch (error) {
        if (error.name === "AbortError" || controller.signal.aborted) {
          return;
        }

        if (requestId !== routeIdRef.current) {
          return;
        }

        console.error("Route calculation error:", error);

        setRouteGeoJSON(null);

        setRouteError(error.message || "Unable to calculate driving route.");
      } finally {
        if (requestId === routeIdRef.current) {
          setIsCalculatingRoute(false);
          routeControllerRef.current = null;
        }
      }
    };

    Promise.resolve().then(() => {
      if (requestId !== routeIdRef.current) return;

      setRouteGeoJSON(null);
      setRouteError("");
      setRouteNotice("");
      setIsCalculatingRoute(false);

      setForm((previous) => ({
        ...previous,
        distanceKm: "",
        estimatedMinutes: "",
      }));

      if (
        !isOpen ||
        !validCoordinate(confirmedPickup) ||
        !validCoordinate(confirmedDestination)
      ) {
        return;
      }

      calculateRoute();
    });

    return () => {
      controller.abort();
    };
  }, [confirmedPickup, confirmedDestination, form.usesTollRoad, isOpen, routeRetryToken]);

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
    (customer) => String(customer.id) === String(form.billingCustomer)
  );

  const selectedVehicle = vehicles.find(
    (vehicle) => vehicle.id === form.selectedVehicle
  );

  // FINANCIAL CALCULATIONS
  const baseRate =
    routeGeoJSON && pricingDefaults
      ? vehicleBaseRate(
          selectedVehicle,
          form.distanceKm,
          pricingDefaults.minimumBookingFee
        )
      : null;

  const handlingCharge = handlingCost(
    handlingRates,
    form.specialHandling,
    form.distanceKm
  );

  let tollEstimate = null;
  let tollEstimateError = "";
  try {
    tollEstimate = automaticTollQuote(
      form.usesTollRoad,
      selectedVehicle,
      routeGeoJSON,
      tollRates
    );
  } catch (error) {
    tollEstimateError = error.message;
  }
  const tollCost = tollEstimate?.total ?? null;
  const tollPending =
    form.usesTollRoad &&
    (tollCost === null || tollRatesLoading || Boolean(tollRatesError));
  const shipmentSubtotal =
    baseRate === null || handlingCharge === null
      ? null
      : baseRate + handlingCharge;

  const suggestedCharge =
    handlingCharge === null || baseRate === null || tollCost === null
      ? null
      : baseRate + handlingCharge + tollCost;

  const finalCharge =
    form.overrideAmount.trim() === ""
      ? suggestedCharge
      : Number(form.overrideAmount);

  const driverAllowance = Number(form.driverAllowance) || 0;

  const operationalCost =
    tollCost === null ? null : tollCost + driverAllowance;

  const estimatedProfit =
    finalCharge === null || operationalCost === null
      ? null
      : finalCharge - operationalCost;

  // SCHEDULE DERIVATIONS
  const activeLeadTimeHours = resolveVehicleLeadTimeHours(selectedVehicle);
  const activeLoadingBufferMinutes =
    resolveVehicleLoadingBufferMinutes(selectedVehicle);
  const scheduleLimits = departureLimits(scheduleClock, {
    minLeadTimeHours: activeLeadTimeHours,
    maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
  });
  const scheduleError =
    form.departureDate || form.departureTime
      ? validateDeparture(
          form.departureDate,
          form.departureTime,
          scheduleClock,
          {
            minLeadTimeHours: activeLeadTimeHours,
            maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
          }
        )
      : "Departure date and time are required.";
  const isEarliestDay = form.departureDate === scheduleLimits.earliestDate;
  const parsedReviewDeparture = parsePhilippineDeparture(
    form.departureDate,
    form.departureTime
  );
  const estimatedArrivalIso = calculateEstimatedArrival(
    parsedReviewDeparture,
    Number(form.estimatedMinutes),
    activeLoadingBufferMinutes
  );
  const schedulePresets = getSchedulePresets(scheduleClock, activeLeadTimeHours);

  // ROUTE & DIRTY STATE
  const hasValidRoute =
    routeGeoJSON?.features?.some(
      (feature) =>
        feature.geometry?.type === "LineString" &&
        feature.geometry.coordinates?.length >= 2 &&
        feature.geometry.coordinates.every(
          (point) =>
            Array.isArray(point) &&
            validCoordinate({ lng: point[0], lat: point[1] })
        )
    ) &&
    validCoordinate(confirmedPickup) &&
    validCoordinate(confirmedDestination) &&
    !isCalculatingRoute;

  const verifiedExpressway =
    form.usesTollRoad && hasValidRoute
      ? routeGeoJSON.features.find(
          (feature) => feature.properties?.expressway?.verified
        )?.properties.expressway
      : null;

  const isDirty =
    !createdShipment &&
    (Object.keys(INITIAL_FORM).some((key) => form[key] !== baselineForm[key]) ||
      confirmedPickup !== null ||
      confirmedDestination !== null);

  // RESET DRAWER
  const reset = () => {
    cancelAddressLookup();

    routeIdRef.current += 1;
    routeControllerRef.current?.abort();
    routeControllerRef.current = null;

    allowanceEdited.current = false;
    scheduleEdited.current = false;
    const earliest = departureLimits(scheduleClock, {
      minLeadTimeHours: DEFAULT_FTL_MIN_LEAD_TIME_HOURS,
      maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
    });
    const nextBaseline = {
      ...INITIAL_FORM,
      driverAllowance: String(pricingDefaults?.driverAllowance ?? 0),
      departureDate: earliest.earliestDate,
      departureTime: earliest.earliestTime,
    };
    draftInitial.current = nextBaseline;
    setBaselineForm(nextBaseline);
    setForm(nextBaseline);

    setPickerMode(null);
    setMobilePane("form");
    setConfirmedPickup(null);
    setConfirmedDestination(null);

    setRouteGeoJSON(null);
    setIsCalculatingRoute(false);
    setRouteError("");
    setRouteNotice("");

    setAddressError("");
    setCurrentStep(1);
    setTouched({});
    setStepSubmitted({ 1: false, 2: false, 3: false });
    setSaveError("");
    setLiveErrorAnnouncement("");

    setCreatedShipment(null);
    setShowSuccessModal(false);
  };

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const handleDiscard = () => {
    if (isSaving) return;
    setShowDiscardDialog(false);
    reset();
    onClose?.();
  };

  const handleCloseAll = () => {
    if (isSaving) return;

    const hasUnsavedChanges = !createdShipment && (
      Object.keys(INITIAL_FORM).some(key => form[key] !== draftInitial.current[key]) ||
      confirmedPickup !== null || confirmedDestination !== null
    );
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
      return;
    }

    reset();
    onClose?.();
  };

  // VALIDATORS
  const validateRoute = () => {
    if (!selectedCustomer || selectedCustomer.is_active !== true) {
      return "Select an active registered customer.";
    }
    if (!form.pickupLocation.trim()) {
      return "Pickup location is required.";
    }
    if (!validCoordinate(confirmedPickup)) {
      return "Select a pickup suggestion or pin the pickup on the map.";
    }
    if (!form.destination.trim()) {
      return "Destination is required.";
    }
    if (!validCoordinate(confirmedDestination)) {
      return "Select a destination suggestion or pin the destination on the map.";
    }
    if (!routeGeoJSON || isCalculatingRoute || routeError) {
      return "Calculate a valid route for the selected toll-road option first.";
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
    if (!vehicleCanCarry(selectedVehicle, weight)) return "The selected vehicle cannot carry this weight. Select another vehicle.";
    if (baseRate === null) return "A valid driving route and vehicle pricing record are required.";

    return "";
  };

  const validateSchedule = () => {
    return validateDeparture(
      form.departureDate,
      form.departureTime,
      undefined,
      {
        minLeadTimeHours: resolveVehicleLeadTimeHours(selectedVehicle),
        maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
      }
    );
  };

  // VALIDATE FINANCIAL DATA
  const validateFinance = () => {
    if (
      form.usesTollRoad &&
      (tollRatesLoading || tollRatesError || tollEstimateError)
    ) {
      return tollRatesError || tollEstimateError || "Wait for toll rates to load.";
    }
    if (
      baseRate === null ||
      !selectedVehicle?.pricing?.id ||
      !vehicleCanCarry(selectedVehicle, form.weight)
    ) {
      return "Select a vehicle with valid pricing and sufficient capacity, and calculate a valid route.";
    }
    if (handlingCharge === null || handlingPricingError) {
      return (
        handlingPricingError ||
        "The selected handling price is unavailable. Check pricing settings and route distance."
      );
    }
    if (!isValidMoney(form.driverAllowance)) {
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
      (!Number.isFinite(Number(form.distanceKm)) ||
        Number(form.distanceKm) < 0)
    ) {
      return "Enter a valid route distance.";
    }

    if (
      form.estimatedMinutes !== "" &&
      (!Number.isFinite(Number(form.estimatedMinutes)) ||
        Number(form.estimatedMinutes) < 0)
    ) {
      return "Enter a valid estimated travel time.";
    }

    return "";
  };

  // PER-FIELD ERRORS & ACCESSIBLE ANNOUNCEMENTS
  const parsedWeight = Number(form.weight);
  const rawFieldErrors = {
    billingCustomer:
      !selectedCustomer || selectedCustomer.is_active !== true
        ? "Select an active registered billing customer."
        : "",
    pickupLocation: !form.pickupLocation.trim()
      ? "Enter a pickup address or choose a port hub."
      : !validCoordinate(confirmedPickup)
        ? "Choose an address from suggestions or pin the pickup on the map."
        : "",
    destination: !form.destination.trim()
      ? "Enter a delivery address or choose a port hub."
      : !validCoordinate(confirmedDestination)
        ? "Choose an address from suggestions or pin the destination on the map."
        : "",
    cargoDescription: !form.cargoDescription.trim()
      ? "Enter a cargo description."
      : "",
    weight:
      form.weight === "" || !Number.isFinite(parsedWeight) || parsedWeight <= 0
        ? "Enter a positive cargo weight in kilograms."
        : "",
    selectedVehicle: !selectedVehicle
      ? "Select a vehicle type for this shipment."
      : Number.isFinite(parsedWeight) &&
          parsedWeight > 0 &&
          !vehicleCanCarry(selectedVehicle, parsedWeight)
        ? "Selected vehicle cannot carry this cargo weight. Lower the weight or pick a larger vehicle type."
        : hasValidRoute && baseRate === null
          ? "Pricing is unavailable for the selected vehicle type."
          : "",
    departure: scheduleError,
    driverAllowance: !isValidMoney(form.driverAllowance)
      ? "Enter a valid non-negative allowance amount."
      : "",
    overrideAmount:
      form.overrideAmount.trim() !== "" && !isValidMoney(form.overrideAmount)
        ? "Enter a valid non-negative override amount."
        : "",
  };

  const FIELD_LABELS = {
    billingCustomer: "Customer billing",
    pickupLocation: "Pick-up location",
    destination: "Destination",
    cargoDescription: "Cargo description",
    weight: "Total weight",
    selectedVehicle: "Vehicle type",
    departure: "Pickup schedule",
    driverAllowance: "Driver allowance",
    overrideAmount: "Override amount",
  };

  const showFieldError = (key, step) =>
    Boolean((touched[key] || stepSubmitted[step]) && rawFieldErrors[key]);

  const handleFieldBlur = (key, event) => {
    const related = event?.relatedTarget || null;
    if (
      key === "pickupLocation" &&
      (pickerMode === "pickup" || pickupGroupRef.current?.contains(related))
    ) {
      return;
    }
    if (
      key === "destination" &&
      (pickerMode === "destination" ||
        destinationGroupRef.current?.contains(related))
    ) {
      return;
    }

    const deferEmptyUntilSubmit =
      (key === "billingCustomer" && !form.billingCustomer && !stepSubmitted[1]) ||
      (key === "pickupLocation" && !form.pickupLocation.trim() && !stepSubmitted[1]) ||
      (key === "destination" && !form.destination.trim() && !stepSubmitted[1]) ||
      (key === "cargoDescription" && !form.cargoDescription.trim() && !stepSubmitted[2]) ||
      (key === "weight" && !String(form.weight).trim() && !stepSubmitted[2]);

    if (deferEmptyUntilSubmit) {
      return;
    }

    setTouched((previous) => ({ ...previous, [key]: true }));
    const message = rawFieldErrors[key];
    clearTimeout(announceTimerRef.current);
    if (message) {
      announceTimerRef.current = setTimeout(() => {
        setLiveErrorAnnouncement(
          `${FIELD_LABELS[key] || "Field"}: ${message}`
        );
      }, 450);
    } else {
      setLiveErrorAnnouncement("");
    }
  };

  const focusFirstInvalidField = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const target = formBodyRef.current?.querySelector(
        '[aria-invalid="true"], [data-invalid="true"]'
      );
      if (target && typeof target.focus === "function") {
        target.focus();
        if (typeof target.scrollIntoView === "function") {
          const reducedMotion =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          target.scrollIntoView({
            block: "center",
            behavior: reducedMotion ? "auto" : "smooth",
          });
        }
      }
    });
  };

  const handleSelectVehicle = (truck) => {
    const leadHours = resolveVehicleLeadTimeHours(truck);
    const shouldSyncSchedule = !scheduleEdited.current;
    const earliest = shouldSyncSchedule
      ? departureLimits(scheduleClock, {
          minLeadTimeHours: leadHours,
          maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
        })
      : null;

    if (shouldSyncSchedule && earliest) {
      draftInitial.current = {
        ...draftInitial.current,
        departureDate: earliest.earliestDate,
        departureTime: earliest.earliestTime,
      };
      setBaselineForm({ ...draftInitial.current });
    }

    setForm((previous) => ({
      ...previous,
      selectedVehicle: truck.id,
      ...(shouldSyncSchedule && earliest
        ? {
            departureDate: earliest.earliestDate,
            departureTime: earliest.earliestTime,
          }
        : {}),
    }));
    setTouched((previous) => ({ ...previous, selectedVehicle: true }));
    setSaveError("");
    setLiveErrorAnnouncement("");
  };

  const handleShiftToEarliestSlot = () => {
    const earliest = departureLimits(scheduleClock, {
      minLeadTimeHours: activeLeadTimeHours,
      maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
    });
    scheduleEdited.current = true;
    setForm((previous) => ({
      ...previous,
      departureDate: earliest.earliestDate,
      departureTime: earliest.earliestTime,
    }));
    setTouched((previous) => ({
      ...previous,
      departure: true,
    }));
    setSaveError("");
    setLiveErrorAnnouncement("");
  };

  const handleApplySchedulePreset = (preset) => {
    scheduleEdited.current = true;
    setForm((previous) => ({
      ...previous,
      departureDate: preset.date,
      departureTime: preset.time,
    }));
    setTouched((previous) => ({ ...previous, departure: true }));
    setSaveError("");
    setLiveErrorAnnouncement("");
  };

  // BACK STEP
  const handleBack = () => {
    if (isSaving) return;

    setSaveError("");
    setCurrentStep((previousStep) => Math.max(previousStep - 1, 1));
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

    const scheduleMsg =
      typeof validateSchedule === "function" ? validateSchedule() : "";
    const error =
      currentStep === 1
        ? validateRoute()
        : validateCargo() || scheduleMsg;

    if (error) {
      if (typeof setStepSubmitted === "function") {
        setStepSubmitted((previous) => ({
          ...previous,
          [currentStep]: true,
        }));
      }
      setSaveError(error);
      if (typeof focusFirstInvalidField === "function") {
        focusFirstInvalidField();
      }
      return;
    }

    setSaveError("");

    setCurrentStep((step) =>
      Math.min(step + 1, 3)
    );
  };

  const handleStepSelect = (targetStep) => {
    if (isSaving || targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setSaveError("");
      setCurrentStep(targetStep);
      return;
    }
    if (isResolvingAddress || isCalculatingRoute) {
      setSaveError("Wait for the location or route calculation to finish.");
      return;
    }
    if (currentStep === 1) {
      const step1Error = validateRoute();
      if (step1Error) {
        setStepSubmitted((previous) => ({ ...previous, 1: true }));
        setSaveError(step1Error);
        focusFirstInvalidField();
        return;
      }
      if (targetStep === 2) {
        setSaveError("");
        setCurrentStep(2);
        return;
      }
      const step2Error = validateCargo() || validateSchedule();
      if (step2Error) {
        setStepSubmitted((previous) => ({ ...previous, 2: true }));
        setSaveError(step2Error);
        setCurrentStep(2);
        focusFirstInvalidField();
        return;
      }
      setSaveError("");
      setCurrentStep(3);
      return;
    }
    if (currentStep === 2 && targetStep === 3) {
      handleNext();
    }
  };

  // CREATE SHIPMENT IN SUPABASE
  const handleCreateShipment = async () => {
    if (isSaving || isResolvingAddress || isCalculatingRoute) {
      return;
    }

    const error =
      validateRoute() ||
      validateCargo() ||
      validateSchedule() ||
      validateFinance();

    if (error) {
      setStepSubmitted((previous) => ({ ...previous, [currentStep]: true }));
      setSaveError(error);
      focusFirstInvalidField();
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const billingCustomers = await fetchBillingCustomers();
      if (
        !billingCustomers.some(
          (customer) => customer.id === selectedCustomer.id
        )
      ) {
        throw new Error(
          "The selected customer is no longer eligible for billing. Choose an active customer from Customer Billing."
        );
      }
      const currentPricing = await fetchPricingData();
      const currentVehicle = currentPricing.vehicles.find(
        (vehicle) => vehicle.id === form.selectedVehicle
      );
      if (form.usesTollRoad) {
        const currentTollRates = await getTollGates();
        setTollRates(currentTollRates);
        const currentTollQuote = automaticTollQuote(
          true,
          currentVehicle,
          routeGeoJSON,
          currentTollRates
        );
        setVehicles(currentPricing.vehicles);
        if (!sameTollQuote(tollEstimate, currentTollQuote)) {
          throw new Error(
            "Toll rates have changed. Review the updated total and submit again."
          );
        }
      }
      const currentDefaults = bookingDefaults(currentPricing.settings);
      const currentRates = currentPricing.settings.handling_surcharges;
      const currentBaseRate = vehicleBaseRate(
        currentVehicle,
        form.distanceKm,
        currentDefaults.minimumBookingFee
      );
      if (
        !vehicleCanCarry(currentVehicle, form.weight) ||
        currentBaseRate === null
      ) {
        setVehicles(currentPricing.vehicles);
        throw new Error(
          "The selected vehicle or its pricing is no longer available for this shipment."
        );
      }
      const currentHandlingCharge = handlingCost(
        currentRates,
        form.specialHandling,
        form.distanceKm
      );
      if (currentHandlingCharge === null) {
        throw new Error(
          "The selected handling price is unavailable. Check pricing settings and route distance."
        );
      }
      if (
        currentDefaults.minimumBookingFee !== pricingDefaults.minimumBookingFee ||
        (!allowanceEdited.current &&
          currentDefaults.driverAllowance !== pricingDefaults.driverAllowance) ||
        currentHandlingCharge !== handlingCharge ||
        currentBaseRate !== baseRate ||
        currentVehicle.pricing.id !== selectedVehicle.pricing.id ||
        Number(currentVehicle.pricing.per_km_rate) !==
          Number(selectedVehicle.pricing.per_km_rate) ||
        Number(currentVehicle.pricing.min_charge) !==
          Number(selectedVehicle.pricing.min_charge)
      ) {
        setHandlingRates(currentRates);
        setPricingDefaults(currentDefaults);
        if (!allowanceEdited.current) {
          draftInitial.current = {
            ...INITIAL_FORM,
            driverAllowance: String(currentDefaults.driverAllowance),
          };
          setForm((previous) => ({
            ...previous,
            driverAllowance: String(currentDefaults.driverAllowance),
          }));
        }
        setVehicles(currentPricing.vehicles);
        throw new Error(
          "Shipment pricing has changed. Review the updated total and submit again."
        );
      }
      const departureError = validateDeparture(
        form.departureDate,
        form.departureTime,
        undefined,
        {
          minLeadTimeHours: resolveVehicleLeadTimeHours(currentVehicle),
          maxAdvanceDays: FTL_MAX_ADVANCE_DAYS,
        }
      );
      if (departureError) throw new Error(departureError);
      const departure = parsePhilippineDeparture(
        form.departureDate,
        form.departureTime
      );

      const shipmentData = {
        ...shipmentRouteFields(
          confirmedPickup,
          confirmedDestination,
          withBookingPricing(routeGeoJSON, form.usesTollRoad, tollEstimate),
          form.estimatedMinutes
        ),
        customer_id: selectedCustomer.id,

        pickup_address: detailedAddress(form, "pickup"),

        dropoff_address: detailedAddress(form, "destination"),

        scheduled_departure: departure.toISOString(),

        estimated_arrival: new Date(
          departure.getTime() +
            (Math.max(0, Number(form.estimatedMinutes) || 0) +
              Math.max(
                0,
                Number(currentVehicle?.loading_buffer_minutes ?? 180)
              )) *
              60000
        ).toISOString(),

        cargo_description: form.cargoDescription.trim(),

        weight_kg: Number(form.weight),

        special_handling: form.specialHandling,
        driver_notes: form.driverNotes.trim() || null,
        requested_vehicle_type_id: currentVehicle.id,
        pricing_rate_id: currentVehicle.pricing.id,
        distance_km: Number(form.distanceKm),

        linehaul_amount:
          suggestedCharge != null
            ? Math.max(
                0,
                Math.round(
                  (Number(suggestedCharge) -
                    (form.usesTollRoad ? (tollEstimate?.total ?? 0) : 0)) *
                    100
                ) / 100
              )
            : null,
        toll_amount: form.usesTollRoad ? (tollEstimate?.total ?? 0) : 0,
        mobilization_fee: 0,
        deadhead_km: 0,
        quoted_amount: suggestedCharge,

        override_amount:
          form.overrideAmount.trim() !== ""
            ? Number(form.overrideAmount)
            : null,

        status: "booked",
        booking_source: "web",
        driver_allowance: Number(form.driverAllowance) || 0,
        toll_fees: form.usesTollRoad ? (tollEstimate?.total ?? 0) : 0,
        created_by: typeof user !== "undefined" && user?.id ? user.id : null,
      };

      const data = await createShipment(shipmentData);

      setCreatedShipment(data);
      setShowSuccessModal(true);

      onCreated?.(data);
    } catch (error) {
      console.error("Create shipment error:", error);

      setSaveError(error.message || "Failed to create shipment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const renderAddressDetails = (type) => (
    <details className="location-details">
      <summary>Building, gate, or landmark details (optional)</summary>
      <div className="location-details-fields">
        {[
          ["Building", "Building or warehouse name", "e.g. Warehouse B"],
          ["Unit", "Unit / floor number", "e.g. Bay 4 / Unit 2"],
          ["Gate", "Gate / entrance number", "e.g. Truck Gate 2"],
          ["Landmark", "Nearby landmark", "e.g. Near MacArthur Hwy"],
        ].map(([key, label, placeholder]) => (
          <label
            key={key}
            className="location-detail-label"
            htmlFor={`shipment-addr-${type}-${key}`}
          >
            {label}
            <input
              id={`shipment-addr-${type}-${key}`}
              name={`${type}${key}`}
              type="text"
              value={form[`${type}${key}`]}
              maxLength={200}
              onChange={(event) => update(`${type}${key}`, event.target.value)}
              placeholder={placeholder}
            />
          </label>
        ))}
      </div>
    </details>
  );

  // STEP FIELD ERROR FLAGS
  const customerHasErr = showFieldError("billingCustomer", 1);
  const pickupHasErr =
    pickerMode !== "pickup" && showFieldError("pickupLocation", 1);
  const destHasErr =
    pickerMode !== "destination" && showFieldError("destination", 1);
  const descHasErr = showFieldError("cargoDescription", 2);
  const weightHasErr = showFieldError("weight", 2);
  const vehicleHasErr = showFieldError("selectedVehicle", 2);
  const departureHasErr = showFieldError("departure", 2);
  const validWeight = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const allowanceHasErr = showFieldError("driverAllowance", 3);
  const overrideHasErr = showFieldError("overrideAmount", 3);
  const overrideDiff =
    form.overrideAmount.trim() !== "" &&
    suggestedCharge != null &&
    isValidMoney(form.overrideAmount)
      ? Number(form.overrideAmount) - suggestedCharge
      : null;

  // LIVE FOOTER SUMMARY TEXT
  const footerSummaryText = (() => {
    if (currentStep === 1) {
      if (isCalculatingRoute) return "Calculating driving route...";
      if (hasValidRoute) {
        return `${form.distanceKm} km · ${formatDuration(form.estimatedMinutes)}`;
      }
      if (routeError) return "Route unavailable · Retry or adjust pins";
      if (
        validCoordinate(confirmedPickup) &&
        validCoordinate(confirmedDestination)
      ) {
        return "Waiting for driving route...";
      }
      return "Pin pickup and destination to calculate distance";
    }
    if (currentStep === 2) {
      if (selectedVehicle) {
        const est = suggestedCharge ?? baseRate;
        return est != null
          ? `${selectedVehicle.name} · Est. ${currency(est)}`
          : selectedVehicle.name;
      }
      return "Select a vehicle type to preview pricing";
    }
    if (tollPending) return "Waiting for matching toll rate";
    return finalCharge != null
      ? `Total billable: ${currency(finalCharge)}`
      : "Review charges before confirming";
  })();

  // MAIN DRAWER
  return (
    <div className="drawer-overlay">
      {showDiscardDialog && (
        <ShipmentDiscardDialog
          onKeepEditing={() => setShowDiscardDialog(false)}
          onDiscard={handleDiscard}
        />
      )}

      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={drawerTitleId}
        className={`drawer-container${currentStep === 3 ? " shipment-review" : ""}${mobilePane === "map" ? " show-mobile-map" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">
          {liveErrorAnnouncement}
        </div>

        {/* LEFT FORM PANEL */}
        <div className="drawer-form-panel">
          <div className="drawer-fixed-header-block">
            <div className="drawer-top-actions">
              <button
                type="button"
                className="back-link-btn"
                onClick={handleCloseAll}
                disabled={isSaving}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Shipments
              </button>

              {isDirty && (
                <button
                  type="button"
                  className="btn-discard-header"
                  onClick={() => setShowDiscardDialog(true)}
                  disabled={isSaving}
                >
                  Discard draft
                </button>
              )}
            </div>

            <div className="drawer-header">
              <h2 id={drawerTitleId}>Create New Shipment</h2>
            </div>

            {/* ACCESSIBLE STEPPER */}
            <nav aria-label="Shipment booking progress">
              <ol className="stepper-list">
                {STEPS.map((step, index) => {
                  const isActive = currentStep === step.number;
                  const isDone = currentStep > step.number;
                  const canJump = step.number <= currentStep + 1 || isDone;
                  return (
                    <li
                      key={step.number}
                      className={`stepper-list-item${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
                    >
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-current={isActive ? "step" : undefined}
                        disabled={!canJump || isSaving}
                        onClick={() => handleStepSelect(step.number)}
                      >
                        <span className="step-num" aria-hidden="true">
                          {isDone ? "✓" : step.number}
                        </span>
                        <span className="step-label">{step.label}</span>
                      </button>
                      {index < STEPS.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={`step-line${currentStep > step.number ? " active-line" : ""}`}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* MOBILE / NARROW VIEWPORT PANE SWITCHER */}
            <div
              className="mobile-pane-toggle"
              role="group"
              aria-label="Booking workspace view"
            >
              <button
                type="button"
                aria-pressed={mobilePane === "form"}
                className={`mobile-pane-btn${mobilePane === "form" ? " is-active" : ""}`}
                onClick={() => setMobilePane("form")}
              >
                Booking Form
              </button>
              <button
                type="button"
                aria-pressed={mobilePane === "map"}
                className={`mobile-pane-btn${mobilePane === "map" ? " is-active" : ""}`}
                onClick={() => setMobilePane("map")}
              >
                Route Map{confirmedPickup && confirmedDestination ? " (Pinned)" : ""}
              </button>
            </div>
          </div>

          <form
            className="drawer-form-shell"
            noValidate
            aria-labelledby={drawerTitleId}
            onSubmit={(event) => {
              event.preventDefault();
              if (currentStep < 3) {
                handleNext();
              } else {
                handleCreateShipment();
              }
            }}
          >
            <div ref={formBodyRef} className="drawer-form-body-scrollable">
              {/* STEP 1: CLIENT & ROUTE */}
              {currentStep === 1 && (
                <div className="step-scroll-content">
        <h3
          ref={stepHeadingRef}
          tabIndex={-1}
          className="step-section-heading"
        >
          1. Client and route locations
        </h3>

        {/* CUSTOMER BILLING */}
        <fieldset className="drawer-fieldset">
          <legend className="fieldset-legend">Client billing</legend>
          <div className="form-group">
            <label className="input-title" htmlFor="shipment-billing-customer">
              Registered Customer <span className="required-star" aria-hidden="true">*</span>
            </label>
            <p id="customer-field-hint" className="field-hint-above">
              Active registered billing customers only. Driver and office accounts are excluded.
            </p>
            <CustomerCombobox
              inputId="shipment-billing-customer"
              name="billingCustomer"
              customers={customers}
              value={form.billingCustomer}
              loading={loadingCustomers}
              error={customerError}
              disabled={isSaving}
              required
              ariaInvalid={customerHasErr}
              ariaDescribedBy={
                customerHasErr
                  ? "customer-field-hint customer-field-error"
                  : "customer-field-hint"
              }
              onBlur={(event) => handleFieldBlur("billingCustomer", event)}
              onChange={(customerId) => {
                update("billingCustomer", customerId);
                setTouched((previous) => ({
                  ...previous,
                  billingCustomer: Boolean(customerId),
                }));
              }}
            />
            {customerHasErr && (
              <p id="customer-field-error" className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {rawFieldErrors.billingCustomer}
                </span>
              </p>
            )}
          </div>
        </fieldset>

        {/* ROUTE LOCATIONS */}
        <fieldset className="drawer-fieldset">
          <legend className="fieldset-legend">Route locations</legend>

          {/* PICKUP */}
          <div ref={pickupGroupRef} className="form-group">
            <div className="field-label-row">
              <label className="input-title" htmlFor="shipment-pickup-location">
                Pick-up Location <span className="required-star" aria-hidden="true">*</span>
              </label>
              <span
                className={`pin-status-badge ${
                  confirmedPickup ? "is-confirmed" : "is-pending"
                }`}
              >
                {confirmedPickup ? "Pinned on map" : "Select suggestion or pin"}
              </span>
            </div>

            <AddressAutocomplete
              inputId="shipment-pickup-location"
              name="pickupLocation"
              placeholder="Search Luzon pickup address or port"
              value={form.pickupLocation}
              disabled={isResolvingAddress || isSaving}
              required
              clearLabel="Clear pickup address"
              ariaInvalid={pickupHasErr}
              ariaDescribedBy={
                pickupHasErr
                  ? "pickup-hint pickup-error"
                  : "pickup-hint"
              }
              onBlur={(event) => handleFieldBlur("pickupLocation", event)}
              onClear={() => {
                update("pickupLocation", "");
                setConfirmedPickup(null);
                setTouched((previous) => ({
                  ...previous,
                  pickupLocation: false,
                }));
              }}
              onSelect={(feature) => {
                selectAddress("pickup", feature);
                setTouched((previous) => ({ ...previous, pickupLocation: true }));
              }}
              onChange={(value) => update("pickupLocation", value)}
            />

            <p id="pickup-hint" className="field-hint-text">
              Pick a suggestion from the search dropdown, select a quick port hub, or pin the exact truck entrance on the map.
            </p>

            {pickupHasErr && (
              <p id="pickup-error" className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {rawFieldErrors.pickupLocation}
                </span>
              </p>
            )}

            <div className="location-actions-row">
              <button
                type="button"
                className={`view-map-text-btn${pickerMode === "pickup" ? " is-active" : ""}`}
                disabled={isResolvingAddress || isSaving}
                onClick={() => {
                  const next = pickerMode === "pickup" ? null : "pickup";
                  if (next === "pickup") {
                    setTouched((previous) => ({
                      ...previous,
                      pickupLocation: false,
                    }));
                  }
                  setPickerMode(next);
                  setMobilePane(next ? "map" : "form");
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {pickerMode === "pickup"
                  ? "Exit pickup pin mode"
                  : confirmedPickup
                    ? "Adjust pickup pin on map"
                    : "Pin pickup on map"}
              </button>
            </div>

            <div className="hub-pills-row" role="group" aria-label="Quick pickup port hubs">
              {HUBS.map((hub) => (
                <button
                  key={`pickup-${hub.label}`}
                  data-hub={hub.label}
                  type="button"
                  disabled={isResolvingAddress || isSaving}
                  className={`hub-pill ${form.pickupLocation === hub.value ? "active" : ""}`}
                  onClick={() => handleSelectHub("pickup", hub)}
                >
                  {hub.label}
                </button>
              ))}
            </div>
            {renderAddressDetails("pickup")}
          </div>

          {/* SWAP PICKUP & DESTINATION */}
          <div className="route-swap-row">
            <button
              type="button"
              className="route-swap-btn"
              disabled={
                isResolvingAddress ||
                isSaving ||
                (!form.pickupLocation.trim() && !form.destination.trim())
              }
              onClick={handleSwapLocations}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="7 16 3 12 7 8" />
                <line x1="21" y1="12" x2="3" y2="12" />
                <polyline points="17 8 21 12 17 16" />
              </svg>
              Swap pickup and destination
            </button>
          </div>

          {/* DESTINATION */}
          <div ref={destinationGroupRef} className="form-group">
            <div className="field-label-row">
              <label className="input-title" htmlFor="shipment-destination-location">
                Destination <span className="required-star" aria-hidden="true">*</span>
              </label>
              <span
                className={`pin-status-badge ${
                  confirmedDestination ? "is-confirmed" : "is-pending"
                }`}
              >
                {confirmedDestination ? "Pinned on map" : "Select suggestion or pin"}
              </span>
            </div>

            <AddressAutocomplete
              inputId="shipment-destination-location"
              name="destination"
              placeholder="Search Luzon delivery address or port"
              value={form.destination}
              disabled={isResolvingAddress || isSaving}
              required
              clearLabel="Clear destination address"
              ariaInvalid={destHasErr}
              ariaDescribedBy={
                destHasErr
                  ? "destination-hint destination-error"
                  : "destination-hint"
              }
              onBlur={(event) => handleFieldBlur("destination", event)}
              onClear={() => {
                update("destination", "");
                setConfirmedDestination(null);
                setTouched((previous) => ({
                  ...previous,
                  destination: false,
                }));
              }}
              onSelect={(feature) => {
                selectAddress("destination", feature);
                setTouched((previous) => ({ ...previous, destination: true }));
              }}
              onChange={(value) => update("destination", value)}
            />

            <p id="destination-hint" className="field-hint-text">
              Pick a suggestion, select a quick port hub, or pin the exact delivery gate on the map.
            </p>

            {destHasErr && (
              <p id="destination-error" className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {rawFieldErrors.destination}
                </span>
              </p>
            )}

            <div className="location-actions-row">
              <button
                type="button"
                className={`view-map-text-btn${pickerMode === "destination" ? " is-active" : ""}`}
                disabled={isResolvingAddress || isSaving}
                onClick={() => {
                  const next = pickerMode === "destination" ? null : "destination";
                  if (next === "destination") {
                    setTouched((previous) => ({
                      ...previous,
                      destination: false,
                    }));
                  }
                  setPickerMode(next);
                  setMobilePane(next ? "map" : "form");
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {pickerMode === "destination"
                  ? "Exit destination pin mode"
                  : confirmedDestination
                    ? "Adjust delivery pin on map"
                    : "Pin destination on map"}
              </button>
            </div>

            <div className="hub-pills-row" role="group" aria-label="Quick destination port hubs">
              {HUBS.map((hub) => (
                <button
                  key={`dropoff-${hub.label}`}
                  data-hub={hub.label}
                  type="button"
                  disabled={isResolvingAddress || isSaving}
                  className={`hub-pill ${form.destination === hub.value ? "active" : ""}`}
                  onClick={() => handleSelectHub("destination", hub)}
                >
                  {hub.label}
                </button>
              ))}
            </div>
            {renderAddressDetails("destination")}
          </div>
        </fieldset>

        {/* ROUTE SUMMARY & EXPRESSWAY TOGGLE */}
        <div className="route-summary-card">
          <div className="summary-header">
            <h4>Driving Route Summary</h4>
            {verifiedExpressway && (
              <span className="toll-badge">EXPRESSWAY</span>
            )}
          </div>

          {verifiedExpressway && (
            <p className="field-info-text expressway-route-status">
              <strong>{verifiedExpressway.distanceKm} km on expressways</strong>
              {verifiedExpressway.roadNames?.length > 0 && (
                <> · {verifiedExpressway.roadNames.join(" · ")}</>
              )}
            </p>
          )}

          <div className="summary-timeline">
            <div className="timeline-node blue-node">
              {detailedAddress(form, "pickup") || "Pickup location not set"}
            </div>
            <div className="timeline-node orange-node">
              {detailedAddress(form, "destination") || "Destination not set"}
            </div>
          </div>

          <div className="summary-footer-metrics">
            <div>
              <span className="metric-label">Distance</span>
              <strong
                className={`metric-val tabular-nums${
                  !isCalculatingRoute && routeError && form.distanceKm === ""
                    ? " is-unavailable"
                    : ""
                }`}
              >
                {isCalculatingRoute
                  ? "Calculating..."
                  : form.distanceKm !== ""
                    ? `${form.distanceKm} km`
                    : routeError
                      ? "Unavailable"
                      : "Pending"}
              </strong>
            </div>

            <div>
              <span className="metric-label">Drive Time</span>
              <strong
                className={`metric-val tabular-nums${
                  !isCalculatingRoute &&
                  routeError &&
                  form.estimatedMinutes === ""
                    ? " is-unavailable"
                    : ""
                }`}
              >
                {isCalculatingRoute
                  ? "Calculating..."
                  : form.estimatedMinutes !== ""
                    ? formatDuration(form.estimatedMinutes)
                    : routeError
                      ? "Unavailable"
                      : "Pending"}
              </strong>
            </div>

            <button
              type="button"
              className="view-map-text-btn"
              disabled={!hasValidRoute}
              title={
                hasValidRoute
                  ? "Fit the full driving route and both pins on the map"
                  : "Calculate a valid driving route first"
              }
              onClick={() => {
                setPickerMode(null);
                setFullRouteViewRequest((previous) => previous + 1);
                setMobilePane("map");
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              Fit full route
            </button>
          </div>

          <div className="toll-toggle-box">
            <label className="toll-checkbox-label" htmlFor="shipment-uses-toll-road">
              <input
                id="shipment-uses-toll-road"
                name="usesTollRoad"
                type="checkbox"
                checked={form.usesTollRoad}
                disabled={isSaving}
                onChange={(event) => update("usesTollRoad", event.target.checked)}
              />
              <span>Use toll roads and expressways (NLEX, SCTEX, TPLEX, SLEX, Skyway)</span>
            </label>
            <p className="field-hint-text">
              {form.usesTollRoad
                ? "Verified expressways are routed and matched against configured toll gates in Step 3."
                : "Avoids tollways where possible. Toggling recalculates distance and drive time."}
            </p>
          </div>
        </div>

        {/* LIVE ROUTE STATUS */}
        {isCalculatingRoute && (
          <p className="route-status-banner is-loading" role="status">
            <svg className="shipment-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Calculating road-only truck route...</span>
          </p>
        )}

        {routeGeoJSON && !isCalculatingRoute && (
          <p className="route-status-banner is-success" role="status">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Road route verified ({form.distanceKm} km, {formatDuration(form.estimatedMinutes)}).</span>
          </p>
        )}

        {routeNotice && (
          <p className="route-status-banner is-info" role="status">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{routeNotice}</span>
          </p>
        )}

        {displayRouteError && (
          <div className="route-status-banner is-error" role="alert">
            <div className="route-status-content">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{displayRouteError}</span>
            </div>
            <button
              type="button"
              className="route-retry-btn"
              disabled={isCalculatingRoute || isSaving}
              onClick={handleRetryRoute}
            >
              Retry route
            </button>
          </div>
        )}
      </div>
              )}

              {/* STEP 2: CARGO, VEHICLE & SCHEDULE */}
              {currentStep === 2 && (
                <div className="step-scroll-content">
        <h3
          ref={stepHeadingRef}
          tabIndex={-1}
          className="step-section-heading"
        >
          2. Cargo, vehicle type, and pickup schedule
        </h3>

        {/* CARGO DETAILS */}
        <fieldset className="drawer-fieldset">
          <legend className="fieldset-legend">Cargo details</legend>

          <div className="form-group">
            <label className="input-title" htmlFor="shipment-cargo-description">
              Cargo Description <span className="required-star" aria-hidden="true">*</span>
            </label>
            <textarea
              id="shipment-cargo-description"
              name="cargoDescription"
              className={`form-textarea${descHasErr ? " is-field-invalid" : ""}`}
              rows={2}
              required
              aria-invalid={descHasErr ? "true" : "false"}
              aria-describedby={descHasErr ? "cargo-desc-error" : undefined}
              placeholder="e.g. Palletized dry goods, construction materials, cold beverages"
              value={form.cargoDescription}
              onBlur={() => handleFieldBlur("cargoDescription")}
              onChange={(event) => update("cargoDescription", event.target.value)}
            />
            {descHasErr && (
              <p id="cargo-desc-error" className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {rawFieldErrors.cargoDescription}
                </span>
              </p>
            )}
          </div>

          <div className="form-group">
            <div className="field-label-row">
              <label className="input-title" htmlFor="shipment-total-weight">
                Total Cargo Weight (kg) <span className="required-star" aria-hidden="true">*</span>
              </label>
              {validWeight && parsedWeight >= 1000 && (
                <span className="tonnage-readout tabular-nums">
                  = {(parsedWeight / 1000).toFixed(2)} metric tons
                </span>
              )}
            </div>

            <div className="input-search-wrapper">
              <input
                id="shipment-total-weight"
                name="weight"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                aria-invalid={weightHasErr ? "true" : "false"}
                aria-describedby={
                  weightHasErr ? "weight-hint weight-error" : "weight-hint"
                }
                className={`shipment-weight-input${weightHasErr ? " is-field-invalid" : ""}`}
                placeholder="Enter weight in kg"
                value={form.weight}
                onBlur={() => handleFieldBlur("weight")}
                onChange={(event) => update("weight", event.target.value)}
              />
              <span className="trailing-unit" aria-hidden="true">
                kg
              </span>
            </div>
            <p id="weight-hint" className="field-hint-text">
              Overweight trucks are blocked. Larger truck types remain selectable for bulky but light FTL cargo.
            </p>
            {weightHasErr && (
              <p id="weight-error" className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {rawFieldErrors.weight}
                </span>
              </p>
            )}
          </div>

          {/* SPECIAL HANDLING (Native Radio Group) */}
          <fieldset className="sub-fieldset">
            <legend className="input-title">Special Handling</legend>
            {handlingPricingError && (
              <p role="alert" className="field-error-text">
                {handlingPricingError}
              </p>
            )}
            {!handlingRates && !handlingPricingError && (
              <p className="field-info-text" role="status">
                Loading handling surcharge prices...
              </p>
            )}
            <div className="handling-badges-row">
              {HANDLING_OPTIONS.map((option) => {
                const optionRate = handlingRates?.[option.id];
                const computedFee =
                  optionRate != null && form.distanceKm !== ""
                    ? handlingCost(handlingRates, option.label, form.distanceKm)
                    : null;
                const priceLabel =
                  optionRate == null
                    ? "Unavailable"
                    : computedFee != null
                      ? currency(computedFee)
                      : `${currency(optionRate)}${option.perKm ? "/km" : ""}`;
                const isSelected = form.specialHandling === option.label;
                const optionDisabled = optionRate == null || isSaving;

                return (
                  <label
                    key={option.id}
                    className={`handling-badge-btn${isSelected ? " active" : ""}${optionDisabled ? " is-disabled" : ""}`}
                  >
                    <input
                      type="radio"
                      name="specialHandling"
                      className="visually-hidden"
                      value={option.label}
                      checked={isSelected}
                      disabled={optionDisabled}
                      onChange={() => update("specialHandling", option.label)}
                    />
                    <span>{option.label}</span>
                    <span className="handling-price-pill tabular-nums">
                      {priceLabel}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </fieldset>

        {/* VEHICLE TYPE SELECTION (Native Radio Cards) */}
        <fieldset
          className="drawer-fieldset"
          aria-describedby={vehicleHasErr ? "vehicle-type-error" : undefined}
        >
          <legend className="fieldset-legend">
            Vehicle type <span className="required-star" aria-hidden="true">*</span>
          </legend>

          <div className="vehicle-header-row">
            <span className="field-hint-text">
              {validWeight
                ? `Evaluating capacity for ${parsedWeight.toLocaleString()} kg.`
                : "Select a vehicle type or enter cargo weight above to check payload fit."}
            </span>
          </div>

          {vehicles.length > 0 &&
            vehicles.every((vehicle) => vehicleBaseRate(vehicle, 0) === null) && (
              <p className="field-error-text" role="alert">
                No active vehicle pricing is configured. Add vehicle rates in Settings: Pricing before booking.
              </p>
            )}

          {vehicles.length === 0 && !handlingPricingError && (
            <p className="field-info-text" role="status">
              Loading vehicle types and fleet readiness...
            </p>
          )}

          <div className="vehicle-selection-grid">
            {vehicles.map((truck) => {
              const truckCapacity = Number(truck.default_capacity_kg);
              const fit = classifyVehicleWeightFit(truck, form.weight);
              const missingPrice = vehicleBaseRate(truck, 0) === null;
              const estLinehaul =
                pricingDefaults && form.distanceKm !== ""
                  ? vehicleBaseRate(
                      truck,
                      form.distanceKm,
                      pricingDefaults.minimumBookingFee
                    )
                  : null;
              const unavailable = fit === "overweight" || missingPrice;
              const selected = form.selectedVehicle === truck.id && !unavailable;
              const leadHours = resolveVehicleLeadTimeHours(truck);
              const bufferMins = resolveVehicleLoadingBufferMinutes(truck);
              const tollClass = vehicleTollClass(truck) || "Unconfigured toll class";

              let fitTag = null;
              if (fit === "overweight") {
                fitTag = { cls: "is-danger", text: "Exceeds capacity" };
              } else if (missingPrice) {
                fitTag = { cls: "is-danger", text: "Pricing unavailable" };
              } else if (fit === "best_fit") {
                fitTag = { cls: "is-info", text: "Best weight fit" };
              } else if (fit === "oversized") {
                fitTag = { cls: "is-neutral", text: "Bulky cargo fit" };
              }

              let fleetNote = "Fleet readiness unavailable";
              if (truck.fleetCapacityKnown) {
                if (!truck.registeredTruckCount) {
                  fleetNote = "No units registered (booking awaits assignment)";
                } else {
                  const avail = truck.availableTruckCount ?? 0;
                  const maxCap = truck.registeredMaxCapacityKg
                    ? `, max unit ${truck.registeredMaxCapacityKg.toLocaleString()} kg`
                    : "";
                  fleetNote = `${avail} of ${truck.registeredTruckCount} unit${truck.registeredTruckCount === 1 ? "" : "s"} currently available${maxCap}`;
                }
              }

              const noRegisteredCapable =
                validWeight &&
                truck.fleetCapacityKnown &&
                (truck.registeredMaxCapacityKg == null ||
                  truck.registeredMaxCapacityKg < parsedWeight);

              return (
                <label
                  key={truck.id}
                  className={`vehicle-card${unavailable ? " disabled" : " searchable"}${selected ? " active" : ""}`}
                >
                  <input
                    type="radio"
                    name="selectedVehicle"
                    className="visually-hidden"
                    value={truck.id}
                    checked={selected}
                    disabled={unavailable || isSaving}
                    data-invalid={
                      vehicleHasErr && !selectedVehicle ? "true" : undefined
                    }
                    onChange={() => handleSelectVehicle(truck)}
                  />

                  <div className="vehicle-card-icon">
                    <SafeVehicleSilhouette category={truck.name} size="md" />
                  </div>

                  <div className="vehicle-card-details">
                    <div className="vehicle-title-line">
                      <span className="vehicle-card-name">{truck.name}</span>
                      <span className="vehicle-est-price tabular-nums">
                        {missingPrice
                          ? "No rate"
                          : estLinehaul != null
                            ? `${currency(estLinehaul)} est.`
                            : `${currency(truck.pricing.per_km_rate)}/km`}
                      </span>
                    </div>

                    <p className="vehicle-spec-line tabular-nums">
                      Up to {truckCapacity.toLocaleString()} kg · {tollClass} · {leadHours}h lead · {formatDuration(bufferMins)} load buffer
                    </p>

                    <p className="vehicle-fleet-line">
                      {fleetNote}
                    </p>

                    {noRegisteredCapable && !unavailable && (
                      <p className="vehicle-warning-inline" role="status">
                        No single registered unit matches {parsedWeight.toLocaleString()} kg yet; booking will await assignment.
                      </p>
                    )}

                    <div className="vehicle-badges-row">
                      {!missingPrice && (
                        <span className="vehicle-tag blue-tag tabular-nums">
                          Min {currency(truck.pricing.min_charge)} · {currency(truck.pricing.per_km_rate)}/km
                        </span>
                      )}
                      {fitTag && (
                        <span className={`vehicle-fit-badge ${fitTag.cls}`}>
                          {fitTag.text}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {vehicleHasErr && (
            <p id="vehicle-type-error" className="field-error-text">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                <span className="sr-only">Error: </span>
                {rawFieldErrors.selectedVehicle}
              </span>
            </p>
          )}
        </fieldset>

        {/* PICKUP SCHEDULE */}
        <fieldset className="drawer-fieldset">
          <legend className="fieldset-legend">
            Pickup schedule <span className="required-star" aria-hidden="true">*</span>
          </legend>

          <p id="departure-timezone" className="field-hint-above tabular-nums">
            Requires at least {activeLeadTimeHours}h lead time (up to {FTL_MAX_ADVANCE_DAYS} days ahead, Philippine time). Earliest valid slot: {scheduleLimits.earliestDate} {scheduleLimits.earliestTime} PHT.
          </p>

          <div
            className="schedule-presets-row"
            role="group"
            aria-label="Quick pickup schedule presets"
          >
            {schedulePresets.map((preset) => {
              const isPresetActive =
                form.departureDate === preset.date &&
                form.departureTime === preset.time;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isSaving}
                  className={`hub-pill${isPresetActive ? " active" : ""}`}
                  onClick={() => handleApplySchedulePreset(preset)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="form-grid-2x2">
            <div className="form-group">
              <label className="input-title" htmlFor="shipment-departure-date">
                Departure Date
              </label>
              <div className="input-search-wrapper">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <input
                  id="shipment-departure-date"
                  name="departureDate"
                  type="date"
                  required
                  value={form.departureDate}
                  min={scheduleLimits.earliestDate}
                  max={scheduleLimits.latestDate}
                  aria-invalid={departureHasErr ? "true" : "false"}
                  aria-describedby={
                    departureHasErr
                      ? "departure-timezone departure-schedule-error"
                      : "departure-timezone"
                  }
                  className={departureHasErr ? "is-field-invalid" : undefined}
                  onBlur={() => handleFieldBlur("departure")}
                  onChange={(event) => update("departureDate", event.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="input-title" htmlFor="shipment-departure-time">
                Departure Time (PHT)
              </label>
              <div className="input-search-wrapper">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <input
                  id="shipment-departure-time"
                  name="departureTime"
                  type="time"
                  required
                  value={form.departureTime}
                  step={60}
                  min={isEarliestDay ? scheduleLimits.earliestTime : undefined}
                  aria-invalid={departureHasErr ? "true" : "false"}
                  aria-describedby={
                    departureHasErr
                      ? "departure-timezone departure-schedule-error"
                      : "departure-timezone"
                  }
                  className={departureHasErr ? "is-field-invalid" : undefined}
                  onBlur={() => handleFieldBlur("departure")}
                  onChange={(event) => update("departureTime", event.target.value)}
                />
              </div>
            </div>
          </div>

          {scheduleError && (departureHasErr || Boolean(selectedVehicle)) && (
            <div id="departure-schedule-error" className="schedule-mismatch-box" role="alert">
              <p className="field-error-text">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <span className="sr-only">Error: </span>
                  {scheduleError}
                </span>
              </p>
              <button
                type="button"
                className="btn-shift-slot"
                disabled={isSaving}
                onClick={handleShiftToEarliestSlot}
              >
                Shift to earliest valid slot ({scheduleLimits.earliestDate} {scheduleLimits.earliestTime} PHT)
              </button>
            </div>
          )}

          {estimatedArrivalIso && !scheduleError && (
            <p className="eta-preview-pill tabular-nums">
              Estimated Arrival:{" "}
              <strong>
                {new Date(estimatedArrivalIso).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}{" "}
                PHT
              </strong>{" "}
              ({formatDuration(form.estimatedMinutes)} drive + {formatDuration(activeLoadingBufferMinutes)} load buffer)
            </p>
          )}
        </fieldset>

        {/* DRIVER NOTES */}
        <div className="form-group">
          <label className="input-title" htmlFor="shipment-driver-notes">
            Notes to Driver (optional)
          </label>
          <textarea
            id="shipment-driver-notes"
            name="driverNotes"
            className="form-textarea"
            rows={2}
            placeholder="Gate pass instructions, dock contact, or loading notes"
            value={form.driverNotes}
            onChange={(event) => update("driverNotes", event.target.value)}
          />
        </div>
      </div>
              )}

              {/* STEP 3: REVIEW & PRICING */}
              {currentStep === 3 && (
                <div className="step-scroll-content">
        <h3
          ref={stepHeadingRef}
          tabIndex={-1}
          className="step-section-heading"
        >
          3. Review booking and finalize pricing
        </h3>

        <div className="review-alert-banner">
          <svg className="alert-banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p>
            Confirm details and charges below. The system automatically assigns an eligible driver and truck matching the vehicle type and payload capacity when available; otherwise, the booking awaits manual dispatch assignment.
          </p>
        </div>

        <div className="review-two-col">
          {/* LEFT COLUMN: SHIPMENT DETAILS */}
          <div className="review-col-stack">
            <section className="review-card" aria-label="Client and schedule summary">
              <div className="review-card-header">
                <h4>Client and Schedule</h4>
                <div className="review-edit-links">
                  <button
                    type="button"
                    className="review-edit-btn"
                    onClick={() => setCurrentStep(1)}
                  >
                    Edit client
                  </button>
                  <button
                    type="button"
                    className="review-edit-btn"
                    onClick={() => setCurrentStep(2)}
                  >
                    Edit schedule
                  </button>
                </div>
              </div>

              <dl className="review-kv-list">
                <div>
                  <dt>Billing Customer</dt>
                  <dd>{customerName(selectedCustomer)}</dd>
                </div>
                <div>
                  <dt>Scheduled Departure</dt>
                  <dd className="tabular-nums">
                    {formatPhilippineDateTime(form.departureDate, form.departureTime)}
                  </dd>
                </div>
                {estimatedArrivalIso && (
                  <div>
                    <dt>Estimated Arrival</dt>
                    <dd className="tabular-nums">
                      {new Date(estimatedArrivalIso).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      PHT ({formatDuration(form.estimatedMinutes)} drive + {formatDuration(activeLoadingBufferMinutes)} buffer)
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="review-card" aria-label="Route and expressway summary">
              <div className="review-card-header">
                <h4>Route and Expressways</h4>
                <button
                  type="button"
                  className="review-edit-btn"
                  onClick={() => setCurrentStep(1)}
                >
                  Edit route
                </button>
              </div>

              <div className="review-timeline-display">
                <div className="review-node blue-dot">
                  <span>Pick-up</span>
                  <strong>{detailedAddress(form, "pickup")}</strong>
                </div>
                <div className="review-node orange-dot">
                  <span>Destination</span>
                  <strong>{detailedAddress(form, "destination")}</strong>
                </div>
              </div>

              <div className="review-inline-pills tabular-nums">
                <span className="info-inline-pill">
                  {form.distanceKm ? `${form.distanceKm} km` : "Distance not set"}
                </span>
                <span className="info-inline-pill">
                  {form.estimatedMinutes
                    ? formatDuration(form.estimatedMinutes)
                    : "Drive time not set"}
                </span>
                {verifiedExpressway && (
                  <span className="info-inline-pill highlight-orange">
                    EXPRESSWAY ({verifiedExpressway.distanceKm} km)
                  </span>
                )}
              </div>

              <div className="toll-toggle-box is-compact">
                <label className="toll-checkbox-label" htmlFor="review-uses-toll-road">
                  <input
                    id="review-uses-toll-road"
                    type="checkbox"
                    checked={form.usesTollRoad}
                    disabled={isSaving || isCalculatingRoute}
                    onChange={(event) => update("usesTollRoad", event.target.checked)}
                  />
                  <span>Use toll roads and expressways</span>
                </label>
              </div>
              {isCalculatingRoute && (
                <p className="field-info-text" role="status">
                  Recalculating route and toll segments...
                </p>
              )}
              {routeNotice && (
                <p className="field-info-text" role="status">
                  {routeNotice}
                </p>
              )}
              {routeError && (
                <p className="field-error-text" role="alert">
                  {routeError}
                </p>
              )}
            </section>

            <section className="review-card" aria-label="Cargo and vehicle summary">
              <div className="review-card-header">
                <h4>Cargo and Vehicle Type</h4>
                <button
                  type="button"
                  className="review-edit-btn"
                  onClick={() => setCurrentStep(2)}
                >
                  Edit cargo
                </button>
              </div>

              <div className="assigned-entity-card">
                <div className="entity-icon-box">
                  <SafeVehicleSilhouette category={selectedVehicle?.name} size="md" />
                </div>
                <div className="entity-info-box">
                  <h5>{selectedVehicle?.name || "Not selected"}</h5>
                  <p className="tabular-nums">
                    {selectedVehicle?.pricing
                      ? `${currency(selectedVehicle.pricing.per_km_rate)}/km · Min ${currency(selectedVehicle.pricing.min_charge)}`
                      : "No vehicle pricing selected"}
                  </p>
                </div>
                <span className="auto-assign-tag">
                  {vehicleTollClass(selectedVehicle) || "No toll class"}
                </span>
              </div>

              <dl className="review-kv-list">
                <div>
                  <dt>Weight and Handling</dt>
                  <dd className="tabular-nums">
                    {Number(form.weight || 0).toLocaleString()} kg · {form.specialHandling}
                  </dd>
                </div>
                <div>
                  <dt>Cargo Description</dt>
                  <dd>{form.cargoDescription}</dd>
                </div>
                <div>
                  <dt>Driver Notes</dt>
                  <dd>{form.driverNotes.trim() || "None"}</dd>
                </div>
                <div>
                  <dt>Dispatch Assignment</dt>
                  <dd>
                    Automatic check on confirmation (assigns an eligible driver and truck if available).
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {/* RIGHT COLUMN: PRICING & MARGIN */}
          <div className="review-col-stack">
            <section
              className="financial-statement-card cost-charge-blue"
              aria-label="Customer shipment charge"
            >
              <div className="financial-header-row">
                <h4>Customer Charge</h4>
                <span className="financial-badge-tag orange-bg">
                  BILLABLE TOTAL
                </span>
              </div>

              <dl className="financial-dl-list tabular-nums">
                <div className="financial-data-row">
                  <dt>Base Rate (Linehaul)</dt>
                  <dd>
                    {baseRate != null ? currency(baseRate) : "Awaiting route and pricing"}
                  </dd>
                </div>
                <div className="financial-data-row">
                  <dt>Special Handling ({form.specialHandling})</dt>
                  <dd>
                    {handlingCharge != null ? currency(handlingCharge) : "Unavailable"}
                  </dd>
                </div>
                <div className="financial-data-row">
                  <dt>Expressway Tolls</dt>
                  <dd className={tollPending ? "toll-pending-text" : undefined}>
                    {tollPending ? "Fee pending" : currency(tollCost)}
                  </dd>
                </div>
              </dl>

              {form.usesTollRoad && (
                <TollPricingPanel
                  rates={tollRates}
                  loading={tollRatesLoading}
                  error={tollRatesError}
                  vehicleClass={vehicleTollClass(selectedVehicle)}
                  vehicleName={selectedVehicle?.name}
                  sections={
                    routeGeoJSON?.features?.find(
                      (feature) => feature.properties?.expressway
                    )?.properties.expressway.sections || []
                  }
                  matchedRates={tollEstimate?.rates || []}
                  total={tollPending ? null : tollCost}
                  validationError={tollEstimateError}
                  disabled={isSaving}
                  currency={currency}
                  onRefresh={() => {
                    setTollRatesLoading(true);
                    setTollRatesError("");
                    setTollReload((value) => value + 1);
                  }}
                />
              )}

              <div className="financial-total-row tabular-nums">
                <span>
                  {tollPending ? "Subtotal before tolls" : "Suggested Total Charge"}
                </span>
                <span className="total-price-text">
                  {currency(tollPending ? shipmentSubtotal : suggestedCharge)}
                </span>
              </div>

              {tollPending && (
                <p className="toll-total-notice">
                  Final total waits for matching expressway entry and exit toll rates.
                </p>
              )}

              <div className="override-input-group">
                <label className="override-label" htmlFor="shipment-override-amount">
                  Override Customer Price (₱, optional)
                </label>
                <input
                  id="shipment-override-amount"
                  name="overrideAmount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-invalid={overrideHasErr ? "true" : "false"}
                  aria-describedby={
                    overrideHasErr
                      ? "override-hint override-error"
                      : "override-hint"
                  }
                  className={`override-text-field tabular-nums${overrideHasErr ? " is-field-invalid" : ""}`}
                  placeholder={
                    tollPending
                      ? "Waiting for matching toll fee"
                      : `Leave blank for ${currency(suggestedCharge)}`
                  }
                  disabled={tollPending || isSaving}
                  value={form.overrideAmount}
                  onBlur={() => handleFieldBlur("overrideAmount")}
                  onChange={(event) => update("overrideAmount", event.target.value)}
                />
                <p id="override-hint" className="field-hint-text tabular-nums">
                  {overrideDiff !== null
                    ? `Custom adjustment vs. suggested total: ${overrideDiff >= 0 ? "+" : "-"}${currency(Math.abs(overrideDiff))}`
                    : "Leave blank to bill the suggested total."}
                </p>
                {overrideHasErr && (
                  <p id="override-error" className="field-error-text">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      <span className="sr-only">Error: </span>
                      {rawFieldErrors.overrideAmount}
                    </span>
                  </p>
                )}
              </div>
            </section>

            <section
              className="financial-statement-card operational-grey"
              aria-label="Operational cost and estimated margin"
            >
              <div className="financial-header-row">
                <h4>Trip Estimate and Margin</h4>
                <span className="financial-badge-tag grey-bg">
                  OPERATIONAL COST
                </span>
              </div>

              <dl className="financial-dl-list tabular-nums">
                <div className="financial-data-row">
                  <dt>Expressway Tolls</dt>
                  <dd className={tollPending ? "toll-pending-text" : undefined}>
                    {tollPending ? "Fee pending" : currency(tollCost)}
                  </dd>
                </div>
              </dl>

              <div className="allowance-edit-row">
                <label className="override-label" htmlFor="shipment-driver-allowance">
                  Driver Allowance (₱)
                </label>
                <input
                  id="shipment-driver-allowance"
                  name="driverAllowance"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-invalid={allowanceHasErr ? "true" : "false"}
                  aria-describedby={
                    allowanceHasErr
                      ? "allowance-hint allowance-error"
                      : "allowance-hint"
                  }
                  className={`override-text-field tabular-nums${allowanceHasErr ? " is-field-invalid" : ""}`}
                  value={form.driverAllowance}
                  onBlur={() => handleFieldBlur("driverAllowance")}
                  onChange={(event) => update("driverAllowance", event.target.value)}
                />
                <p id="allowance-hint" className="field-hint-text">
                  Defaults from Settings: Pricing; editable for this trip.
                </p>
                {allowanceHasErr && (
                  <p id="allowance-error" className="field-error-text">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      <span className="sr-only">Error: </span>
                      {rawFieldErrors.driverAllowance}
                    </span>
                  </p>
                )}
              </div>

              <div className="financial-total-row tabular-nums">
                <span>
                  {tollPending ? "Allowance subtotal" : "Total Operational Cost"}
                </span>
                <span className="total-price-text-sm">
                  {currency(tollPending ? driverAllowance : operationalCost)}
                </span>
              </div>

              {tollPending ? (
                <div className="profit-box is-pending">
                  <strong>Margin estimate pending</strong>
                  <p>Available once expressway toll fees are resolved.</p>
                </div>
              ) : (
                <div
                  className={`profit-box${estimatedProfit < 0 ? " is-negative" : ""}`}
                >
                  <div className="profit-box-row tabular-nums">
                    <span>
                      {form.overrideAmount.trim()
                        ? "Billed Charge (Override)"
                        : "Billed Charge (Suggested)"}
                    </span>
                    <span>{currency(finalCharge)}</span>
                  </div>
                  <div className="profit-box-row tabular-nums">
                    <span>Operational Cost</span>
                    <span>-{currency(operationalCost)}</span>
                  </div>
                  <div className="profit-box-total tabular-nums">
                    <span className="profit-final-label">
                      Estimated Trip Margin
                    </span>
                    <div className="profit-amount-group">
                      {estimatedProfit < 0 && (
                        <span className="negative-margin-badge">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          Negative margin
                        </span>
                      )}
                      <strong className="total-profit-highlight">
                        {currency(estimatedProfit)}
                      </strong>
                    </div>
                  </div>
                  <p className="field-hint-text">
                    Estimate excludes fuel and vehicle depreciation.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
              )}

              {saveError && (
                <div className="drawer-alert-banner is-error" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p>{saveError}</p>
                </div>
              )}

              {addressError && (
                <div className="drawer-alert-banner is-warning" role="alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p>{addressError}</p>
                </div>
              )}
            </div>

            {/* STICKY FOOTER */}
            <div className="drawer-footer-wrapper-fixed">
              <div className="drawer-footer">
                <div className="footer-live-summary tabular-nums">
                  {footerSummaryText}
                </div>
                <div className="footer-action-buttons">
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={currentStep === 1 ? handleCloseAll : handleBack}
                    disabled={isSaving}
                  >
                    {currentStep === 1
                      ? "Cancel"
                      : currentStep === 2
                        ? "Back to Route"
                        : "Back to Cargo"}
                  </button>

                  {currentStep < 3 ? (
                    <button
                      type="submit"
                      className="btn-submit"
                      disabled={
                        isSaving || isResolvingAddress || isCalculatingRoute
                      }
                    >
                      {currentStep === 1
                        ? "Continue to Cargo & Schedule"
                        : "Continue to Review & Pricing"}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn-full-confirm"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <svg className="shipment-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      )}
                      {isSaving
                        ? "Confirming Booking..."
                        : tollPending
                          ? "Confirm Booking (Toll Fee Pending)"
                          : finalCharge != null
                            ? `Confirm Shipment · ${currency(finalCharge)}`
                            : "Confirm Shipment Booking"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* RIGHT MAP PANEL */}
        <div className="drawer-map-panel">
          <TruckTrackingMap
            pickupLocation={form.pickupLocation}
            pickerMode={pickerMode}
            onConfirmLocation={handleConfirmLocation}
            onCancelPicker={handleCancelPicker}
            confirmedPickup={confirmedPickup}
            confirmedDestination={confirmedDestination}
            isResolvingAddress={isResolvingAddress}
            routeGeoJSON={routeGeoJSON}
            fullRouteViewRequest={fullRouteViewRequest}
            isCalculatingRoute={isCalculatingRoute}
            routeError={displayRouteError}
            onRetryRoute={handleRetryRoute}
          />
        </div>

        {/* NATIVE MODAL SUCCESS DIALOG */}
        <dialog
          ref={successDialogRef}
          className="shipment-success-dialog"
          aria-labelledby={successTitleId}
          onCancel={(event) => {
            event.preventDefault();
            handleCloseAll();
          }}
        >
          <div className="alert-success-icon-ring" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 id={successTitleId}>Shipment Booked Successfully</h2>

          <p className="alert-modal-subtitle">
            {createdShipment?.assignmentLookupFailed
              ? "Shipment booked. Check the overview for assignment details."
              : createdShipment?.assignment
                ? "Shipment booked with an eligible driver and truck assigned."
                : "Shipment booked. Awaiting an available driver and matching truck."}
          </p>

          <div className="alert-meta-summary-box tabular-nums">
            <div className="meta-row">
              <span className="meta-lbl">SHIPMENT ID</span>
              <strong className="meta-val color-blue">
                {createdShipment?.tracking_number ||
                  createdShipment?.id ||
                  "Pending ID"}
              </strong>
            </div>
            <div className="meta-row">
              <span className="meta-lbl">CUSTOMER</span>
              <strong className="meta-val">
                {customerName(selectedCustomer)}
              </strong>
            </div>
            <div className="meta-row">
              <span className="meta-lbl">DRIVER</span>
              <strong className="meta-val">
                {createdShipment?.assignment?.driver?.full_name ||
                  (createdShipment?.assignmentLookupFailed
                    ? "Check overview"
                    : "Awaiting assignment")}
              </strong>
            </div>
            <div className="meta-row">
              <span className="meta-lbl">TRUCK</span>
              <strong className="meta-val">
                {createdShipment?.assignment?.truck?.plate_number ||
                  (createdShipment?.assignmentLookupFailed
                    ? "Check overview"
                    : "Awaiting assignment")}
              </strong>
            </div>
            <div className="meta-row">
              <span className="meta-lbl">NET VALUE</span>
              <strong className="meta-val">
                {currency(createdShipment?.final_amount ?? finalCharge)}
              </strong>
            </div>
          </div>

          <div className="success-dialog-actions">
            <button
              type="button"
              className="btn-alert-dismiss"
              autoFocus
              onClick={handleCloseAll}
            >
              Back to Shipments
            </button>
            <button
              type="button"
              className="btn-secondary-outline"
              onClick={() => {
                reset();
                if (typeof window !== "undefined") {
                  window.requestAnimationFrame(() => {
                    stepHeadingRef.current?.focus();
                  });
                }
              }}
            >
              Create Another Shipment
            </button>
          </div>
        </dialog>
      </div>
    </div>
  );
}
