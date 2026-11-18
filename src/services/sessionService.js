import { getApproxLocation, getDeviceInfo, getOrCreateDeviceId } from '../lib/deviceInfo.js';

const MAX_STORED_SESSIONS = 10;

function normalizeSessionRecord(entry, currentDeviceId) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || entry.deviceId || '').trim();
  if (!id) return null;
  const deviceId = String(entry.deviceId || id).trim();
  return {
    id,
    deviceId,
    deviceType: entry.deviceType === 'mobile' || entry.deviceType === 'tablet' ? entry.deviceType : 'desktop',
    deviceName: entry.deviceName || 'Desktop Browser',
    os: entry.os || 'Unknown OS',
    browser: entry.browser || 'Unknown Browser',
    location: entry.location || null,
    signedInAt: entry.signedInAt || entry.lastActiveAt || null,
    lastActiveAt: entry.lastActiveAt || entry.signedInAt || null,
    isCurrent: Boolean(currentDeviceId && deviceId === currentDeviceId),
  };
}

export function sortSessions(sessions = [], currentDeviceId = getOrCreateDeviceId()) {
  const normalized = sessions
    .map(item => normalizeSessionRecord(item, currentDeviceId))
    .filter(Boolean);

  return normalized.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const aTime = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
    const bTime = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
    return bTime - aTime;
  });
}

export async function buildCurrentSessionRecord(user, { forceGeoRefresh = false } = {}) {
  const deviceId = getOrCreateDeviceId();
  const [device, location] = await Promise.all([
    getDeviceInfo(),
    getApproxLocation({ timeoutMs: 2000, forceRefresh: forceGeoRefresh }),
  ]);
  const now = new Date().toISOString();
  const existing = Array.isArray(user?.user_metadata?.device_sessions)
    ? user.user_metadata.device_sessions.find(item => item?.deviceId === deviceId || item?.id === deviceId)
    : null;

  return {
    id: deviceId,
    deviceId,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    os: device.os,
    browser: device.browser,
    location: location || existing?.location || null,
    signedInAt: user?.last_sign_in_at || existing?.signedInAt || now,
    lastActiveAt: now,
  };
}

export async function recordDeviceSession(client, user, options = {}) {
  if (!client?.auth?.updateUser || !user?.id) return [];
  const currentDeviceId = getOrCreateDeviceId();
  const currentRecord = await buildCurrentSessionRecord(user, options);
  const existingList = Array.isArray(user.user_metadata?.device_sessions)
    ? user.user_metadata.device_sessions
    : [];

  const filtered = existingList.filter(
    item => item && item.deviceId !== currentDeviceId && item.id !== currentDeviceId
  );

  const nextSessions = [currentRecord, ...filtered].slice(0, MAX_STORED_SESSIONS);

  try {
    await client.auth.updateUser({
      data: { device_sessions: nextSessions },
    });
  } catch {
    // Non-fatal: still return sorted local view if metadata write fails.
  }

  return sortSessions(nextSessions, currentDeviceId);
}

export async function ensureDeviceSessions(client, user) {
  const currentDeviceId = getOrCreateDeviceId();
  const existingList = Array.isArray(user?.user_metadata?.device_sessions)
    ? user.user_metadata.device_sessions
    : [];

  const currentEntry = existingList.find(
    item => item && (item.deviceId === currentDeviceId || item.id === currentDeviceId)
  );

  const needsRecord = !currentEntry || !currentEntry.os || !currentEntry.browser || !currentEntry.location;
  if (needsRecord && client?.auth?.updateUser) {
    return recordDeviceSession(client, user);
  }

  return sortSessions(existingList, currentDeviceId);
}

export async function removeDeviceSession(client, user, sessionId) {
  const currentDeviceId = getOrCreateDeviceId();
  const existingList = Array.isArray(user?.user_metadata?.device_sessions)
    ? user.user_metadata.device_sessions
    : [];

  const nextRaw = existingList.filter(item => item && item.id !== sessionId && item.deviceId !== sessionId);

  if (nextRaw.every(item => item.deviceId === currentDeviceId || item.id === currentDeviceId)) {
    const { error } = await client.auth.signOut({ scope: 'others' });
    if (error) throw new Error('Unable to sign out other sessions. Please retry.');
  }

  if (client?.auth?.updateUser) {
    const { error } = await client.auth.updateUser({
      data: { device_sessions: nextRaw },
    });
    if (error) throw new Error(error.message || 'Unable to remove device session. Please retry.');
  }

  return sortSessions(nextRaw, currentDeviceId);
}

export async function clearOtherDeviceSessions(client, user) {
  const currentDeviceId = getOrCreateDeviceId();
  const existingList = Array.isArray(user?.user_metadata?.device_sessions)
    ? user.user_metadata.device_sessions
    : [];

  const currentOnly = existingList.filter(
    item => item && (item.deviceId === currentDeviceId || item.id === currentDeviceId)
  );

  if (client?.auth?.updateUser) {
    try {
      await client.auth.updateUser({
        data: { device_sessions: currentOnly },
      });
    } catch {
      // Non-fatal after global others signOut
    }
  }

  return sortSessions(currentOnly, currentDeviceId);
}
