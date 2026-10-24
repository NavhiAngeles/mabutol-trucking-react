import { useEffect, useRef, useState } from 'react';
import { reportSchedules } from '../services/reportScheduleService';
import { snapshotReport } from '../services/reportSnapshots.js';
import { downloadReport } from '../services/reportExport.js';
import { useAuth } from '../context/AuthContext';
import './ReportSchedule.css';

export default function ReportSchedule({ type }) {
  const { user } = useAuth();
  return <SchedulePanel key={`${user?.id}-${type}`} type={type} />;
}
function SchedulePanel({ type }) {
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('08:00');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    reportSchedules.load(type, page).then(value => { if (!disposed) { setData(value); setError(''); } }).catch(err => { if (!disposed) setError(err.message); });
    return () => { disposed = true; };
  }, [open, type, page, reload]);
  async function act(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const refresh = () => { setData(null); setReload(n => n + 1); };
  const date = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  return <><button type="button" className="report-schedule-button" onClick={() => setOpen(true)}>Schedule Report</button>
    {open && <div className="report-schedule-backdrop"><section className="report-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="report-schedule-title">
      <h2 id="report-schedule-title">Scheduled {type} Reports</h2><p>Saved privately in the app for download. Times use Asia/Manila. Generation may start up to a minute after the scheduled time.</p>
      <p>Daily: previous day. Weekly: previous Monday–Sunday, generated on Monday. Monthly: previous calendar month, generated on the first. Schedules include the full report; current search, status and custom dates are not saved.</p>
      <form onSubmit={event => { event.preventDefault(); act(async () => { await reportSchedules.create(type, frequency, time); setNotice('Schedule saved. Your first report will appear after its next run.'); setPage(0); refresh(); }); }}>
        <fieldset disabled={busy}><label>Frequency<select value={frequency} onChange={e => setFrequency(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Time (Philippine time)<input type="time" required value={time} onChange={e => setTime(e.target.value)} /></label><button type="submit">Save Schedule</button></fieldset>
      </form>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading schedules…</p>}
      <button disabled={busy} onClick={refresh}>Refresh saved reports</button>
      {data && <><h3>Your schedules</h3>{!data.schedules.length && <p>No schedules yet.</p>}{data.schedules.map(schedule => <div className="report-schedule-row" key={schedule.id}><span>{schedule.frequency} at {schedule.local_time.slice(0, 5)} — {schedule.enabled ? `Next: ${date(schedule.next_run_at)}` : 'Paused'}</span><button disabled={busy} onClick={() => act(async () => { await reportSchedules.toggle(schedule); refresh(); })}>{schedule.enabled ? 'Pause' : 'Resume'}</button></div>)}
      <h3>Generated reports</h3>{!data.reports.length && <p>No generated reports on this page.</p>}{data.reports.map(report => <div className="report-schedule-row" key={report.id}><span>{report.period_start} – {report.period_end}<small>Generated {date(report.generated_at)}</small>{report.status === 'failed' && <span role="alert">{report.error_message}</span>}</span><button disabled={busy || report.status !== 'ready'} onClick={() => act(async () => { const snapshot = await reportSchedules.read(report.id); downloadReport(type, { start: snapshot.period_start, end: snapshot.period_end }, snapshotReport(snapshot), { 'Snapshot captured at': snapshot.generated_at }); })}>Download CSV</button></div>)}
      <button disabled={busy || page === 0} onClick={() => { setPage(n => n - 1); setData(null); }}>Newer</button><button disabled={busy || data.reports.length < 10} onClick={() => { setPage(n => n + 1); setData(null); }}>Older</button></>}
      <button disabled={busy} onClick={() => { setOpen(false); setData(null); setError(''); setNotice(''); }}>Close</button>
    </section></div>}
  </>;
}
