import { createClient } from '@supabase/supabase-js';

// Supabase udfaser anon-nøglen ved udgangen af 2026 til fordel for
// sb_publishable_…. Den nye foretrækkes; den gamle læses stadig, så appen
// bliver ved at virke indtil variablen er sat i Netlify og der er bygget igen.
const noegle =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  noegle,
  { auth: { detectSessionInUrl: false } }
);
