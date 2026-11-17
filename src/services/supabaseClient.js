import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // SMS recovery never consumes email/OAuth URL credentials into office auth.
  auth: { detectSessionInUrl: typeof window === 'undefined' || !['/forgot-password', '/reset-password'].includes(window.location.pathname) },
});
