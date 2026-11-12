import { createClient } from "@/lib/supabase/server";

/**
 * Seerens ÅRBOG — Pioner-gaven (brugerens beslutning 12/11): avanceret
 * personlig seer-statistik på profilen, vises først når Pioner-trinnet
 * er nået (1.000 minutter — profilen styrer tærsklen via getViewerStatus'
 * tierIndex; tierIndex >= 3 = Pioner, da tier0 tæller med fra start).
 *
 * Ren JS-aggregation — ingen migration/RPC: præcis getViewerStatus-
 * mønsteret (RLS garanterer egen-læsning, documentaries er offentligt
 * læsbar). SAMME bevidste afvigelse fra getSupportLedger: INTET
 * verdict-filter — afregn_session trækker forbruget uanset dom, så
 * sete minutter ER forbrugte minutter, og det er forbruget årbogen
 * regner med (årstalsbogen kan derfor omfatte ikke-valide minutter).
 *
 * NB: tærskler/genre-minutreglen bor IKKE her — årbogen antager, at
 * profilen allerede har beregnet tierIndex (én kilde: SEER_TRAE).
 */

/** Én måned i årbogen — nøglen er "YYYY-MM" (server-tid, UTC). */
export interface AarbogMaaned {
  key: string;
  minutes: number;
}

/** Seerens årbog — beregnet af getViewerAarbog. */
export interface ViewerAarbog {
  /** samlede minutter i de seneste 12 måneder */
  totalMinutes: number;
  /** 12 måneder ældst → nyest; tommer er udfyldt med 0 (flakker aldrig) */
  months: AarbogMaaned[];
  /** top-3 genrer (filmens sekunder tæller FULDT i alle dens genrer) */
  topGenres: { genre: string; minutes: number }[];
  /** top-3 skabere (dansk handle) i samme deterministiske orden som genre-summen */
  topCreators: { handle: string; minutes: number }[];
}

/** Seneste 12 måneder (inkl. pågående måned), ældst først. */
function sidsteTolvMaanednøgler(nu: Date): string[] {
  const noegler: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getUTCFullYear(), nu.getUTCMonth() - i, 1);
    noegler.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return noegler;
}

export async function getViewerAarbog(userId: string): Promise<ViewerAarbog | null> {
  try {
    const supabase = await createClient();
    // RLS garanterer allerede, at kun egne rækker kan læses —
    // user_id-filtret sættes alligevel eksplicit (dobbeltforsvar, som
    // getViewerStatus/getSupportLedger).
    const { data: sessions, error } = await supabase
      .from("view_sessions")
      .select("documentary_slug, watched_seconds, started_at, ended_at")
      .eq("user_id", userId)
      .neq("status", "active");
    if (error) throw new Error(error.message);

    const afregnede = (sessions ?? []).filter(
      (row) => row.watched_seconds > 0,
    );

    // Måned-bøtter: afregningen sker ved validate (sessionen lukkes) —
    // måneden tæller i den måned, sekundet BRUGNES, ikke den, sessionen
    // begyndte: ended_at ?? started_at (afregningen er sidste hændelse).
    const noegler = sidsteTolvMaanednøgler(new Date());
    const secondsByMonth = new Map<string, number>(
      noegler.map((key) => [key, 0]),
    );
    const secondsBySlug = new Map<string, number>();
    let totalSeconds = 0;
    for (const row of afregnede) {
      const ts = row.ended_at ?? row.started_at;
      const d = new Date(ts);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      secondsByMonth.set(key, (secondsByMonth.get(key) ?? 0) + row.watched_seconds);
      secondsBySlug.set(
        row.documentary_slug,
        (secondsBySlug.get(row.documentary_slug) ?? 0) + row.watched_seconds,
      );
      totalSeconds += row.watched_seconds;
    }

    const months: AarbogMaaned[] = noegler.map((key) => ({
      key,
      minutes: Math.floor((secondsByMonth.get(key) ?? 0) / 60),
    }));

    // Tom slug-liste vogtes FØR .in()-kaldet (PostgREST-kant-case, som
    // getViewerStatus). Ukendt slug (slettet/afpubliceret film) kan ikke
    // gives genre/skaber — minutterne tæller i totalen alligevel.
    if (secondsBySlug.size === 0) {
      return { totalMinutes: 0, months, topGenres: [], topCreators: [] };
    }

    const { data: filmRows, error: filmError } = await supabase
      .from("documentaries")
      .select("slug, genres, creator_handle")
      .in("slug", [...secondsBySlug.keys()]);
    if (filmError) throw new Error(filmError.message);
    const filmBySlug = new Map(
      (filmRows ?? []).map((row) => [row.slug, row] as const),
    );

    // Genre- og skaber-summer: samme regnereglor som getViewerStatus —
    // genrenummering er ikke begrænset, og skaberen er filmens
    // creator_handle (den danske handle, som kanonisk identifikator).
    const secondsByGenre = new Map<string, number>();
    const secondsByHandle = new Map<string, number>();
    for (const [slug, seconds] of secondsBySlug) {
      const film = filmBySlug.get(slug);
      if (!film) {
        console.warn(`getViewerAarbog: ukendt film-slug ${slug}`);
        continue;
      }
      for (const genre of film.genres) {
        secondsByGenre.set(genre, (secondsByGenre.get(genre) ?? 0) + seconds);
      }
      secondsByHandle.set(
        film.creator_handle,
        (secondsByHandle.get(film.creator_handle) ?? 0) + seconds,
      );
    }

    // Deterministisk orden: minutter faldende, dansk nøgle stigende ved
    // lige store (getViewerStatus-mønsteret — kortet flakker ikke mellem
    // reloads).
    const sortSekunder = (
      map: Map<string, number>,
      count: number,
    ): { key: string; minutes: number }[] =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "da"))
        .slice(0, count)
        .map(([key, seconds]) => ({ key, minutes: Math.floor(seconds / 60) }));

    return {
      totalMinutes: Math.floor(totalSeconds / 60),
      months,
      topGenres: sortSekunder(secondsByGenre, 3).map((x) => ({
        genre: x.key,
        minutes: x.minutes,
      })),
      topCreators: sortSekunder(secondsByHandle, 3).map((x) => ({
        handle: x.key,
        minutes: x.minutes,
      })),
    };
  } catch (err) {
    // Pynt, ikke en fejlside: profilen lever videre uden årbogen
    console.warn("getViewerAarbog:", err);
    return null;
  }
}
