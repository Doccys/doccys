/**
 * Data-lag for film-trailere (film_trailers) — én række pr. film.
 *
 * - getFilmTrailerUrl: klar-trailer-URL (kun 'ready') → paywall-
 *   smagsprøve, /api/embed-indlejring og og:video. Gæster må se den —
 *   traileren ER filmens reklame; filmen selv forbliver bag paywall.
 * - getFilmTrailerStatus: hele rækken til studiet (knapper + badges).
 *
 * Samme skelnen som subtitles.ts: status-filtret ligger i QUERY'en,
 * ikke i select-policynet — creatoren skal kunne se egen processing/
 * failed i studiet, og select er offentlig.
 */
import { createClient } from "@/lib/supabase/server";
import type { FilmTrailerRow } from "@/lib/supabase/database.types";
import type { FilmTrailerStatus } from "@/lib/types";

export type { FilmTrailerStatus };

/** Klar-trailerens public URL — null hvis der ikke er en færdig trailer. */
export async function getFilmTrailerUrl(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("film_trailers")
    .select("trailer_url")
    .eq("documentary_slug", slug)
    .eq("status", "ready")
    .maybeSingle();
  if (error) {
    // Tabel findes ikke = migrationen er endnu ikke kørt — stil: ingen
    // trailer (app'en fejler aldrig på den nye feature).
    console.warn("getFilmTrailerUrl:", error.message);
    return null;
  }
  return data?.trailer_url ?? null;
}

/** Hele statusrækken til studiet — null = aldrig genereret. */
export async function getFilmTrailerStatus(
  slug: string,
): Promise<FilmTrailerStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("film_trailers")
    .select("*")
    .eq("documentary_slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("getFilmTrailerStatus:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as FilmTrailerRow;
  const status = (["processing", "ready", "failed"] as const).includes(
    row.status as FilmTrailerStatus["status"],
  )
    ? (row.status as FilmTrailerStatus["status"])
    : "processing";
  return {
    startSec: row.start_sec,
    lengthSec: row.length_sec,
    trailerUrl: row.trailer_url,
    status,
    error: row.error,
  };
}