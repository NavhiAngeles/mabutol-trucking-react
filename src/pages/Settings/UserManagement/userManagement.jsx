import { useEffect, useRef, useState } from 'react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { userManagementApi } from '../../../services/userManagementService';
import './userManagement.css';

const dateLabel = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';
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
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'staff', active: true, password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    userManagementApi.load().then(value => { if (!disposed) { setSnapshot(value); setLoadError(''); } })
      .catch(cause => { if (!disposed) setLoadError(cause.message); });
    return () => { disposed = true; };
  }, [reload]);
  function refresh() { if (guard.current) return; setSnapshot(null); setLoadError(''); setReload(value => value + 1); }
  function close() { if (guard.current) return; setModal(null); setTarget(null); setForm(previous => ({ ...previous, password: '', confirm: '' })); setError(''); }
  function open(kind, row = null) {
    setTarget(row); setError('');
    setForm({ fullName: row?.full_name || '', email: row?.email || '', phone: row?.phone || '', role: row?.role || 'staff', active: row?.is_active ?? true, password: '', confirm: '' });
    setModal(kind);
  }
  async function submit(event) {
    event.preventDefault(); if (guard.current) return;
    if (['create','password'].includes(modal) && form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    guard.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (modal === 'create') await userManagementApi.create(form);
      else if (modal === 'password') await userManagementApi.setPassword({ userId: target.id, password: form.password });
      else await userManagementApi.save(target, modal === 'activation' ? { ...form, active: !target.is_active } : form);
      if (mounted.current) {
        setNotice(modal === 'create' ? 'Office account created. No email was sent; share the initial credentials securely.' : modal === 'password' ? 'Password changed. No email was sent.' : 'Account updated. Office permissions refresh on focus or within 30 seconds. Existing Auth access tokens may remain valid until expiry.');
        setModal(null); setTarget(null); setForm(previous => ({ ...previous, password: '', confirm: '' }));
        setSnapshot(null); setReload(value => value + 1);
      }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  }
  const filtered = (snapshot?.users || []).filter(row => (!search || [row.full_name,row.email].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))) && (status === 'all' || row.is_active === (status === 'active')));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const self = target?.id === snapshot?.callerId;
  return <section className="content office-user-management">
    <div className="page-header"><div><h2>Settings — User Management</h2><p>Manage Admin and Staff accounts. Driver and customer records remain in their existing workflows.</p></div><div className="header-actions"><button className="secondary-btn" onClick={() => open('roles')}>Role Summary</button><button className="primary-btn" disabled={!snapshot || busy} onClick={() => open('create')}>Add Office User</button></div></div>
    <p>Custom module permissions and the “Super Admin” role are not supported. Permanent deletion is unavailable to preserve operational and audit records; deactivate accounts instead. Sign-in history is unavailable here.</p>
    {notice && <p role="status" className="um-success">{notice}</p>}
    {loadError && <div role="alert"><p>{loadError}</p><button onClick={refresh}>Retry loading</button></div>}
    {!snapshot && !loadError && <p role="status">Loading office users…</p>}
    {snapshot && <><div className="search-row"><input aria-label="Search users" placeholder="Search by name or login email" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /><select aria-label="Account status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button disabled={busy} onClick={refresh}>Refresh users</button></div>
      <div className="table-card um-table-scroll"><table className="user-table"><thead><tr><th>User / Login Email</th><th>Role</th><th>Created (Philippine time)</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {!filtered.length && <tr><td colSpan={5}>No matching office users.</td></tr>}
        {filtered.slice(currentPage * 20, currentPage * 20 + 20).map(row => <tr key={row.id}><td><strong>{row.full_name || 'Name not set'}</strong><p>{row.email}</p>{row.id === snapshot.callerId && <small>Your account</small>}</td><td>{row.role === 'admin' ? 'Admin' : 'Staff'}</td><td>{dateLabel(row.created_at)}</td><td>{row.is_active ? 'Active' : 'Inactive'}</td><td><div className="um-row-actions"><button onClick={() => open('details',row)}>View</button><button onClick={() => open('edit',row)}>Edit / Role</button><button disabled={row.id === snapshot.callerId} onClick={() => open('password',row)}>Set Password</button><button disabled={row.id === snapshot.callerId} onClick={() => open('activation',row)}>{row.is_active ? 'Deactivate' : 'Activate'}</button><button disabled title="Deactivate to preserve linked records">Delete unavailable</button></div></td></tr>)}
      </tbody></table></div><div className="um-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages} · {filtered.length} users</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></>}
    {modal && <div className="modal-overlay" onClick={close}><form className="modal" role="dialog" aria-modal="true" aria-label={modal === 'create' ? 'Create office account' : modal === 'password' ? 'Set account password' : 'Office account details'} onClick={event => event.stopPropagation()} onSubmit={submit}>
      <div className="modal-header"><h3>{({create:'Add Office User',edit:'Edit Office Account',password:'Set New Password',activation:target?.is_active?'Deactivate Account?':'Activate Account?',details:'Account Details',roles:'Role Summary'})[modal]}</h3><button type="button" disabled={busy} onClick={close} aria-label="Close">✕</button></div>
      <fieldset disabled={busy} className="um-fieldset"><div className="modal-body">
        {modal === 'roles' && <><p><strong>Admin:</strong> Manages office users and shared settings, with operational access governed by database policies.</p><p><strong>Staff:</strong> Uses operational workflows under existing backend permissions; cannot manage office accounts or admin-only settings.</p><p>No custom per-user permission matrix is implemented.</p></>}
        {modal === 'details' && <dl><dt>Account ID</dt><dd style={{overflowWrap:'anywhere'}}>{target.id}</dd><dt>Name</dt><dd>{target.full_name || 'Not set'}</dd><dt>Email</dt><dd>{target.email}</dd><dt>Contact</dt><dd>{target.phone || 'Not set'}</dd><dt>Role</dt><dd>{target.role}</dd><dt>Created</dt><dd>{dateLabel(target.created_at)}</dd><dt>Updated</dt><dd>{dateLabel(target.updated_at)}</dd></dl>}
        {['create','edit'].includes(modal) && <>
          <label className="form-field">Full Name<input required maxLength={200} value={form.fullName} onChange={event => setForm({...form,fullName:event.target.value})} /></label>
          <label className="form-field">Login Email<input type="email" required value={form.email} readOnly={modal === 'edit'} onChange={event => setForm({...form,email:event.target.value})} /></label>
          {modal === 'edit' && <label className="form-field">Contact Number<input type="tel" maxLength={40} value={form.phone} onChange={event => setForm({...form,phone:event.target.value})} /></label>}
          <label className="form-field">Role<select value={form.role} disabled={self} onChange={event => setForm({...form,role:event.target.value})}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          {modal === 'edit' && <label className="form-field">Status<select value={form.active?'active':'inactive'} disabled={self} onChange={event => setForm({...form,active:event.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
          {self && <p>Use Account settings for your password. Your own role and activation status cannot be changed here.</p>}
        </>}
        {modal === 'activation' && <><p>{target.is_active?'Deactivate':'Activate'} <strong>{target.full_name || target.email}</strong> ({target.email})?</p><p>Deactivation blocks office access after the next permission refresh. Existing Auth access tokens may remain valid until expiry. Operational records are retained.</p></>}
        {['create','password'].includes(modal) && <>
          {target && <p>Change the login password for <strong>{target.email}</strong>. No reset email will be sent.</p>}
          <label className="form-field">{modal==='create'?'Initial':'New'} Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.password} onChange={event => setForm({...form,password:event.target.value})} /></label>
          <label className="form-field">Confirm Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.confirm} onChange={event => setForm({...form,confirm:event.target.value})} /></label>
          <p>Use 12–128 characters. Share credentials securely; the user can change them under Account settings.</p>
        </>}
        {error && <p role="alert" className="um-error">{error}</p>}
      </div><div className="modal-footer"><button type="button" onClick={close}>Close</button>{!['details','roles'].includes(modal) && <button className="primary-btn" type="submit">{busy?'Saving…':modal==='create'?'Create Account':modal==='password'?'Set New Password':modal==='activation'?'Confirm':'Save Changes'}</button>}</div></fieldset>
    </form></div>}
  </section>;
}
