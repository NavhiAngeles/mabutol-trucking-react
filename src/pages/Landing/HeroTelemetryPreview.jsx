import { useId, useState } from "react";

const CORRIDORS = [
  {
    id: "nlex",
    shortLabel: "NLEX South",
    title: "NLEX SOUTHBOUND · CABANATUAN TO METRO MANILA",
    coords: "14.8527° N, 120.8160° E",
    shipmentId: "TRK-2026-0142",
    statusText: "In Transit · NLEX KM 64",
    speedEta: "64 km/h · ETA 14:20 PHT",
    tollSummary: "Class 3 Heavy · ₱1,420 Toll",
    timestampIso: "2026-11-18T11:42:09+08:00",
    timestampLabel: "2026-11-18 11:42:09 PHT (UTC+8)",
    roadPath: "M58 214 L124 186 Q168 168 212 152 L286 124 Q324 108 360 118 L458 174",
    traveledPath: "M58 214 L124 186 Q168 168 212 152",
    remainingPath: "M212 152 L286 124 Q324 108 360 118 L458 174",
    waypoints: [
      { id: "depot", label: "Cabanatuan Hub", x: 58, y: 214, labelX: 52, labelY: 244, anchor: "start", state: "done" },
      { id: "nlex", label: "NLEX KM 64", x: 212, y: 152, labelX: 212, labelY: 122, anchor: "middle", state: "active" },
      { id: "balagtas", label: "Balagtas Toll", x: 360, y: 118, labelX: 360, labelY: 92, anchor: "middle", state: "ahead" },
      { id: "manila", label: "Metro Manila", x: 458, y: 174, labelX: 466, labelY: 204, anchor: "end", state: "ahead" },
    ],
  },
  {
    id: "sctex",
    shortLabel: "SCTEX Spur",
    title: "SCTEX WESTBOUND · TARLAC TO SUBIC FREEPORT",
    coords: "15.1859° N, 120.5426° E",
    shipmentId: "TRK-2026-0188",
    statusText: "In Transit · Clark North Exit",
    speedEta: "58 km/h · ETA 15:45 PHT",
    tollSummary: "Class 2 Medium · ₱780 Toll",
    timestampIso: "2026-11-18T12:15:00+08:00",
    timestampLabel: "2026-11-18 12:15:00 PHT (UTC+8)",
    roadPath: "M58 188 L150 156 Q205 138 256 132 L352 146 Q405 156 460 198",
    traveledPath: "M58 188 L150 156 Q205 138 256 132",
    remainingPath: "M256 132 L352 146 Q405 156 460 198",
    waypoints: [
      { id: "cabanatuan", label: "Cabanatuan Hub", x: 58, y: 188, labelX: 52, labelY: 218, anchor: "start", state: "done" },
      { id: "tarlac", label: "La Paz / SCTEX", x: 150, y: 156, labelX: 150, labelY: 130, anchor: "middle", state: "done" },
      { id: "clark", label: "Clark North", x: 256, y: 132, labelX: 256, labelY: 102, anchor: "middle", state: "active" },
      { id: "subic", label: "Subic Bay Port", x: 460, y: 198, labelX: 466, labelY: 228, anchor: "end", state: "ahead" },
    ],
  },
  {
    id: "tplex",
    shortLabel: "TPLEX North",
    title: "TPLEX NORTHBOUND · NUEVA ECIJA TO ROSARIO",
    coords: "15.9758° N, 120.5713° E",
    shipmentId: "TRK-2026-0204",
    statusText: "Delivered · Rosario Exit",
    speedEta: "POD Logged · 11:18 PHT",
    tollSummary: "Class 3 Heavy · ₱1,190 Toll",
    timestampIso: "2026-11-18T11:18:42+08:00",
    timestampLabel: "2026-11-18 11:18:42 PHT (UTC+8)",
    roadPath: "M64 218 L158 176 Q216 146 286 116 L368 86 Q418 72 456 66",
    traveledPath: "M64 218 L158 176 Q216 146 286 116 L368 86 Q418 72 456 66",
    remainingPath: "",
    waypoints: [
      { id: "origin", label: "Cabanatuan Hub", x: 64, y: 218, labelX: 56, labelY: 248, anchor: "start", state: "done" },
      { id: "tarlac-city", label: "Tarlac Plaza", x: 216, y: 146, labelX: 216, labelY: 176, anchor: "middle", state: "done" },
      { id: "urdaneta", label: "Urdaneta", x: 332, y: 98, labelX: 332, labelY: 72, anchor: "middle", state: "done" },
      { id: "rosario", label: "Rosario Terminus", x: 456, y: 66, labelX: 466, labelY: 94, anchor: "end", state: "active" },
    ],
  },
];

