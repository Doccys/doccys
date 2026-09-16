/**
 * Session refresh for the middleware.
 *
 * Supabase auth tokens expire; this runs on every page request and writes
 * refreshed tokens back to the request + response cookies, so a signed-in
 * user stays signed in. `getUser()` also validates the token server-side —
 * use the returned user for route protection later on.
 *
 * While `.env.local` is empty (no credentials yet) this is a no-op
 * passthrough, so the app runs exactly as before.
 */
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "./config";

export interface SessionUpdate {
  /** Response carrying refreshed auth cookies (already applied to `request`). */
  response: NextResponse;
  /** Signed-in user, validated by the Supabase auth server. Null otherwise. */
  user: User | null;
}

export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  if (!hasSupabaseEnv()) {
    return { response: NextResponse.next({ request }), user: null };
  }

  const { url, anonKey } = getSupabaseEnv();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Refreshed tokens must be visible to the rest of this request …
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // … and persisted in the browser via Set-Cookie on the response.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not add code between createServerClient and getUser() —
  // it breaks the refresh-token rotation in some Next.js versions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}