import { useEffect, useRef, useState } from "react";
import { useLiveData } from "../../hooks/useLiveData";
import { getLiveTracking, DASHBOARD_TABLES } from "../../services/dashboardDetailService";
import { absoluteEventTime } from "../../services/operationsFeed";
import { snapshotStatus } from "../../services/snapshotStatus";
import { watchTrackingFreshness } from "../../services/trackingFreshness";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  LUZON_BOUNDS,
  LUZON_CENTER,
  LUZON_MIN_ZOOM,
  LUZON_MAX_ZOOM,
} from "../../config/mapBound";
import { buildRouteGeoJSON, disperseTruckCoordinates } from "../../services/dashboardRouteGeometry";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const MAP_STYLES = {
  streets: "streets-v2",
  satellite: "hybrid",
};

const ROUTE_SOURCE = "dashboard-assigned-route-source";
const ROUTE_CASING = "dashboard-assigned-route-casing";
const ROUTE_LINE = "dashboard-assigned-route-line";

const disperse = typeof disperseTruckCoordinates === "function"
  ? disperseTruckCoordinates
  : (trucks) => (trucks || []).map(t => ({ ...t, displayLatitude: t?.latitude, displayLongitude: t?.longitude }));

const buildRoute = typeof buildRouteGeoJSON === "function" ? buildRouteGeoJSON : () => null;

