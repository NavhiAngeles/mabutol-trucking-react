import { useState } from 'react';
import { FleetEditor } from './FleetDialogs';
import { manilaDate } from '../../services/dashboardAnalytics.js';

export default function MaintenancePanel({ fleet }) {
  const [view, setView] = useState('list');
  const [month, setMonth] = useState(() => manilaDate(Date.now()).slice(0, 7));
  const [editing, setEditing] = useState(undefined);
  const [today] = useState(() => manilaDate(Date.now()));
  const first = new Date(month + '-01T12:00:00');
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = first.getDay();
  function move(delta) { const d = new Date(first.getFullYear(), first.getMonth() + delta, 1, 12); setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  return <section id="fleet-maintenance">
    <div className="section-tab-container" style={{ marginTop: 40 }}><div><h3>Maintenance Schedule</h3><p>Schedule and update vehicle service records.</p></div><div className="tab-pill-box">
      <button className="tab-pill" onClick={() => setView('list')}>List view</button><button className="tab-pill" onClick={() => setView('calendar')}>Calendar view</button>
      <button className="btn-primary" onClick={() => setEditing(null)}>Schedule service</button></div></div>
    {fleet.loading && <p role="status">Loading maintenance…</p>}
    {view === 'list' ? <div className="fleet-table-scroll"><table className="premium-table"><thead><tr><th>Vehicle</th><th>Service</th><th>Scheduled</th><th>Completed</th><th>Workshop / Cost</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {!fleet.loading && !fleet.maintenanceRecords.length && <tr><td colSpan="7">{fleet.error ? 'Maintenance unavailable; retry above.' : 'No maintenance records.'}</td></tr>}
      {fleet.maintenanceRecords.map(r => <tr key={r.id}><td>{r.trucks?.plate_number || '—'}</td><td>{r.kind}<span className="subtext">{r.description}</span></td><td>{r.scheduled_date}</td><td>{r.completed_date || '—'}</td><td>{r.vendor || '—'} / {r.cost == null ? '—' : 'PHP ' + r.cost}</td><td>{r.status.replaceAll('_', ' ')}{r.status === 'scheduled' && r.scheduled_date < today ? ' · overdue' : ''}</td><td><button onClick={() => setEditing(r)}>Edit service</button></td></tr>)}
    </tbody></table></div> : <div className="fleet-calendar">
      <div className="calendar-header-mock"><h4>{first.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h4><div className="calendar-nav-mock"><button onClick={() => move(-1)} aria-label="Previous month">←</button><button onClick={() => setMonth(manilaDate(Date.now()).slice(0, 7))}>Today</button><button onClick={() => move(1)} aria-label="Next month">→</button></div></div>
      <div className="fleet-calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <strong key={d}>{d}</strong>)}
        {Array.from({ length: offset }, (_, i) => <div key={'blank-' + i} />)}
        {Array.from({ length: days }, (_, i) => { const date = month + '-' + String(i + 1).padStart(2, '0'); return <div className="fleet-calendar-day" key={date}><time dateTime={date}>{i + 1}</time>
          {fleet.maintenanceRecords.filter(r => r.scheduled_date === date).map(r => <button key={r.id} onClick={() => setEditing(r)}>{r.trucks?.plate_number || 'Vehicle'} · {r.status.replaceAll('_', ' ')}</button>)}</div>; })}
      </div>
      {!fleet.maintenanceRecords.some(r => r.scheduled_date.startsWith(month)) && <p>No service scheduled this month.</p>}
    </div>}
    {editing !== undefined && <FleetEditor kind="maintenance" record={editing} fleet={fleet} onClose={() => setEditing(undefined)} onSaved={fleet.refresh} />}
  </section>;
}
