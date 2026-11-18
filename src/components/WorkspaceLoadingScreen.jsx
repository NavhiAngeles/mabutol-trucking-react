import "./WorkspaceLoadingScreen.css";

const SIDEBAR_PRIMARY_WIDTHS = ["56%", "64%", "52%", "60%", "66%"];
const SIDEBAR_SECONDARY_WIDTHS = ["50%", "54%"];

const KPI_ACCENTS = ["green", "red", "orange", "blue"];

export default function WorkspaceLoadingScreen({
  message = "Preparing dispatch workspace…",
  detail = "Checking your office session and loading fleet telemetry.",
}) {
  return (
    <div
      className="workspace-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Desktop sidebar shell skeleton matching MainLayout / Sidebar */}
      <aside className="workspace-loading-sidebar" aria-hidden="true">
        <div className="workspace-loading-brand">
          <div className="workspace-loading-brand-icon">
            <img
              src="/tanaw-logo.png"
              alt=""
              width="38"
              height="38"
              className="workspace-loading-brand-img"
              decoding="sync"
            />
          </div>
          <div className="workspace-loading-brand-text">
            <span className="workspace-loading-brand-title">TANAW</span>
            <span className="workspace-loading-brand-sub">MABUTOL TRUCKING</span>
          </div>
        </div>

        <div className="workspace-loading-nav">
          {SIDEBAR_PRIMARY_WIDTHS.map((width, index) => (
            <div
              key={width}
              className={`workspace-loading-nav-item${index === 0 ? " is-active" : ""}`}
            >
              <span className="workspace-loading-nav-icon skeleton-block" />
              <span
                className="workspace-loading-nav-label skeleton-block"
                style={{ width }}
              />
            </div>
          ))}
          <div className="workspace-loading-nav-divider" />
          {SIDEBAR_SECONDARY_WIDTHS.map((width) => (
            <div key={width} className="workspace-loading-nav-item">
              <span className="workspace-loading-nav-icon skeleton-block" />
              <span
                className="workspace-loading-nav-label skeleton-block"
                style={{ width }}
              />
            </div>
          ))}
        </div>
      </aside>

      {/* Main workspace column */}
      <div className="workspace-loading-main">
        <header className="workspace-loading-topbar" aria-hidden="true">
          <div className="workspace-loading-topbar-left">
            <div className="workspace-loading-mobile-brand">
              <div className="workspace-loading-brand-icon is-compact">
                <img
                  src="/tanaw-logo.png"
                  alt=""
                  width="32"
                  height="32"
                  className="workspace-loading-brand-img"
                  decoding="sync"
                />
              </div>
              <span className="workspace-loading-brand-title">TANAW</span>
            </div>
          </div>

          <div className="workspace-loading-topbar-right">
            <span className="workspace-loading-tool skeleton-block" />
            <span className="workspace-loading-tool skeleton-block" />
            <span className="workspace-loading-avatar skeleton-block" />
          </div>

          <div className="workspace-loading-progress-track">
            <div className="workspace-loading-progress-bar" />
          </div>
        </header>

        <div className="workspace-loading-content">
          {/* Honest, accessible status banner anchored at the top of the workspace */}
          <div className="workspace-loading-status-card">
            <div className="workspace-loading-indicator" aria-hidden="true">
              <span className="workspace-loading-spinner" />
            </div>
            <div className="workspace-loading-status-copy">
              <p className="workspace-loading-status-title">{message}</p>
              <p className="workspace-loading-status-detail">{detail}</p>
            </div>
          </div>

          {/* 4-column KPI skeleton matching dashboard.css */}
          <div className="workspace-loading-stats" aria-hidden="true">
            {KPI_ACCENTS.map((accent) => (
              <div
                key={accent}
                className={`workspace-loading-stat-card is-${accent}`}
              >
                <div className="workspace-loading-stat-top">
                  <span className="workspace-loading-line is-label skeleton-block" />
                  <span className="workspace-loading-stat-icon skeleton-block" />
                </div>
                <span className="workspace-loading-line is-value skeleton-block" />
                <span className="workspace-loading-line is-delta skeleton-block" />
              </div>
            ))}
          </div>

          {/* Asymmetric 2-column dashboard split */}
          <div className="workspace-loading-columns" aria-hidden="true">
            <div className="workspace-loading-col-left">
              <div className="workspace-loading-panel workspace-loading-map-panel">
                <div className="workspace-loading-panel-header">
                  <span className="workspace-loading-line is-heading skeleton-block" />
                  <span className="workspace-loading-pill skeleton-block" />
                </div>
                <div className="workspace-loading-map-surface">
                  <svg
                    className="workspace-loading-corridor"
                    viewBox="0 0 480 240"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M48 198 C118 170, 168 152, 224 126 C276 102, 336 74, 424 38"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                    />
                    <circle cx="48" cy="198" r="5" fill="currentColor" />
                    <circle cx="224" cy="126" r="5" fill="currentColor" />
                    <circle cx="424" cy="38" r="5" fill="currentColor" />
                  </svg>
                </div>
              </div>

              <div className="workspace-loading-panel">
                <div className="workspace-loading-panel-header">
                  <span className="workspace-loading-line is-heading skeleton-block" />
                </div>
                <div className="workspace-loading-analytics-row">
                  <div className="workspace-loading-mini-box skeleton-block" />
                  <div className="workspace-loading-mini-box skeleton-block" />
                </div>
              </div>
            </div>

            <div className="workspace-loading-col-right">
              <div className="workspace-loading-panel">
                <div className="workspace-loading-panel-header">
                  <span className="workspace-loading-line is-heading skeleton-block" />
                  <span className="workspace-loading-line is-sub skeleton-block" />
                </div>
                <div className="workspace-loading-stack">
                  <div className="workspace-loading-list-row skeleton-block" />
                  <div className="workspace-loading-list-row skeleton-block" />
                  <div className="workspace-loading-list-row skeleton-block" />
                </div>
              </div>

              <div className="workspace-loading-panel">
                <div className="workspace-loading-panel-header">
                  <span className="workspace-loading-line is-heading skeleton-block" />
                </div>
                <div className="workspace-loading-stack">
                  <div className="workspace-loading-bar-row skeleton-block" />
                  <div className="workspace-loading-bar-row skeleton-block" />
                  <div className="workspace-loading-bar-row skeleton-block" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
