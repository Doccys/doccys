/**
 * Stripe-klient — lazy singleton, server-side kun.
 *
 * STRIPE_SECRET_KEY hentes fra .env.local (Stripe-dashboardet →
 * Developers → API keys, test-tilstand). apiVersion er fastlåst,
 * så en SDK-opgradering ikke ændrer payload-formater i lynløbet.
 */
import Stripe from "stripe";

let cached: Stripe | null = null;

/** Stripe-klient. Fejler tydeligt hvis nøglen mangler. */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY mangler i .env.local — hentes i Stripe-dashboardet under Developers → API keys.",
    );
  }

  cached = new Stripe(key);
  return cached;
}