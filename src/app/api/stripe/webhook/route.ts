import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook — indfrier gennemførte køb.
 *
 * Tillidsmodel: ruten er den ENESTE del af appen der bruger
 * service-role-nøglen, og den kalder aldrig andet end de to
 * indfri-/marker-operationer. Signaturverifikationen er porten —
 * uden STRIPE_WEBHOOK_SECRET afvises alt. Selve forretningen
 * (kreditér pakke + evt. affiliate, markér paid) sker atomisk i
 * security definer-RPC'en indfri_koeb, der er idempotent ved
 * Stripe-replay (status-guard + unikke source_keys), så ruten
 * altid kan svare 200 og Stripe aldrig spammer samme køb dobbelt.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json(
      { error: "Ugyldig webhook-signatur" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json(
      { error: "Ugyldig webhook-signatur" },
      { status: 400 },
    );
  }

  try {
    const service = createServiceClient();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      // RPC'en håndterer ukendt session-id + replay → altid safe
      await service.rpc("indfri_koeb", {
        p_stripe_session_id: session.id,
      });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await service
        .from("credit_purchases")
        .update({ status: "failed" })
        .eq("stripe_session_id", session.id)
        .eq("status", "pending");
    }
    // andre events: accepteret uden handling — 200 så Stripe ikke gensender
  } catch (err) {
    console.error("Webhook-håndtering fejlede:", err);
    // 500 → Stripe prøver igen med backoff; indfri_koeb er idempotent,
    // så en replay efter delvis succes er harmløs
    return NextResponse.json({ error: "Webhook fejlede" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}