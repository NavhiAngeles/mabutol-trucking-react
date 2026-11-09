import { useCallback, useRef, useState } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import { getFleetSnapshot, FLEET_TABLES, saveFleetRecord, registerDriver, deleteFleetRecord } from '../services/fleetWorkspaceService';

const EMPTY = { kpis: { total: null, available: null, maintenance: null, onTrip: null }, trucks: [], drivers: [], maintenanceRecords: [],
 vehicleTypes: [], assignableTrucks: [], assignableDrivers: [], cargoCategories: [], truckComplianceRows: [], driverComplianceRows: [] };
export function useFleetViewModel() {
  const live = useLiveData(getFleetSnapshot, FLEET_TABLES);
  const state = live.data || EMPTY;
  const { refresh } = live;
  const [submitting, setSubmitting] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const guard = useRef(false);
  const submit = useCallback(async (kind, operation) => {
    if (guard.current) throw new Error('A save is already in progress.');
    guard.current = true; setSubmitting(kind); setSubmitError(null);
    try {
      const result = await operation();
      if (!result?.id) throw new Error(`The database did not confirm ${kind} registration.`);
      refresh();
      return result;
    }
    catch (error) { setSubmitError(error); throw error; }
    finally { guard.current = false; setSubmitting(null); }
  }, [refresh]);
  const deleteRecord = useCallback(async (kind, id) => {
    if (guard.current) throw new Error('An operation is already in progress.');
    guard.current = true; setSubmitting(`delete-${kind}`); setSubmitError(null);
    try {
      const result = await deleteFleetRecord(kind, id);
      refresh();
      return result;
    } catch (error) {
      setSubmitError(error);
      throw error;
    } finally {
      guard.current = false;
      setSubmitting(null);
    }
  }, [refresh]);
  const removeTruck = useCallback((id) => deleteRecord('truck', id), [deleteRecord]);
  const removeDriver = useCallback((id) => deleteRecord('driver', id), [deleteRecord]);
  const submitNewTruck = form => submit('truck', () => {
    const docs = [
      { doc_type: 'lto_registration', document_number: form.orNumber || null, remarks: 'OR copy', file: form.orFile },
      { doc_type: 'lto_registration', document_number: form.crNumber || null, remarks: 'CR copy', file: form.crFile },
    ].filter(doc => doc.document_number || doc.file);
    return saveFleetRecord('truck', null, { plate_number: form.plateNumber.trim(), model: form.model.trim(), model_year: form.modelYear || null,
      vehicle_type_id: form.type, capacity_kg: Number(form.capacity), assigned_driver_id: form.assignedDriver || null }, { categories: form.cargoCompatibility, documents: docs });
  });
  const submitNewDriver = form => submit('driver', () => registerDriver(form, [
    { doc_type: 'drivers_license', document_number: form.licenseNumber, expiry_date: form.licenseExpiry || null, file: form.licenseFile },
    { doc_type: 'medical_certificate', document_number: form.medicalDocNumber || null, expiry_date: form.medicalExpiry || null, file: form.medicalFile },
    { doc_type: 'nbi_clearance', document_number: form.nbiDocNumber || null, expiry_date: form.nbiExpiry || null, file: form.nbiFile },
  ].filter(doc => doc.document_number || doc.expiry_date || doc.file)));
  return { ...state, refresh: live.refresh, error: live.error, loading: live.loading, hasData: !!live.data,
    kpisLoading: live.loading, trucksLoading: live.loading, driversLoading: live.loading, maintenanceLoading: live.loading,
    truckComplianceLoading: live.loading, driverComplianceLoading: live.loading,
    trucksError: live.error, driversError: live.error, maintenanceError: live.error, truckComplianceError: live.error, driverComplianceError: live.error,
    submitNewTruck, submitNewDriver, isSubmittingTruck: submitting === 'truck', isSubmittingDriver: submitting === 'driver', submitError,
    deleteRecord, removeTruck, removeDriver, isDeleting: Boolean(submitting?.startsWith('delete-')),
    isDeletingTruck: submitting === 'delete-truck', isDeletingDriver: submitting === 'delete-driver' };
}
