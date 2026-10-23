
import { useEffect, useRef, useState } from "react";
import { useLiveData } from "../../hooks/useLiveData";
import { getLiveTracking, DASHBOARD_TABLES } from "../../services/dashboardDetailService";
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

const MAP_STYLES = {
  streets: "streets-v2",
  satellite: "hybrid",
};

export default function DashboardTrackingMap() {
  const tracking = useLiveData(getLiveTracking, DASHBOARD_TABLES);
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const [mapStyle, setMapStyle] = useState("streets");
  const [error, setError] = useState(() => import.meta.env.VITE_MAPTILER_API_KEY ? "" : "Map configuration is missing.");

  const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

  useEffect(() => {
    if (!containerRef.current) return;

    if (!apiKey) return;

    let map, initializationError;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: `https://api.maptiler.com/maps/${MAP_STYLES.streets}/style.json?key=${encodeURIComponent(apiKey)}`,

        // Luzon restrictions
        center: LUZON_CENTER,
        zoom: 7,
        minZoom: LUZON_MIN_ZOOM,
        maxZoom: LUZON_MAX_ZOOM,
        maxBounds: LUZON_BOUNDS,
        renderWorldCopies: false,
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
      initializationError = err.message;
    }

    const errorTimer = initializationError ? setTimeout(() => setError(initializationError), 0) : null;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });

    observer.observe(containerRef.current);

    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      observer.disconnect();
      mapRef.current = null;
      map?.remove();
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tracking.data) return;
    const markers = tracking.data.map(row => {
      const text = document.createElement('div');
      text.textContent = row.plate + ' · ' + new Date(row.recorded_at).toLocaleString() + (row.stale ? ' · Last known position (older than 5 minutes)' : ' · Recent GPS');
      return new maplibregl.Marker({ color: row.stale ? '#64748b' : '#16a34a' })
        .setLngLat([row.longitude, row.latitude]).setPopup(new maplibregl.Popup().setDOMContent(text)).addTo(map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [tracking.data]);

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
    center: LUZON_CENTER,
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
        {tracking.loading ? 'Loading vehicle positions…' : tracking.error ? 'Unable to refresh GPS positions.' : tracking.data?.length ? tracking.data.length + ' tracked vehicle(s); select a marker for its timestamp.' : 'No GPS positions for active deliveries.'}
        {tracking.error && <button onClick={tracking.refresh}>Retry GPS</button>}
      </div>
    </div>
  );
}
