import { supabase } from './supabaseClient';
import { getTrucks, getDrivers, getMaintenanceRecords, getVehicleTypes, getCargoCategories, getTruckComplianceRows, getDriverComplianceRows } from './fleetService';
import { fetchOperationalRows } from './dashboardService';
import { dispatchReadyIds } from './operationalStats';
import { latestTracking } from './dashboardAnalytics.js';

export const FLEET_TABLES = ['trucks', 'drivers', 'deliveries', 'maintenance_records', 'compliance_documents', 'tracking_logs', 'vehicle_types', 'cargo_categories', 'truck_cargo_categories'];
export function fleetDisplayStatus(truck, deliveries, maintenanceRecords) {
  if (truck.status === 'maintenance' || maintenanceRecords.some(m => m.truck_id === truck.id && m.status === 'in_progress')) return 'maintenance';
  const trips = deliveries.filter(d => d.truck_id === truck.id);
  if (trips.some(d => d.status === 'in_transit')) return 'on_trip';
  if (trips.some(d => d.status === 'loading')) return 'loading';
  if (trips.some(d => d.status === 'assigned')) return 'reserved';
  return truck.status;
}
export async function getFleetSnapshot() {
  const [trucks, drivers, maintenanceRecords, vehicleTypes, cargoCategories, truckComplianceRows, driverComplianceRows, deliveries, gps] = await Promise.all([
    getTrucks(), getDrivers(), getMaintenanceRecords(), getVehicleTypes(), getCargoCategories(), getTruckComplianceRows(), getDriverComplianceRows(),
    fetchOperationalRows('deliveries', 'id,truck_id,driver_id,status'),
    fetchOperationalRows('tracking_logs', 'id,delivery_id,truck_id,driver_id,latitude,longitude,recorded_at'),
  ]);
  const locations = latestTracking(gps, deliveries);
  const reservedDrivers = new Set(deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status)).map(d => d.driver_id));
  const ready = new Set(dispatchReadyIds(trucks, deliveries, maintenanceRecords));
  const activeTrucks = new Set(deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status)).map(d => d.truck_id));
  const servicing = new Set(maintenanceRecords.filter(m => m.status === 'in_progress').map(m => m.truck_id));
  const assignedDrivers = new Set(trucks.map(t => t.drivers?.id).filter(Boolean));
  return {
    trucks: trucks.map(t => ({ ...t, displayStatus: fleetDisplayStatus(t, deliveries, maintenanceRecords) })), drivers: drivers.map(d => ({ ...d, location: locations.find(l => l.driver_id === d.id), reserved: reservedDrivers.has(d.id) })),
    maintenanceRecords, vehicleTypes, cargoCategories, truckComplianceRows, driverComplianceRows,
    assignableTrucks: trucks.filter(t => ready.has(t.id) && !t.drivers),
    assignableDrivers: drivers.filter(d => d.status === 'available' && !reservedDrivers.has(d.id) && !assignedDrivers.has(d.id)),
    kpis: { total: trucks.length, available: ready.size, maintenance: trucks.filter(t => t.status === 'maintenance' || servicing.has(t.id)).length,
      onTrip: trucks.filter(t => t.status === 'on_trip' || activeTrucks.has(t.id)).length },
  };
}
export function validateComplianceFile(file) {
  if (!file) return;
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, PNG, JPEG or WebP file.');
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Files must be between 1 byte and 10 MB.');
}
export async function saveFleetRecord(kind, record, payload, { categories = null, documents = [] } = {}) {
  // Prevalidate every file before uploading any of them.
  documents.forEach(d => validateComplianceFile(d.file));
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Please sign in again.');
  const uploads = [];
  const staged = [];
  try {
    for (const doc of documents) {
      const { file, ...metadata } = doc;
      if (file) {
        const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
        const path = user.id + '/' + crypto.randomUUID() + '/document.' + extension;
        const { error } = await supabase.storage.from('compliance-documents').upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error('Document upload failed. Please retry.');
        uploads.push(path); metadata.file_path = path;
      }
      staged.push(metadata);
    }
    const data = kind === 'document' ? { ...payload, ...staged[0] } : payload;
    const { data: id, error } = await supabase.rpc('fleet_save', {
      p_kind: kind, p_id: record?.id || null, p_data: data, p_categories: categories,
      p_documents: kind === 'document' ? [] : staged, p_expected: record?.updated_at || null,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Fleet database setup is pending. Your changes have not been saved.');
      throw new Error(error.message || 'Unable to save the record.');
    }
    if (!id) throw new Error('The database did not confirm the save.');
    return { id };
  } catch (error) {
    if (uploads.length) {
      // Only these newly staged, unlinked uploads can be removed by the storage policy.
      const cleanup = await supabase.storage.from('compliance-documents').remove(uploads);
      if (cleanup.error) throw new Error(error.message + ' Unlinked uploaded files could not be cleaned up; ask an administrator to check storage.', { cause: error });
    }
    throw error;
  }
}
export async function openComplianceFile(path) {
  if (!path || /^(https?:|data:)/i.test(path)) throw new Error('No private stored file is linked to this document.');
  const { data, error } = await supabase.storage.from('compliance-documents').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error('Unable to open the document.');
  return data.signedUrl;
}
export async function registerDriver(form, docs) {
  const payload = { full_name: form.fullName.trim(), contact_number: form.contactNumber.trim(), date_hired: form.dateHired || null,
    emergency_contact_number: form.emergencyContact || null, license_number: form.licenseNumber.trim(), assigned_truck_id: form.assignVehicle || null };
  if (!!form.email !== !!form.password) throw new Error('Provide both email and password, or leave both empty for a roster-only driver.');
  if (!form.email) return saveFleetRecord('driver', null, payload, { documents: docs });
  if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.');
  const { data, error } = await supabase.functions.invoke('create-driver-user', { body: {
    email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), registration: { payload, documents: docs },
  } });
  if (error) {
    let message = 'Unable to create the driver account. Please retry.';
    try { message = (await error.context.json()).error || message; } catch { /* no structured response */ }
    throw new Error(message);
  }
  if (!data?.driverId) throw new Error('Driver registration was not confirmed. Contact an administrator before retrying.');
  return { id: data.driverId };
}
