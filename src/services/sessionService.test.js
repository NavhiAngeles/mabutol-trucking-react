import test from 'node:test';
import assert from 'node:assert/strict';
import { clearOtherDeviceSessions, removeDeviceSession, sortSessions } from './sessionService.js';

test('sortSessions places current device first and orders others by recency', () => {
  const sorted = sortSessions([
    { id: 'old', deviceId: 'old', deviceName: 'Mac', lastActiveAt: '2026-11-18T08:00:00Z' },
    { id: 'cur', deviceId: 'cur', deviceName: 'Windows 11 PC', lastActiveAt: '2026-11-18T07:00:00Z' },
    { id: 'new', deviceId: 'new', deviceName: 'Pixel 8', lastActiveAt: '2026-11-18T09:00:00Z' },
  ], 'cur');

  assert.deepEqual(sorted.map(s => s.id), ['cur', 'new', 'old']);
  assert.equal(sorted[0].isCurrent, true);
  assert.equal(sorted[1].isCurrent, false);
});

test('removeDeviceSession updates metadata and invokes signOut(others) when only current remains', async () => {
  let signOutScope = null;
  let updatedData = null;
  const mockClient = {
    auth: {
      signOut: async ({ scope }) => {
        signOutScope = scope;
        return { error: null };
      },
      updateUser: async ({ data }) => {
        updatedData = data;
        return { error: null };
      },
    },
  };
  const user = {
    id: 'u1',
    user_metadata: {
      device_sessions: [
        { id: 'server-session', deviceId: 'server-session', deviceName: 'Current PC' },
        { id: 'other-1', deviceId: 'other-1', deviceName: 'Other Phone' },
      ],
    },
  };

  const remaining = await removeDeviceSession(mockClient, user, 'other-1');
  assert.equal(signOutScope, 'others');
  assert.equal(updatedData.device_sessions.length, 1);
  assert.equal(remaining.length, 1);
});

test('clearOtherDeviceSessions keeps only current session', async () => {
  let updatedData = null;
  const mockClient = {
    auth: {
      updateUser: async ({ data }) => {
        updatedData = data;
        return { error: null };
      },
    },
  };
  const user = {
    id: 'u1',
    user_metadata: {
      device_sessions: [
        { id: 'server-session', deviceId: 'server-session', deviceName: 'Current PC' },
        { id: 'other-1', deviceId: 'other-1', deviceName: 'Other Phone' },
      ],
    },
  };

  const remaining = await clearOtherDeviceSessions(mockClient, user);
  assert.equal(updatedData.device_sessions.length, 1);
  assert.equal(remaining.length, 1);
});
