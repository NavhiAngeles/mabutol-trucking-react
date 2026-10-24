import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { markActivity, getLastActivity, getIdleLimitMinutes } from '../services/authService';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

export function useIdleTimeout(role, onTimeout) {
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!role) return;

    // Initialize only a missing clock. Renders, role changes and remounts are not activity.
    if (!getLastActivity()) markActivity();

    const handleActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    const interval = setInterval(async () => {
      const last = getLastActivity();
      if (!last) return;

      const idleMinutes = (Date.now() - last) / 1000 / 60;
      if (idleMinutes > getIdleLimitMinutes(role)) {
        await supabase.auth.signOut();
        onTimeoutRef.current?.();
      }
    }, 60 * 1000); // check every minute

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearInterval(interval);
    };
  }, [role]);
}
