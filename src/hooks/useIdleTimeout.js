import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { markActivity, getLastActivity, getIdleLimitMinutes } from '../services/authService';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

export function useIdleTimeout(role, onTimeout) {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!role) return;

    markActivity(); // reset the clock when this mounts (e.g. right after login)

    const handleActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    intervalRef.current = setInterval(async () => {
      const last = getLastActivity();
      if (!last) return;

      const idleMinutes = (Date.now() - last) / 1000 / 60;
      if (idleMinutes > getIdleLimitMinutes(role)) {
        await supabase.auth.signOut();
        onTimeout?.();
      }
    }, 60 * 1000); // check every minute

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearInterval(intervalRef.current);
    };
  }, [role, onTimeout]);
}