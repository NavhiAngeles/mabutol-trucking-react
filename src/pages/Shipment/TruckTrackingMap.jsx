import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  LUZON_BOUNDS,
  LUZON_CENTER,
  LUZON_MIN_ZOOM,
  LUZON_MAX_ZOOM,
} from "../../config/mapBound";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const ROUTE_SOURCE = "shipment-driving-route";
const ROUTE_LAYER = "shipment-driving-route-line";
const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

export default function TruckTrackingMap({
  pickerMode = null,
  onConfirmLocation,
  onCancelPicker,
  confirmedPickup = null,
  confirmedDestination = null,
  isResolvingAddress = false,
  routeGeoJSON = null,
  fullRouteViewRequest = 0,
  isCalculatingRoute = false,
  routeError = "",
  onRetryRoute,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);

  const [error, setError] = useState(() => (!MAPTILER_API_KEY ? "Missing MapTiler API key in .env" : ""));
  const [mapReady, setMapReady] = useState(false);
  const [centerCoordinates, setCenterCoordinates] = useState(null);

  // INITIALIZE MAP
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!MAPTILER_API_KEY) {
      return;
    }

    let map;
    let resizeObserver;

    try {
      map = new maplibregl.Map({
        container,
        style:
          "https://api.maptiler.com/maps/streets-v2/style.json" +
          `?key=${encodeURIComponent(MAPTILER_API_KEY)}`,
        center: LUZON_CENTER,
        zoom: 8,
        minZoom: LUZON_MIN_ZOOM,
        maxZoom: LUZON_MAX_ZOOM,
        maxBounds: LUZON_BOUNDS,
        renderWorldCopies: false,
      });

      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl(),
        "top-right"
      );

      const updateCenter = () => {
        const center = map.getCenter();

        setCenterCoordinates({
          lat: center.lat,
          lng: center.lng,
        });
      };

      map.on("load", () => {
        setError("");
        setMapReady(true);
        map.resize();
        updateCenter();
      });

      map.on("moveend", updateCenter);

      map.on("error", (event) => {
        console.error("MapLibre error:", event.error);

        if (!map.loaded()) {
          setError(
            event.error?.message || "Map failed to load."
          );
        }
      });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });

        resizeObserver.observe(container);
      }
    } catch (err) {
      console.error("Map initialization error:", { message: err?.message || "Unable to initialize map." });
      Promise.resolve().then(() => {
        setError(err?.message || "Unable to initialize map.");
      });
    }

    return () => {
      resizeObserver?.disconnect();

      pickupMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();

      pickupMarkerRef.current = null;
      destinationMarkerRef.current = null;

      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // CONFIRMED PICKUP MARKER
  useEffect(() => {
    const map = mapRef.current;

    pickupMarkerRef.current?.remove();
    pickupMarkerRef.current = null;

    if (!map || !mapReady || !confirmedPickup) return;

    const marker = new maplibregl.Marker({
      color: "#1D4ED8",
    })
      .setLngLat([
        confirmedPickup.lng,
        confirmedPickup.lat,
      ])
      .setPopup(
        new maplibregl.Popup({ offset: 25 }).setText(
          "Confirmed Pickup Location"
        )
      )
      .addTo(map);

    pickupMarkerRef.current = marker;
    map.flyTo({ center: [confirmedPickup.lng, confirmedPickup.lat], zoom: 15, essential: true });

    return () => {
      marker.remove();

      if (pickupMarkerRef.current === marker) {
        pickupMarkerRef.current = null;
      }
    };
  }, [confirmedPickup, mapReady]);

  // CONFIRMED DESTINATION MARKER
  useEffect(() => {
    const map = mapRef.current;

    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;

    if (!map || !mapReady || !confirmedDestination) return;

    const marker = new maplibregl.Marker({
      color: "#D97706",
    })
      .setLngLat([
        confirmedDestination.lng,
        confirmedDestination.lat,
      ])
      .setPopup(
        new maplibregl.Popup({ offset: 25 }).setText(
          "Confirmed Destination"
        )
      )
      .addTo(map);

    destinationMarkerRef.current = marker;
    map.flyTo({ center: [confirmedDestination.lng, confirmedDestination.lat], zoom: 15, essential: true });

    return () => {
      marker.remove();

      if (destinationMarkerRef.current === marker) {
        destinationMarkerRef.current = null;
      }
    };
  }, [confirmedDestination, mapReady]);

  // PHASE 4: DRAW ROAD ROUTE
  // Start exact-pin adjustments at the selected point, even after route fitting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !pickerMode) return;
    const point = pickerMode === "pickup" ? confirmedPickup : confirmedDestination;
    if (point) map.flyTo({ center: [point.lng, point.lat], zoom: 17, essential: true });
  }, [pickerMode, mapReady, confirmedPickup, confirmedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const removeRoute = () => {
      if (map.getLayer(ROUTE_LAYER)) {
        map.removeLayer(ROUTE_LAYER);
      }

      if (map.getSource(ROUTE_SOURCE)) {
        map.removeSource(ROUTE_SOURCE);
      }
    };

    removeRoute();

    if (!routeGeoJSON?.features?.length) {
      return;
    }

    try {
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: routeGeoJSON,
      });

      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#2563eb",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

    } catch (err) {
      console.error("Unable to draw route:", err);
    }

    return () => {
      if (mapRef.current === map) {
        removeRoute();
      }
    };
  }, [routeGeoJSON, mapReady, pickerMode]);

  // Refit the existing route on every button click, without requesting a new route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || pickerMode || !routeGeoJSON?.features?.length) return;

    const bounds = new maplibregl.LngLatBounds();
    const validPoint = point => Array.isArray(point) &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
    let hasRoute = false;
    for (const feature of routeGeoJSON.features) {
      const geometry = feature.geometry;
      if (geometry?.type !== "LineString" || geometry.coordinates?.length < 2 ||
          !geometry.coordinates?.every(validPoint)) continue;
      geometry.coordinates.forEach(point => bounds.extend(point));
      hasRoute = true;
    }
    if (!hasRoute) return;
    for (const point of [confirmedPickup, confirmedDestination]) {
      if (point && validPoint([point.lng, point.lat])) bounds.extend([point.lng, point.lat]);
    }
    map.resize();
    map.stop();
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 90, left: 70, right: 80 },
      maxZoom: 14,
      duration: 800,
    });
  }, [routeGeoJSON, mapReady, pickerMode, confirmedPickup, confirmedDestination, fullRouteViewRequest]);

  // CONFIRM MAP CENTER
  const handleConfirmLocation = () => {
    const map = mapRef.current;

    if (
      !map ||
      !mapReady ||
      !pickerMode ||
      isResolvingAddress
    ) {
      return;
    }

    const center = map.getCenter();

    onConfirmLocation?.({
      type: pickerMode,
      lat: center.lat,
      lng: center.lng,
    });
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "320px",
        position: "relative",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* CAMERA-STYLE PICKER */}
      {pickerMode && !error && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              zIndex: 5,
              filter:
                "drop-shadow(0 4px 4px rgba(15, 23, 42, 0.28))",
            }}
          >
            <svg
              width="44"
              height="60"
              viewBox="0 0 44 60"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22 2C11 2 2 11 2 22C2 38 22 58 22 58S42 38 42 22C42 11 33 2 22 2Z"
                fill={pickerMode === "destination" ? "#D97706" : "#1D4ED8"}
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <circle
                cx="22"
                cy="22"
                r="9"
                fill="#ffffff"
              />
            </svg>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 6,
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              padding: "16px",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(15, 23, 42, 0.14)",
              textAlign: "center",
              width: "min(300px, calc(100% - 24px))",
              boxSizing: "border-box",
            }}
          >
            <strong
              style={{
                display: "block",
                fontSize: "14px",
                color: "#0F172A",
              }}
            >
              {pickerMode === "pickup"
                ? "Pin Pickup Entrance"
                : "Pin Delivery Entrance"}
            </strong>

            <p
              style={{
                fontSize: "12px",
                color: "#475569",
                margin: "6px 0 10px",
              }}
            >
              Drag or zoom the map under the pin to set exact coordinates.
            </p>

            {centerCoordinates && (
              <div
                className="tabular-nums"
                style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "#475569",
                  marginBottom: "12px",
                }}
              >
                <div>
                  Lat: {centerCoordinates.lat.toFixed(6)} · Lng: {centerCoordinates.lng.toFixed(6)}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmLocation}
              disabled={!mapReady || isResolvingAddress}
              style={{
                width: "100%",
                minHeight: "44px",
                padding: "10px 14px",
                background:
                  mapReady && !isResolvingAddress
                    ? "#0F2A52"
                    : "#64748B",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor:
                  mapReady && !isResolvingAddress
                    ? "pointer"
                    : "not-allowed",
                fontWeight: "600",
                fontSize: "13px",
                marginBottom: "8px",
              }}
            >
              {isResolvingAddress
                ? "Resolving Address..."
                : "Confirm Pin Location"}
            </button>

            <button
              type="button"
              disabled={isResolvingAddress}
              onClick={() => onCancelPicker?.()}
              style={{
                width: "100%",
                minHeight: "44px",
                padding: "10px 14px",
                background: "#FFFFFF",
                color: "#0F172A",
                border: "1px solid #CBD5E1",
                borderRadius: "8px",
                cursor: isResolvingAddress
                  ? "not-allowed"
                  : "pointer",
                opacity: isResolvingAddress ? 0.55 : 1,
                fontWeight: "600",
                fontSize: "13px",
              }}
            >
              Cancel Pinning
            </button>
          </div>
        </>
      )}

      {/* ROUTING STATUS */}
      {!pickerMode && (isCalculatingRoute || Boolean(routeError)) && (
        <div
          role={routeError ? "alert" : "status"}
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            maxWidth: "calc(100% - 76px)",
            padding: "8px 12px",
            background: routeError ? "#FEF2F2" : "#FFFFFF",
            border: routeError ? "1px solid #FECACA" : "1px solid #E2E8F0",
            color: routeError ? "#B91C1C" : "#0F172A",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.10)",
            zIndex: 7,
            fontSize: "12px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            boxSizing: "border-box",
          }}
        >
          <span>
            {isCalculatingRoute
              ? "Calculating truck route..."
              : "Route preview unavailable"}
          </span>
          {!isCalculatingRoute && onRetryRoute && (
            <button
              type="button"
              onClick={() => onRetryRoute()}
              style={{
                background: "#FFFFFF",
                border: "1px solid #FECACA",
                color: "#B91C1C",
                borderRadius: "6px",
                minHeight: "32px",
                padding: "4px 10px",
                font: "inherit",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* MAP ERROR */}
      {error && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            right: "60px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            padding: "14px 16px",
            borderRadius: "8px",
            color: "#B91C1C",
            fontSize: "13px",
            fontWeight: 500,
            zIndex: 10,
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
