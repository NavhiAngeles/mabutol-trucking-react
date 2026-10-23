import { useCallback, useEffect, useRef, useState } from 'react';
import { saveFleetRecord, validateComplianceFile, openComplianceFile } from '../../services/fleetWorkspaceService';
import { getComplianceDocumentsForTruck, getComplianceDocumentsForDriver, TRUCK_COMPLIANCE_DOC_TYPES, DRIVER_COMPLIANCE_DOC_TYPES, getComplianceDocBadge } from '../../services/fleetService';
import { useLiveData } from '../../hooks/useLiveData';

const DOCUMENT_TABLES = ['compliance_documents'];
function useDialog(onClose, busy) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  return { ref, onCancel: event => { event.preventDefault(); if (!busy) onClose(); } };
}
function Field({ label, name, form, setForm, options, ...props }) {
  const id = 'fleet-field-' + name;
  return <div className="form-group"><label htmlFor={id}>{label}</label>{options
    ? <select id={id} value={form[name] ?? ''} onChange={e => setForm({ ...form, [name]: e.target.value })} {...props}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
    : <input id={id} value={form[name] ?? ''} onChange={e => setForm({ ...form, [name]: e.target.value })} {...props} />}</div>;
}
export function FleetEditor({ kind, record, fleet, onClose, onSaved }) {
  const [form, setForm] = useState(() => kind === 'truck' ? { ...record, assigned_driver_id: record.drivers?.id || '', vehicle_type_id: record.vehicle_types?.id || '' }
    : kind === 'driver' ? { ...record } : { truck_id: '', kind: 'preventive', status: 'scheduled', scheduled_date: '', description: '', vendor: '', cost: '', ...record });
  const [categories, setCategories] = useState(() => record?.cargoCategories?.map(c => c.id) || []);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState('');
  const dialog = useDialog(onClose, busy);
  async function save(event) {
    event.preventDefault(); if (guard.current) return;
    guard.current = true; setBusy(true); setError('');
    try { await saveFleetRecord(kind, record, form, { categories: kind === 'truck' ? categories : null }); onSaved(); onClose(); }
    catch (error) { setError(error.message); } finally { guard.current = false; setBusy(false); }
  }
  const field = (name, label, props = {}) => <Field key={name} name={name} label={label} form={form} setForm={setForm} {...props} />;
  return <dialog {...dialog} className="fleet-dialog">
    <form onSubmit={save}><h3>{record ? 'Edit' : 'Schedule'} {kind === 'truck' ? 'vehicle' : kind}</h3>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy}><div className="form-grid">
        {kind === 'truck' && <>
          {field('plate_number', 'Plate number', { required: true })}
          {field('model', 'Model', { required: true })}
          {field('model_year', 'Model year', { type: 'number', min: 1980, max: 2100 })}
          {field('capacity_kg', 'Registered capacity (kg)', { type: 'number', min: 1, step: 'any', required: true })}
          {field('vehicle_type_id', 'Vehicle type', { required: true, options: [['', 'Select vehicle type'], ...fleet.vehicleTypes.map(t => [t.id, t.name])] })}
          {field('assigned_driver_id', 'Assigned driver', { options: [['', 'Unassigned'], ...fleet.drivers.filter(d => d.id === form.assigned_driver_id || fleet.assignableDrivers.some(a => a.id === d.id)).map(d => [d.id, d.full_name])] })}
          {field('status', 'Status', { options: ['available', 'maintenance', 'inactive', ...(form.status === 'on_trip' ? ['on_trip'] : [])].map(v => [v, v.replaceAll('_', ' ')]) })}
        </>}
        {kind === 'driver' && <>
          {field('full_name', 'Full name', { required: true })}
          {field('license_number', 'License number', { required: true })}
          {field('contact_number', 'Contact number')}
          {field('date_hired', 'Date hired', { type: 'date' })}
          {field('emergency_contact_number', 'Emergency contact')}
          {field('status', 'Status', { options: ['available', 'off_duty', 'on_leave', 'inactive', ...(form.status === 'on_trip' ? ['on_trip'] : [])].map(v => [v, v.replaceAll('_', ' ')]) })}
        </>}
        {kind === 'maintenance' && <>
          {field('truck_id', 'Vehicle', { required: true, disabled: !!record, options: [['', 'Select vehicle'], ...fleet.trucks.map(t => [t.id, t.plate_number])] })}
          {field('kind', 'Service type', { options: ['preventive', 'repair', 'inspection', 'tire', 'other'].map(v => [v, v]) })}
          {field('status', 'Status', { options: ['scheduled', 'in_progress', 'completed', 'cancelled'].map(v => [v, v.replaceAll('_', ' ')]) })}
          {field('scheduled_date', 'Scheduled date', { type: 'date', required: true })}
          {field('completed_date', 'Completion date', { type: 'date', required: form.status === 'completed', min: form.scheduled_date })}
          {field('vendor', 'Workshop')}
          {field('description', 'Description')}
          {field('cost', 'Cost (PHP)', { type: 'number', min: 0, step: '0.01' })}
        </>}
        {kind !== 'maintenance' && field('notes', 'Notes')}
      </div>
      {kind === 'truck' && <div><p>Cargo compatibility</p>{fleet.cargoCategories.length === 0 && <p>No cargo categories configured.</p>}{fleet.cargoCategories.map(c => <label className="fleet-check" key={c.id}><input type="checkbox" checked={categories.includes(c.id)} onChange={e => setCategories(e.target.checked ? [...categories, c.id] : categories.filter(id => id !== c.id))} />{c.name}</label>)}</div>}
      <div className="modal-footer"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary">{busy ? 'Saving…' : 'Save changes'}</button></div></fieldset>
    </form>
  </dialog>;
}
function DocumentForm({ record, entity, kind, onSaved, onCancel }) {
  const types = kind === 'truck' ? TRUCK_COMPLIANCE_DOC_TYPES : DRIVER_COMPLIANCE_DOC_TYPES;
  const [form, setForm] = useState(() => ({ doc_type: types[0].docType, document_number: '', issued_date: '', expiry_date: '', review_status: 'pending_review', remarks: '', ...record, [kind + '_id']: entity.id }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guard = useRef(false);
  async function save(event) {
    event.preventDefault(); if (guard.current) return;
    guard.current = true; setBusy(true); setError('');
    try {
      validateComplianceFile(file);
      await saveFleetRecord('document', record, form, { documents: [{ ...form, file }] });
      onSaved();
    } catch (error) { setError(error.message); }
    finally { guard.current = false; setBusy(false); }
  }
  return <form onSubmit={save}>
    <h4>{record ? 'Edit document' : 'Add document'}</h4>{error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}><div className="form-grid">
      <Field label="Document type" name="doc_type" form={form} setForm={setForm} disabled={!!record} options={types.map(t => [t.docType, t.label])} />
      <Field label="Document number" name="document_number" form={form} setForm={setForm} />
      <Field label="Issued date" name="issued_date" form={form} setForm={setForm} type="date" />
      <Field label="Expiry date" name="expiry_date" form={form} setForm={setForm} type="date" min={form.issued_date || undefined} />
      <Field label="Review status" name="review_status" form={form} setForm={setForm} options={['pending_review', 'approved', 'rejected'].map(v => [v, v.replaceAll('_', ' ')])} />
      <Field label="Remarks (use OR copy / CR copy for registration)" name="remarks" form={form} setForm={setForm} />
      <label>Private file (PDF, PNG, JPG, WebP; up to 10 MB)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => { setFile(e.target.files[0] || null); setError(''); }} /></label>
    </div><div className="modal-footer"><button className="btn-secondary" type="button" onClick={onCancel}>Cancel edit</button><button className="btn-primary">{busy ? 'Saving…' : 'Save document'}</button></div></fieldset>
  </form>;
}
export function ComplianceDialog({ kind, entity, onClose, onSaved }) {
  const loader = useCallback(() => kind === 'truck' ? getComplianceDocumentsForTruck(entity.id) : getComplianceDocumentsForDriver(entity.id), [kind, entity.id]);
  const live = useLiveData(loader, DOCUMENT_TABLES);
  const [editing, setEditing] = useState(undefined);
  const [fileUrl, setFileUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const dialog = useDialog(onClose, editing !== undefined);
  async function view(doc) {
    setFileUrl(''); setFileError('');
    try { setFileUrl(await openComplianceFile(doc.file_path)); }
    catch (error) { setFileError(error.message); }
  }
  return <dialog {...dialog} className="fleet-dialog">
    <h3>{entity.plate_number || entity.full_name} — Compliance</h3>
    {editing === undefined && <button className="btn-secondary" onClick={onClose}>Close</button>}
    {live.loading && <p role="status">Loading documents…</p>}
    {live.error && <p role="alert">Could not refresh documents. <button onClick={live.refresh}>Retry</button></p>}
    {fileError && <p role="alert">{fileError}</p>}
    {fileUrl && <p><a href={fileUrl} target="_blank" rel="noreferrer">Open private document (link expires in 60 seconds)</a></p>}
    {editing === undefined ? <>
      <button className="btn-primary" onClick={() => setEditing(null)}>Add document</button>
      {!live.loading && !live.error && !live.data?.length && <p>No compliance documents recorded.</p>}
      <ul className="fleet-documents">{live.data?.map(doc => <li key={doc.id}><strong>{doc.doc_type.replaceAll('_', ' ')}</strong> — {doc.remarks} — {doc.document_number || 'No number'} — {getComplianceDocBadge(doc).label}
        <button onClick={() => setEditing(doc)}>Edit / review</button>{doc.file_path && <button onClick={() => view(doc)}>View file</button>}
      </li>)}</ul>
    </> : <DocumentForm key={editing?.id || 'new'} record={editing} entity={entity} kind={kind} onCancel={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); live.refresh(); onSaved(); }} />}
  </dialog>;
}
