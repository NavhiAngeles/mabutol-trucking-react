import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { markActivity, getLastActivity, getIdleLimitMinutes, IDLE_WARNING_SECONDS } from '../services/authService';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];
const WARNING_SECONDS = typeof IDLE_WARNING_SECONDS === 'number' ? IDLE_WARNING_SECONDS : 120;

export function useIdleTimeout(role, onTimeout) {
  const onTimeoutRef = useRef(onTimeout);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_SECONDS);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const staySignedIn = useCallback(() => {
    markActivity();
    setShowWarning(false);
    setRemainingSeconds(WARNING_SECONDS);
  }, []);

  useEffect(() => {
    if (!role) return;

    // Initialize only a missing clock. Renders, role changes and remounts are not activity.
    if (!getLastActivity()) markActivity();

    const handleActivity = () => {
      markActivity();
      setShowWarning(false);
      setRemainingSeconds(WARNING_SECONDS);
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    const checkTimeout = async () => {
      const last = getLastActivity();
      if (!last) return;

      const now = Date.now();
      const limitMinutes = getIdleLimitMinutes(role);
      const limitMs = limitMinutes * 60 * 1000;
      const warningThresholdMs = WARNING_SECONDS * 1000;
      const idleMs = now - last;
      const remainingMs = limitMs - idleMs;

      if (remainingMs <= 0) {
        setShowWarning(false);
        await supabase.auth.signOut();
        onTimeoutRef.current?.();
        return;
      }

      if (remainingMs <= warningThresholdMs) {
        setShowWarning(true);
        setRemainingSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      } else {
        setShowWarning(false);
        setRemainingSeconds(WARNING_SECONDS);
      }
    };

    const handleStorage = (event) => {
      // Synchronize activity across browser tabs via the window storage event
      if (!event || event.key === 'lastActivityAt' || event.key === null) {
        void checkTimeout();
      }
    };

    window.addEventListener('storage', handleStorage);

    const interval = setInterval(checkTimeout, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [role]);

  return { showWarning: Boolean(role && showWarning), remainingSeconds, staySignedIn };
}
