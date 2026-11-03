import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { updateSession, type SessionUpdate } from "./lib/supabase/middleware";
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

// Session-refreshens budget i ms før sitet fortsætter som gæst. middlewareen
// kører for ALLE sider — hvis Supabase er uopnåelig (pauset projekt, DNS
// væk, netværksfejl), hænger getUser() ellers hele siten, og Vercel
// afskærer med "routing middleware took too long to respond" (3/11-udfaldet
// på doccys.com da Supabase var auto-pauset). Udløb/fejl = gæst-session;
// refresh'et prøves stille igen på næste side-visning.
const SESSION_BUDGET_MS = 3_000;

function guestSession(request: NextRequest): SessionUpdate {
  return { response: NextResponse.next({ request }), user: null };
}

export async function middleware(request: NextRequest) {
  // 1 — refresh the Supabase auth session (no-op when not configured).
  // Fail-open for hele middlewareen: en Supabase-udfald degraderer til
  // gæst — den DÆMR IKKE sitets routing.
  let authResponse: NextResponse;
  try {
    const { response } = await Promise.race([
      updateSession(request),
      new Promise<SessionUpdate>((resolve) =>
        setTimeout(() => resolve(guestSession(request)), SESSION_BUDGET_MS),
      ),
    ]);
    authResponse = response;
  } catch {
    authResponse = guestSession(request).response;
  }

  // 2 — locale-aware routing for the (possibly updated) request
  const response = await handleI18nRouting(request);

  // 3 — carry the refreshed auth cookies onto the final response
  for (const cookie of authResponse.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  }

  // 4 — affiliate: delte links bærer ?ref={kode} (se ShareButtons).
  // Koden valideres her KUN syntaktisk — om den findes, afgør checkout
  // (som allerede slår koden op i user_referral_codes), så en
  // opfundet kode er en harmløs cookie, der aldrig krediterer nogen.
  // Samme cookie-semantik som /api/ref/[code]: 30 dage, httpOnly.
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref !== null && /^[a-z0-9]{8}$/.test(ref)) {
    response.cookies.set("doccys_ref", ref, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

export const config = {
  // /og (genererede Open Graph-billeder) og /app-icons (PWA-ikonerne)
  // matcher ikke next-intl — de er sprogløse og skal kunne caches frit.
  matcher: "/((?!api|og|app-icons|_next|_vercel|.*\\..*).*)",
};