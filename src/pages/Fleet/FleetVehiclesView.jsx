import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FleetRefreshButton from "./FleetRefreshButton";
import PaginationFooter from "./PaginationFooter";
import RowActionMenu from "./RowActionMenu";
import { vehicleCategories, vehicleCategoryId } from "./vehicleCategories";
import { SkeletonTableRows } from "../../components/Skeleton/Skeleton";

const PAGE_SIZE = 10;

export default function FleetVehiclesView({
  fleet,
  trucks,
  trucksLoading,
  vehicleTypes,
  truckComplianceRows,
  readyOnly,
  readyIds,
  readyError,
  onClearReadyOnly,
  onAddVehicle,
  onEditTruck,
  onOpenDocuments,
  onDeleteTruck,
  openMenuId,
  menuRef,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}) {
  const [params, setParams] = useSearchParams();
  const [vehicleSearch, setVehicleSearch] = useState("");
  const vehicleCategory = params.get("category") || "all";
  const [vehiclePage, setVehiclePage] = useState(1);

  const categoryTrucks = readyOnly ? trucks.filter(truck => readyIds?.has(truck.id)) : trucks;
  const categories = vehicleCategories(categoryTrucks, vehicleTypes);
  const activeCategory = categories.some(category => category.id === vehicleCategory) ? vehicleCategory : "all";
  const categoryCountsUnavailable = trucksLoading || (readyOnly && !readyIds) || (fleet.error && !fleet.hasData);
  const filteredTrucks = categoryTrucks.filter((truck) => {
    if (activeCategory !== "all" && vehicleCategoryId(truck) !== activeCategory) return false;
    if (!vehicleSearch.trim()) return true;
    const q = vehicleSearch.trim().toLowerCase();
    return (
      truck.plate_number?.toLowerCase().includes(q) ||
      truck.model?.toLowerCase().includes(q) ||
      truck.vehicle_types?.name?.toLowerCase().includes(q) ||
      truck.drivers?.full_name?.toLowerCase().includes(q)
    );
  });

  const vehiclePageCount = Math.max(1, Math.ceil(filteredTrucks.length / PAGE_SIZE));
  const currentVehiclePage = Math.min(vehiclePage, vehiclePageCount);
  const pagedTrucks = filteredTrucks.slice((currentVehiclePage - 1) * PAGE_SIZE, currentVehiclePage * PAGE_SIZE);

  return (
    <>
      {readyOnly && (
        <p role="status">
          Dispatch-ready vehicles only. {readyError || (!readyIds ? "Checking assignments and maintenance…" : `${readyIds.size} eligible vehicles`)}{" "}
          <button type="button" onClick={() => { onClearReadyOnly(); setVehiclePage(1); }}>
            Show all vehicles
          </button>
        </p>
      )}

      <div className="header-actions-row">
        <div className="header-titles">
          <h1>Vehicles</h1>
          <p className="subtitle">REGISTERED FLEET VEHICLES AND OPERATIONAL STATUS.</p>
        </div>
        <div className="action-buttons-group">
          <FleetRefreshButton loading={fleet.loading} onRefresh={fleet.refresh} />
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

      <div className="table-filter-bar">
        <div className="filter-search-wrapper">
          <label htmlFor="fleetSearch" className="sr-only">Search vehicles</label>
          <input
            type="text"
            id="fleetSearch"
            aria-label="Search vehicles"
            className="inner-search"
            placeholder="Search by plate, vehicle type..."
            value={vehicleSearch}
            onChange={(e) => {
              setVehicleSearch(e.target.value);
              setVehiclePage(1);
            }}
          />
        </div>
      </div>

      <nav className="fleet-vehicle-categories" aria-label="Vehicle categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`fleet-vehicle-category${activeCategory === category.id ? " active" : ""}`}
            aria-pressed={activeCategory === category.id}
            aria-controls="fleet-vehicle-details"
            onClick={() => {
              const next = new URLSearchParams(params);
              if (category.id === "all") next.delete("category");
              else next.set("category", category.id);
              setParams(next);
              setVehiclePage(1);
            }}
          >
            {category.label}
            <span className="fleet-category-count">{categoryCountsUnavailable ? "N/A" : category.count}</span>
          </button>
        ))}
      </nav>

      {trucksLoading && trucks.length === 0 && (
        <p role="status" className="fleet-panel-state">Loading fleet vehicles…</p>
      )}
      <div className="fleet-table-scroll" id="fleet-vehicle-details" aria-busy={trucksLoading}>
        <table className="premium-table">
          <thead>
            <tr>
              <th>VEHICLE</th>
              <th>TYPE & CAPACITY</th>
              <th>CARGO COMPATIBILITY</th>
              <th>ASSIGNED DRIVER</th>
              <th>STATUS</th>
              <th>COMPLIANCE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {trucksLoading && trucks.length === 0 ? (
              <SkeletonTableRows
                rows={6}
                columns={["stack", "text", "badge", "short", "badge", "short", "action"]}
              />
            ) : filteredTrucks.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "28px", color: "#64748B" }}>
                  {fleet.error
                    ? "Vehicle data unavailable; retry above."
                    : vehicleSearch.trim() || activeCategory !== "all"
                      ? "No vehicles match this category and search."
                      : readyOnly
                        ? "No dispatch-ready vehicles."
                        : "No vehicles registered in fleet yet."}
                </td>
              </tr>
            ) : (
              pagedTrucks.map((truck) => {
                const complianceRow = truckComplianceRows.find((r) => r.truck.id === truck.id);
                const isVerified = complianceRow?.overallStatus === "verified";

                return (
                  <tr key={truck.id}>
                    <td>
                      <strong>{truck.plate_number}</strong>
                      {truck.fleet_code && <span className="subtext" style={{ marginLeft: "6px" }}>({truck.fleet_code})</span>}
                      <br />
                      <span className="subtext">{[truck.model_year, truck.model].filter(Boolean).join(" ") || "N/A"}</span>
                    </td>
                    <td>
                      {truck.vehicle_types?.name ?? "General Freight"}
                      {truck.capacity_kg ? `, ${truck.capacity_kg.toLocaleString()} kg` : ""}
                    </td>
                    <td>
                      {truck.cargoCategories && truck.cargoCategories.length > 0 ? (
                        truck.cargoCategories.map((c) => (
                          <span key={c.id} className="badge">
                            {c.name.toUpperCase()}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "#64748B" }}>N/A</span>
                      )}
                    </td>
                    <td>{truck.drivers?.full_name ?? <span style={{ color: "#64748B" }}>Unassigned</span>}</td>
                    <td>
                      {(truck.displayStatus || truck.status) === "on_trip" ? (
                        <span className="status-pill status-transit">● IN TRANSIT</span>
                      ) : (truck.displayStatus || truck.status) === "maintenance" ? (
                        <span className="status-pill status-danger">● IN MAINTENANCE</span>
                      ) : (truck.displayStatus || truck.status) === "available" ? (
                        <span className="status-pill status-active">● AVAILABLE</span>
                      ) : (
                        <span className="status-pill status-warning">● {(truck.displayStatus || truck.status || "OFFLINE").replaceAll("_", " ").toUpperCase()}</span>
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
                        menuKey={`truck-${truck.id}`}
                        isOpen={openMenuId === `truck-${truck.id}`}
                        menuRef={menuRef}
                        menuPosition={menuPosition}
                        buttonAriaLabel={`Actions for vehicle ${truck.plate_number}`}
                        editLabel="Edit vehicle"
                        onOpenMenu={onOpenMenu}
                        onEdit={() => {
                          onCloseMenu();
                          onEditTruck(truck);
                        }}
                        onDocuments={() => {
                          onCloseMenu();
                          onOpenDocuments(truck);
                        }}
                        onDelete={() => {
                          onCloseMenu();
                          onDeleteTruck(truck);
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
        entityLabel="vehicles"
        paginationAriaLabel="Vehicles table pagination"
        pagesAriaLabel="Vehicles pages"
        previousAriaLabel="Previous vehicles page"
        nextAriaLabel="Next vehicles page"
        totalItems={filteredTrucks.length}
        currentPage={currentVehiclePage}
        pageCount={vehiclePageCount}
        pageSize={PAGE_SIZE}
        disabled={trucksLoading || Boolean(fleet.error)}
        onPageChange={setVehiclePage}
      />
    </>
  );
}
