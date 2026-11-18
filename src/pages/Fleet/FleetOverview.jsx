import { useNavigate } from "react-router-dom";
import FleetRefreshButton from "./FleetRefreshButton";
import { vehicleCategories, vehicleCategoryId } from "./vehicleCategories";
import { SkeletonListRows, SkeletonStatValue } from "../../components/Skeleton/Skeleton";

export default function FleetOverview({
  fleet,
  kpis,
  kpisLoading,
  trucks,
  trucksLoading,
  vehicleTypes,
  drivers,
  driversLoading,
  truckComplianceRows,
  driverComplianceRows,
  onAssignDriver,
  onOpenDocuments,
  onRegisterDriver,
  onAddVehicle,
}) {
  const navigate = useNavigate();

  const totalVehicles = kpis.total ?? 0;
  const availableVehicles = kpis.available ?? 0;
  const readyPercent = totalVehicles > 0 ? Math.round((availableVehicles / totalVehicles) * 100) : 0;

  const totalDrivers = drivers.length;
  const onRouteDrivers = drivers.filter((d) => d.status === "on_route" || d.status === "on_trip").length;
  const availableDrivers = drivers.filter(
    (d) => d.status !== "inactive" && d.status !== "on_route" && d.status !== "on_trip"
  ).length;
  const activeDriversCount = drivers.filter((d) => d.status !== "inactive").length;
  const driverSummary = driversLoading && !fleet.hasData
    ? "Checking driver availability…"
    : `${activeDriversCount} of ${totalDrivers} drivers active`;

  const typeGroups = vehicleCategories(trucks, vehicleTypes)
    .filter((category) => category.id !== "all")
    .map((category) => {
      const available = trucks.filter(
        (truck) =>
          vehicleCategoryId(truck) === category.id &&
          (truck.displayStatus || truck.status) === "available"
      ).length;
      const pct = category.count > 0 ? Math.round((available / category.count) * 100) : 0;
      return {
        ...category,
        available,
        pct,
      };
    });

  const blockers = [];
  for (const truck of trucks) {
    if ((truck.displayStatus || truck.status) === "maintenance") {
      blockers.push({
        key: `maint-${truck.id}`,
        title: truck.plate_number,
        typeLabel: truck.vehicle_types?.name || null,
        detail: `${truck.model || "Vehicle"} is currently in maintenance`,
        badgeClass: "status-pill status-danger",
        badgeLabel: "MAINTENANCE",
        actionLabel: "View maintenance",
        onAction: () => navigate("/fleet/maintenance"),
      });
    }
  }

  for (const truck of trucks) {
    if ((truck.displayStatus || truck.status) === "available" && !truck.drivers?.full_name) {
      const typeName = truck.vehicle_types?.name ?? "General Freight";
      const capacityText = truck.capacity_kg ? ` · ${truck.capacity_kg.toLocaleString()} kg` : "";
      blockers.push({
        key: `unassigned-${truck.id}`,
        title: truck.plate_number,
        typeLabel: typeName,
        detail: `${typeName}${capacityText} · No driver assigned`,
        badgeClass: "status-pill status-warning",
        badgeLabel: "UNASSIGNED",
        actionLabel: "Assign driver",
        onAction: () => onAssignDriver(truck),
      });
    }
  }

  for (const row of truckComplianceRows) {
    if (row.overallStatus !== "verified") {
      blockers.push({
        key: `tcomp-${row.truck.id}`,
        title: row.truck.plate_number,
        typeLabel: row.truck.vehicle_types?.name || null,
        detail: "Vehicle compliance requires review",
        badgeClass: "status-pill status-warning",
        badgeLabel: "COMPLIANCE",
        actionLabel: "Review docs",
        onAction: () => onOpenDocuments({ kind: "truck", entity: row.truck }),
      });
    }
  }

  for (const row of driverComplianceRows) {
    if (row.overallStatus !== "verified") {
      blockers.push({
        key: `dcomp-${row.driver.id}`,
        title: row.driver.full_name,
        typeLabel: null,
        detail: "Driver compliance requires review",
        badgeClass: "status-pill status-warning",
        badgeLabel: "COMPLIANCE",
        actionLabel: "Review docs",
        onAction: () => onOpenDocuments({ kind: "driver", entity: row.driver }),
      });
    }
  }

  const visibleBlockers = blockers.slice(0, 5);
  const dataUnavailable = Boolean(fleet.error && !fleet.hasData);

  return (
    <>
      <div className="header-actions-row">
        <div className="header-titles">
          <h1>Fleet Management Overview</h1>
          <p className="fleet-live-subtitle">
            Dispatch readiness &amp; fleet allocation summary · <strong>{driverSummary}</strong>
          </p>
        </div>
        <div className="action-buttons-group">
          <FleetRefreshButton loading={fleet.loading} onRefresh={fleet.refresh} />
          <button type="button" className="btn-secondary" onClick={onRegisterDriver}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>+ Register Driver</span>
          </button>
          <button type="button" className="btn-primary" onClick={onAddVehicle}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 3v5h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            <span>+ Add Vehicle</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <button
          type="button"
          className="metric-card metric-card-interactive border-green"
          onClick={() => navigate("/fleet/vehicles?availability=dispatch-ready")}
        >
          <div className="metric-header">
            <h4>FLEET AVAILABILITY</h4>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2>{kpisLoading && !fleet.hasData ? <SkeletonStatValue width="72px" height={28} /> : `${availableVehicles} / ${totalVehicles}`}</h2>
          <p className="growth-indicator target">{readyPercent}% dispatch-ready · View available</p>
        </button>

        <button
          type="button"
          className="metric-card metric-card-interactive border-slate"
          onClick={() => navigate("/fleet/drivers")}
        >
          <div className="metric-header">
            <h4>DRIVER ROSTER</h4>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2>{driversLoading && !fleet.hasData ? <SkeletonStatValue width="72px" height={28} /> : `${availableDrivers} / ${totalDrivers}`}</h2>
          <p className="growth-indicator">{onRouteDrivers} on route · View driver roster</p>
        </button>

        <button
          type="button"
          className="metric-card metric-card-interactive border-blue-accent"
          onClick={() => navigate("/fleet/vehicles")}
        >
          <div className="metric-header">
            <h4>IN USE / RESERVED</h4>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 3v5h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <h2>{kpisLoading && !fleet.hasData ? <SkeletonStatValue width="48px" height={28} /> : kpis.onTrip ?? 0}</h2>
          <p className="growth-indicator transit">Assigned or on active shipment</p>
        </button>

        <button
          type="button"
          className="metric-card metric-card-interactive border-red"
          onClick={() => navigate("/fleet/maintenance")}
        >
          <div className="metric-header">
            <h4>IN MAINTENANCE</h4>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2>{kpisLoading && !fleet.hasData ? <SkeletonStatValue width="48px" height={28} /> : kpis.maintenance ?? 0}</h2>
          <p className="growth-indicator">View maintenance schedule</p>
        </button>
      </div>

      <div className="fleet-overview-grid">
        <section className="fleet-overview-panel" aria-labelledby="fleet-capacity-heading">
          <div className="fleet-panel-header">
            <div>
              <h3 id="fleet-capacity-heading">Fleet Capacity by Type</h3>
              <p className="fleet-panel-subtitle">Available vs. total units per vehicle class</p>
            </div>
            <button
              type="button"
              className="fleet-panel-link"
              onClick={() => navigate("/fleet/vehicles")}
            >
              All vehicles
            </button>
          </div>

          {trucksLoading && !fleet.hasData ? (
            <>
              <p className="fleet-panel-state" role="status">Loading vehicle capacity…</p>
              <SkeletonListRows rows={4} variant="bar" />
            </>
          ) : dataUnavailable ? (
            <p className="fleet-panel-state">Vehicle capacity unavailable. Retry above.</p>
          ) : typeGroups.length === 0 ? (
            <div className="fleet-panel-empty">
              <p>No vehicles registered in fleet yet.</p>
              <button type="button" className="btn-secondary" onClick={onAddVehicle}>
                + Add Vehicle
              </button>
            </div>
          ) : (
            <div className="fleet-capacity-list">
              {typeGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="fleet-capacity-row"
                  onClick={() => navigate(`/fleet/vehicles?category=${encodeURIComponent(group.id)}`)}
                >
                  <div className="fleet-capacity-row-top">
                    <span className="fleet-capacity-label">{group.label}</span>
                    <span className="fleet-capacity-count">
                      <strong>{group.available}</strong> / {group.count}
                    </span>
                  </div>
                  <div className="fleet-capacity-bar" aria-hidden="true">
                    <div
                      className="fleet-capacity-fill"
                      style={{ width: `${group.pct}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="fleet-overview-panel" aria-labelledby="fleet-attention-heading">
          <div className="fleet-panel-header">
            <div>
              <h3 id="fleet-attention-heading">Needs Attention</h3>
              <p className="fleet-panel-subtitle">Dispatch blockers, unassigned units, and compliance alerts</p>
            </div>
            <button
              type="button"
              className="fleet-panel-link"
              onClick={() => navigate("/compliance")}
            >
              Compliance hub
            </button>
          </div>

          {(trucksLoading || driversLoading) && !fleet.hasData ? (
            <>
              <p className="fleet-panel-state" role="status">Checking dispatch blockers…</p>
              <SkeletonListRows rows={3} variant="alert" />
            </>
          ) : dataUnavailable ? (
            <p className="fleet-panel-state">Dispatch blocker data unavailable. Retry above.</p>
          ) : visibleBlockers.length === 0 ? (
            <p className="fleet-panel-state">All vehicles and drivers are dispatch-ready.</p>
          ) : (
            <ul className="fleet-blocker-list">
              {visibleBlockers.map((item) => (
                <li key={item.key} className="fleet-blocker-item">
                  <div className="fleet-blocker-info">
                    <div className="fleet-blocker-title-row">
                      <strong>{item.title}</strong>
                      <span className={item.badgeClass}>{item.badgeLabel}</span>
                      {item.typeLabel && <span className="subtext">{item.typeLabel}</span>}
                    </div>
                    <span className="fleet-blocker-detail">{item.detail}</span>
                  </div>
                  <button
                    type="button"
                    className="fleet-blocker-action"
                    onClick={item.onAction}
                  >
                    {item.actionLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
