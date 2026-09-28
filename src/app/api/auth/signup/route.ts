import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendAuthMail } from "@/lib/mail";
import { hitRateLimit, recentlySent, markSent } from "@/lib/rateLimit";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Alders-vilkårs-version: bundet til "Senest opdateret"-datoen i
 * legal.terms.intro og klausulen i legal.terms.sections.s12 —
 * ændres aldersklausulen væsentligt, bumpes alle tre steder
 * (samme model som FILM_LICENSE_VERSION i api/films/route.ts).
 */
const AGE_TERMS_VERSION = "2026-09-28";

/**
 * POST /api/auth/signup — opret konto OG send den lokaliserede
 * bekræftelses-mail.
 *
 * Appen sender selv mailen (Supabases indbyggede skabeloner findes kun
 * på engelsk): admin.generateLink({type:'signup'}) opretter brugeren
 * ubekræftet med password + metadata (full_name, locale) i ét kald og
 * returnerer et engangs-token — der bygges et link til confirm-kortet
 * af hashed_token, og mailen sendes via nodemailer på seerens sprog.
 * action_link bruges IKKE: dens redirect-mål fryses ved afsendelse.
 *
 * 18+-bekræftelse (Handelsbetingelserne afsnit 12): ruten kræver
 * ageAccepted === true og skriver selv beviset (servertid + version)
 * i raw_user_meta_data — klienten sender ingen tid, intet klient-ur.
 *
 * Supabase udsender ingen egne mails fra admin-API'et; "Confirm email"
 * forbliver slået til i dashboardet, så login stadig kræver bekræftelse.
 *
 * Svarer {ok:true} ved succes; fejl svarer med ERROR_KEYS-nøglesprog
 * (emailExists/weakPassword/rateLimited/ageRequired/generic), som
 * AuthForm viser direkte.
 */
export async function POST(request: NextRequest) {
  let body: {
    email?: string;
    password?: string;
    name?: string;
    locale?: string;
    ageAccepted?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const name = body.name?.trim() ?? "";

  // Håndlavet validering à la comments-ruten (ingen zod i projektet):
  // 6 = Supabases minimum, 72 = bcrypt-grænsen.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "generic" }, { status: 400 });
  }
  if (password.length < 6 || password.length > 72) {
    return NextResponse.json({ error: "weakPassword" }, { status: 422 });
  }
  if (name.length < 1 || name.length > 120) {
    return NextResponse.json({ error: "nameMissing" }, { status: 400 });
  }
  // 18+ (Handelsbetingelserne afsnit 12): strikt === true — en streng
  // "true" eller 1 afvises (samme håndhævelse som licensen i /api/films).
  // Tjekket ligger blandt felt-valideringerne, FØR rate-limit, så et
  // afvist kald ikke koster en bucket eller en mail.
  if (body.ageAccepted !== true) {
    return NextResponse.json({ error: "ageRequired" }, { status: 422 });
  }
  const locale: (typeof routing.locales)[number] = routing.locales.includes(
    (body.locale ?? "") as (typeof routing.locales)[number],
  )
    ? ((body.locale ?? routing.defaultLocale) as (typeof routing.locales)[number])
    : routing.defaultLocale;

  // Mail-bombing-vagt: admin-API'et omgår Supabases egne limiter, så
  // app-niveauet er den eneste beskyttelse (se rateLimit.ts).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (hitRateLimit(`signup:${ip}`, 5, 10 * 60_000) || recentlySent(email)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  // Ét kald: opretter (eller re-udsteder token for) den ubekræftede
  // bruger med password og metadata.
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: {
        full_name: name,
        locale,
        // 18+-bevis: HVORNÅR (servertid) + HVAD (vilkårs-version bundet
        // til terms-datoen) — samme model som filmlicensens kolonner,
        // blot i metadata da auth.users ikke kan ALTER'es.
        age_confirmed_at: new Date().toISOString(),
        age_terms_version: AGE_TERMS_VERSION,
      },
    },
  });

  if (error) {
    // Admin-fejl bærer sjældent error.code — triage på beskeden.
    const msg = error.message ?? "";
    if (/password|weak/i.test(msg)) {
      return NextResponse.json({ error: "weakPassword" }, { status: 422 });
    }
    if (/already|exist|registered/i.test(msg)) {
      // Bekræftet konto — samme afsløring som i dag (user_already_exists).
      return NextResponse.json({ error: "emailExists" }, { status: 409 });
    }
    console.warn("auth/signup: generateLink fejlede:", msg);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  // Linket bygges selv af hashed_token (enkelt-brug, kortlivet).
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const link = `${origin}/${locale}/auth/confirm?token_hash=${data.properties.hashed_token}&type=signup`;

  try {
    await sendAuthMail({ to: email, locale, kind: "signup", link, name });
    markSent(email);
  } catch (err) {
    // Kontoen er oprettet; et nyt forsøg er blot en resend — harmløst.
    console.warn("auth/signup: mailen kunne ikke sendes:", err);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}