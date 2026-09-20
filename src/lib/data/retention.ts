/**
 * Retention-aggregatet fra film_retention-RPC'en (security
 * definer, ejer-privat: kun creatorens ejer-konto kan kalde den —
 * anon er revet af, andre brugere får 42501, seedede skabere har
 * ingen ejer). credits.ts-stil: async opslag, fejl logges med
 * console.warn og giver null, så studiet viser grafen kun når
 * der er data (fx før migrationen).
 */
import { createClient } from "@/lib/supabase/server";
import type { FilmRetention } from "@/lib/types";

/**
 * Minimum antal afsluttede afspilninger før grafen tegnes — samme
 * tærskel som færdigheds-badget (catalog.ts): ét konsistent
 * "statistisk grundlag"-begreb, så en enkelt seer aldrig bliver
 * en kurve.
 */
export const RETENTION_MIN_SESSIONS = 5;

type RetentionJson = {
  afsluttede?: number | string;
  naaede?: Array<number | string>;
};

/**
 * Retention pr. decil for ÉN film. Kaldes kun fra studiet, hvor
 * ejerskabet allerede er verificeret server-side. Null = RPC'en
 * fejlede (ikke-ejer, film uden ejende skaber, eller migrationen
 * er ikke kørt endnu).
 */
export async function getFilmRetention(
  slug: string,
): Promise<FilmRetention | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("film_retention", {
      p_slug: slug,
    });
    if (error) throw error;
    const json = data as RetentionJson | null;
    if (!json) return null;
    return {
      sessions: Number(json.afsluttede ?? 0),
      deciles: (json.naaede ?? []).map((v) => Number(v)),
    };
  } catch (err) {
    console.warn("getFilmRetention fejlede:", err);
    return null;
  }
}