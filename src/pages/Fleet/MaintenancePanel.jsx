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

  function move(delta) {
    const d = new Date(first.getFullYear(), first.getMonth() + delta, 1, 12);
    setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }

  return (
    <section id="fleet-maintenance">
      <div className="section-tab-container maintenance-toolbar">
        <div className="section-titles">
          <h3>Maintenance Schedule</h3>
          <p className="section-subtitle">SCHEDULE AND UPDATE VEHICLE SERVICE RECORDS.</p>
        </div>
        <div className="maintenance-actions">
          <div className="tab-pill-box maintenance-view-switch" role="group" aria-label="Maintenance display">
            <button
              type="button"
              className={`tab-pill${view === 'list' ? ' active' : ''}`}
              aria-pressed={view === 'list'}
              aria-controls="maintenance-view"
              onClick={() => setView('list')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List view
            </button>
            <button
              type="button"
              className={`tab-pill${view === 'calendar' ? ' active' : ''}`}
              aria-pressed={view === 'calendar'}
              aria-controls="maintenance-view"
              onClick={() => setView('calendar')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Calendar view
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={() => setEditing(null)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Schedule service
          </button>
        </div>
      </div>

      {fleet.loading && <p role="status" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>Loading maintenance…</p>}
      {fleet.error && (
        <p role="alert" className="fleet-error-banner" style={{ margin: '16px 0', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Unable to refresh maintenance. {fleet.maintenanceRecords.length ? 'Showing previously loaded records.' : 'Maintenance records are unavailable.'}</span>
          <button type="button" className="fleet-btn-action" onClick={fleet.refresh} style={{ marginLeft: '12px' }}>Retry maintenance</button>
        </p>
      )}

      <div id="maintenance-view" role="region" aria-label={view === 'list' ? 'Maintenance list view' : 'Maintenance calendar view'}>
        {view === 'list' ? (
          <div className="fleet-table-scroll">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>SERVICE</th>
                  <th>SCHEDULED</th>
                  <th>COMPLETED</th>
                  <th>WORKSHOP / COST</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {!fleet.loading && !fleet.maintenanceRecords.length && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "36px 20px", color: "#64748B" }}>
                      {fleet.error ? 'Maintenance unavailable; retry above.' : 'No maintenance records.'}
                    </td>
                  </tr>
                )}
                {fleet.maintenanceRecords.map(r => {
                  let statusClass = "status-pill status-transit";
                  let statusLabel = r.status.replaceAll('_', ' ').toUpperCase();
                  if (r.status === 'completed') {
                    statusClass = "status-pill status-active";
                  } else if (r.status === 'scheduled') {
                    if (r.scheduled_date && r.scheduled_date < today) {
                      statusClass = "status-pill status-danger";
                      statusLabel = "OVERDUE";
                    } else if (r.warningState === 'critical') {
                      statusClass = "status-pill status-danger";
                      statusLabel = "CRITICAL — DUE SOON";
                    } else if (r.warningState === 'expiring_soon') {
                      statusClass = "status-pill status-warning";
                      statusLabel = "DUE SOON";
                    } else {
                      statusClass = "status-pill status-transit";
                      statusLabel = "SCHEDULED";
                    }
                  } else if (r.status === 'in_progress') {
                    statusClass = "status-pill status-transit";
                    statusLabel = "IN PROGRESS";
                  } else if (r.status === 'cancelled') {
                    statusClass = "status-pill status-inactive";
                    statusLabel = "CANCELLED";
                  }

                  return (
                    <tr key={r.id}>
                      <td><strong>{r.trucks?.plate_number || '—'}</strong></td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{r.kind}</span>
                        {r.description && <span className="subtext" style={{ display: 'block' }}>{r.description}</span>}
                      </td>
                      <td>{r.scheduled_date || '—'}</td>
                      <td>{r.completed_date || '—'}</td>
                      <td>
                        {r.vendor || '—'}
                        <span className="subtext" style={{ display: 'block' }}>
                          {r.cost == null ? '—' : `PHP ${Number(r.cost).toLocaleString()}`}
                        </span>
                      </td>
                      <td>
                        <span className={statusClass}>● {statusLabel}</span>
                      </td>
                      <td className="fleet-actions-cell">
                        <button
                          type="button"
                          className="fleet-btn-action fleet-btn-edit"
                          onClick={() => setEditing(r)}
                          title={`Edit maintenance record for ${r.trucks?.plate_number || 'vehicle'}`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit service
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="fleet-calendar">
            <div className="calendar-header-mock">
              <h4>{first.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h4>
              <div className="calendar-nav-mock">
                <button type="button" onClick={() => move(-1)} aria-label="Previous month">←</button>
                <button type="button" onClick={() => setMonth(manilaDate(Date.now()).slice(0, 7))}>Today</button>
                <button type="button" onClick={() => move(1)} aria-label="Next month">→</button>
              </div>
            </div>
            <div className="fleet-calendar-grid">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <strong key={d}>{d}</strong>)}
              {Array.from({ length: offset }, (_, i) => <div key={'blank-' + i} />)}
              {Array.from({ length: days }, (_, i) => {
                const date = month + '-' + String(i + 1).padStart(2, '0');
                return (
                  <div className="fleet-calendar-day" key={date}>
                    <time dateTime={date}>{i + 1}</time>
                    {fleet.maintenanceRecords
                      .filter(r => r.scheduled_date === date)
                      .map(r => (
                        <button
                          type="button"
                          key={r.id}
                          onClick={() => setEditing(r)}
                        >
                          {r.trucks?.plate_number || 'Vehicle'} · {r.status.replaceAll('_', ' ')}
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
            {!fleet.loading && !fleet.error && !fleet.maintenanceRecords.some(r => r.scheduled_date?.startsWith(month)) && (
              <p style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>No service scheduled this month.</p>
            )}
          </div>
        )}
      </div>
      {editing !== undefined && <FleetEditor kind="maintenance" record={editing} fleet={fleet} onClose={() => setEditing(undefined)} onSaved={fleet.refresh} />}
    </section>
  );
}

