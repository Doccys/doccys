import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bygKvitteringPdf } from "@/lib/pdf/kvittering";

export const dynamic = "force-dynamic";

/**
 * GET /api/payouts/[id]/kvittering — PDF-kvittering for en gennemført
 * udbetaling ("indbakken" er anmodningshistorikken selv: hver 'paid'-
 * række får en download-knap; PDF'en genereres on-the-fly, intet gemmes).
 *
 * Sikkerhedsmodel: login + rækken skal tilhøre den loggede bruger
 * (RLS er anden forsvarslinje, .eq gør ejerskabstjekket til en pæn 404
 * i stedet for en læk). Kvitteringen findes først, når redaktionen har
 * sat status 'paid' — ellers 409.
 *
 * NB: beløbet er ANMODNINGENS beløb — redaktionens arbejdsgang er netop
 * at overføre og kvittere med samme beløb (se migrationens kommentarer),
 * så de to er altid i overensstemmelse.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Log ind først" }, { status: 401 });
  }

  // uuid-tjek først: en ulovlig streng mod en uuid-kolonne er en
  // Postgres-fejl, ikke et tomt resultat
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Ukendt anmodning" }, { status: 404 });
  }

  const { data: payoutRequest, error: reqError } = await supabase
    .from("creator_payout_requests")
    .select("id, amount_dkk, status, created_at, processed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (reqError || !payoutRequest) {
    return NextResponse.json({ error: "Ukendt anmodning" }, { status: 404 });
  }
  if (payoutRequest.status !== "paid" || !payoutRequest.processed_at) {
    return NextResponse.json(
      { error: "Kvitteringen findes først, når udbetalingen er gennemført" },
      { status: 409 },
    );
  }

  // modtager + konto til dokumentet (creatorens egen profil + IBAN)
  const [{ data: creator }, { data: method }] = await Promise.all([
    supabase
      .from("creators")
      .select("name, handle")
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("creator_payout_methods")
      .select("iban")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const pdf = bygKvitteringPdf({
    creatorName: creator?.name ?? "—",
    creatorHandle: creator?.handle ?? "—",
    amountDkk: Number(payoutRequest.amount_dkk), // numeric → string fra Postgres
    iban: method?.iban ?? null,
    requestId: payoutRequest.id,
    createdAt: new Date(payoutRequest.created_at),
    processedAt: new Date(payoutRequest.processed_at),
  });

  const filnavn = `doccys-kvittering-${payoutRequest.id.slice(0, 8)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filnavn}"`,
    },
  });
}