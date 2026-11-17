import { useEffect, useRef, useState } from 'react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { userManagementApi, validateOfficeCreation } from '../../../services/userManagementService';
import './userManagement.css';

const dateLabel = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';

function formatDetailsSummary(details) {
  if (!details || typeof details !== 'object') return String(details ?? '—');
  const targetObj = details.new && typeof details.new === 'object' ? details.new : details;
  const entries = Object.entries(targetObj).filter(([k]) => k !== 'id' && !k.endsWith('_id'));
  if (entries.length === 0) {
    const keys = Object.keys(details);
    return keys.length ? keys.join(', ') : 'Empty payload';
  }
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{…}' : JSON.stringify(v)}`)
    .join(' · ') + (entries.length > 3 ? ` (+${entries.length - 3} more)` : '');
}

export default function UserManagement() {
  const { user, role } = useAuth();
  return <SettingsLayout>{role === 'admin' ? <OfficeUsers key={user?.id} /> : <section className="content"><div className="page-header"><div><h2>Settings — User Management</h2><p>Manage Admin and Staff accounts. Driver and customer records remain in their existing workflows.</p></div></div><p>Only active administrators can manage office accounts.</p></section>}</SettingsLayout>;
}
function OfficeUsers() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'staff', active: true, password: '', confirm: '', mfaReason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [mfaLoaded, setMfaLoaded] = useState(false);
  const [mfaFactors, setMfaFactors] = useState([]);
  const [openActionId, setOpenActionId] = useState(null);
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [expandedAuditRows, setExpandedAuditRows] = useState({});
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const guard = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    userManagementApi.load().then(value => { if (!disposed) { setSnapshot(value); setLoadError(''); } })
      .catch(cause => { if (!disposed) setLoadError(cause.message); });
    return () => { disposed = true; };
  }, [reload]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    function handleKey(e) { if (e.key === 'Escape') { close(); setOpenActionId(null); } }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);
  function refresh() { if (guard.current) return; setSnapshot(null); setLoadError(''); setReload(value => value + 1); }
  function close() { if (guard.current) return; setModal(null); setTarget(null); setForm(previous => ({ ...previous, password: '', confirm: '', mfaReason: '' })); setError(''); setExpandedAuditRows({}); setMfaLoaded(false); setMfaFactors([]); setOpenActionId(null); }
  function open(kind, row = null) {
    if (guard.current) return;
    setTarget(row); setError('');
    setForm({ fullName: row?.full_name || '', email: row?.email || '', phone: row?.phone || '', role: row?.role || 'staff', active: row?.is_active ?? true, password: '', confirm: '', mfaReason: '' });
    setModal(kind);
  }
  async function openMfa(row) {
    if (guard.current) return;
    open('mfa', row);
    setMfaLoaded(false);
    setMfaFactors([]);
    guard.current = true;
    setBusy(true);
    try {
      const factors = await userManagementApi.getMfaFactors(row);
      if (mounted.current) {
        setMfaFactors(Array.isArray(factors) ? factors : []);
        setForm(previous => ({ ...previous, mfaReason: '' }));
        setMfaLoaded(true);
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Unable to load authenticator factors.');
    } finally {
      guard.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function openAudit() {
    if (guard.current) return;
    setModal('audit');
    setAuditSearch('');
    setAuditActionFilter('all');
    setExpandedAuditRows({});
    setAuditPage(0);
    setAuditLoading(true);
    setAuditError('');
    try {
      const data = await userManagementApi.auditLogs();
      if (mounted.current) setAuditLogs(Array.isArray(data) ? data : []);
    } catch (cause) {
      if (mounted.current) setAuditError(cause.message || 'Unable to load audit logs.');
    } finally {
      if (mounted.current) setAuditLoading(false);
    }
  }
  function toggleAuditRow(rowId) {
    setExpandedAuditRows(prev => ({ ...prev, [rowId]: !prev[rowId] }));
  }
  async function refreshAudit() {
    setAuditLoading(true);
    setAuditError('');
    try {
      const data = await userManagementApi.auditLogs();
      if (mounted.current) setAuditLogs(Array.isArray(data) ? data : []);
    } catch (cause) {
      if (mounted.current) setAuditError(cause.message || 'Unable to load audit logs.');
    } finally {
      if (mounted.current) setAuditLoading(false);
    }
  }
  async function openRecovery(row) {
    if (guard.current) return;
    open('recovery', row); setRecoveryLoaded(false);
    guard.current = true; setBusy(true);
    try {
      const phone = await userManagementApi.recoveryPhone(row);
      if (mounted.current) { setForm(previous => ({ ...previous, recoveryPhone: phone || '', expectedPhone: phone })); setRecoveryLoaded(true); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (guard.current) return;
    if (['create','password'].includes(modal) && form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (modal === 'create') {
      if (!snapshot?.provisioningReady) { setError('Account was not created. Refresh users after the SMS account-management backend is ready.'); return; }
      try { validateOfficeCreation(form); } catch (cause) { setError(cause.message); return; }
    }
    guard.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (modal === 'create') await userManagementApi.create(form);
      else if (modal === 'password') await userManagementApi.setPassword({ userId: target.id, password: form.password });
      else if (modal === 'recovery') {
        if (!recoveryLoaded) throw new Error('Close and reopen recovery enrollment before saving.');
        await userManagementApi.recoveryPhone(target, form);
      }
      else if (modal === 'mfa') {
        if (!mfaLoaded) throw new Error('Wait for enrolled factors to load before resetting.');
        if (mfaFactors.length === 0) throw new Error('No enrolled authenticator factors to reset.');
        if (!form.mfaReason?.trim() || form.mfaReason.trim().length < 5) throw new Error('Provide a confirmation reason (at least 5 characters).');
        await userManagementApi.resetMfa(target, form.mfaReason.trim());
      }
      else await userManagementApi.save(target, modal === 'activation' ? { ...form, active: !target.is_active } : form);
      if (mounted.current) {
        setNotice(
          modal === 'create'
            ? 'Office account created with an SMS recovery phone. No email was sent; share the initial credentials securely.'
            : modal === 'password'
            ? 'Password changed. No email was sent.'
            : modal === 'recovery'
            ? 'Recovery phone registered. SMS code verification is required when resetting the password.'
            : modal === 'mfa'
            ? '2FA reset for ' + (target.full_name || target.email) + '. The user can now sign in with their password and enroll a new device.'
            : 'Account updated. Office permissions refresh on focus or within 30 seconds. Existing Auth access tokens may remain valid until expiry.'
        );
        setModal(null); setTarget(null); setForm(previous => ({ ...previous, password: '', confirm: '', mfaReason: '' }));
        setSnapshot(null); setReload(value => value + 1);
      }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  }
  const filtered = (snapshot?.users || []).filter(row => (!search || [row.full_name,row.email].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))) && (status === 'all' || row.is_active === (status === 'active')));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const self = target?.id === snapshot?.callerId;

  const searchAuditLower = auditSearch.trim().toLowerCase();
  const filteredAuditLogs = (auditLogs || []).filter(row => {
    if (auditActionFilter !== 'all' && String(row.action || '').toUpperCase() !== auditActionFilter.toUpperCase()) {
      return false;
    }
    if (!searchAuditLower) return true;
    return (
      (row.actor?.name && String(row.actor.name).toLowerCase().includes(searchAuditLower)) ||
      (row.actor?.email && String(row.actor.email).toLowerCase().includes(searchAuditLower)) ||
      (row.action && String(row.action).toLowerCase().includes(searchAuditLower)) ||
      (row.target && String(row.target).toLowerCase().includes(searchAuditLower)) ||
      (row.philippineTime && String(row.philippineTime).toLowerCase().includes(searchAuditLower)) ||
      (row.details && JSON.stringify(row.details).toLowerCase().includes(searchAuditLower))
    );
  });
  const auditPageSize = 10;
  const auditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const currentAuditPage = Math.min(auditPage, auditPages - 1);
  const visibleAuditLogs = filteredAuditLogs.slice(currentAuditPage * auditPageSize, currentAuditPage * auditPageSize + auditPageSize);

  return <section className="content office-user-management">
    <div className="page-header">
      <div>
        <h2>Settings — User Management</h2>
        <p>Manage Admin and Staff accounts. Driver and customer records remain in their existing workflows.</p>
      </div>
      <div className="header-actions">
        <button type="button" className="secondary-btn" onClick={() => open('roles')}>Role Summary</button>
        <button type="button" className="secondary-btn" onClick={openAudit}>Audit & Activity Log</button>
        <button type="button" className="primary-btn" disabled={!snapshot?.provisioningReady || busy} onClick={() => open('create')}>Add Office User</button>
      </div>
    </div>
    <div className="um-info-banner">
      <span className="um-info-icon" aria-hidden="true">i</span>
      <p>Custom module permissions and the “Super Admin” role are not supported. Permanent deletion is unavailable to preserve operational and audit records; deactivate accounts instead. Sign-in history is unavailable here.</p>
    </div>
    {notice && (
      <div role="status" className="um-success">
        <div className="um-notice-content">
          <span className="um-success-icon" aria-hidden="true">✓</span>
          <p>{notice}</p>
        </div>
        <button type="button" className="um-notice-close" onClick={() => setNotice('')} aria-label="Dismiss notice">✕</button>
      </div>
    )}
    {snapshot?.provisioningError && <p role="alert" className="um-error-banner">{snapshot.provisioningError}</p>}
    {loadError && <div role="alert" className="um-error-banner"><p>{loadError}</p><button onClick={refresh}>Retry loading</button></div>}
    {!snapshot && !loadError && <p role="status">Loading office users…</p>}
    {snapshot && <>
      <div className="um-directory">
        <div className="um-directory-heading">
          <div>
            <h3>Office accounts</h3>
            <p>Manage access for your office team.</p>
          </div>
          <span className="um-directory-count">{snapshot.users.length} accounts</span>
        </div>
        <div className="search-row um-toolbar">
          <label className="um-search">
            <span className="um-label-sr">Search users</span>
            <input aria-label="Search users" placeholder="Search by name or login email" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
          </label>
          <div className="um-toolbar-controls">
            <label className="um-status-filter">
              <span className="um-label-sr">Account status</span>
              <select aria-label="Account status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button className="um-refresh" disabled={busy} onClick={refresh} title="Refresh users">
              <span className="um-refresh-icon" aria-hidden="true">↻</span>
              <span>Refresh users</span>
            </button>
          </div>
        </div>
        <div className="table-card um-table-scroll">
          <table className="user-table">
            <thead>
              <tr>
                <th>User / Login Email</th>
                <th>Role</th>
                <th>Created (Philippine time)</th>
                <th>Status</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length && <tr><td colSpan={5} className="um-empty">No matching office users.</td></tr>}
              {(() => {
                const pageRows = filtered.slice(currentPage * 20, currentPage * 20 + 20);
                return pageRows.map((row, idx) => {
                  const isUp = (pageRows.length > 1 && idx === pageRows.length - 1) || (pageRows.length > 3 && idx >= pageRows.length - 2);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="user-cell">
                          <span className="user-avatar" aria-hidden="true">{(row.full_name || row.email || '?').slice(0, 2).toUpperCase()}</span>
                          <div className="user-meta">
                            <div className="user-name-line">
                              <strong>{row.full_name || 'Name not set'}</strong>
                              {row.id === snapshot.callerId && <span className="um-self-badge">Your account</span>}
                            </div>
                            <p className="user-email">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`um-role-badge ${row.role === 'admin' ? 'um-role-admin' : ''}`}>{row.role === 'admin' ? 'Admin' : 'Staff'}</span>
                      </td>
                      <td className="user-created">{dateLabel(row.created_at)}</td>
                      <td>
                        <span className={`um-status-badge ${row.is_active ? 'um-status-active' : ''}`}>
                          <span className="status-dot" aria-hidden="true" />
                          {row.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                  <div className={`action-menu-wrapper${openActionId === row.id ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="action-dots-btn"
                      aria-label={`Actions for ${row.full_name || row.email}`}
                      aria-expanded={openActionId === row.id}
                      onClick={() => setOpenActionId(openActionId === row.id ? null : row.id)}
                    >
                      ⋮
                    </button>
                    {openActionId === row.id && (
                      <>
                        <div className="action-menu-backdrop" onClick={() => setOpenActionId(null)} />
                        <div className={`action-dropdown${isUp ? ' action-dropdown-up' : ''}`} role="menu">
                          <button type="button" className="action-item" role="menuitem" onClick={() => { setOpenActionId(null); open('details', row); }}>
                            <span className="action-item-icon" aria-hidden="true">👁</span>
                            <span>View</span>
                          </button>
                          <button type="button" className="action-item" role="menuitem" onClick={() => { setOpenActionId(null); open('edit', row); }}>
                            <span className="action-item-icon" aria-hidden="true">✏</span>
                            <span>Edit / Role</span>
                          </button>
                          <button type="button" className="action-item" role="menuitem" title={row.id === snapshot.callerId ? 'Change your password in Account settings' : undefined} disabled={row.id === snapshot.callerId} onClick={() => { setOpenActionId(null); open('password', row); }}>
                            <span className="action-item-icon" aria-hidden="true">🔑</span>
                            <span>Set Password</span>
                          </button>
                          <button type="button" className="action-item" role="menuitem" disabled={busy} onClick={() => { setOpenActionId(null); openRecovery(row); }}>
                            <span className="action-item-icon" aria-hidden="true">📱</span>
                            <span>Recovery Phone</span>
                          </button>
                          <div className="action-divider" />
                          <button type="button" className="action-item action-item-danger" role="menuitem" title={row.id === snapshot.callerId ? 'Manage your own 2FA in Security settings' : undefined} disabled={busy || row.id === snapshot.callerId} onClick={() => { setOpenActionId(null); openMfa(row); }}>
                            <span className="action-item-icon" aria-hidden="true">🛡</span>
                            <span>Reset 2FA</span>
                          </button>
                          <button type="button" className={`action-item ${row.is_active ? 'action-item-danger' : ''}`} role="menuitem" title={row.id === snapshot.callerId ? 'Your own account cannot be deactivated here' : undefined} disabled={row.id === snapshot.callerId} onClick={() => { setOpenActionId(null); open('activation', row); }}>
                            <span className="action-item-icon" aria-hidden="true">{row.is_active ? '⏸' : '▶'}</span>
                            <span>{row.is_active ? 'Deactivate' : 'Activate'}</span>
                          </button>
                          <button type="button" className="action-item" role="menuitem" disabled title="Deactivate to preserve linked records">
                            <span className="action-item-icon" aria-hidden="true">🗑</span>
                            <span>Delete unavailable</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          });
        })()}
      </tbody></table></div>
        <div className="um-pagination">
          <span className="um-pagination-info">Page {currentPage + 1} of {pages} · {filtered.length} {filtered.length === 1 ? 'user' : 'users'}</span>
          <div className="um-pagination-actions">
            <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
      </div>
    </>}
    {modal === 'audit' && (
      <div className="modal-overlay" onClick={close}>
        <div
          className="modal um-audit-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Audit and Activity Log"
          onClick={e => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3>Audit & Activity Log</h3>
              <p className="um-audit-subtitle">Authorized records from system activity logs (Philippine time)</p>
            </div>
            <button type="button" className="modal-close-btn" onClick={close} aria-label="Close">✕</button>
          </div>

          <div className="modal-body um-audit-body">
            <div className="um-audit-toolbar">
              <label className="um-search">
                <span>Search logs</span>
                <input
                  type="search"
                  placeholder="Search actor, action, target, metadata..."
                  aria-label="Search audit logs"
                  value={auditSearch}
                  onChange={e => { setAuditSearch(e.target.value); setAuditPage(0); }}
                />
              </label>
              <label className="um-action-filter">
                <span>Action</span>
                <select
                  aria-label="Filter by action"
                  value={auditActionFilter}
                  onChange={e => { setAuditActionFilter(e.target.value); setAuditPage(0); }}
                >
                  <option value="all">All actions</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="CREATE">CREATE</option>
                  <option value="DELETE">DELETE</option>
                  <option value="SUSPEND">SUSPEND</option>
                  <option value="LOGIN">LOGIN</option>
                </select>
              </label>
              <button type="button" className="um-refresh" disabled={auditLoading} onClick={refreshAudit}>
                Refresh logs
              </button>
            </div>

            {auditLoading && !auditLogs && <p role="status" className="um-audit-status">Loading audit logs…</p>}
            {auditError && (
              <div role="alert" className="um-error-banner">
                <p>{auditError}</p>
                <button type="button" onClick={refreshAudit}>Retry loading</button>
              </div>
            )}

            {auditLogs && (
              <div className="table-card um-table-scroll um-audit-table-card">
                <table className="user-table um-audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp (Philippine time)</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredAuditLogs.length && (
                      <tr>
                        <td colSpan={5} className="um-empty">No matching audit logs.</td>
                      </tr>
                    )}
                    {visibleAuditLogs.map(row => {
                      const isExpanded = !!expandedAuditRows[row.id];
                      return (
                        <tr key={row.id}>
                          <td className="um-audit-time">{row.philippineTime}</td>
                          <td>
                            <div className="user-cell">
                              <span className="user-avatar" aria-hidden="true">
                                {(row.actor?.name || row.actor?.email || '?').slice(0, 2).toUpperCase()}
                              </span>
                              <div>
                                <strong>{row.actor?.name || 'System'}</strong>
                                {row.actor?.email && <p>{row.actor.email}</p>}
                                {row.actor?.role && <small className="um-audit-role">{row.actor.role}</small>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`um-audit-badge um-audit-${String(row.action || '').toLowerCase()}`}>
                              {row.action}
                            </span>
                          </td>
                          <td>
                            <div className="um-audit-target-wrapper" title={row.target}>
                              <code className="um-audit-target">{row.target}</code>
                            </div>
                          </td>
                          <td className="um-audit-metadata-cell">
                            {row.details && typeof row.details === 'object' && Object.keys(row.details).length > 0 ? (
                              <div className="um-audit-details-wrap">
                                <div className="um-audit-details-header">
                                  <span className="um-audit-details-summary" title={JSON.stringify(row.details)}>
                                    {formatDetailsSummary(row.details)}
                                  </span>
                                  <button
                                    type="button"
                                    className="um-audit-toggle-btn"
                                    onClick={() => toggleAuditRow(row.id)}
                                    aria-expanded={isExpanded}
                                  >
                                    {isExpanded ? 'Hide JSON' : 'View JSON'}
                                  </button>
                                </div>
                                {isExpanded && (
                                  <pre className="um-audit-details">{JSON.stringify(row.details, null, 2)}</pre>
                                )}
                              </div>
                            ) : row.details != null && typeof row.details !== 'object' ? (
                              <code className="um-audit-target">{String(row.details)}</code>
                            ) : (
                              <span className="um-audit-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="modal-footer um-audit-footer">
            <div className="um-pagination">
              <button type="button" disabled={currentAuditPage === 0 || auditLoading} onClick={() => setAuditPage(p => Math.max(0, p - 1))}>
                Previous
              </button>
              <span>
                Page {currentAuditPage + 1} of {auditPages} · {filteredAuditLogs.length} {filteredAuditLogs.length === 1 ? 'log' : 'logs'}
              </span>
              <button type="button" disabled={currentAuditPage + 1 >= auditPages || auditLoading} onClick={() => setAuditPage(p => p + 1)}>
                Next
              </button>
            </div>
            <button type="button" className="secondary-btn" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    {modal && modal !== 'audit' && <div className="modal-overlay" onClick={close}><form className="modal" role="dialog" aria-modal="true" noValidate={modal === 'create'} aria-label={modal === 'create' ? 'Create office account' : modal === 'password' ? 'Set account password' : modal === 'mfa' ? 'Reset 2FA (TextBee SMS)' : 'Office account details'} onClick={event => event.stopPropagation()} onSubmit={submit}>
      <div className="modal-header"><h3>{({create:'Add Office User',edit:'Edit Office Account',password:'Set New Password',activation:target?.is_active?'Deactivate Account?':'Activate Account?',details:'Account Details',roles:'Role Summary',recovery:'SMS Recovery Phone',mfa:'Reset 2FA (TextBee SMS)'})[modal]}</h3><button type="button" disabled={busy} onClick={close} aria-label="Close">✕</button></div>
      <fieldset disabled={busy} className="um-fieldset"><div className="modal-body">
        {modal === 'roles' && <><p><strong>Admin:</strong> Manages office users and shared settings, with operational access governed by database policies.</p><p><strong>Staff:</strong> Uses operational workflows under existing backend permissions; cannot manage office accounts or admin-only settings.</p><p>No custom per-user permission matrix is implemented.</p></>}
        {modal === 'details' && <dl><dt>Account ID</dt><dd style={{overflowWrap:'anywhere'}}>{target.id}</dd><dt>Name</dt><dd>{target.full_name || 'Not set'}</dd><dt>Email</dt><dd>{target.email}</dd><dt>Contact</dt><dd>{target.phone || 'Not set'}</dd><dt>Role</dt><dd>{target.role}</dd><dt>Created</dt><dd>{dateLabel(target.created_at)}</dd><dt>Updated</dt><dd>{dateLabel(target.updated_at)}</dd></dl>}
        {['create','edit'].includes(modal) && <>
          <label className="form-field">Full Name<input required maxLength={200} value={form.fullName} onChange={event => setForm({...form,fullName:event.target.value})} /></label>
          <label className="form-field">Login Email<input type="email" required value={form.email} readOnly={modal === 'edit'} onChange={event => setForm({...form,email:event.target.value})} /></label>
          <label className="form-field">{modal === 'create' ? 'Recovery Mobile Number' : 'Contact Number'}<input type="tel" autoComplete="tel" required={modal === 'create'} maxLength={40} placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={form.phone} onChange={event => setForm({...form,phone:event.target.value})} /></label>
          <p>{modal === 'create' ? 'Use this user’s own Philippine mobile number. Whoever receives its SMS codes can reset this account’s password.' : 'Contact edits do not change the authentication recovery number. Use Recovery Phone to enroll or replace it.'}</p>
          <label className="form-field">Role<select value={form.role} disabled={self} onChange={event => setForm({...form,role:event.target.value})}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          {modal === 'edit' && <label className="form-field">Status<select value={form.active?'active':'inactive'} disabled={self} onChange={event => setForm({...form,active:event.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
          {self && <p>Use Account settings for your password. Your own role and activation status cannot be changed here.</p>}
        </>}
        {modal === 'recovery' && <>
          <p>Register the recovery number for <strong>{target.email}</strong>. Whoever receives its SMS codes can reset this account’s password. Confirm this is the user’s own number before saving.</p>
          {!recoveryLoaded && !error && <p role="status">Loading registered recovery phone…</p>}
          {recoveryLoaded && <label className="form-field">Recovery Mobile Number<input type="tel" autoComplete="tel" required maxLength={40} placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={form.recoveryPhone || ''} onChange={event => setForm({ ...form, recoveryPhone: event.target.value })} /></label>}
          <p>This changes the Auth recovery number. The profile’s contact number remains separate. No SMS is sent when an administrator registers a number; possession is checked during recovery.</p>
        </>}
        {modal === 'mfa' && <>
          <p>Inspect and reset enrolled 2FA factors for <strong>{target.full_name || target.email}</strong> ({target.email}). Use this when a staff member loses access to their phone or 2FA device.</p>
          {!mfaLoaded && !error && <p role="status">Loading enrolled authenticator factors…</p>}
          {mfaLoaded && <>
            <div className="um-mfa-factors-list">
              <h4>Enrolled 2FA Factors</h4>
              {mfaFactors.length === 0 ? (
                <p className="um-mfa-empty">No enrolled 2FA factors found on this account.</p>
              ) : (
                <ul className="um-factors-items">
                  {mfaFactors.map(f => (
                    <li key={f.id} className="um-factor-item">
                      <div className="um-factor-info">
                        <strong>{f.friendlyName || f.friendly_name || 'SMS 2FA (TextBee)'}</strong>
                        <span className="um-factor-meta">ID: <code>{f.id}</code> · Status: <span className="um-factor-status">{f.status}</span></span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="form-field">Confirmation Reason *
              <textarea
                required
                rows={3}
                minLength={5}
                maxLength={500}
                placeholder="e.g. Staff member lost their mobile phone / 2FA device."
                value={form.mfaReason || ''}
                onChange={event => setForm({ ...form, mfaReason: event.target.value })}
              />
            </label>
            <p className="um-mfa-notice">Resetting 2FA removes all enrolled factors for this user and records an audit log. The user can sign in with their password and enroll a new device via TextBee SMS.</p>
          </>}
        </>}
        {modal === 'activation' && <><p>{target.is_active?'Deactivate':'Activate'} <strong>{target.full_name || target.email}</strong> ({target.email})?</p><p>Deactivation blocks office access after the next permission refresh. Existing Auth access tokens may remain valid until expiry. Operational records are retained.</p></>}
        {['create','password'].includes(modal) && <>
          {target && <p>Change the login password for <strong>{target.email}</strong>. No reset email will be sent.</p>}
          <label className="form-field">{modal==='create'?'Initial':'New'} Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.password} onChange={event => setForm({...form,password:event.target.value})} /></label>
          <label className="form-field">Confirm Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.confirm} onChange={event => setForm({...form,confirm:event.target.value})} /></label>
          <p>Use 12–128 characters. Share credentials securely; the user can change them under Account settings.</p>
        </>}
        {error && <p role="alert" className="um-error">{error}</p>}
      </div><div className="modal-footer"><button type="button" onClick={close}>Close</button>{!['details','roles'].includes(modal) && <button className={`primary-btn ${modal === 'mfa' ? 'um-action-danger-btn' : ''}`} type="submit" disabled={(modal === 'recovery' && !recoveryLoaded) || (modal === 'mfa' && (!mfaLoaded || mfaFactors.length === 0 || !form.mfaReason?.trim() || form.mfaReason.trim().length < 5))}>{busy?'Saving…':modal==='create'?'Create Account':modal==='password'?'Set New Password':modal==='activation'?'Confirm':modal==='mfa'?'Reset 2FA':'Save Changes'}</button>}</div></fieldset>
    </form></div>}
  </section>;
}
