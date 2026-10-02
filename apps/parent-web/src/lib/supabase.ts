import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Message explicite plutôt qu'un échec silencieux au premier appel.
  console.error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants — copier .env.example en .env.local",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
