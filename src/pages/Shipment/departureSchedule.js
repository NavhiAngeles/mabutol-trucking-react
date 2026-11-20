// Philippine civil time is UTC+08:00, independent of the browser timezone.
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60 * 1000;

export const DEFAULT_FTL_MIN_LEAD_TIME_HOURS = 24;
export const SPECIALIZED_FTL_MIN_LEAD_TIME_HOURS = 48;
export const FTL_MAX_ADVANCE_DAYS = 14;
export const DEFAULT_LOADING_BUFFER_MINUTES = 180;

export function resolveVehicleLeadTimeHours(vehicle) {
  const configured = Number(vehicle?.min_lead_time_hours);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.round(configured);
  }
  const name = String(vehicle?.name || "");
  if (/refrigerated|flat/i.test(name)) {
    return SPECIALIZED_FTL_MIN_LEAD_TIME_HOURS;
  }
  return DEFAULT_FTL_MIN_LEAD_TIME_HOURS;
}

export function resolveVehicleLoadingBufferMinutes(vehicle) {
  const configured = Number(vehicle?.loading_buffer_minutes);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.round(configured);
  }
  return DEFAULT_LOADING_BUFFER_MINUTES;
}

export function calculateEstimatedArrival(
  departure,
  routeDurationMinutes,
  loadingBufferMinutes = DEFAULT_LOADING_BUFFER_MINUTES
) {
  const departureMs =
    departure instanceof Date
      ? departure.getTime()
      : typeof departure === "number"
        ? departure
        : Date.parse(departure || "");
  const routeMins = Number(routeDurationMinutes);
  const bufferMins = Number(loadingBufferMinutes);

  if (
    !Number.isFinite(departureMs) ||
    !Number.isFinite(routeMins) ||
    routeMins <= 0 ||
    !Number.isFinite(bufferMins) ||
    bufferMins < 0
  ) {
    return null;
  }

  return new Date(departureMs + Math.round(routeMins + bufferMins) * MINUTE_MS).toISOString();
}

export function parsePhilippineDeparture(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const departure = new Date(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(departure.getTime())) return null;
  // Date parsing may normalize impossible dates such as February 30.
  const civilTime = new Date(departure.getTime() + PHILIPPINE_OFFSET_MS).toISOString().slice(0, 16);
  return civilTime === `${date}T${time}` ? departure : null;
}

export function departureLimits(now = Date.now(), options = {}) {
  const minLeadTimeHours = Number(options?.minLeadTimeHours ?? 0);
  const maxAdvanceDays = Number(options?.maxAdvanceDays ?? 0);
  const today = new Date(now + PHILIPPINE_OFFSET_MS).toISOString().slice(0, 10);

  const earliestMs =
    Number.isFinite(minLeadTimeHours) && minLeadTimeHours > 0
      ? Math.ceil((now + minLeadTimeHours * HOUR_MS) / MINUTE_MS) * MINUTE_MS
      : (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS;

  const earliest = new Date(earliestMs + PHILIPPINE_OFFSET_MS).toISOString();
  const base = {
    today,
    earliestDate: earliest.slice(0, 10),
    earliestTime: earliest.slice(11, 16),
  };

  if (Number.isFinite(maxAdvanceDays) && maxAdvanceDays > 0) {
    const latestMs = Math.floor((now + maxAdvanceDays * DAY_MS) / MINUTE_MS) * MINUTE_MS;
    const latest = new Date(latestMs + PHILIPPINE_OFFSET_MS).toISOString();
    return {
      ...base,
      latestDate: latest.slice(0, 10),
      latestTime: latest.slice(11, 16),
    };
  }

  return base;
}

export function validateDeparture(date, time, now = Date.now(), options = {}) {
  if (!date || !time) return "Departure date and time are required.";
  const departure = parsePhilippineDeparture(date, time);
  if (!departure) return "Invalid departure date or time.";

  const minLeadTimeHours = Number(options?.minLeadTimeHours ?? 0);
  const maxAdvanceDays = Number(options?.maxAdvanceDays ?? 0);
  const nextMinute = (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS;

  if (departure.getTime() < nextMinute) {
    return "Departure must be scheduled in the future.";
  }

  if (Number.isFinite(minLeadTimeHours) && minLeadTimeHours > 0) {
    const minDepartureMs = now + minLeadTimeHours * HOUR_MS;
    if (departure.getTime() < minDepartureMs) {
      return `Scheduled departure must be at least ${minLeadTimeHours} hours in advance (Philippine time).`;
    }
  }

  if (Number.isFinite(maxAdvanceDays) && maxAdvanceDays > 0) {
    const maxDepartureMs = now + maxAdvanceDays * DAY_MS;
    if (departure.getTime() > maxDepartureMs) {
      return `Scheduled departure cannot be more than ${maxAdvanceDays} days in advance.`;
    }
  }

  return "";
}
