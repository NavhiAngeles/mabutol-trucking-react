import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    const { data: { session } } = await supabase.auth.getSession();
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

    setUser(session.user);
    setRole(profile?.role ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function clearAuth() {
    setUser(null);
    setRole(null);
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