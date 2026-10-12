import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export default function TruckTrackingMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState("");

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
        center: [121.0437, 14.676],
        zoom: 9,
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
