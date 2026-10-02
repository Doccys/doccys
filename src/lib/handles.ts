/**
 * Fælles regler for @ tags (handles) — deles af AuthForm (@ tag ved
 * signup), profilens claim-form og skaber-ansøgningen, så formatet
 * kun findes ét sted i kodebasen. Spejler DB'ens check-constraint på
 * creator_applications.handle og user_handles.handle:
 * ^[a-z0-9]+(-[a-z0-9]+)*$, 3-40 tegn.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 40;

/** Statiske ruter skygger for /creator/[handle] — disse tags er reserverede. */
export const RESERVED_HANDLES = ["apply", "studio"] as const;

/**
 * Normalisér rå input: trim, smid ledende "@-tegn (brugere skriver
 * ofte "@navn" — tegnet er pynt, ikke en del af tag'et) og tving
 * lowercase, så DB'ens check-constraint altid rammer.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/**
 * Rent syntaks-tjek uden DB-kald. null = gyldigt; "invalid" og
 * "reserved" er suffikser, der matches til i18n-nøgler hos kalderen
 * (auth.errors.handleInvalid/handleReserved, profile.handleInvalid …).
 */
export function validateHandleSyntax(
  handle: string,
): "invalid" | "reserved" | null {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH ||
    !HANDLE_PATTERN.test(handle)
  ) {
    return "invalid";
  }
  if ((RESERVED_HANDLES as readonly string[]).includes(handle)) {
    return "reserved";
  }
  return null;
}

/**
 * Browser-ledighedstjek mod de to offentligt læsbare tabeller
 * (creators + user_handles). Returnerer true = taget, false = ledigt,
 * null = ukendt (tabellen findes ikke endnu pre-migration, eller
 * netværksfejl — kalderen viser intet og lader serveren afgøre).
 *
 * Andre brugeres PENDING ansøgninger kan RLS ikke vise fra klienten —
 * unique-constrainten og signup-rutens service-tjek er backstop,
 * præcis som hidtil i CreatorApplicationForm.
 */
export async function probeHandleTakenClient(
  supabase: SupabaseClient<Database>,
  handle: string,
): Promise<boolean | null> {
  const [creatorHit, handleHit] = await Promise.all([
    supabase.from("creators").select("handle").eq("handle", handle).maybeSingle(),
    supabase.from("user_handles").select("handle").eq("handle", handle).maybeSingle(),
  ]);
  if (creatorHit.error || handleHit.error) return null;
  return Boolean(creatorHit.data ?? handleHit.data);
}