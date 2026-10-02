import { createClient } from "@/lib/supabase/server";
import {
  GENRE_TITEL_MIN_MINUTTER,
  SEER_TRAE,
  type ViewerStatus,
} from "@/lib/viewerStatus";

/**
 * Seer-status: brugerens samlede sete minutter + mest sete genre,
 * aggregeret i JS over egne view_sessions-rækker — samme mønster som
 * getSupportLedger (RLS dækker allerede egen-læsning, documentaries er
 * offentligt læsbar, og en brugers afregnede sessioner er en lille
 * mængde — ingen RPC/migration er nødvendig).
 *
 * BEVIDST AFVIGELSE fra getSupportLedger: INTET verdict-filter. Her
 * tæller ALLE afregnede minutter, for afregn_session trækker forbruget
 * fra credit_ledger uanset anti-fraud-verdict — sete minutter ER
 * forbrugte minutter, og det er forbruget denne sektion belønner.
 * Støtte-regnskabet filtrerer derimod kun på valide minutter, som er
 * udbetalingsbeviset over for skaberen. Konsekvens: seer-status-
 * minutter kan være større end "Din støtte"-minutter — forventet.
 */
export async function getViewerStatus(
  userId: string,
): Promise<ViewerStatus | null> {
  try {
    const supabase = await createClient();
    // RLS garanterer allerede, at kun egne rækker kan læses —
    // user_id-filtret sættes alligevel eksplicit (samme dobbeltforsvar
    // som getSupportLedger).
    const { data: sessions, error } = await supabase
      .from("view_sessions")
      .select("documentary_slug, watched_seconds")
      .eq("user_id", userId)
      .neq("status", "active");
    if (error) throw new Error(error.message);

    // Anonyme sessioner har altid watched_seconds = 0; kun afregnede
    // sekunder (skrevet af afregn_session) tæller.
    const afregnede = (sessions ?? []).filter(
      (row) => row.watched_seconds > 0,
    );

    let totalSeconds = 0;
    // Sekunder pr. film — genrerne slås op ét kald for alle slugene
    const secondsBySlug = new Map<string, number>();
    for (const row of afregnede) {
      totalSeconds += row.watched_seconds;
      secondsBySlug.set(
        row.documentary_slug,
        (secondsBySlug.get(row.documentary_slug) ?? 0) + row.watched_seconds,
      );
    }

    // Tom slug-liste vogtes FØR .in()-kaldet — et tomt array til PostgREST
    // er en kantcase, der ikke skal røres.
    if (secondsBySlug.size === 0) {
      return { totalMinutes: 0, tierIndex: 0, genre: null };
    }

    const { data: filmRows, error: filmError } = await supabase
      .from("documentaries")
      .select("slug, genres")
      .in("slug", [...secondsBySlug.keys()]);
    if (filmError) throw new Error(filmError.message);
    const genresBySlug = new Map(
      (filmRows ?? []).map((row) => [row.slug, row.genres] as const),
    );

    // Genre-sum: filmens sekunder tæller FULDT i alle dens genrer
    // (1–5 pr. film) — genre-summe kan derfor overstige totalen.
    // Ukendt slug (slettet/afpubliceret film) springes over her, men
    // tæller stadig i totalen: minutterne blev brugt, regnskabet står.
    const secondsByGenre = new Map<string, number>();
    for (const [slug, seconds] of secondsBySlug) {
      const genres = genresBySlug.get(slug);
      if (!genres) {
        console.warn(`getViewerStatus: ukendt film-slug ${slug}`);
        continue;
      }
      for (const genre of genres) {
        secondsByGenre.set(
          genre,
          (secondsByGenre.get(genre) ?? 0) + seconds,
        );
      }
    }

    // Mest sete genre: minutter faldende, dansk nøgle stigende ved
    // lige store (deterministet — kortet flakker ikke mellem reloads)
    let genre: ViewerStatus["genre"] = null;
    const genreEntries = [...secondsByGenre.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        a[0].localeCompare(b[0], "da"),
    );
    const top = genreEntries[0]; // undefined hvis alle slugge var ukendte
    if (top && top[1] / 60 >= GENRE_TITEL_MIN_MINUTTER) {
      genre = { genre: top[0], minutes: Math.floor(top[1] / 60) };
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    // tierIndex gemmes på statussen via SEER_TRAE (samme tabel som
    // kortet bruger) — konsumenten slipper for at duplikere tærskler.
    const naaet = SEER_TRAE.filter(
      (trin) => totalMinutes >= trin.minMinutter,
    ).length;

    return { totalMinutes, tierIndex: naaet, genre };
  } catch (err) {
    // Pynt, ikke en fejlside: profilen lever videre uden statuskortet
    console.warn("getViewerStatus:", err);
    return null;
  }
}