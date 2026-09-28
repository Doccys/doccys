import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account — selvbetjent kontosletning (GDPR).
 *
 * Privatlivspolitikkens løfte (legal.privacy s6): konto- og
 * kommentardata slettes, købsdata og beviser opbevares anonymiseret
 * i fem år (bogføringsloven). Ruten gennemfører det i én kanal.
 *
 * Trin-rækkefølgen er FAIL CLOSED — anonymiseringen står FØR alle
 * øvrige skrivehandlinger, så en u-migreret database (user_id
 * stadig NOT NULL, jf. 20260928_slet_konto.sql) stopper ruten med
 * en fejl, FØR noget som helst er slettet:
 *
 *   1. Session (server-cookie) — ellers 401.
 *   2. Navne-bekræftelse: body.name skal matche brugerens eget
 *      full_name (trim + case-insensitivt) — skriv-og-bekræft er
 *      dermed håndhævet server-side, ikke kun i UI'et.
 *   3. Skaber-lås: konti der ejer en creator-profil afvises — film,
 *      udbetalingshistorik og storage-objekter kræver redaktionel
 *      håndtering (support@doccys.com).
 *   4. Købsdata anonymiseres: user_id = null på credit_purchases +
 *      credit_ledger, FØR deleteUser — kaskaden (on delete cascade)
 *      æder ellers rækkerne, og beviserne forsvinder med dem.
 *   5. Kommentarer slettes helt (politikkens ordlyd) — kaskaderne
 *      tager likes og hele svar-tråde med.
 *   6. admin.deleteUser — identiteten går som det sidste.
 *
 * Idempotens: trin 4 og 5 kan trygt gentages (et nyt kald rammer 0
 * rækker). deleteUser kan ALDRIG stå før anonymiseringen. SQL'erne
 * og auth-admin-API'et kan ikke omsluttes af én transaktion —
 * rækkefølgen data-først gør alle fiasko-tilstande re-runnable og
 * privatlivs-fremadrettede: er deleteUser fejlet, prøver brugeren
 * bare igen, og intet går tabt.
 *
 * Ingen rate limit (ruten er session-beskyttet og sender ingen
 * mail), ingen storage-oprydning ({user_id}/-objekter findes kun
 * for skabere — og skabere er blokeret).
 *
 * Fejl-nøgler (UI'et oversætter selv): creatorBlocked (403),
 * nameMismatch (422), generic (401/500).
 */
export async function DELETE(request: NextRequest) {
  // 1) Session — server-cookien er den eneste autoritet.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "generic" }, { status: 401 });
  }

  // 2) Skriv-og-bekræft, håndhævet server-side: DELETE er ikke en
  //    CORS-"simple method", så cross-site drive-by blokeres af
  //    preflight — tjekket garderer egne scripts og forvirrede kald.
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "nameMismatch" }, { status: 422 });
  }
  const expected = (user.user_metadata?.full_name as string | undefined)?.trim().toLowerCase() ?? "";
  const given = body.name?.trim().toLowerCase() ?? "";
  if (!expected || !given || expected !== given) {
    return NextResponse.json({ error: "nameMismatch" }, { status: 422 });
  }

  // 3) Skaber-lås: creators er offentligt læsbart, så brugerens egen
  //    session kan slå ejerskabet op. Ruten gen-tjekker aldrig med
  //    det UI'et mener — UI'et skjuler blot formularen.
  const { data: ownedCreator } = await supabase
    .from("creators")
    .select("id")
    .eq("owner_user_id", user.id)
    .limit(1);
  if (ownedCreator && ownedCreator.length > 0) {
    return NextResponse.json({ error: "creatorBlocked" }, { status: 403 });
  }

  const service = createServiceClient();

  // 4) Købsdata anonymiseres FØR alt andet (fail closed): uden
  //    migrationen fejler PostgREST her med NOT NULL — og ruten har
  //    endnu ikke rørt kommentarer eller kontoen.
  const anonymize = async (table: "credit_purchases" | "credit_ledger") => {
    const { error } = await service.from(table).update({ user_id: null }).eq("user_id", user.id);
    if (error) {
      console.warn(`account/delete: anonymisering af ${table} fejlede:`, error.message);
      throw new Error(error.message);
    }
  };
  try {
    await anonymize("credit_purchases");
    await anonymize("credit_ledger");
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  // 5) Kommentarer slettes helt — kaskaderne (comment_likes og
  //    parent_id er begge on delete cascade) tager likes og hele
  //    svar-tråde med. Service-klienten er nødvendig: seerens egen
  //    RLS giver ikke delete-adgang til comments.
  const { error: commentsError } = await service
    .from("comments")
    .delete()
    .eq("user_id", user.id);
  if (commentsError) {
    console.warn("account/delete: kommentar-sletning fejlede:", commentsError.message);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  // 6) Identiteten sidst — fejler dette, kan brugeren trygt prøve
  //    igen: ovenstående trin er idempotente, og slut-tilstanden er
  //    allerede den lovede for data.
  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.warn("account/delete: deleteUser fejlede:", deleteError.message);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}