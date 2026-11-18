import FleetRefreshButton from "./FleetRefreshButton";
import MaintenancePanel from "./MaintenancePanel";

export default function FleetMaintenanceView({ fleet }) {
  return (
    <>
      <div className="header-actions-row">
        <div className="header-titles">
          <h1>Maintenance</h1>
          <p className="subtitle">PREVENTIVE MAINTENANCE SCHEDULES AND SERVICE LOGS.</p>
        </div>
        <div className="action-buttons-group">
          <FleetRefreshButton loading={fleet.loading} onRefresh={fleet.refresh} />
        </div>
      </div>

      <MaintenancePanel fleet={fleet} />
    </>
  );
}