export default function HeroTelemetryPreview() {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState("nlex");

  const activeCorridor = CORRIDORS.find((item) => item.id === selectedId) || CORRIDORS[0];
  const routeSummary = activeCorridor.waypoints.map((stop) => stop.label).join(", then ");

  return (
    <figure className="hero-telemetry">
      <div className="hero-telemetry-header">
        <div className="hero-telemetry-brand">
          <img
            src="/tanaw-logo.png"
            alt=""
            width="24"
            height="24"
            className="hero-telemetry-mark"
          />
          <p className="hero-telemetry-title">{activeCorridor.title}</p>
        </div>
        <div className="hero-telemetry-meta-row">
          <p className="hero-telemetry-coords">{activeCorridor.coords}</p>
          <span className="hero-telemetry-pill">SAMPLE PREVIEW</span>
        </div>
      </div>

      <div className="hero-corridor-switcher" role="group" aria-label="Select Central Luzon sample corridor">
        {CORRIDORS.map((corridor) => (
          <button
            key={corridor.id}
            type="button"
            className={`hero-corridor-btn ${corridor.id === activeCorridor.id ? "is-active" : ""}`}
            aria-pressed={corridor.id === activeCorridor.id}
            onClick={() => setSelectedId(corridor.id)}
          >
            {corridor.shortLabel}
          </button>
        ))}
      </div>

      <div className="hero-telemetry-stage">
        <svg
          className="hero-telemetry-map"
          viewBox="0 0 520 280"
          width="520"
          height="280"
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{`Sample route schematic for ${activeCorridor.shortLabel}: ${routeSummary}.`}</title>

          {/* Subtle arterial highway context lines so the corridor reads as a Luzon dispatch plane */}
          <g fill="none" stroke="#1E293B" strokeWidth="1.25" aria-hidden="true">
            <path d="M24 96 Q140 120 260 92 T500 84" />
            <path d="M18 240 Q180 210 310 226 T504 242" />
            <path d="M138 24 Q152 132 146 260" />
            <path d="M342 22 Q334 140 356 262" />
          </g>

          <g fill="none" strokeLinejoin="round">
            <path className="route-road" d={activeCorridor.roadPath} />
            {activeCorridor.remainingPath && (
              <path className="route-remaining" d={activeCorridor.remainingPath} />
            )}
            <path
              key={activeCorridor.id}
              className="route-traveled"
              d={activeCorridor.traveledPath}
              pathLength="1"
            />
          </g>

          {activeCorridor.waypoints.map((stop) => (
            <g key={stop.id} aria-hidden="true">
              {stop.state === "active" && (
                <>
                  <circle className="node-glow" cx={stop.x} cy={stop.y} r="16" />
                  <circle className="node-active" cx={stop.x} cy={stop.y} r="7" />
                  <circle cx={stop.x} cy={stop.y} r="2.5" fill="#FFFFFF" />
                </>
              )}
              {stop.state === "done" && <circle className="node-done" cx={stop.x} cy={stop.y} r="5" />}
              {stop.state === "ahead" && <circle className="node-ahead" cx={stop.x} cy={stop.y} r="5" />}
              <text className="node-label" x={stop.labelX} y={stop.labelY} textAnchor={stop.anchor}>
                {stop.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <ol className="hero-telemetry-stops">
        {activeCorridor.waypoints.map((stop) => (
          <li key={stop.id}>{stop.label}</li>
        ))}
      </ol>

      <div className="hero-telemetry-hud">
        <div className="telemetry-hud-pill">
          <span className="telemetry-hud-id">{activeCorridor.shipmentId}</span>
          <span className="telemetry-hud-state">{activeCorridor.statusText}</span>
          <span className="telemetry-hud-meta">{activeCorridor.speedEta}</span>
        </div>
        <div className="telemetry-hud-pill is-right">
          <span className="telemetry-hud-label">{activeCorridor.tollSummary}</span>
          <time className="telemetry-hud-meta" dateTime={activeCorridor.timestampIso}>
            {activeCorridor.timestampLabel}
          </time>
        </div>
      </div>

      <figcaption className="hero-telemetry-note">
        Illustrative sample route and toll matrix. Figures are not live telemetry.
      </figcaption>
    </figure>
  );
}
