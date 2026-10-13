// Philippine civil time is UTC+08:00, independent of the browser timezone.
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;

export function parsePhilippineDeparture(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const departure = new Date(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(departure.getTime())) return null;
  // Date parsing may normalize impossible dates such as February 30.
  const civilTime = new Date(departure.getTime() + PHILIPPINE_OFFSET_MS).toISOString().slice(0, 16);
  return civilTime === `${date}T${time}` ? departure : null;
}

export function departureLimits(now = Date.now()) {
  const today = new Date(now + PHILIPPINE_OFFSET_MS).toISOString().slice(0, 10);
  const nextMinute = (Math.floor(now / 60000) + 1) * 60000;
  const earliest = new Date(nextMinute + PHILIPPINE_OFFSET_MS).toISOString();
  return { today, earliestDate: earliest.slice(0, 10), earliestTime: earliest.slice(11, 16) };
}

export function validateDeparture(date, time, now = Date.now()) {
  if (!date || !time) return "Departure date and time are required.";
  const departure = parsePhilippineDeparture(date, time);
  if (!departure) return "Invalid departure date or time.";
  const earliest = (Math.floor(now / 60000) + 1) * 60000;
  if (departure.getTime() < earliest) return "Departure must be scheduled in the future.";
  return "";
}
