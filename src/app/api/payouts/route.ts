import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Selvbetjent udbetaling for creators.
 *
 *   PUT  /api/payouts — gem/rediger egne udbetalingsoplysninger
 *   POST /api/payouts — opret udbetalingsanmodning (body: creatorHandle)
 *
 * Sikkerhedsmodel: RLS er anden forsvarslinje — metode-rækken og
 * anmodningen kan kun skrives på auth.uid() selv, og anmodningens
 * status er låst til 'pending' for app-klienter (ingen update-policy).
 * Beløbet beregnes SERVER-side via creator_indtjening (kunnet ikke
 * forfalskes af klienten) og skal være >= 150 kr for at bankgebyret
 * kan forsvares.
 */

/** minimum for en udbetaling — skal matche DB-check amount_dkk >= 150 */
const PAYOUT_THRESHOLD_DKK = 150;

export async function PUT(request: NextRequest) {
  let body: { iban?: string; bic?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Log ind først" }, { status: 401 });
  }

  // IBAN er den internationale standard (danske konti har også et —
  // DK + 16 cifre, synligt i netbanken). Mellemrum strippes først,
  // mange skriver IBAN'en grupperet.
  const iban = body.iban?.trim().replace(/\s+/g, "").toUpperCase() || null;

  if (!iban) {
    return NextResponse.json({ error: "Udfyld din IBAN" }, { status: 400 });
  }
  // landkode + 2 tjekciffer + 11-30 tegn = samlet længde 15-34
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return NextResponse.json(
      { error: "IBAN-formatet ser forkert ud — tjek din netbank" },
      { status: 400 },
    );
  }

  // BIC/SWIFT er VALGFRI — kun nødvendig for konti uden for SEPA.
  // 8 tegn (bank+land+sted) eller 11 tegn (+ afdeling). Tomt = null.
  const bic = body.bic?.trim().replace(/\s+/g, "").toUpperCase() || null;
  if (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic)) {
    return NextResponse.json(
      { error: "BIC/SWIFT-formatet ser forkert ud — 8 eller 11 tegn" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("creator_payout_methods")
    .upsert({ user_id: user.id, bank_reg_nr: null, bank_account_nr: null, iban, bic });

  if (error) {
    console.error("gem udbetalingsoplysninger:", error);
    return NextResponse.json({ error: "Kunne ikke gemme oplysningerne" }, { status: 500 });
  }
  return NextResponse.json({ method: { iban, bic } });
}

export async function POST(request: NextRequest) {
  let body: { creatorHandle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Log ind først" }, { status: 401 });
  }

  // ejerskab: kontoen skal eje creator-profilen (creator_indtjening
  // afviser alligevel andre — dette giver en pæn 403 i stedet)
  const { data: creator } = await supabase
    .from("creators")
    .select("handle")
    .eq("handle", body.creatorHandle ?? "")
    .maybeSingle();
  const { data: ownedCreator } = await supabase
    .from("creators")
    .select("handle")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!creator || ownedCreator?.handle !== creator.handle) {
    return NextResponse.json({ error: "Du ejer ikke denne skaber-profil" }, { status: 403 });
  }

  // bankoplysninger skal findes, før der kan anmodes
  const { data: method } = await supabase
    .from("creator_payout_methods")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!method) {
    return NextResponse.json(
      { error: "Gem dine udbetalingsoplysninger først" },
      { status: 400 },
    );
  }

  // tilgængelig saldo beregnes server-side — klienten kan ikke lyve
  // (RPC'en returnerer jsonb → unknown, så feltet læses med et cast)
  const { data: earnings, error: rpcError } = await supabase.rpc(
    "creator_indtjening",
    { p_creator_handle: creator.handle },
  );
  if (rpcError || !earnings) {
    console.error("creator_indtjening ved udbetaling:", rpcError);
    return NextResponse.json(
      { error: "Kunne ikke læse din saldo — prøv igen" },
      { status: 500 },
    );
  }
  const available = Number(
    (earnings as { tilgaengelig_dkk?: string | number }).tilgaengelig_dkk ?? 0,
  );
  if (available < PAYOUT_THRESHOLD_DKK) {
    return NextResponse.json(
      { error: `Udbetaling kræver en saldo på mindst ${PAYOUT_THRESHOLD_DKK} kr.` },
      { status: 400 },
    );
  }

  const { data: payoutRequest, error: insertError } = await supabase
    .from("creator_payout_requests")
    .insert({ user_id: user.id, amount_dkk: available })
    .select("id, amount_dkk, status, created_at, processed_at")
    .single();

  if (insertError) {
    // 23505 = der er allerede en afventende anmodning
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Der er allerede en afventende udbetalingsanmodning" },
        { status: 409 },
      );
    }
    console.error("opret udbetalingsanmodning:", insertError);
    return NextResponse.json({ error: "Kunne ikke oprette anmodningen" }, { status: 500 });
  }

  // camelCase + number, så svaret matcher panelets type 1:1
  return NextResponse.json(
    {
      request: {
        id: payoutRequest.id,
        amountDkk: Number(payoutRequest.amount_dkk),
        status: payoutRequest.status,
        createdAt: payoutRequest.created_at,
        processedAt: payoutRequest.processed_at,
      },
    },
    { status: 201 },
  );
}