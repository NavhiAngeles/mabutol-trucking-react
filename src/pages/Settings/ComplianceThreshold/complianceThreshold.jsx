import { useEffect, useRef, useState } from 'react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { complianceThresholdApi } from '../../../services/complianceThresholdService';
import { THRESHOLD_FIELDS, DEFAULT_THRESHOLDS, validateThresholds } from '../../../services/complianceThresholds.js';
import './complianceThreshold.css';

export default function ComplianceThresholds() {
  const { user, role } = useAuth();
  return <SettingsLayout><ThresholdForm key={user?.id} role={role} /></SettingsLayout>;
}
function ThresholdForm({ role }) {
  const [snapshot, setSnapshot] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    complianceThresholdApi.load().then(value => {
      if (!disposed) { setSnapshot(value); setForm(value.thresholds || DEFAULT_THRESHOLDS); setLoadError(''); }
    }).catch(cause => { if (!disposed) setLoadError(cause.message); });
    return () => { disposed = true; };
  }, [reload]);
  function refresh() {
    if (operation.current) return;
    setSnapshot(null); setForm(null); setError(''); setLoadError(''); setNotice(''); setReload(value => value + 1);
  }
  async function submit(event) {
    event.preventDefault();
    if (operation.current || role !== 'admin') return;
    let value;
    try { value = validateThresholds(form); } catch (cause) { setError(cause.message); return; }
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await complianceThresholdApi.save(value, snapshot);
      if (mounted.current) { setSnapshot(saved); setForm(saved.thresholds); setNotice('Compliance thresholds saved. Dashboard, Fleet and Reports use these on their next refresh.'); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  const dirty = snapshot && JSON.stringify(form) !== JSON.stringify(snapshot.thresholds || DEFAULT_THRESHOLDS);
  return <section className="content compliance-threshold-settings">
    <div className="page-header"><div><h2>Settings — Compliance Thresholds</h2><p>Configure warning lead times for driver documents, vehicle documents and scheduled maintenance.</p></div></div>
    {loadError ? <div role="alert"><p>{loadError}</p><button onClick={refresh}>Retry loading</button></div> : !snapshot ? <p role="status">Loading compliance thresholds…</p> : <form onSubmit={submit} className="settings-card">
      <p className="intro-text">First Alert marks an approaching expiry or service date. Critical Alert marks the final warning window, including the due date. Past dates remain expired or overdue. All dates use Philippine time.</p>
      {!snapshot.thresholds && <p role="status">No per-document thresholds are saved. Documents currently use the existing {snapshot.legacyDays}-day warning window; maintenance warnings currently cover overdue work only. The values below are suggested settings and take effect only after an administrator saves them.</p>}
      {role !== 'admin' && <p>Only administrators can edit these shared settings.</p>}
      <p>These settings control on-screen Dashboard, Fleet and Report indicators. They do not send email, SMS or push alerts, or change dispatch eligibility. The standalone Compliance page is not yet connected.</p>
      <fieldset disabled={busy || role !== 'admin'} style={{ border: 0, padding: 0, margin: 0 }}>
        {['DRIVER DOCUMENTATION', 'VEHICLE DOCUMENTATION'].map((title, index) => <div className="section-block" key={title}><h3 className="section-title">{title}</h3>{THRESHOLD_FIELDS.slice(index === 0 ? 0 : 3, index === 0 ? 3 : undefined).map(([key, label]) => <div className="threshold-row" key={key}><div className="threshold-info"><strong>{label}</strong></div><div className="threshold-inputs">{[['first', 'First Alert'], ['critical', 'Critical Alert']].map(([field, caption]) => <div className="input-wrap" key={field}><label htmlFor={`${key}-${field}`}>{caption}</label><input id={`${key}-${field}`} aria-label={`${label} ${caption}`} type="number" min={field === 'first' ? 1 : 0} max={365} step={1} required value={form[key][field]} onChange={event => {
          const raw = event.target.value;
          setForm(previous => ({ ...previous, [key]: { ...previous[key], [field]: raw === '' ? '' : Number(raw) } })); setNotice('');
        }} /><span>days</span></div>)}</div></div>)}</div>)}
      </fieldset>
      {error && <p role="alert" className="threshold-error">{error}</p>}
      {notice && <p role="status" className="threshold-success">{notice}</p>}
      {dirty && <p role="status">Unsaved changes.</p>}
      <div className="threshold-actions"><button type="submit" disabled={busy || role !== 'admin'}>{busy ? 'Saving…' : 'Save Thresholds'}</button><button type="button" disabled={busy} onClick={refresh}>Reload Saved Values</button></div>
    </form>}
  </section>;
}
