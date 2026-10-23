import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const sessionVersion = useRef(0);

  async function loadSession() {
    const version = ++sessionVersion.current;
    const { data: { session } } = await supabase.auth.getSession();
    if (version !== sessionVersion.current) return;
    if (!session) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, is_active")
      .eq("id", session.user.id)
      .single();

    if (version !== sessionVersion.current) return;
    setUser(session.user);
    setRole(profile?.role ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearAuth();
      else loadSession();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function clearAuth() {
    sessionVersion.current++;
    setUser(null);
    setRole(null);
    setLoading(false);
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}