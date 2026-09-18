/**
 * Supabase client for browser contexts (client components, event handlers).
 *
 * Usage:
 *   "use client";
 *   import { createClient } from "@/lib/supabase/client";
 *   const supabase = createClient();
 *   await supabase.auth.signInWithPassword({ email, password });
 *
 * `createBrowserClient` from @supabase/ssr stores the session in cookies
 * (not localStorage), so the same session is available on the server —
 * which is what the server client below reads.
 *
 * Typet med Database-genericen, så realtime-kanaler (postgres_changes)
 * og .from()-kald giver fuld typedata i klienten.
 */
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./config";
import type { Database } from "./database.types";

export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}