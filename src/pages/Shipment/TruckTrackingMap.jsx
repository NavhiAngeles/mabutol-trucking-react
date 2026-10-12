
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

const PICKUP_LOCATIONS = [
  {
    name: "MICT Manila",
    search: "Manila International Container Terminal",
    coordinates: [120.9608, 14.5967],
  },
  {
    name: "North Harbor",
    search: "Manila North Harbor",
    coordinates: [120.9585, 14.6135],
  },
  {
    name: "South Harbor",
    search: "Manila South Harbor",
    coordinates: [120.9677, 14.5833],
  },
  {
    name: "Subic Port",
    search: "Subic Bay International Terminal",
    coordinates: [120.2824, 14.7942],
  },
];

export default function TruckTrackingMap({
  pickupLocation = "",
  pickerMode = null,
  onConfirmLocation,
  onCancelPicker,
  confirmedPickup = null,
  confirmedDestination = null,
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
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(
          apiKey
        )}`,

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

      const updateCenterCoordinates = () => {
        const center = map.getCenter();

        setCenterCoordinates({
          lat: center.lat,
          lng: center.lng,
        });
      };

      map.on("load", () => {
        console.log("MapLibre map loaded successfully!");

        setError("");
        map.resize();
        updateCenterCoordinates();
        setMapReady(true);
      });

      map.on("moveend", updateCenterCoordinates);

      map.on("error", (event) => {
        console.error("MapLibre error:", event.error);

        setError(
          event.error?.message || "Map failed to load."
        );
      });

      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });

      resizeObserver.observe(container);
    } catch (err) {
      console.error("Map initialization error:", err);

      setError(
        err?.message || "Unable to initialize the map."
      );
    }

    return () => {
      resizeObserver?.disconnect();

      pickupMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();

      pickupMarkerRef.current = null;
      destinationMarkerRef.current = null;

      if (map) {
        map.remove();
      }

      mapRef.current = null;
    };
  }, []);

  // DISPLAY PRESET PICKUP LOCATION
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || pickerMode) return;

    // Confirmed pickup markers are managed separately.
    if (confirmedPickup) return;

    if (!pickupLocation) return;

    const location = PICKUP_LOCATIONS.find((item) =>
      pickupLocation.includes(item.search)
    );

    if (!location) return;

    const marker = new maplibregl.Marker({
      color: "#dc2626",
    })
      .setLngLat(location.coordinates)
      .setPopup(
        new maplibregl.Popup({
          offset: 25,
        }).setText(`Pickup: ${location.name}`)
      )
      .addTo(map);

    map.flyTo({
      center: location.coordinates,
      zoom: 14,
      essential: true,
    });

    return () => {
      marker.remove();
    };
  }, [
    pickupLocation,
    pickerMode,
    mapReady,
    confirmedPickup,
  ]);

  // DISPLAY CONFIRMED PICKUP MARKER
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
        new maplibregl.Popup({
          offset: 25,
        }).setText("Confirmed Pickup Location")
      )
      .addTo(map);

    pickupMarkerRef.current = marker;

    return () => {
      marker.remove();

      if (pickupMarkerRef.current === marker) {
        pickupMarkerRef.current = null;
      }
    };
  }, [confirmedPickup, mapReady]);

  // DISPLAY CONFIRMED DESTINATION MARKER
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
        new maplibregl.Popup({
          offset: 25,
        }).setText("Confirmed Destination")
      )
      .addTo(map);

    destinationMarkerRef.current = marker;

    return () => {
      marker.remove();

      if (destinationMarkerRef.current === marker) {
        destinationMarkerRef.current = null;
      }
    };
  }, [confirmedDestination, mapReady]);

  // CONFIRM SELECTED LOCATION
  const handleConfirmLocation = () => {
    const map = mapRef.current;

    if (!map || !mapReady || !pickerMode) return;

    if (
      pickerMode !== "pickup" &&
      pickerMode !== "destination"
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
      {/* MAP CONTAINER */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* LOCATION PICKER */}
      {pickerMode && !error && (
        <>
          {/* FIXED RED POINTER */}
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
                fill="#dc2626"
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

          {/* PICKER INFORMATION PANEL */}
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
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.2)",
              textAlign: "center",
              width: "min(290px, calc(100% - 24px))",
              boxSizing: "border-box",
              pointerEvents: "auto",
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

            {/* SELECTED COORDINATES */}
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

            {/* CONFIRM BUTTON */}
            <button
              type="button"
              onClick={handleConfirmLocation}
              disabled={!mapReady}
              style={{
                width: "100%",
                padding: "11px",
                background: mapReady
                  ? "#dc2626"
                  : "#9ca3af",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                cursor: mapReady
                  ? "pointer"
                  : "not-allowed",
                fontWeight: "600",
                fontSize: "13px",
                marginBottom: "8px",
              }}
            >
              Confirm Location
            </button>

            {/* CANCEL BUTTON */}
            <button
              type="button"
              onClick={() => onCancelPicker?.()}
              style={{
                width: "100%",
                padding: "10px",
                background: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px",
              }}
            >
              Cancel Selection
            </button>
          </div>
        </>
      )}

      {/* ERROR MESSAGE */}
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
            boxShadow:
              "0 2px 10px rgba(0,0,0,0.15)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
