import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendAuthMail } from "@/lib/mail";
import { hitRateLimit, recentlySent, markSent } from "@/lib/rateLimit";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset — send den lokaliserede password-nulstillings-mail.
 *
 * Som signup-ruten sender appen selv mailen via nodemailer; linket bygges
 * af generateLink({type:'recovery'})'s hashed_token og peger på
 * /{locale}/auth/reset, hvor kortet veksler via verifyOtp.
 *
 * Ingen konto-afsløring: svaret er ALTID {ok:true} — findes e-mailen
 * ikke, sendes ingen mail men svaret er identisk. Mail-sproget tages
 * fra brugerens gemte locale-metadata (sat ved signup), så nulstillings-
 * mailen rammer det sprog, brugeren valgte ved oprettelsen; konti uden
 * locale (oprettet før 28/9) falder tilbage til det sprog, formularen
 * bad fra. SMTP-fejl logges og svaret forbliver ok — ellers ville en
 * fejlmeddelelse afsløre, at kontoen findes.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Ugyldigt format: afvis stille (samme svarform som resten af ruten —
    // et format-tjek skal ikke kunne bruges til at sondre noget).
    return NextResponse.json({ ok: true });
  }
  const bodyLocale: (typeof routing.locales)[number] = routing.locales.includes(
    (body.locale ?? "") as (typeof routing.locales)[number],
  )
    ? ((body.locale ?? routing.defaultLocale) as (typeof routing.locales)[number])
    : routing.defaultLocale;

  // Mail-bombing er den primære trussel her — én indbakke kan målrettes
  // af alle. IP-grænsen + pr.-e-mail-cooldown (se rateLimit.ts).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (hitRateLimit(`reset:${ip}`, 5, 10 * 60_000) || recentlySent(email)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data?.user) {
    // Ukendt (eller fejlende) e-mail: log stille, svar ok uden mail —
    // ingen sondring mellem de to tilstande må nå klienten.
    if (error) console.warn("auth/reset: generateLink fejlede:", error.message);
    return NextResponse.json({ ok: true });
  }

  // Sproget fra signup-tidspunktet, hvis det findes og er gyldigt.
  const stored = (data.user.user_metadata?.locale as string | undefined) ?? "";
  const locale: (typeof routing.locales)[number] = routing.locales.includes(
    stored as (typeof routing.locales)[number],
  )
    ? (stored as (typeof routing.locales)[number])
    : bodyLocale;

  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const link = `${origin}/${locale}/auth/reset?token_hash=${data.properties.hashed_token}&type=recovery`;

  try {
    await sendAuthMail({ to: email, locale, kind: "recovery", link });
    markSent(email);
  } catch (err) {
    console.warn("auth/reset: mailen kunne ikke sendes:", err);
  }

  return NextResponse.json({ ok: true });
}