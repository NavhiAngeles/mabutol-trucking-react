// useFleetViewModel.js
// Owns all Fleet page state and talks to fleetService. Fleet.jsx should
// consume this hook instead of holding mock data / raw fetch calls.
import { useState, useEffect, useCallback } from "react";
import {
    getFleetKPIs,
    getTrucks,
    createTruck,
    getAssignableTrucks,
    getDrivers,
    createDriver,
    getMaintenanceRecords,
    getVehicleTypes,
    getCargoCategories,
    getTruckComplianceRows,
    getDriverComplianceRows,
} from "../services/fleetService"; // adjust path to match where you save fleetService.js

export function useFleetViewModel() {
    // ---- KPI cards ----
    const [kpis, setKpis] = useState({ total: 0, available: 0, maintenance: 0, onTrip: 0 });
    const [kpisLoading, setKpisLoading] = useState(true);

    // ---- Vehicles table ----
    const [trucks, setTrucks] = useState([]);
    const [trucksLoading, setTrucksLoading] = useState(true);
    const [trucksError, setTrucksError] = useState(null);

    // ---- Drivers table ----
    const [drivers, setDrivers] = useState([]);
    const [driversLoading, setDriversLoading] = useState(true);
    const [driversError, setDriversError] = useState(null);

    // ---- Maintenance table ----
    const [maintenanceRecords, setMaintenanceRecords] = useState([]);
    const [maintenanceLoading, setMaintenanceLoading] = useState(true);
    const [maintenanceError, setMaintenanceError] = useState(null);

    // ---- Compliance tabs (Vehicles > Compliance, Drivers > Compliance) ----
    const [truckComplianceRows, setTruckComplianceRows] = useState([]);
    const [truckComplianceLoading, setTruckComplianceLoading] = useState(true);
    const [truckComplianceError, setTruckComplianceError] = useState(null);

    const [driverComplianceRows, setDriverComplianceRows] = useState([]);
    const [driverComplianceLoading, setDriverComplianceLoading] = useState(true);
    const [driverComplianceError, setDriverComplianceError] = useState(null);

    // ---- Supporting lookups (dropdowns in the Add Vehicle / Register Driver modals) ----
    const [vehicleTypes, setVehicleTypes] = useState([]);
    const [assignableTrucks, setAssignableTrucks] = useState([]);
    const [cargoCategories, setCargoCategories] = useState([]);

    // ---- Modal submit state ----
    const [isSubmittingDriver, setIsSubmittingDriver] = useState(false);
    const [isSubmittingTruck, setIsSubmittingTruck] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    /* ---------------- fetchers ---------------- */

    const refetchKpis = useCallback(async () => {
        setKpisLoading(true);
        try {
            const data = await getFleetKPIs();
            setKpis(data);
        } catch (err) {
            console.error("Failed to load fleet KPIs:", err);
        } finally {
            setKpisLoading(false);
        }
    }, []);

    const refetchTrucks = useCallback(async () => {
        setTrucksLoading(true);
        setTrucksError(null);
        try {
            const data = await getTrucks();
            setTrucks(data);
        } catch (err) {
            setTrucksError(err);
        } finally {
            setTrucksLoading(false);
        }
    }, []);

    const refetchDrivers = useCallback(async () => {
        setDriversLoading(true);
        setDriversError(null);
        try {
            const data = await getDrivers();
            setDrivers(data);
        } catch (err) {
            setDriversError(err);
        } finally {
            setDriversLoading(false);
        }
    }, []);

    const refetchMaintenance = useCallback(async () => {
        setMaintenanceLoading(true);
        setMaintenanceError(null);
        try {
            const data = await getMaintenanceRecords();
            setMaintenanceRecords(data);
        } catch (err) {
            setMaintenanceError(err);
        } finally {
            setMaintenanceLoading(false);
        }
    }, []);

    const refetchTruckCompliance = useCallback(async () => {
        setTruckComplianceLoading(true);
        setTruckComplianceError(null);
        try {
            const data = await getTruckComplianceRows();
            setTruckComplianceRows(data);
        } catch (err) {
            setTruckComplianceError(err);
        } finally {
            setTruckComplianceLoading(false);
        }
    }, []);

    const refetchDriverCompliance = useCallback(async () => {
        setDriverComplianceLoading(true);
        setDriverComplianceError(null);
        try {
            const data = await getDriverComplianceRows();
            setDriverComplianceRows(data);
        } catch (err) {
            setDriverComplianceError(err);
        } finally {
            setDriverComplianceLoading(false);
        }
    }, []);

    const refetchLookups = useCallback(async () => {
        try {
            const [types, assignable, categories] = await Promise.all([
                getVehicleTypes(),
                getAssignableTrucks(),
                getCargoCategories(),
            ]);
            setVehicleTypes(types);
            setAssignableTrucks(assignable);
            setCargoCategories(categories);
        } catch (err) {
            console.error("Failed to load fleet lookups:", err);
        }
    }, []);

    // Initial load
    useEffect(() => {
        refetchKpis();
        refetchTrucks();
        refetchDrivers();
        refetchMaintenance();
        refetchTruckCompliance();
        refetchDriverCompliance();
        refetchLookups();
    }, [
        refetchKpis,
        refetchTrucks,
        refetchDrivers,
        refetchMaintenance,
        refetchTruckCompliance,
        refetchDriverCompliance,
        refetchLookups,
    ]);

    /* ---------------- mutations (called from the modals) ---------------- */

    /**
     * Submits Step 1 & 2 (+ optional assigned vehicle and manual compliance documents)
     * of the Register Driver modal.
     * `form` is the driverForm state shape from Fleet.jsx.
     */
    const submitNewDriver = useCallback(
        async (form) => {
            setIsSubmittingDriver(true);
            setSubmitError(null);
            try {
                // Build manual compliance docs from form entries
                const complianceDocs = [];
                if (form.licenseNumber) {
                    complianceDocs.push({
                        doc_type: "drivers_license",
                        document_number: form.licenseNumber,
                        expiry_date: form.licenseExpiry || null,
                        review_status: "valid",
                    });
                }
                if (form.medicalDocNumber || form.medicalExpiry) {
                    complianceDocs.push({
                        doc_type: "medical_certificate",
                        document_number: form.medicalDocNumber || null,
                        expiry_date: form.medicalExpiry || null,
                        review_status: "valid",
                    });
                }
                if (form.nbiDocNumber || form.nbiExpiry) {
                    complianceDocs.push({
                        doc_type: "nbi_clearance",
                        document_number: form.nbiDocNumber || null,
                        expiry_date: form.nbiExpiry || null,
                        review_status: "valid",
                    });
                }

                const driver = await createDriver(
                    {
                        full_name: form.fullName,
                        contact_number: form.contactNumber,
                        date_hired: form.dateHired || null,
                        emergency_contact_number: form.emergencyContact || null,
                        license_number: form.licenseNumber,
                    },
                    form.assignVehicle || null,
                    complianceDocs
                );

                await Promise.all([
                    refetchDrivers(),
                    refetchTrucks(),
                    refetchKpis(),
                    refetchLookups(),
                    refetchDriverCompliance(),
                ]);
                return driver;
            } catch (err) {
                setSubmitError(err);
                throw err;
            } finally {
                setIsSubmittingDriver(false);
            }
        },
        [refetchDrivers, refetchTrucks, refetchKpis, refetchLookups, refetchDriverCompliance]
    );

    /**
     * Submits Step 1 (+ cargo compatibility) of the Add Vehicle modal.
     * `form` is the vehicleForm state shape from Fleet.jsx.
     */
    const submitNewTruck = useCallback(
        async (form) => {
            setIsSubmittingTruck(true);
            setSubmitError(null);
            try {
                const truck = await createTruck(
                    {
                        plate_number: form.plateNumber,
                        model: form.model,
                        model_year: form.modelYear ? Number(form.modelYear) : null,
                        vehicle_type_id: form.type || null,
                        capacity_kg: form.capacity ? Number(form.capacity) : null,
                        assigned_driver_id: form.assignedDriver || null,
                    },
                    form.cargoCompatibility || []
                );
                await Promise.all([
                    refetchTrucks(),
                    refetchKpis(),
                    refetchLookups(),
                    refetchTruckCompliance(),
                ]);
                return truck;
            } catch (err) {
                setSubmitError(err);
                throw err;
            } finally {
                setIsSubmittingTruck(false);
            }
        },
        [refetchTrucks, refetchKpis, refetchLookups, refetchTruckCompliance]
    );

    return {
        // KPIs
        kpis,
        kpisLoading,

        // Vehicles
        trucks,
        trucksLoading,
        trucksError,
        refetchTrucks,

        // Drivers
        drivers,
        driversLoading,
        driversError,
        refetchDrivers,

        // Maintenance
        maintenanceRecords,
        maintenanceLoading,
        maintenanceError,
        refetchMaintenance,

        // Compliance
        truckComplianceRows,
        truckComplianceLoading,
        truckComplianceError,
        refetchTruckCompliance,
        driverComplianceRows,
        driverComplianceLoading,
        driverComplianceError,
        refetchDriverCompliance,

        // Lookups for modal dropdowns
        vehicleTypes,
        assignableTrucks,
        cargoCategories,

        // Mutations
        submitNewDriver,
        submitNewTruck,
        isSubmittingDriver,
        isSubmittingTruck,
        submitError,
    };
}