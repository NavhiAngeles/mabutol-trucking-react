import { useEffect, useState } from "react";
import FleetRefreshButton from "./FleetRefreshButton";
import PaginationFooter from "./PaginationFooter";
import RowActionMenu from "./RowActionMenu";
import { SkeletonTableRows } from "../../components/Skeleton/Skeleton";
import { reverseGeocodeLuzon, toPoint } from "../../services/geocodingService";
import LocationMapModal from "../../components/LocationPicker/LocationMapModal";

const PAGE_SIZE = 10;

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
};

export default function FleetDriversView({
  fleet,
  drivers,
  driversLoading,
  driverComplianceRows,
  onRegisterDriver,
  onEditDriver,
  onOpenDocuments,
  onDeleteDriver,
  openMenuId,
  menuRef,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}) {
  const [driverSearch, setDriverSearch] = useState("");
  const [driverPage, setDriverPage] = useState(1);
  const [driverPlaces, setDriverPlaces] = useState({});
  const [selectedMapDriver, setSelectedMapDriver] = useState(null);

  const filteredDrivers = drivers.filter((driver) => {
    if (!driverSearch.trim()) return true;
    const q = driverSearch.toLowerCase();
    return (
      driver.full_name?.toLowerCase().includes(q) ||
      driver.contact_number?.toLowerCase().includes(q) ||
      driver.license_number?.toLowerCase().includes(q) ||
      (driver.assignedTrucks || (driver.assignedTruck ? [driver.assignedTruck] : [])).some(truck => truck.plate_number?.toLowerCase().includes(q))
    );
  });

  const driverPageCount = Math.max(1, Math.ceil(filteredDrivers.length / PAGE_SIZE));
  const currentDriverPage = Math.min(driverPage, driverPageCount);
  const pagedDrivers = filteredDrivers.slice((currentDriverPage - 1) * PAGE_SIZE, currentDriverPage * PAGE_SIZE);

  const pageLocationKey = pagedDrivers
    .map((driver) => {
      const pt = toPoint(driver.location?.latitude, driver.location?.longitude);
      return `${driver.id}:${pt ? `${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}` : ""}`;
    })
    .join("|");

  useEffect(() => {
    const controller = new AbortController();
    pagedDrivers.forEach((driver) => {
      const pt = toPoint(driver.location?.latitude, driver.location?.longitude);
      if (!pt) return;
      const cacheKey = `${driver.id}:${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}`;
      reverseGeocodeLuzon(pt.lat, pt.lng, { signal: controller.signal })
        .then((place) => {
          if (controller.signal.aborted) return;
          setDriverPlaces((prev) => ({
            ...prev,
            [cacheKey]: {
              status: place ? "ready" : "unavailable",
              shortLabel: place?.shortLabel || "",
            },
          }));
        })
        .catch((err) => {
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          setDriverPlaces((prev) => ({
            ...prev,
            [cacheKey]: { status: "unavailable", shortLabel: "" },
          }));
        });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLocationKey]);

  return (
    <>
      <div className="header-actions-row">
        <div className="header-titles">
          <h1>Drivers</h1>
          <p className="subtitle">REGISTERED DRIVERS AND SYSTEM ROSTERS.</p>
        </div>
        <div className="action-buttons-group">
          <FleetRefreshButton loading={fleet.loading} onRefresh={fleet.refresh} />
          <button type="button" className="btn-primary" onClick={onRegisterDriver}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>+ Register Driver</span>
          </button>
        </div>
      </div>

      <div className="table-filter-bar">
        <label htmlFor="fleetDriverSearch" className="sr-only">Search drivers</label>
        <input
          id="fleetDriverSearch"
          className="inner-search"
          placeholder="Search drivers by name, phone or license…"
          aria-label="Search drivers"
          value={driverSearch}
          onChange={(event) => {
            setDriverSearch(event.target.value);
            setDriverPage(1);
          }}
        />
      </div>

      {driversLoading && drivers.length === 0 && (
        <p role="status" className="fleet-panel-state">Loading drivers list…</p>
      )}
      <div className="fleet-table-scroll" aria-busy={driversLoading}>
        <table className="premium-table">
          <thead>
            <tr>
              <th>DRIVER DETAILS</th>
              <th>LICENSE INFORMATION</th>
              <th>VEHICLE</th>
              <th>CURRENT LOCATION</th>
              <th>STATUS</th>
              <th>COMPLIANCE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {driversLoading && drivers.length === 0 ? (
              <SkeletonTableRows
                rows={6}
                columns={["stack", "stack", "text", "stack", "badge", "short", "action"]}
              />
            ) : filteredDrivers.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                  {fleet.error ? "Driver data unavailable; retry above." : driverSearch ? "No drivers matching search filter." : "No drivers registered yet."}
                </td>
              </tr>
            ) : (
              pagedDrivers.map((driver) => {
                const complianceRow = driverComplianceRows.find((r) => r.driver.id === driver.id);
                const isVerified = complianceRow?.overallStatus === "verified";
                const assignedTrucks = driver.assignedTrucks || (driver.assignedTruck ? [driver.assignedTruck] : []);

                return (
                  <tr key={driver.id}>
                    <td>
                      <strong>{driver.full_name}</strong>
                      <br />
                      <span className="subtext driver-contact">{driver.contact_number || "No contact"}</span>
                    </td>
                    <td>
                      {driver.license_number || "N/A"}
                      {driver.date_hired && (
                        <>
                          <br />
                          <span className="subtext">Hired: {formatDate(driver.date_hired)}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {assignedTrucks.map(truck => <div key={truck.id}>{truck.model || "Truck"} ({truck.plate_number})</div>)}
                      {driver.vehicleAssignmentUnavailable && <span className="subtext">Assigned vehicle unavailable</span>}
                      {assignedTrucks.length === 0 && !driver.vehicleAssignmentUnavailable && (
                        <span style={{ color: "#64748B" }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const pt = driver.location
                          ? toPoint(driver.location.latitude, driver.location.longitude)
                          : null;
                        if (!pt) return "No GPS report";
                        const cacheKey = `${driver.id}:${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}`;
                        const resolved = driverPlaces[cacheKey];
                        const placeLabel = !resolved
                          ? "Locating area…"
                          : resolved.shortLabel || "GPS recorded";
                        return (
                          <div className="fleet-driver-location-cell">
                            <span className="fleet-driver-place">{placeLabel}</span>
                            <span className="subtext">
                              {driver.location.stale ? "Last known GPS · " : "GPS · "}
                              {new Date(driver.location.recorded_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                            </span>
                            <button
                              type="button"
                              className="fleet-view-map-btn"
                              aria-label={`View ${driver.full_name} on map`}
                              onClick={() => setSelectedMapDriver(driver)}
                            >
                              View map
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {driver.status === "on_route" || driver.status === "on_trip" ? (
                        <span className="status-pill status-transit">ON ROUTE</span>
                      ) : driver.status === "inactive" ? (
                        <span className="status-pill status-danger">INACTIVE</span>
                      ) : (
                        <span className="status-pill status-active">{driver.reserved ? "RESERVED" : driver.status ? driver.status.toUpperCase() : "UNKNOWN"}</span>
                      )}
                    </td>
                    <td>
                      {isVerified ? (
                        <span className="text-success">Verified</span>
                      ) : (
                        <span className="text-warning">Pending Review</span>
                      )}
                    </td>
                    <td className="fleet-actions-cell text-center">
                      <RowActionMenu
                        menuKey={`driver-${driver.id}`}
                        isOpen={openMenuId === `driver-${driver.id}`}
                        menuRef={menuRef}
                        menuPosition={menuPosition}
                        buttonAriaLabel={`Actions for driver ${driver.full_name}`}
                        editLabel="Edit driver"
                        onOpenMenu={onOpenMenu}
                        onEdit={() => {
                          onCloseMenu();
                          onEditDriver(driver);
                        }}
                        onDocuments={() => {
                          onCloseMenu();
                          onOpenDocuments(driver);
                        }}
                        onDelete={() => {
                          onCloseMenu();
                          onDeleteDriver(driver);
                        }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        entityLabel="drivers"
        paginationAriaLabel="Drivers table pagination"
        pagesAriaLabel="Drivers pages"
        previousAriaLabel="Previous drivers page"
        nextAriaLabel="Next drivers page"
        totalItems={filteredDrivers.length}
        currentPage={currentDriverPage}
        pageCount={driverPageCount}
        pageSize={PAGE_SIZE}
        disabled={driversLoading || Boolean(fleet.error)}
        onPageChange={setDriverPage}
      />

      <LocationMapModal
        open={Boolean(selectedMapDriver?.location)}
        onClose={() => setSelectedMapDriver(null)}
        title={
          selectedMapDriver
            ? `${selectedMapDriver.full_name}${
                selectedMapDriver.assignedTrucks?.[0]?.plate_number
                  ? ` · ${selectedMapDriver.assignedTrucks[0].plate_number}`
                  : selectedMapDriver.assignedTruck?.plate_number
                    ? ` · ${selectedMapDriver.assignedTruck.plate_number}`
                    : ""
              }`
            : ""
        }
        subtitle={selectedMapDriver?.contact_number || ""}
        lat={selectedMapDriver?.location?.latitude}
        lng={selectedMapDriver?.location?.longitude}
        recordedAt={selectedMapDriver?.location?.recorded_at}
        stale={Boolean(selectedMapDriver?.location?.stale)}
      />
    </>
  );
}
