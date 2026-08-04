import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when not configured (e.g. a fresh clone without .env.local set up, or a build where the
// GitHub Actions repo variables haven't been added yet) — callers must handle that and fall
// back gracefully, never treat a missing client as an error.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
