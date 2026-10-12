
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const MAP_STYLES = {
  streets: "streets-v2",
  satellite: "hybrid",
};

export default function DashboardTrackingMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const [mapStyle, setMapStyle] = useState("streets");
  const [error, setError] = useState("");

  const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

  useEffect(() => {
    if (!containerRef.current) return;

    if (!apiKey) {
      setError("MapTiler API key is missing from .env");
      return;
    }

    let map;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: `https://api.maptiler.com/maps/${MAP_STYLES.streets}/style.json?key=${encodeURIComponent(apiKey)}`,
        center: [121.05, 15.35],
        zoom: 7,
        attributionControl: true,
      });

      mapRef.current = map;

      map.on("load", () => {
        setError("");
        map.resize();
      });

      map.on("error", (event) => {
        console.error("Dashboard map error:", event.error);
        setError(event.error?.message || "Unable to load map.");
      });
    } catch (err) {
      console.error("Dashboard map initialization failed:", err);
      setError(err.message);
    }

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      mapRef.current = null;
      map?.remove();
    };
  }, [apiKey]);

  function changeStyle(event) {
    const nextStyle = event.target.value;
    setMapStyle(nextStyle);

    if (!mapRef.current || !apiKey) return;

    mapRef.current.setStyle(
      `https://api.maptiler.com/maps/${MAP_STYLES[nextStyle]}/style.json?key=${encodeURIComponent(apiKey)}`
    );
  }

  function zoomIn() {
    mapRef.current?.zoomIn();
  }

  function zoomOut() {
    mapRef.current?.zoomOut();
  }

  function resetView() {
    mapRef.current?.flyTo({
      center: [121.05, 15.35],
      zoom: 7,
      essential: true,
    });
  }

  return (
    <div className="dashboard-tracking-map">
      <div className="dashboard-tracking-toolbar">
        <select
          value={mapStyle}
          onChange={changeStyle}
          aria-label="Map style"
        >
          <option value="streets">Street Map</option>
          <option value="satellite">Satellite</option>
        </select>

        <button type="button" onClick={zoomIn} title="Zoom in">
          +
        </button>

        <button type="button" onClick={zoomOut} title="Zoom out">
          −
        </button>

        <button type="button" onClick={resetView} title="Reset map">
          Reset
        </button>
      </div>

      <div ref={containerRef} className="dashboard-tracking-canvas" />

      {error && (
        <div className="dashboard-tracking-error" role="alert">
          {error}
        </div>
      )}

      <div className="dashboard-tracking-note">
        Map ready — live vehicle locations not yet connected
      </div>
    </div>
  );
}
