import { supabase } from './supabaseClient';

export function deliveryWorkflowService(client = supabase) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  function routeData(form) {
    const fields = ['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng', 'distance_km', 'duration_minutes'];
    const data = Object.fromEntries(fields.map(key => [key, form[key] === '' || form[key] == null ? NaN : Number(form[key])]));
    if (Object.values(data).some(value => !Number.isFinite(value)) || Math.abs(data.pickup_lat) > 90 || Math.abs(data.dropoff_lat) > 90 ||
      Math.abs(data.pickup_lng) > 180 || Math.abs(data.dropoff_lng) > 180 || data.distance_km <= 0 || data.duration_minutes <= 0) throw Error('Enter valid confirmed coordinates, road distance and duration.');
    if (!['provider', 'manual'].includes(form.source)) throw Error('Choose a route source.');
    if (form.source === 'manual' && (form.reason?.trim().length < 5 || !form.reason?.trim())) throw Error('Explain how the manual road route was verified (5–1000 characters).');
    return { ...data, source: form.source, reason: form.source === 'manual' ? form.reason.trim() : null, geometry: form.source === 'provider' ? form.geometry : null };
  }
  return {
    watch(shipmentId, changed) {
      const channel=client.channel(`office-delivery-${shipmentId}`);
      for(const table of ['deliveries','shipments','tracking_logs','notifications','delivery_expenses','delivery_incidents','incident_attachments']) {
        channel.on('postgres_changes',{event:'*',schema:'public',table},changed);
      }
      channel.subscribe();
      const timer=setInterval(changed,30000);
      return ()=>{clearInterval(timer);client.removeChannel(channel);};
    },
    routeData,
    prepareQuote: (request, form) => {
      if (!request?.id || !request.updated_at) throw Error('Reload the request before quoting.');
      return rpc('office_prepare_quote', { p_shipment: request.id, p_expected: request.updated_at, p_data: routeData(form) });
    },
    async calculateRoute(form) {
      const point = (lat, lng) => {
        if (lat === '' || lng === '' || lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) throw Error('Confirm both route coordinates first.');
        return { lat: Number(lat), lng: Number(lng) };
      };
      const { data, error } = await client.functions.invoke('calculate-route', { body: { pickup: point(form.pickup_lat, form.pickup_lng), destination: point(form.dropoff_lat, form.dropoff_lng) } });
      if (error || data?.error || data?.roadOnlyVerified !== true) throw Error(data?.error || 'Provider routing is unavailable. Retry or enter a verified manual route.');
      return { ...form, distance_km: data.distanceKm, duration_minutes: data.estimatedMinutes, source: 'provider', geometry: data.geojson };
    },
    async load(shipmentId) {
      const [record, result] = await Promise.all([
        rpc('mobile_shipment_details', { p_shipment: shipmentId }),
        client.from('deliveries').select('id,driver_id,status,updated_at,proof_attempt,proof_review_status,proof_review_reason,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at').eq('shipment_id', shipmentId).order('assigned_at', { ascending: false }),
      ]);
      if (result.error) throw result.error;
      const evidence = result.data?.length ? await rpc('mobile_driver_evidence', { p_shipment: shipmentId }) : { expenses: [], incident_evidence: [] };
      return { ...record, ...evidence, deliveries: result.data || [] };
    },
    async proofUrl(shipmentId, documentId) {
      const details = await rpc('mobile_shipment_details', { p_shipment: shipmentId });
      const doc = details.documents.find(item => item.id === documentId);
      if (!doc?.storage_path || doc.storage_path.split('/').includes('..')) throw Error('Recorded proof not found.');
      const { data, error } = await client.storage.from('delivery-documents').createSignedUrl(doc.storage_path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    action: (delivery, action, reason) => rpc('office_delivery_action', { p_delivery: delivery.id, p_expected: delivery.updated_at, p_action: action, p_reason: reason?.trim() || null }),
    async evidenceUrl(shipmentId, kind, recordId) {
      const path = await rpc('mobile_delivery_evidence_file', { p_shipment: shipmentId, p_kind: kind, p_record: recordId });
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..')) throw Error('Recorded file not found.');
      const { data, error } = await client.storage.from('delivery-documents').createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    reviewExpense: (expense, status, reason) => rpc('office_review_expense', { p_expense: expense.id, p_expected: expense.updated_at, p_status: status, p_reason: reason?.trim() || '' }),
    resolveIncident: (incident, delivery, reason) => rpc('office_resolve_incident', { p_incident: incident.id, p_expected: delivery.updated_at, p_reason: reason?.trim() || '' }),
  };
}
