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
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);

  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [centerCoordinates, setCenterCoordinates] = useState(null);

  // INITIALIZE MAP
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

    if (!apiKey) {
      setError("Missing MapTiler API key in .env");
      return;
    }

    let map;
    let resizeObserver;

    try {
      map = new maplibregl.Map({
        container,
        style:
          "https://api.maptiler.com/maps/streets-v2/style.json" +
          `?key=${encodeURIComponent(apiKey)}`,
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
      console.error("Map initialization error:", err);
      setError(err?.message || "Unable to initialize map.");
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
      color: "#dc2626",
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
      color: "#2563eb",
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
        minHeight: "500px",
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
                "drop-shadow(0 4px 4px rgba(0,0,0,0.3))",
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
                fill={pickerMode === "destination" ? "#2563eb" : "#dc2626"}
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
              background: "#ffffff",
              padding: "16px",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              textAlign: "center",
              width: "min(290px, calc(100% - 24px))",
              boxSizing: "border-box",
            }}
          >
            <strong
              style={{
                display: "block",
                fontSize: "14px",
                color: "#111827",
              }}
            >
              {pickerMode === "pickup"
                ? "Select Pickup Location"
                : "Select Destination"}
            </strong>

            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                margin: "8px 0",
              }}
            >
              Drag or zoom the map to position the pointer.
            </p>

            {centerCoordinates && (
              <div
                style={{
                  background: "#f3f4f6",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#374151",
                  marginBottom: "12px",
                }}
              >
                <div>
                  Latitude:{" "}
                  {centerCoordinates.lat.toFixed(6)}
                </div>
                <div>
                  Longitude:{" "}
                  {centerCoordinates.lng.toFixed(6)}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmLocation}
              disabled={!mapReady || isResolvingAddress}
              style={{
                width: "100%",
                padding: "11px",
                background:
                  mapReady && !isResolvingAddress
                    ? "#dc2626"
                    : "#9ca3af",
                color: "#ffffff",
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
                ? "Detecting Address..."
                : "Confirm Location"}
            </button>

            <button
              type="button"
              disabled={isResolvingAddress}
              onClick={() => onCancelPicker?.()}
              style={{
                width: "100%",
                padding: "10px",
                background: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                cursor: isResolvingAddress
                  ? "not-allowed"
                  : "pointer",
                opacity: isResolvingAddress ? 0.6 : 1,
                fontWeight: "600",
                fontSize: "13px",
              }}
            >
              Cancel Selection
            </button>
          </div>
        </>
      )}

      {/* ROUTING STATUS */}
      {!pickerMode && (isCalculatingRoute || routeError) && (
        <div
          role="status"
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(360px, calc(100% - 24px))",
            padding: "12px 16px",
            background: "#ffffff",
            color: routeError ? "#b91c1c" : "#1f2937",
            borderRadius: "10px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
            zIndex: 7,
            fontSize: "13px",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {isCalculatingRoute
            ? "Calculating truck route..."
            : routeError}
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
            background: "#ffffff",
            padding: "15px",
            borderRadius: "8px",
            color: "#dc2626",
            zIndex: 10,
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
