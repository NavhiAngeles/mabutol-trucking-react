import { useCallback, useEffect, useRef, useState } from 'react';
import { saveFleetRecord, validateComplianceFile, openComplianceFile } from '../../services/fleetWorkspaceService';
import { getComplianceDocumentsForTruck, getComplianceDocumentsForDriver, TRUCK_COMPLIANCE_DOC_TYPES, DRIVER_COMPLIANCE_DOC_TYPES, getComplianceDocBadge } from '../../services/fleetService';
import { useLiveData } from '../../hooks/useLiveData';

const DOCUMENT_TABLES = ['compliance_documents'];

export function FleetModal({
  isOpen,
  onRequestClose,
  titleId,
  ariaLabel,
  className = 'modal-window',
  backdropClassName = 'modal-backdrop',
  children,
  isBusy = false,
}) {
  const modalRef = useRef(null);
  const launcherRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    launcherRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const currentModal = modalRef.current;
    if (currentModal) {
      const focusable = currentModal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (typeof currentModal.focus === 'function') {
        currentModal.focus();
      }
    }
    return () => {
      if (launcherRef.current && typeof launcherRef.current.focus === 'function') {
        launcherRef.current.focus();
      }
    };
  }, [isOpen]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!isBusy && onRequestClose) {
        onRequestClose();
      }
      return;
    }
    if (event.key === 'Tab') {
      if (!modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }, [isBusy, onRequestClose]);

  if (!isOpen) return null;

  return (
    <div
      className={backdropClassName}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy && onRequestClose) {
          onRequestClose();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>
  );
}

