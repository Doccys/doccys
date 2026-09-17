/**
 * Service-role-klient — omgår RLS, bruges KUN server-side.
 *
 * Importeres udelukkende af Stripe-webhook-ruten, som er den eneste
 * del af appen der skal skrive uden om brugerens RLS-sikkerhed
 * (indfri_koeb + markering af udløbne køb). Nøglen må ALDRIG eksponeres
 * som NEXT_PUBLIC_* — den giver fuld adgang til databasen.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let cached: SupabaseClient<Database> | null = null;

/** Service-role-klient til server-brug. Fejler tydeligt hvis nøglen mangler. */
export function createServiceClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mangler i .env.local — hentes i Supabase-dashboardet under Settings → API.",
    );
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}