/**
 * "Dine tal"-aggregatet fra creator_tal-RPC'en (security definer,
 * ejer-privat: kun creatorens ejer-konto kan kalde den — anon er
 * revet af, andre brugere får 42501, seed-profiler afvises).
 * retention.ts-stil: async opslag, fejl logges med console.warn og
 * giver null, så studiet viser sektionen kun når der er data
 * (fx før migrationen er kørt).
 *
 * Bemærk det bevidste skel, studiet også kommunikerer: adfærdstal
 * (afspilninger, seere) tæller ALLE sessioner, mens minutter og kr
 * KUN kommer fra loggede, gyldige sessioner — det er dem, der kan
 * afregnes, og derfor dem, satsen skal retfærdiggøres ud fra.
 */
import { createClient } from "@/lib/supabase/server";
import type { CreatorTal, CreatorTalDay, CreatorTalFilm, CreatorTalSeere } from "@/lib/types";

type TalJson = {
  ialt?: { minutter?: number | string; kr?: number | string };
  film?: Array<Record<string, unknown>>;
  daglig?: Array<Record<string, unknown>>;
  seere?: {
    sprog?: Array<{ navn?: string; antal?: number | string }>;
    enhed?: {
      mobil?: number | string;
      tablet?: number | string;
      computer?: number | string;
      ukendt?: number | string;
    };
  };
};

/**
 * Alle tal for creatorens film. Kaldes kun fra studiet, hvor
 * ejerskabet allerede er verificeret server-side (getOwnedCreator).
 * Null = RPC'en fejlede (ikke-ejer eller migrationen er ikke
 * kørt endnu) — studiet udelader da sektionen helt.
 */
export async function getCreatorTal(
  handle: string,
): Promise<CreatorTal | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creator_tal", {
      p_creator_handle: handle,
    });
    if (error) throw error;
    const json = data as TalJson | null;
    if (!json) return null;

    const films: CreatorTalFilm[] = (json.film ?? []).map((f) => ({
      slug: String(f.slug ?? ""),
      title: String(f.titel ?? ""),
      status: String(f.status ?? "draft"),
      rateDkk: Number(f.sats ?? 0),
      plays: Number(f.afspilninger ?? 0),
      uniqueViewers: Number(f.unikke_seere ?? 0),
      validMinutes: Number(f.gyldige_minutter ?? 0),
      earnedDkk: Number(f.optjent_dkk ?? 0),
      finishPct: Number(f.faerdigspct ?? 0),
      comments: Number(f.kommentarer ?? 0),
      likes: Number(f.likes ?? 0),
    }));

    const daily: CreatorTalDay[] = (json.daglig ?? []).map((d) => ({
      date: String(d.dato ?? ""),
      minutes: Number(d.minutter ?? 0),
      dkk: Number(d.kr ?? 0),
    }));

    const seere: CreatorTalSeere = {
      languages: (json.seere?.sprog ?? []).map((l) => ({
        name: String(l.navn ?? "—"),
        count: Number(l.antal ?? 0),
      })),
      devices: {
        mobile: Number(json.seere?.enhed?.mobil ?? 0),
        tablet: Number(json.seere?.enhed?.tablet ?? 0),
        desktop: Number(json.seere?.enhed?.computer ?? 0),
        unknown: Number(json.seere?.enhed?.ukendt ?? 0),
      },
    };

    return {
      totalMinutes: Number(json.ialt?.minutter ?? 0),
      totalDkk: Number(json.ialt?.kr ?? 0),
      films,
      daily,
      seere,
    };
  } catch (err) {
    console.warn("getCreatorTal fejlede:", err);
    return null;
  }
}