function useDialog(onClose, busy) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  return { ref, onCancel: event => { event.preventDefault(); if (!busy) onClose(); } };
}
function Field({ label, name, form, setForm, options, wrapperClassName = '', ...props }) {
  const id = 'fleet-field-' + name;
  return (
    <div className={`form-group ${wrapperClassName}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select
          id={id}
          value={form[name] ?? ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          {...props}
        >
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={form[name] ?? ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          {...props}
        />
      )}
    </div>
  );
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

  const field = (name, label, props = {}, wrapperClassName = '') => (
    <Field key={name} name={name} label={label} form={form} setForm={setForm} wrapperClassName={wrapperClassName} {...props} />
  );

  return (
    <dialog {...dialog} className="fleet-dialog" aria-modal="true" aria-labelledby="fleet-editor-title">
      <div className="fleet-dialog-header">
        <div className="fleet-dialog-header-info">
          <div className="fleet-dialog-header-icon">
            {kind === 'truck' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            ) : kind === 'driver' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            )}
          </div>
          <div>
            <h3 id="fleet-editor-title" className="fleet-dialog-title">
              {record ? 'Edit' : 'Schedule'} {kind === 'truck' ? 'vehicle' : kind}
            </h3>
            <p className="fleet-dialog-subtitle">
              {kind === 'truck'
                ? (record?.plate_number ? `Configure specifications for ${record.plate_number}` : 'Add vehicle technical specifications')
                : kind === 'driver'
                ? (record?.full_name ? `Update driver record for ${record.full_name}` : 'Configure driver details')
                : 'Service and maintenance schedule record'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="fleet-dialog-close-btn"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          title="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <form onSubmit={save} className="fleet-dialog-form">
        <div className="fleet-dialog-body">
          {error && (
            <div className="error-message fleet-dialog-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <fieldset disabled={busy}>
            <div className="form-grid">
              {kind === 'truck' && (
                <>
                  {field('plate_number', 'Plate number', { required: true, placeholder: 'e.g. ABC-1234' })}
                  {field('model', 'Model', { required: true, placeholder: 'e.g. Fuso Canter Dropside' })}
                  {field('model_year', 'Model year', { type: 'number', min: 1980, max: 2100, placeholder: 'YYYY' })}
                  {field('capacity_kg', 'Registered capacity (kg)', { type: 'number', min: 1, step: 'any', required: true, placeholder: 'e.g. 8000' })}
                  {field('vehicle_type_id', 'Vehicle type', { required: true, options: [['', 'Select vehicle type'], ...fleet.vehicleTypes.map(t => [t.id, t.name])] })}
                  {field('assigned_driver_id', 'Assigned driver', { options: [['', 'Unassigned'], ...fleet.drivers.filter(d => d.id === form.assigned_driver_id || fleet.assignableDrivers.some(a => a.id === d.id)).map(d => [d.id, d.full_name])] })}
                  {field('status', 'Status', { options: ['available', 'maintenance', 'inactive', ...(form.status === 'on_trip' ? ['on_trip'] : [])].map(v => [v, v.replaceAll('_', ' ')]) })}
                  {field('notes', 'Notes', { placeholder: 'Internal operational notes or specifications' }, 'col-span-2')}
                </>
              )}
              {kind === 'driver' && (
                <>
                  {field('full_name', 'Full name', { required: true })}
                  {field('license_number', 'License number', { required: true })}
                  {field('contact_number', 'Contact number')}
                  {field('date_hired', 'Date hired', { type: 'date' })}
                  {field('emergency_contact_number', 'Emergency contact')}
                  {field('status', 'Status', { options: ['available', 'off_duty', 'on_leave', 'inactive', ...(form.status === 'on_trip' ? ['on_trip'] : [])].map(v => [v, v.replaceAll('_', ' ')]) })}
                  {field('notes', 'Notes', { placeholder: 'Internal driver notes' }, 'col-span-full')}
                </>
              )}
              {kind === 'maintenance' && (
                <>
                  {field('truck_id', 'Vehicle', { required: true, disabled: !!record, options: [['', 'Select vehicle'], ...fleet.trucks.map(t => [t.id, t.plate_number])] })}
                  {field('kind', 'Service type', { options: ['preventive', 'repair', 'inspection', 'tire', 'other'].map(v => [v, v]) })}
                  {field('status', 'Status', { options: ['scheduled', 'in_progress', 'completed', 'cancelled'].map(v => [v, v.replaceAll('_', ' ')]) })}
                  {field('scheduled_date', 'Scheduled date', { type: 'date', required: true })}
                  {field('completed_date', 'Completion date', { type: 'date', required: form.status === 'completed', min: form.scheduled_date })}
                  {field('vendor', 'Workshop')}
                  {field('description', 'Description')}
                  {field('cost', 'Cost (PHP)', { type: 'number', min: 0, step: '0.01' })}
                </>
              )}
            </div>

            {kind === 'truck' && (
              <div className="fleet-cargo-section">
                <div className="fleet-cargo-section-header">
                  <span className="fleet-cargo-section-title">Cargo Compatibility</span>
                  <span className="fleet-cargo-section-desc">Categories supported by this vehicle</span>
                </div>
                {fleet.cargoCategories.length === 0 ? (
                  <p className="fleet-empty-cargo">No cargo categories configured in settings.</p>
                ) : (
                  <div className="fleet-cargo-tags">
                    {fleet.cargoCategories.map((c) => {
                      const isChecked = categories.includes(c.id);
                      return (
                        <label className={`fleet-check ${isChecked ? 'is-checked' : ''}`} key={c.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setCategories(
                                e.target.checked
                                  ? [...categories, c.id]
                                  : categories.filter((id) => id !== c.id)
                              )
                            }
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </fieldset>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
function DocumentForm({ record, entity, kind, onSaved, onCancel }) {
  const types = kind === 'truck' ? TRUCK_COMPLIANCE_DOC_TYPES : DRIVER_COMPLIANCE_DOC_TYPES;
  const [form, setForm] = useState(() => ({
    doc_type: types[0].docType,
    document_number: '',
    issued_date: '',
    expiry_date: '',
    review_status: 'pending_review',
    remarks: '',
    ...record,
    [kind + '_id']: entity.id,
  }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guard = useRef(false);

  async function save(event) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      validateComplianceFile(file);
      await saveFleetRecord('document', record, form, { documents: [{ ...form, file }] });
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="fleet-doc-form">
      <div className="fleet-doc-form-top">
        <button type="button" className="fleet-doc-back-btn" onClick={onCancel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to documents
        </button>
        <div className="fleet-doc-form-header">
          <h4 className="fleet-doc-form-title">
            {record ? 'Edit document' : 'Add document'}
          </h4>
          <p className="fleet-doc-form-subtitle">
            {entity.plate_number ? `Vehicle: ${entity.plate_number}` : `Driver: ${entity.full_name}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message fleet-dialog-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <fieldset disabled={busy}>
        <div className="form-grid">
          <Field
            label="Document type"
            name="doc_type"
            form={form}
            setForm={setForm}
            disabled={!!record}
            options={types.map(t => [t.docType, t.label])}
          />
          <Field
            label="Document number"
            name="document_number"
            form={form}
            setForm={setForm}
            placeholder="e.g. ORCR-12345"
          />
          <Field
            label="Review status"
            name="review_status"
            form={form}
            setForm={setForm}
            options={['pending_review', 'approved', 'rejected'].map(v => [v, v.replaceAll('_', ' ')])}
          />
          <Field
            label="Issued date"
            name="issued_date"
            form={form}
            setForm={setForm}
            type="date"
          />
          <Field
            label="Expiry date"
            name="expiry_date"
            form={form}
            setForm={setForm}
            type="date"
            min={form.issued_date || undefined}
          />
          <Field
            label="Remarks"
            name="remarks"
            form={form}
            setForm={setForm}
            placeholder="e.g. OR copy / CR copy for registration"
          />

          <div className="form-group col-span-full">
            <label htmlFor="fleet-compliance-file-input">
              Document attachment (PDF, PNG, JPG, WebP; up to 10 MB)
            </label>
            <div className={`fleet-file-dropzone ${file ? 'has-file' : ''}`}>
              <input
                id="fleet-compliance-file-input"
                type="file"
                className="fleet-file-native-input"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={e => {
                  setFile(e.target.files[0] || null);
                  setError('');
                }}
              />
              <div className="fleet-file-dropzone-content">
                <div className="fleet-file-icon">
                  {file ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                </div>
                <div className="fleet-file-details">
                  {file ? (
                    <>
                      <span className="fleet-file-name">{file.name}</span>
                      <span className="fleet-file-hint">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • Click or drag to replace file
                      </span>
                    </>
                  ) : record?.file_path ? (
                    <>
                      <span className="fleet-file-name">Current file: {record.file_path.split('/').pop()}</span>
                      <span className="fleet-file-hint">Click or drag here to upload a replacement file</span>
                    </>
                  ) : (
                    <>
                      <span className="fleet-file-name">Click to choose a file or drag and drop</span>
                      <span className="fleet-file-hint">Supported: PDF, PNG, JPG, WebP up to 10 MB</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer fleet-doc-form-footer">
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            Cancel edit
          </button>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save document'}
          </button>
        </div>
      </fieldset>
    </form>
  );
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
  return (
    <dialog {...dialog} className="fleet-dialog" aria-modal="true" aria-labelledby="compliance-dialog-title">
      <div className="fleet-dialog-header">
        <div className="fleet-dialog-header-info">
          <div className="fleet-dialog-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <h3 id="compliance-dialog-title" className="fleet-dialog-title">
              {entity.plate_number || entity.full_name} — Compliance
            </h3>
            <p className="fleet-dialog-subtitle">Manage, upload and review compliance documents</p>
          </div>
        </div>
        <button
          type="button"
          className="fleet-dialog-close-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="fleet-dialog-body">
        {live.loading && <p role="status">Loading documents…</p>}
        {live.error && (
          <div className="error-message fleet-dialog-error" role="alert">
            <span>Could not refresh documents.</span>
            <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={live.refresh}>
              Retry
            </button>
          </div>
        )}
        {fileError && <div className="error-message fleet-dialog-error" role="alert"><span>{fileError}</span></div>}
        {fileUrl && (
          <p style={{ margin: '0 0 16px 0', fontSize: '13px' }}>
            <a href={fileUrl} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', fontWeight: 600 }}>
              📄 Open private document (link expires in 60 seconds)
            </a>
          </p>
        )}
        {editing === undefined ? (
          <>
            {!live.loading && !live.error && !live.data?.length && (
              <p className="fleet-empty-cargo" style={{ padding: '24px 0', textAlign: 'center' }}>
                No compliance documents recorded.
              </p>
            )}
            <ul className="fleet-documents">
              {live.data?.map(doc => {
                const badge = getComplianceDocBadge(doc);
                return (
                  <li key={doc.id} className="fleet-doc-item">
                    <div className="fleet-doc-item-details">
                      <div className="fleet-doc-item-title-row">
                        <strong className="fleet-doc-type-label">{doc.doc_type.replaceAll('_', ' ')}</strong>
                        {doc.document_number && <span className="fleet-doc-number-label">({doc.document_number})</span>}
                        <span className="fleet-doc-sep">—</span>
                        <span className={`fleet-doc-badge ${badge.badgeClass || 'compliance-valid'}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="fleet-doc-item-subtitle">
                        {doc.remarks || 'Approved compliance document for active fleet dispatch'}
                      </div>
                    </div>
                    <div className="fleet-doc-item-actions">
                      <button type="button" className="btn-secondary fleet-doc-action-btn" onClick={() => setEditing(doc)}>
                        Edit / review
                      </button>
                      {doc.file_path && (
                        <button type="button" className="btn-secondary fleet-doc-action-btn" onClick={() => view(doc)}>
                          View file
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="fleet-compliance-bottom-bar">
              <button
                type="button"
                className="btn-primary fleet-add-doc-btn"
                onClick={() => setEditing(null)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add document</span>
              </button>
            </div>
          </>
        ) : (
          <DocumentForm
            key={editing?.id || 'new'}
            record={editing}
            entity={entity}
            kind={kind}
            onCancel={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              live.refresh();
              onSaved();
            }}
          />
        )}
      </div>
    </dialog>
  );
}

export function FleetDiscardDialog({
  onKeepEditing,
  onDiscard,
  title = "Discard unsaved changes?",
  description = "You have unsaved changes in this registration draft. If you leave now, your entered information will be discarded.",
  discardLabel = "Discard changes",
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const trigger = typeof document !== 'undefined' ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog && typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
      if (trigger?.isConnected && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fleet-discard-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fleet-discard-title"
      aria-describedby="fleet-discard-description"
      onCancel={(event) => {
        event.preventDefault();
        onKeepEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onKeepEditing();
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        const destination = event.shiftKey && document.activeElement === buttons[0]
          ? buttons.at(-1)
          : !event.shiftKey && document.activeElement === buttons.at(-1)
          ? buttons[0]
          : null;
        if (destination) {
          event.preventDefault();
          destination.focus();
        }
      }}
    >
      <div className="fleet-discard-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </svg>
      </div>
      <h2 id="fleet-discard-title">{title}</h2>
      <p id="fleet-discard-description">{description}</p>
      <div className="fleet-discard-actions">
        <button
          type="button"
          className="fleet-discard-keep"
          autoFocus
          onClick={onKeepEditing}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="fleet-discard-confirm"
          onClick={onDiscard}
        >
          {discardLabel}
        </button>
      </div>
    </dialog>
  );
}

export function FleetDeleteDialog({
  onCancel,
  onConfirm,
  title = "Delete record?",
  description = "Are you sure you want to delete this record? This action cannot be undone.",
  confirmLabel = "Delete",
  isDeleting = false,
  error = null,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const trigger = typeof document !== 'undefined' ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog && typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
      if (trigger?.isConnected && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fleet-discard-dialog fleet-delete-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fleet-delete-title"
      aria-describedby="fleet-delete-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!isDeleting && onCancel) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (!isDeleting && onCancel) onCancel();
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button:not([disabled])')];
        if (buttons.length === 0) return;
        const destination = event.shiftKey && document.activeElement === buttons[0]
          ? buttons.at(-1)
          : !event.shiftKey && document.activeElement === buttons.at(-1)
          ? buttons[0]
          : null;
        if (destination) {
          event.preventDefault();
          destination.focus();
        }
      }}
    >
      <div className="fleet-discard-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </div>
      <h2 id="fleet-delete-title">{title}</h2>
      <p id="fleet-delete-description">{description}</p>
      {error && (
        <div className="error-message fleet-dialog-error" role="alert" style={{ marginTop: '14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      <div className="fleet-discard-actions">
        <button
          type="button"
          className="fleet-discard-keep"
          autoFocus
          disabled={isDeleting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="fleet-discard-confirm"
          disabled={isDeleting}
          onClick={onConfirm}
        >
          {isDeleting ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
