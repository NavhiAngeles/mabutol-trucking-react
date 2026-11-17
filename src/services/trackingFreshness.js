export const GPS_FRESHNESS_MS = 5 * 60000;

export function isTrackingStale(recordedAt, now = Date.now()) {
  const recorded = Date.parse(recordedAt);
  return !Number.isFinite(recorded) || now - recorded > GPS_FRESHNESS_MS;
}

// Independent of network refresh: retained positions still age during outages.
export function watchTrackingFreshness(rows, update, runtime = window) {
  const check = () => update(rows.map(row => isTrackingStale(row.recorded_at)));
  check();
  if (!rows.length) return () => {};
  const timer = runtime.setInterval(check, 1000);
  runtime.addEventListener('focus', check);
  runtime.document.addEventListener('visibilitychange', check);
  return () => {
    runtime.clearInterval(timer);
    runtime.removeEventListener('focus', check);
    runtime.document.removeEventListener('visibilitychange', check);
  };
}
