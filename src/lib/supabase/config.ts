/**
 * Shared access to the Supabase environment variables.
 *
 * Both variables live in `.env.local` (see `.env.example` for the template).
 * Until real credentials are filled in, `hasSupabaseEnv()` returns false and
 * the middleware/clients degrade gracefully instead of calling a dead URL.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (Supabase dashboard → " +
        "Settings → API) and restart the dev server.",
    );
  }

  return { url, anonKey };
}