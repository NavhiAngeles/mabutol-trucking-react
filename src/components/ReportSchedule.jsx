import { useEffect, useRef, useState } from 'react';
import { reportSchedules } from '../services/reportScheduleService';
import { snapshotReport } from '../services/reportSnapshots.js';
import ReportExportModal from './ReportExportModal.jsx';
import { useAuth } from '../context/AuthContext';
import './ReportSchedule.css';

const HOURS_12 = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
const MINUTES_60 = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0'));
const QUICK_TIMES = [
  { label: '06:00 AM', value: '06:00' },
  { label: '08:00 AM', value: '08:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '06:00 PM', value: '18:00' }
];
const WHEEL_ITEM_HEIGHT = 36;

function parseTime24(value) {
  const [rawH = '08', rawM = '00'] = String(value || '08:00').split(':');
  const h24 = Math.min(23, Math.max(0, Number.parseInt(rawH, 10) || 0));
  const minute = Math.min(59, Math.max(0, Number.parseInt(rawM, 10) || 0));
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    hour12: String(hour12).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    period
  };
}

function toTime24(hour12Str, minuteStr, period) {
  const h12 = Number.parseInt(hour12Str, 10) || 12;
  let h24 = h12 % 12;
  if (period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minuteStr).padStart(2, '0')}`;
}

function DraggableWheel({ items, value, onChange, label }) {
  const listRef = useRef(null);
  const dragRef = useRef({ active: false, startY: 0, startScroll: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const selectedIndex = Math.max(0, items.indexOf(value));

  useEffect(() => {
    const el = listRef.current;
    if (!el || dragRef.current.active) return;
    const targetTop = selectedIndex * WHEEL_ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      el.scrollTop = targetTop;
    }
  }, [selectedIndex]);

  const commitScroll = el => {
    if (!el) return;
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT)));
    const snappedTop = idx * WHEEL_ITEM_HEIGHT;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: snappedTop, behavior: 'smooth' });
    } else {
      el.scrollTop = snappedTop;
    }
    if (items[idx] && items[idx] !== value) {
      onChange(items[idx]);
    }
  };

  const onPointerDown = event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    const el = listRef.current;
    if (!el) return;
    dragRef.current = { active: true, startY: event.clientY, startScroll: el.scrollTop, moved: false };
    setDragging(true);
    el.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = event => {
    if (!dragRef.current.active) return;
    const el = listRef.current;
    if (!el) return;
    const deltaY = event.clientY - dragRef.current.startY;
    if (Math.abs(deltaY) > 3) dragRef.current.moved = true;
    el.scrollTop = dragRef.current.startScroll - deltaY;
  };

  const onPointerUp = event => {
    if (!dragRef.current.active) return;
    const el = listRef.current;
    dragRef.current.active = false;
    setDragging(false);
    el?.releasePointerCapture?.(event.pointerId);
    commitScroll(el);
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = items[Math.min(items.length - 1, selectedIndex + 1)];
      if (next) onChange(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = items[Math.max(0, selectedIndex - 1)];
      if (prev) onChange(prev);
    }
  };

  return (
    <div className="rs-wheel-col">
      <div className="rs-wheel-col-label">{label}</div>
      <div className="rs-wheel-viewport">
        <div className="rs-wheel-highlight" aria-hidden="true" />
        <div
          ref={listRef}
          className={`rs-wheel-list${dragging ? ' is-dragging' : ''}`}
          role="listbox"
          tabIndex={0}
          aria-label={label}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onScroll={e => {
            if (dragRef.current.active) return;
            const idx = Math.min(items.length - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / WHEEL_ITEM_HEIGHT)));
            if (items[idx] && items[idx] !== value) {
              onChange(items[idx]);
            }
          }}
        >
          <div className="rs-wheel-spacer" aria-hidden="true" />
          {items.map(item => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={item === value}
              className={`rs-wheel-item${item === value ? ' is-selected' : ''}`}
              onClick={() => {
                if (dragRef.current.moved) {
                  dragRef.current.moved = false;
                  return;
                }
                onChange(item);
              }}
            >
              {item}
            </button>
          ))}
          <div className="rs-wheel-spacer" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function ModernTimePicker({ id, value, onChange, disabled, open, onOpenChange }) {
  const containerRef = useRef(null);
  const triggerBtnRef = useRef(null);
  const [draftTime, setDraftTime] = useState(value);
  const committedParsed = parseTime24(value);
  const committedDisplay = `${committedParsed.hour12}:${committedParsed.minute} ${committedParsed.period}`;
  const draftParsed = parseTime24(draftTime);
  const draftDisplay = `${draftParsed.hour12}:${draftParsed.minute} ${draftParsed.period}`;

  useEffect(() => {
    if (open) {
      setDraftTime(value);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const handleOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onOpenChange]);

  return (
    <div className="rs-time-picker" ref={containerRef}>
      <button
        ref={triggerBtnRef}
        id={id}
        type="button"
        disabled={disabled}
        className={`rs-time-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="rs-time-display rs-tabular">{committedDisplay}</span>
        <svg className="rs-time-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="rs-time-popover" role="dialog" aria-label="Select time">
          <div className="rs-time-popover-top">
            <span className="rs-time-preview rs-tabular">{draftDisplay} PHT</span>
            <div className="rs-period-toggle" role="group" aria-label="AM or PM">
              {['AM', 'PM'].map(period => (
                <button
                  key={period}
                  type="button"
                  className={`rs-period-btn${draftParsed.period === period ? ' is-active' : ''}`}
                  onClick={() => setDraftTime(toTime24(draftParsed.hour12, draftParsed.minute, period))}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          <div className="rs-wheels-grid">
            <DraggableWheel
              label="Hour"
              items={HOURS_12}
              value={draftParsed.hour12}
              onChange={nextHour => setDraftTime(toTime24(nextHour, draftParsed.minute, draftParsed.period))}
            />
            <div className="rs-wheel-colon" aria-hidden="true">:</div>
            <DraggableWheel
              label="Min"
              items={MINUTES_60}
              value={draftParsed.minute}
              onChange={nextMin => setDraftTime(toTime24(draftParsed.hour12, nextMin, draftParsed.period))}
            />
          </div>

          <div className="rs-time-presets" aria-label="Quick times">
            {QUICK_TIMES.map(preset => (
              <button
                key={preset.value}
                type="button"
                className={`rs-preset-chip rs-tabular${draftTime === preset.value ? ' is-active' : ''}`}
                onClick={() => setDraftTime(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="rs-time-popover-footer">
            <span className="rs-drag-hint">Drag or scroll, then click Done</span>
            <button
              type="button"
              className="rs-btn rs-btn-primary rs-btn-xs"
              onClick={() => {
                onChange(draftTime);
                onOpenChange(false);
                triggerBtnRef.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportSchedule({ type }) {
  const { user } = useAuth();
  return <SchedulePanel key={`${user?.id}-${type}`} type={type} />;
}
function SchedulePanel({ type }) {
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('08:00');
  const [timeOpen, setTimeOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [exportTarget, setExportTarget] = useState(null);
  const lock = useRef(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const timeOpenRef = useRef(false);
  timeOpenRef.current = timeOpen;
  const exportOpenRef = useRef(false);
  exportOpenRef.current = !!exportTarget;

  const openDialog = () => {
    previousFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setTimeOpen(false);
    setExportTarget(null);
    setPage(0);
    setData(null);
    setError('');
    setNotice('');
    wasOpenRef.current = false;
    const target = previousFocusRef.current || triggerRef.current;
    previousFocusRef.current = null;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  };

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    let disposed = false;
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector?.('select, input, button:not([disabled])');
        if (firstFocusable && typeof firstFocusable.focus === 'function') {
          firstFocusable.focus();
        } else if (typeof dialogRef.current.focus === 'function') {
          dialogRef.current.focus();
        }
      }
    }
    reportSchedules.load(type, page).then(value => { if (!disposed) { setData(value); setError(''); } }).catch(err => { if (!disposed) setError(err.message); });
    const onKeyDown = event => {
      if (event.key === 'Escape' && !lock.current) {
        if (exportOpenRef.current) return;
        if (timeOpenRef.current) {
          setTimeOpen(false);
          return;
        }
        closeDialog();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      disposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', onKeyDown);
      }
    };
  }, [open, type, page, reload]);
  async function act(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const refresh = () => { setError(''); setData(null); setReload(n => n + 1); };
  const date = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  return <><button ref={triggerRef} type="button" className="report-schedule-button" onClick={openDialog}>Schedule Report</button>
    {open && <div className="report-schedule-backdrop" onClick={e => { if (e.target === e.currentTarget && !lock.current) closeDialog(); }}><section ref={dialogRef} tabIndex={-1} className="report-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="report-schedule-title">
      <header className="rs-modal-header">
        <div className="rs-header-copy">
          <h2 id="report-schedule-title">Scheduled {type} Reports</h2>
          <p className="rs-modal-subtitle">Saved privately in the app for download. Times use Asia/Manila (PHT); generation may start up to a minute after the scheduled time.</p>
        </div>
        <button type="button" className="rs-close-icon-btn" disabled={busy} onClick={closeDialog} aria-label="Close dialog">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </header>

      <div className="rs-modal-body">
        <section className="rs-create-card" aria-label="Create report schedule">
          <form className="rs-form" onSubmit={event => { event.preventDefault(); act(async () => { await reportSchedules.create(type, frequency, time); setNotice('Schedule saved. Your first report will appear after its next run.'); setPage(0); refresh(); }); }}>
            <fieldset disabled={busy}>
              <div className="rs-field">
                <label htmlFor="report-schedule-frequency">Frequency</label>
                <select id="report-schedule-frequency" value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="rs-field">
                <label htmlFor="report-schedule-time">Time (Philippine time)</label>
                <ModernTimePicker
                  id="report-schedule-time"
                  value={time}
                  onChange={setTime}
                  disabled={busy}
                  open={timeOpen}
                  onOpenChange={setTimeOpen}
                />
              </div>
              <button type="submit" className="rs-btn rs-btn-primary">Save Schedule</button>
            </fieldset>
          </form>
          <p className="rs-cadence-note">Daily: previous day. Weekly: previous Monday to Sunday, generated on Monday. Monthly: previous calendar month, generated on the 1st. Schedules include the full report; current search, status, and custom dates are not saved.</p>
        </section>

        {error && <p className="rs-banner rs-banner-error" role="alert">{error}</p>}
        {notice && <p className="rs-banner rs-banner-success" role="status">{notice}</p>}

        <div className="rs-section-header">
          <h3>Your schedules</h3>
          <button type="button" className="rs-btn rs-btn-secondary rs-btn-sm" disabled={busy} onClick={refresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Refresh saved reports
          </button>
        </div>

        {!data && !error && <p className="rs-loading" role="status">Loading schedules…</p>}

        {data && <>
          {!data.schedules.length
            ? <p className="rs-empty">No schedules yet. Choose a frequency and time above to create one.</p>
            : <div className="rs-list">
                {data.schedules.map(schedule => <div className="report-schedule-row" key={schedule.id}>
                  <div className="rs-row-main">
                    <div className="rs-row-title">
                      <span className="rs-cap">{schedule.frequency}</span> at <span className="rs-tabular">{schedule.local_time.slice(0, 5)}</span>
                      <span className={`rs-badge ${schedule.enabled ? 'rs-badge-active' : 'rs-badge-paused'}`}>{schedule.enabled ? 'Active' : 'Paused'}</span>
                    </div>
                    <small className="rs-row-meta">{schedule.enabled ? `Next run: ${date(schedule.next_run_at)}` : 'Schedule paused'}</small>
                  </div>
                  <button type="button" className="rs-btn rs-btn-secondary rs-btn-sm" disabled={busy} onClick={() => act(async () => { await reportSchedules.toggle(schedule); refresh(); })}>{schedule.enabled ? 'Pause' : 'Resume'}</button>
                </div>)}
              </div>}

          <div className="rs-section-header rs-section-header-spaced">
            <h3>Generated reports</h3>
          </div>
          {!data.reports.length
            ? <p className="rs-empty">No generated reports on this page.</p>
            : <div className="rs-list">
                {data.reports.map(report => <div className="report-schedule-row" key={report.id}>
                  <div className="rs-row-main">
                    <div className="rs-row-title rs-tabular">
                      {report.period_start} to {report.period_end}
                      <span className={`rs-badge ${report.status === 'ready' ? 'rs-badge-active' : report.status === 'failed' ? 'rs-badge-failed' : 'rs-badge-paused'}`}>
                        {report.status === 'ready' ? 'Ready' : report.status === 'failed' ? 'Failed' : 'Pending'}
                      </span>
                    </div>
                    <small className="rs-row-meta">Generated {date(report.generated_at)}</small>
                    {report.status === 'failed' && <span className="rs-row-error" role="alert">{report.error_message}</span>}
                  </div>
                  <button type="button" className="rs-btn rs-btn-secondary rs-btn-sm" disabled={busy || report.status !== 'ready'} onClick={() => act(async () => { const snapshot = await reportSchedules.read(report.id); const reportData = snapshotReport(snapshot); setExportTarget({ range: { start: snapshot.period_start, end: snapshot.period_end }, reportData, filters: { 'Snapshot captured at': snapshot.generated_at } }); })}>Export</button>
                </div>)}
              </div>}
        </>}
      </div>

      <footer className="rs-modal-footer">
        <div className="rs-pagination">
          {data && <>
            <button type="button" className="rs-btn rs-btn-secondary rs-btn-sm" disabled={busy || page === 0} onClick={() => { setPage(n => n - 1); setData(null); }}>Newer</button>
            <button type="button" className="rs-btn rs-btn-secondary rs-btn-sm" disabled={busy || data.reports.length < 10} onClick={() => { setPage(n => n + 1); setData(null); }}>Older</button>
            <span className="rs-page-label rs-tabular">Page {page + 1}</span>
          </>}
        </div>
        <button type="button" className="rs-btn rs-btn-secondary" disabled={busy} onClick={closeDialog}>Close</button>
      </footer>
    </section></div>}
    {exportTarget && (
      <ReportExportModal
        open
        onClose={() => setExportTarget(null)}
        reportType={type}
        range={exportTarget.range}
        activeRangeLabel="Scheduled Snapshot"
        reportData={exportTarget.reportData}
        filters={exportTarget.filters}
      />
    )}
  </>;
}
