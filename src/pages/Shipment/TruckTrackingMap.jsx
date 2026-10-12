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
  pickupLocation,
  pickerMode = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const [error, setError] = useState("");
  const [centerCoordinates, setCenterCoordinates] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

    if (!apiKey) {
      setError("Missing MapTiler API key in .env");
      return;
    }

    let map;

    try {
      map = new maplibregl.Map({
        container,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(apiKey)}`,

        // Luzon restrictions
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

      map.on("load", () => {
        console.log("MapLibre map loaded successfully!");

        setError("");
        map.resize();

        const center = map.getCenter();

        setCenterCoordinates({
          lat: center.lat,
          lng: center.lng,
        });
      });

      map.on("moveend", () => {
        const center = map.getCenter();

        setCenterCoordinates({
          lat: center.lat,
          lng: center.lng,
        });
      });

      map.on("error", (event) => {
        console.error("MapLibre error:", event.error);
        setError(
          event.error?.message || "Map failed to load."
        );
      });
    } catch (err) {
      console.error("Map initialization error:", err);
      setError(err.message);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !pickupLocation || pickerMode) return;

    const location = PICKUP_LOCATIONS.find((item) =>
      pickupLocation.includes(item.search)
    );

    if (!location) return;

    let marker = null;

    const showMarker = () => {
      marker = new maplibregl.Marker({
        color: "#dc2626",
      })
        .setLngLat(location.coordinates)
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setText(
            `Pickup: ${location.name}`
          )
        )
        .addTo(map);

      map.flyTo({
        center: location.coordinates,
        zoom: 14,
        essential: true,
      });
    };

    if (map.loaded()) {
      showMarker();
    } else {
      map.once("load", showMarker);
    }

    return () => {
      map.off("load", showMarker);
      if (marker) marker.remove();
    };
  }, [pickupLocation, pickerMode]);

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

      {pickerMode && !error && (
        <>
          {/* CENTERED LOCATION POINTER */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              zIndex: 5,
              filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.3))",
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

          {/* LOCATION PICKER INFORMATION */}
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 6,
              background: "#ffffff",
              padding: "12px 18px",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              textAlign: "center",
              minWidth: "240px",
              pointerEvents: "none",
            }}
          >
            <strong
              style={{
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
                margin: "6px 0",
              }}
            >
              Drag the map to position the pointer
            </p>

            {centerCoordinates && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#374151",
                }}
              >
                Lat: {centerCoordinates.lat.toFixed(6)}
                <br />
                Lng: {centerCoordinates.lng.toFixed(6)}
              </div>
            )}
          </div>
        </>
      )}

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
