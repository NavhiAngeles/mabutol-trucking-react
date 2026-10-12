
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import TruckTrackingMap from "./TruckTrackingMap";

const SAMPLE_TRUCKS = [
  {
    id: 1,
    plateNumber: "ABC-1234",
    driver: "Driver 1",
    status: "In Transit",
    longitude: 121.0437,
    latitude: 14.6760,
  },
  {
    id: 2,
    plateNumber: "DEF-5678",
    driver: "Driver 2",
    status: "Available",
    longitude: 120.9842,
    latitude: 14.5995,
  },
  {
    id: 3,
    plateNumber: "GHI-9012",
    driver: "Driver 3",
    status: "In Transit",
    longitude: 121.0747,
    latitude: 14.6333,
  },
];

const getStatusColor = (status) => {
  switch (status) {
    case "In Transit":
      return "#16a34a";
    case "Available":
      return "#2563eb";
    default:
      return "#6b7280";
  }
};

export default function TruckTrackingMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [selectedTruck, setSelectedTruck] = useState(null);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapContainer.current) return;

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

    if (!apiKey) {
      setMapError(
        "MapTiler API key is missing. Check your .env file."
      );
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(apiKey)}`,
      center: [121.02, 14.65],
      zoom: 10,
      attributionControl: true,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      "top-right"
    );

    map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: "metric",
      }),
      "bottom-left"
    );

    map.on("load", () => {
      SAMPLE_TRUCKS.forEach((truck) => {
        const markerElement = document.createElement("div");

        markerElement.style.cssText = `
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: ${getStatusColor(truck.status)};
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        `;

        markerElement.textContent = "🚚";

        markerElement.addEventListener("click", () => {
          setSelectedTruck(truck);

          map.flyTo({
            center: [truck.longitude, truck.latitude],
            zoom: 13,
            essential: true,
          });
        });

        const popup = new maplibregl.Popup({
          offset: 25,
        });

        const popupContent = document.createElement("div");
        popupContent.style.cssText = `
          font-family: Arial, sans-serif;
          padding: 5px;
          min-width: 150px;
        `;

        const title = document.createElement("strong");
        title.textContent = truck.plateNumber;

        const driver = document.createElement("p");
        driver.textContent = `Driver: ${truck.driver}`;

        const status = document.createElement("p");
        status.textContent = `Status: ${truck.status}`;

        popupContent.append(title, driver, status);
        popup.setDOMContent(popupContent);

        const marker = new maplibregl.Marker({
          element: markerElement,
        })
          .setLngLat([truck.longitude, truck.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    });

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      map.remove();
      mapRef.current = null;
    };
  }, []);

  const focusTruck = (truck) => {
    setSelectedTruck(truck);

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [truck.longitude, truck.latitude],
        zoom: 13,
        essential: true,
      });
    }
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 6px" }}>
          Truck Tracking
        </h2>

        <p style={{ color: "#6b7280", margin: 0 }}>
          Monitor truck locations and delivery status.
        </p>
      </div>

      {mapError && (
        <div
          style={{
            padding: "12px",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "8px",
          }}
        >
          {mapError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
          gap: "12px",
        }}
      >
        <div style={summaryCardStyle}>
          <span>Total Trucks</span>
          <strong>{SAMPLE_TRUCKS.length}</strong>
        </div>

        <div style={summaryCardStyle}>
          <span>In Transit</span>
          <strong>
            {
              SAMPLE_TRUCKS.filter(
                (truck) => truck.status === "In Transit"
              ).length
            }
          </strong>
        </div>

        <div style={summaryCardStyle}>
          <span>Available</span>
          <strong>
            {
              SAMPLE_TRUCKS.filter(
                (truck) => truck.status === "Available"
              ).length
            }
          </strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1fr)",
          gap: "16px",
        }}
      >
        <div
          style={{
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            ref={mapContainer}
            style={{
              width: "100%",
              height: "500px",
              background: "#e5e7eb",
            }}
          />
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Truck List</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
            }}
          >
            {SAMPLE_TRUCKS.map((truck) => (
              <button
                key={truck.id}
                type="button"
                onClick={() => focusTruck(truck)}
                style={{
                  textAlign: "left",
                  padding: "14px",
                  border:
                    selectedTruck?.id === truck.id
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                  borderRadius: "8px",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <strong>{truck.plateNumber}</strong>

                <p style={{ margin: "8px 0" }}>
                  {truck.driver}
                </p>

                <span
                  style={{
                    color: getStatusColor(truck.status),
                    fontWeight: 600,
                  }}
                >
                  ● {truck.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p
        style={{
          color: "#6b7280",
          fontSize: "12px",
          margin: 0,
        }}
      >
        Demo mode: Truck locations are sample coordinates.
        Real-time GPS tracking is not connected yet.
      </p>
    </div>
  );
}

const summaryCardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "18px",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  color: "#111827",
};