export default function DashboardTrackingMap() {
  const tracking = useLiveData(getLiveTracking, DASHBOARD_TABLES);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropoffMarkerRef = useRef(null);
  const initialFitDone = useRef(false);

  const [mapStyle, setMapStyle] = useState("streets");
  const [error, setError] = useState(() => import.meta.env.VITE_MAPTILER_API_KEY ? "" : "Map configuration is missing.");
  const [selectedTruckId, setSelectedTruckId] = useState(null);

  const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

  // 1. Initialize MapLibre
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

  // 2. Disperse overlapping truck coordinates so every truck has its own visible, clickable marker
  const dispersedTrucks = disperse(tracking.data);

  // 3. Render distinct Truck Logo Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dispersedTrucks.length) return;

    const entries = dispersedTrucks.map(row => ({ row, marker: null, stale: null, selected: false }));
    const stop = watchTrackingFreshness(dispersedTrucks, states => {
      entries.forEach((entry, index) => {
        const { row } = entry;
        const stale = states[index];
        const isSelected = row.truck_id === selectedTruckId;

        if (entry.marker && entry.stale === stale && entry.selected === isSelected) return;

        entry.marker?.remove();

        const markerEl = document.createElement("div");
        markerEl.className = `dashboard-truck-marker ${isSelected ? "is-selected" : ""} ${stale ? "is-stale" : "is-live"}`;
        markerEl.setAttribute("role", "button");
        markerEl.setAttribute("tabindex", "0");
        markerEl.setAttribute("title", `${row.plate} · ${row.leg_label || "Active truck"}`);
        markerEl.setAttribute("aria-label", `Truck ${row.plate}: ${row.leg_label || "Active"}. Click to view assigned route.`);

        markerEl.innerHTML = `
          <div class="truck-marker-bubble">
            <svg class="truck-marker-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 3h13v13H1z"></path>
              <path d="M14 8h4l3 3v5h-7V8z"></path>
              <circle cx="5.5" cy="18.5" r="1.5"></circle>
              <circle cx="17.5" cy="18.5" r="1.5"></circle>
            </svg>
            <span class="truck-marker-pulse"></span>
          </div>
          <div class="truck-marker-plate">${row.plate}</div>
        `;

        const onSelect = (e) => {
          e.stopPropagation();
          setSelectedTruckId(prev => (prev === row.truck_id ? null : row.truck_id));
        };

        markerEl.addEventListener("click", onSelect);
        markerEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(e);
          }
        });

        entry.marker = new maplibregl.Marker({ element: markerEl, anchor: "bottom" })
          .setLngLat([row.displayLongitude, row.displayLatitude])
          .addTo(map);

        entry.stale = stale;
        entry.selected = isSelected;
      });
    });

    return () => {
      stop();
      entries.forEach(entry => entry.marker?.remove());
    };
  }, [dispersedTrucks, selectedTruckId]);

  // 4. Initial auto-fit camera to all active trucks once loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tracking.data?.length || initialFitDone.current) return;

    if (typeof maplibregl.LngLatBounds === "function") {
      const bounds = new maplibregl.LngLatBounds();
      let hasValidPoint = false;
      tracking.data.forEach(t => {
        if (t.longitude != null && t.latitude != null) {
          bounds.extend([t.longitude, t.latitude]);
          hasValidPoint = true;
        }
      });
      if (hasValidPoint) {
        initialFitDone.current = true;
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    }
  }, [tracking.data]);

  // 5. Selected Truck Assigned Route Layer & Bounds
  const selectedTruck = tracking.data?.find(t => t.truck_id === selectedTruckId) || null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const removeRoute = () => {
      try {
        if (map.getLayer(ROUTE_LINE)) map.removeLayer(ROUTE_LINE);
        if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING);
        if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      } catch {
        // layer or source already removed
      }
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current?.remove();
      dropoffMarkerRef.current = null;
    };

    removeRoute();

    if (!selectedTruck) return;

    const geojson = buildRoute(selectedTruck);
    if (!geojson) return;

    try {
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: geojson,
      });

      map.addLayer({
        id: ROUTE_CASING,
        type: "line",
        source: ROUTE_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0f172a",
          "line-width": 7,
          "line-opacity": 0.65,
        },
      });

      map.addLayer({
        id: ROUTE_LINE,
        type: "line",
        source: ROUTE_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#2563eb",
          "line-width": 4.5,
          "line-opacity": 0.95,
        },
      });

      // Add pickup marker
      if (selectedTruck.pickup_coordinates) {
        const pEl = document.createElement("div");
        pEl.className = "dashboard-endpoint-marker endpoint-pickup";
        pEl.title = `Pickup: ${selectedTruck.pickup_address || "Pickup location"}`;
        pEl.innerHTML = "<span>P</span>";
        pickupMarkerRef.current = new maplibregl.Marker({ element: pEl, anchor: "center" })
          .setLngLat(selectedTruck.pickup_coordinates)
          .addTo(map);
      }

      // Add dropoff marker
      if (selectedTruck.dropoff_coordinates) {
        const dEl = document.createElement("div");
        dEl.className = "dashboard-endpoint-marker endpoint-dropoff";
        dEl.title = `Destination: ${selectedTruck.dropoff_address || "Destination"}`;
        dEl.innerHTML = "<span>D</span>";
        dropoffMarkerRef.current = new maplibregl.Marker({ element: dEl, anchor: "center" })
          .setLngLat(selectedTruck.dropoff_coordinates)
          .addTo(map);
      }

      // Fit map camera to route and truck position
      if (typeof maplibregl.LngLatBounds === "function") {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([selectedTruck.longitude, selectedTruck.latitude]);
        if (selectedTruck.pickup_coordinates) bounds.extend(selectedTruck.pickup_coordinates);
        if (selectedTruck.dropoff_coordinates) bounds.extend(selectedTruck.dropoff_coordinates);
        if (geojson.features) {
          for (const feat of geojson.features) {
            if (feat.geometry?.coordinates) {
              if (feat.geometry.type === "LineString") {
                for (const c of feat.geometry.coordinates) bounds.extend(c);
              }
            }
          }
        }
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    } catch (err) {
      console.error("Unable to draw assigned route:", err);
    }

    return () => {
      removeRoute();
    };
  }, [selectedTruck]);

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
    setSelectedTruckId(null);
    mapRef.current?.flyTo({
      center: LUZON_CENTER,
      zoom: 7,
      essential: true,
    });
  }

  function fitActiveTrucks() {
    const map = mapRef.current;
    if (!map || !tracking.data?.length) return;
    if (typeof maplibregl.LngLatBounds === "function") {
      const bounds = new maplibregl.LngLatBounds();
      tracking.data.forEach(t => {
        if (t.longitude != null && t.latitude != null) bounds.extend([t.longitude, t.latitude]);
      });
      map.fitBounds(bounds, { padding: 50, maxZoom: 13 });
    }
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

        {Boolean(tracking.data?.length) && (
          <button type="button" onClick={fitActiveTrucks} title="Fit camera to all active trucks">
            Focus Trucks
          </button>
        )}

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

      {selectedTruck && (
        <div className="dashboard-route-card" role="region" aria-label="Assigned truck route details">
          <div className="dashboard-route-card-header">
            <div className="dashboard-route-card-title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 3h13v13H1z" />
                <path d="M14 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="1.5" />
                <circle cx="17.5" cy="18.5" r="1.5" />
              </svg>
              <strong>{selectedTruck.plate}</strong>
              {selectedTruck.tracking_number && (
                <span className="dashboard-route-tracking">· {selectedTruck.tracking_number}</span>
              )}
            </div>
            <button
              type="button"
              className="dashboard-route-close"
              onClick={() => setSelectedTruckId(null)}
              title="Close route view"
              aria-label="Close route view"
            >
              ✕
            </button>
          </div>

          <div className="dashboard-route-badge-row">
            <span className={`dashboard-route-leg-badge leg-${selectedTruck.leg || "pickup"}`}>
              {selectedTruck.leg_label || (selectedTruck.leg === "destination" ? "On the way to destination" : "On the way to pickup")}
            </span>
            {selectedTruck.driver_name && (
              <span className="dashboard-route-driver">Driver: {selectedTruck.driver_name}</span>
            )}
          </div>

          <div className="dashboard-route-waypoints">
            {selectedTruck.pickup_address && (
              <div className="dashboard-route-point">
                <span className="point-dot pickup-dot" />
                <div className="point-info">
                  <span className="point-label">Pickup Location</span>
                  <span className="point-address" title={selectedTruck.pickup_address}>
                    {selectedTruck.pickup_address}
                  </span>
                </div>
              </div>
            )}
            {selectedTruck.dropoff_address && (
              <div className="dashboard-route-point">
                <span className="point-dot dropoff-dot" />
                <div className="point-info">
                  <span className="point-label">Destination</span>
                  <span className="point-address" title={selectedTruck.dropoff_address}>
                    {selectedTruck.dropoff_address}
                  </span>
                </div>
              </div>
            )}
          </div>

          {(selectedTruck.distance_km || selectedTruck.route_duration_minutes) && (
            <div className="dashboard-route-metrics">
              {selectedTruck.distance_km && <span>{selectedTruck.distance_km} km</span>}
              {selectedTruck.distance_km && selectedTruck.route_duration_minutes && <span>·</span>}
              {selectedTruck.route_duration_minutes && (
                <span>~{Math.round(selectedTruck.route_duration_minutes)} mins</span>
              )}
            </div>
          )}

          <div className="dashboard-route-footer">
            <small className="dashboard-route-timestamp">
              GPS: {absoluteEventTime(selectedTruck.recorded_at)} PHT
              {selectedTruck.stale ? " (Stale GPS fix)" : " (Live GPS)"}
            </small>
            <button
              type="button"
              className="dashboard-route-clear-btn"
              onClick={() => setSelectedTruckId(null)}
            >
              Clear Route
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="dashboard-tracking-error" role="alert">
          {error}
        </div>
      )}

      <div className="dashboard-tracking-note">
        <p>{snapshotStatus('GPS tracking', tracking.lastUpdated, tracking.error)} Position timestamps show when each GPS fix was recorded.</p>
        {tracking.loading
          ? 'Loading vehicle positions…'
          : tracking.error
          ? 'Unable to refresh GPS positions.'
          : tracking.data?.length
          ? `${tracking.data.length} active vehicle(s); click a truck logo to view its assigned route.`
          : 'No GPS positions for active deliveries.'}
        {tracking.error && <button onClick={tracking.refresh}>Retry GPS</button>}
      </div>
    </div>
  );
}
