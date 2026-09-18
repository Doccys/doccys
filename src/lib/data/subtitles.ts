/**
 * Data-lag for film-undertekster (film_subtitles).
 *
 * To forskellige læsninger:
 * - getFilmSubtitles: kun 'ready'-rækker → tracks til afspilleren.
 *   Status-filtret ligger i QUERY'en (ikke i select-policynet), så
 *   creatoren stadig kan se egne processing/failed-rækker i studiet.
 * - getFilmSubtitleStatuses: alle rækker pr. film → status-badges
 *   i studiet. RLS sikrer i sig selv, at kun ejeren har skrivning;
 *   select er offentlig, men en fremmed ser aldrig andet end 'ready'
 *   i praksis — badgene renderes kun for ejeren.
 *
 * NB: LOCALE_LANGUAGE_NAMES ligger i i18n/languageNames.ts — det
 * modul må også bruges fra klient-komponenter (VideoPlayer), hvilket
 * denne fil ikke må (den trækker supabase-server-klienten ind).
 */
import { createClient } from "@/lib/supabase/server";
import type { FilmSubtitleRow } from "@/lib/supabase/database.types";
import type { FilmSubtitleStatus, FilmSubtitleTrack } from "@/lib/types";

/** Række → status-objekt til studio-badgene. */
export interface FilmSubtitleStatusEntry {
  locale: string;
  status: FilmSubtitleStatus;
  /** Fejlbesked når status = 'failed' (tooltip i studiet). */
  error: string | null;
  vttUrl: string | null;
}

function rowToTrack(row: FilmSubtitleRow): FilmSubtitleTrack | null {
  if (row.status !== "ready" || !row.vtt_url) return null;
  return {
    locale: row.locale,
    vttUrl: row.vtt_url,
    // default-sproget vælges af kaldet (seerens locale) — ikke her
    isDefault: false,
  };
}

/** Klar-undertekster til afspilleren (kun 'ready'), dansk først. */
export async function getFilmSubtitles(
  slug: string,
): Promise<FilmSubtitleTrack[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("film_subtitles")
    .select("*")
    .eq("documentary_slug", slug)
    .eq("status", "ready")
    .order("locale");
  if (error) {
    console.warn("getFilmSubtitles:", error.message);
    return [];
  }
  return (data ?? [])
    .map(rowToTrack)
    .filter((track): track is FilmSubtitleTrack => track !== null);
}

/** Alle statusrækker pr. film — til studio-badgene (dansk først). */
export async function getFilmSubtitleStatuses(
  slug: string,
): Promise<FilmSubtitleStatusEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("film_subtitles")
    .select("*")
    .eq("documentary_slug", slug)
    .order("locale");
  if (error) {
    console.warn("getFilmSubtitleStatuses:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    locale: row.locale,
    status: row.status as FilmSubtitleStatus,
    error: row.error,
    vttUrl: row.vtt_url,
  }));
}