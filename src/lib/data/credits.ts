/**
 * Minut-saldo, henvisningskoder og creator-indtjening.
 *
 * catalog.ts-stil: async opslag mod Supabase, fejl logges med
 * console.warn og giver en tom fallback, Row → domæne-mapping her.
 * Saldoen er en sum over den append-only credit_ledger; selve
 * kreditering/forbrug sker kun server-side (webhook/RPC).
 */
import { createClient } from "@/lib/supabase/server";
import type {
  CreatorEarnings,
  CreatorFilmEarnings,
} from "@/lib/types";

/* ---------- Row → domæne-mapping ---------- */

type IndtjeningJson = {
  optjent_dkk?: number | string;
  udbetalt_dkk?: number | string;
  tilgaengelig_dkk?: number | string;
  sete_minutter?: number | string;
  film?: Array<{
    slug?: string;
    sete_minutter?: number | string;
    optjent_dkk?: number | string;
  }>;
};

function toFilmEarnings(film: NonNullable<IndtjeningJson["film"]>[number]): CreatorFilmEarnings {
  return {
    slug: film.slug ?? "",
    watchedMinutes: Number(film.sete_minutter ?? 0),
    earnedDkk: Number(film.optjent_dkk ?? 0),
  };
}

function toCreatorEarnings(json: IndtjeningJson | null | undefined): CreatorEarnings {
  return {
    earnedDkk: Number(json?.optjent_dkk ?? 0),
    paidDkk: Number(json?.udbetalt_dkk ?? 0),
    availableDkk: Number(json?.tilgaengelig_dkk ?? 0),
    validWatchedMinutes: Number(json?.sete_minutter ?? 0),
    films: (json?.film ?? []).map(toFilmEarnings),
  };
}

/* ---------- API ---------- */

/**
 * Den indloggede brugers minut-saldo i sekunder (negativ =
 * multi-tab-forbrug). Kaldes med den brugerens klient (server-
 * komponenten har cookien); RPC'en summerer auth.uid()'s egne
 * rækker. Returnerer 0 hvis funktionen ikke kan kaldes.
 */
export async function getBalanceSeconds(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("saldo_sekunder");
    if (error) throw error;
    return Number(data ?? 0);
  } catch (err) {
    console.warn("getBalanceSeconds fejlede:", err);
    return 0;
  }
}

/** Koderne består af 8 tegn [a-z0-9] — matcher DB-check-constraintet */
function generateReferralCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * Brugerens henvisningskode — oprettes lazy ved første besøg.
 * Returnerer null hvis koden hverken findes eller kan oprettes.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("user_referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.code) return existing.code;

    // op til 3 forsøg — koder er unikke, kollision er sjælden
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateReferralCode();
      const { error } = await supabase
        .from("user_referral_codes")
        .insert({ user_id: userId, code });
      if (!error) return code;
      // kode-tagget er optaget — prøv igen
    }

    // kollisionerne kan gemme en race: slå op en sidste gang
    const { data: retry } = await supabase
      .from("user_referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    return retry?.code ?? null;
  } catch (err) {
    console.warn("getOrCreateReferralCode fejlede:", err);
    return null;
  }
}

/**
 * Aggregatet fra creator_indtjening-RPC'en (security definer —
 * kun tal for en offentlig handle, ingen persondata).
 * Returnerer null hvis RPC'en ikke kan kaldes (fx før migration).
 */
export async function getCreatorEarnings(handle: string): Promise<CreatorEarnings | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creator_indtjening", {
      p_creator_handle: handle,
    });
    if (error) throw error;
    return toCreatorEarnings(data as IndtjeningJson);
  } catch (err) {
    console.warn("getCreatorEarnings fejlede:", err);
    return null;
  }
}