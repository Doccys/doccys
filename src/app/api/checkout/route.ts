import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { findMinutePack } from "@/lib/data/minutePacks";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout — start et engangs-køb af en minutpakke.
 *
 * Tillidsmodel: brugeren kan selv oprette pending-køb (RLS tvinger
 * status='pending'), men kun Stripe-webhooken kan kreditere pakken —
 * alt købs-flow sker altså med brugerens egen klient + serverens
 * Stripe-nøgle. Stripe-sessionen oprettes FØRST: en forældreløs
 * session ved en senere insert-fejl er harmløs, webhooken ignorerer
 * ukendte session-id'er.
 *
 * Affiliate: læser doccys_ref-cookien (30 dage, sat af /api/ref/[code]).
 * Koderens ejer krediters KUN hvis køberen ikke har tidligere paid-køb
 * og ikke har henvist sig selv — det afgøres endeligt i indfri_koeb
 * under advisory-lås, så det er race-frit.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log ind for at købe minutter" },
      { status: 401 },
    );
  }

  let body: { packId?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON-body" }, { status: 400 });
  }

  const pack = findMinutePack(body.packId ?? "");
  if (!pack) {
    return NextResponse.json({ error: "Ukendt pakke" }, { status: 400 });
  }

  const locale: (typeof routing.locales)[number] = routing.locales.includes(
    (body.locale ?? "") as (typeof routing.locales)[number],
  )
    ? ((body.locale ?? routing.defaultLocale) as (typeof routing.locales)[number])
    : routing.defaultLocale;

  // Affiliate-henvisning: koden i cookien → ejer-id, hvis reglerne matcher
  let referrerUserId: string | null = null;
  const refCode = request.cookies.get("doccys_ref")?.value;
  if (refCode) {
    const { data: referrer } = await supabase
      .from("user_referral_codes")
      .select("user_id")
      .eq("code", refCode)
      .maybeSingle();

    if (referrer && referrer.user_id !== user.id) {
      const { count } = await supabase
        .from("credit_purchases")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "paid");
      if (!count) referrerUserId = referrer.user_id;
    }
  }

  let session;
  try {
    const stripe = getStripe();
    const origin =
      request.headers.get("origin") ?? request.nextUrl.origin;

    // Find/opret Stripe-kunde, så checkouten kan forudfylde e-mail og
    // faktureringsland. Uden forudfyldt land står momslinjen på 0,00 kr,
    // indtil kunden selv har valgt land — med DK som udgangspunkt ser
    // danske kunder 49/75/99 kr inkl. moms fra første sekund. Kunder i
    // andre lande retter selv landet ved køb, og totalen tilpasser sig.
    let customerId: string | undefined;
    if (user.email) {
      const existing = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
      customerId = existing.data[0]?.id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        address: { country: "DK" },
        // Stripes købs-kvittering sendes på kundens foretrukne sprog —
        // ellers kontoens standard. Sproget er allerede valideret ovenfor.
        preferred_locales: [locale],
        metadata: { doccys_user_id: user.id },
      });
      customerId = customer.id;
    }

    session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "auto",
      customer: customerId,
      // moms beregnes ud fra kundens faktureringsland — pålideligere
      // end IP-geolokalisering (og kræves for korrekt EU-moms)
      billing_address_collection: "required",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "dkk",
            // DKK → øre (afrundet: komma-priser som 39,20 giver ikke
            // heltals-øre i flydende komma)
            unit_amount: Math.round(pack.priceDkkExcl * 100),
            product_data: {
              name: `${pack.minutes} minutter — Doccys`,
            },
            // moms beregnes pr. land af Stripe Tax oveni prisen
            tax_behavior: "exclusive",
          },
        },
      ],
      automatic_tax: { enabled: true },
      success_url: `${origin}/${locale}/profile?koeb=ok`,
      cancel_url: `${origin}/${locale}/profile`,
    });
  } catch (err) {
    console.error("Stripe-checkout fejlede:", err);
    return NextResponse.json(
      { error: "Betalingen kunne ikke startes" },
      { status: 500 },
    );
  }

  const { error } = await supabase.from("credit_purchases").insert({
    user_id: user.id,
    pack_id: pack.id,
    minutes: pack.minutes,
    price_dkk_excl: pack.priceDkkExcl,
    stripe_session_id: session.id,
    referrer_user_id: referrerUserId,
  });
  if (error) {
    console.error("credit_purchases-insert fejlede:", error);
    return NextResponse.json(
      { error: "Købet kunne ikke registreres" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url }, { status: 201 });
}