import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signInMessage, setSignInMessage] = useState(null);
  const sessionVersion = useRef(0);
  function completeSignIn(result) {
    if (!result?.user?.id || !['admin','staff'].includes(result.role)) throw new Error('Unable to verify office account.');
    // The login service has checked the active server profile. Publish it before
    // routing and invalidate reads started while the user was signed out.
    sessionVersion.current++;
    setUser(result.user); setRole(result.role); setLoading(false);
    setSignInMessage('You have successfully signed in.');
  }
  function clearAuth() {
    sessionVersion.current++;
    setUser(null); setRole(null); setLoading(false);
    setSignInMessage(null);
  }
  useEffect(() => {
    let disposed = false;
    const pending = new Set();
    async function loadSession() {
      const version = ++sessionVersion.current;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (disposed || version !== sessionVersion.current) return;
        const session = error ? null : data?.session;
        if (!session) { setUser(null); setRole(null); setLoading(false); return; }
        const { data: profile, error: profileError } = await supabase.from('users').select('role,is_active').eq('id', session.user.id).single();
        if (disposed || version !== sessionVersion.current) return;
        const allowed = !profileError && profile?.is_active === true && ['admin','staff'].includes(profile.role);
        setUser(allowed ? session.user : null); setRole(allowed ? profile.role : null); setLoading(false);
      } catch {
        if (!disposed && version === sessionVersion.current) { setUser(null); setRole(null); setLoading(false); }
      }
    }
    void loadSession();
    // Run outside the Auth callback to avoid waiting on its internal session lock.
    function schedule() {
      const timer = setTimeout(() => { pending.delete(timer); void loadSession(); }, 0);
      pending.add(timer);
    }
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { sessionVersion.current++; setUser(null); setRole(null); setLoading(false); }
      else schedule();
    });
    const poll = setInterval(loadSession, 30000);
    window.addEventListener('focus', schedule);
    return () => { disposed = true; listener.subscription.unsubscribe(); clearInterval(poll); pending.forEach(clearTimeout); window.removeEventListener('focus', schedule); };
  }, []);
  return <AuthContext.Provider value={{ user, role, loading, clearAuth, completeSignIn, signInMessage, dismissSignInMessage: () => setSignInMessage(null) }}>{children}</AuthContext.Provider>;
}
// The context provider and its hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext); }
