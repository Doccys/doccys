import createIntlMiddleware from "next-intl/middleware";
import { updateSession } from "./lib/supabase/middleware";
import { routing } from "./i18n/routing";

/**
 * Middleware pipeline (each step runs on every page request):
 *
 * 1. Supabase session refresh — rotated auth tokens are written onto the
 *    request cookies, so both next-intl and the page see the fresh session.
 *    No-op until credentials are filled in in `.env.local`.
 * 2. next-intl — locale routing: "/" redirects to /da, "/watch/x" to
 *    /da/watch/x, etc. API routes and Next-internal paths are exempt.
 * 3. Supabase's Set-Cookie headers are moved onto the final response
 *    (also when next-intl answers with a redirect).
 */
const handleI18nRouting = createIntlMiddleware(routing);

export async function middleware(request: Parameters<typeof handleI18nRouting>[0]) {
  // 1 — refresh the Supabase auth session (no-op when not configured)
  const { response: authResponse } = await updateSession(request);

  // 2 — locale-aware routing for the (possibly updated) request
  const response = await handleI18nRouting(request);

  // 3 — carry the refreshed auth cookies onto the final response
  for (const cookie of authResponse.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  }

  return response;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};