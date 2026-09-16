/**
 * Supabase client for server contexts (server components, server actions,
 * route handlers). Session tokens are read from — and written to — the
 * request cookies via @supabase/ssr, so the user stays signed in across
 * the App Router's server/client boundary.
 *
 * Usage in a server component:
 *   import { createClient } from "@/lib/supabase/server";
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a server component — cookies are read-only there.
          // The middleware (src/lib/supabase/middleware.ts) handles the
          // session refresh, so this is safe to ignore.
        }
      },
    },
  });
}