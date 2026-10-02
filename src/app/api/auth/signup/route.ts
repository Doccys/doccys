import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendAuthMail } from "@/lib/mail";
import { hitRateLimit, recentlySent, markSent } from "@/lib/rateLimit";
import { routing } from "@/i18n/routing";
import { normalizeHandle, validateHandleSyntax } from "@/lib/handles";

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
 * Valgfrit @ tag (body.handle): reserveres i user_handles ÉN gang pr.
 * konto (uforanderligt). Ledighedstjekket kaldes FØR generateLink
 * (intet oprettes ved konflikt), reservationen skrives EFTER og er
 * idempotent — genforsøg med samme tag er en ren resend, andet tag
 * afvises med handleLocked. Fejlene er auth.errors-nøgler som resten
 * af ruten (handleInvalid/handleReserved/handleTaken/handleLocked).
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
    /** valgfrit @ tag — normaliseres og reserveres i user_handles */
    handle?: string;
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

  // Valgfrit @ tag: normaliseres (ledende "@"-pynt ignoreres, lowercase
  // tvunget af DB'ens check-constraint). Format- og reserveret-tjek
  // ligger blandt felt-valideringerne FØR rate-limit — et afvist kald
  // koster ingen bucket (ageAccepted-mønstret). Det DB-baserede
  // ledighedstjek ligger derimod EFTER rate-limit: det koster en
  // forespørgsel og må ikke være gratis at hammere på.
  const handle = normalizeHandle(body.handle ?? "");
  if (handle !== "") {
    const handleSyntax = validateHandleSyntax(handle);
    if (handleSyntax === "invalid") {
      return NextResponse.json({ error: "handleInvalid" }, { status: 422 });
    }
    if (handleSyntax === "reserved") {
      return NextResponse.json({ error: "handleReserved" }, { status: 422 });
    }
  }

  // Mail-bombing-vagt: admin-API'et omgår Supabases egne limiter, så
  // app-niveauet er den eneste beskyttelse (se rateLimit.ts).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (hitRateLimit(`signup:${ip}`, 5, 10 * 60_000) || recentlySent(email)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  // Ledigheds-FOR-TJEK: stopper friske racer FØR kontoen oprettes, så
  // et "taget"-svar aldrig efterlader en konto eller spilder en mail.
  // p_user_id udelades = null = rent "findes tag'et?"-tjek — en ny
  // bruger ejer intet. RPC-fejl (PGRST202 pre-migration el. andet) er
  // graceful: kontoen oprettes uden tag, og claim-formen på profilen
  // fanger den bagefter — triggeren håndhæver, når tabellen findes.
  const supabase = createServiceClient();
  if (handle !== "") {
    const { data: optaget, error: rpcError } = await supabase.rpc(
      "handle_optaget",
      { p_handle: handle },
    );
    if (rpcError) {
      console.warn("auth/signup: handle_optaget fejlede:", rpcError.message);
    } else if (optaget === true) {
      return NextResponse.json({ error: "handleTaken" }, { status: 409 });
    }
  }
  // Ét kald: opretter (eller re-udsteder token for) den ubekræftede
  // bruger med password og metadata.
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

  // Reservation af @ tag'et — FØR mailen, så et race aldrig spilder en
  // afsendelse. ALLE fejlgrene lader kontoen bestå og intet deleteUser:
  // generateLink re-udsteder token ved genforsøg, så ruten kan ikke
  // skelne et frisk kald fra et tidligere — et deleteUser kunne ramme
  // en konto med en allerede afsendt bekræftelsesmail.
  if (handle !== "") {
    const { data: existing, error: selectError } = await supabase
      .from("user_handles")
      .select("handle")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (selectError) {
      // PGRST205 pre-migration el. andet — kontoen oprettes uden tag.
      console.warn(
        "auth/signup: user_handles-læsning fejlede:",
        selectError.message,
      );
    } else if (existing) {
      if (existing.handle !== handle) {
        // Tag'et er valgt og uforanderligt — resend kræver samme tag.
        return NextResponse.json({ error: "handleLocked" }, { status: 409 });
      }
      // Samme tag = ren resend af bekræftelsesmailen; reservationen består.
    } else {
      const { error: insertError } = await supabase
        .from("user_handles")
        .insert({ user_id: data.user.id, handle });
      if (insertError) {
        console.warn(
          "auth/signup: handle-reservation fejlede:",
          insertError.message,
        );
        // 23505 (unique) / P0001 (trigger): racet mellem for-tjekket og
        // commit, eller triggeren afviste — kontoen består, brugeren
        // vælger et andet tag og resubmitter (idempotent via læsningen
        // ovenfor). Alt andet er uventet → generic (som mail-fejlen).
        const taget = insertError.code === "23505" || insertError.code === "P0001";
        return NextResponse.json(
          { error: taget ? "handleTaken" : "generic" },
          { status: taget ? 409 : 500 },
        );
      }
    }
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