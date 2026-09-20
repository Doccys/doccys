import { createClient } from "@/lib/supabase/server";
import { getCreatorByHandle } from "@/lib/data/catalog";

/** Én skabers andel af seerens minutregnskab. */
export interface SupportEntry {
  creatorHandle: string;
  /** null hvis skaber-profilen er væk — regnskabet består */
  creatorName: string | null;
  filmCount: number;
  watchedSeconds: number;
  amountDkk: number;
}

/** Seerens minutregnskab — "Din støtte" i profilen. */
export interface SupportLedger {
  totalSeconds: number;
  totalAmountDkk: number;
  /** pr. skaber, dybeste beløb først */
  creators: SupportEntry[];
}

/**
 * Seerens minutregnskab: de VALIDEREDE afspilninger (status <> 'active'
 * og verdict.verdict = 'valid') summeret pr. skaber og omregnet til
 * kroner med filmens payout_rate_dkk — samme formel som
 * creator_indtjening-RPC'ens (sekunder × sats / 60 / 100), så seerens
 * regnskab og skaberens indtjening altid stemmer overens.
 *
 * Historisk sete film tæller med, også hvis de senere er afpubliceret
 * — pengene blev brugt, regnskabet står ved dem. Returnerer null ved
 * fejl: sektionen udelades, profilen crasher ikke (pynt, ikke en
 * fejlside — samme graceful-konvention som resten af data-laget).
 */
export async function getSupportLedger(
  userId: string,
): Promise<SupportLedger | null> {
  try {
    const supabase = await createClient();
    // RLS garanterer allerede, at kun egne rækker kan læses —
    // user_id-filtret sættes alligevel eksplicit (samme dobbeltforsvar
    // som status-filtret i catalog.ts).
    const { data: sessions, error } = await supabase
      .from("view_sessions")
      .select("documentary_slug, watched_seconds, verdict")
      .eq("user_id", userId)
      .neq("status", "active");
    if (error) throw new Error(error.message);

    // Verdict er jsonb (hele SessionVerdict) — filtret køres i koden,
    // så jsonb-sti-syntaks aldrig kan sprænge forespørgslen. Kun
    // afregnede (valid) minutter tæller i regnskabet.
    const valid = (sessions ?? []).filter(
      (row) =>
        (row.verdict as { verdict?: string } | null)?.verdict === "valid" &&
        row.watched_seconds > 0,
    );
    if (valid.length === 0) {
      return { totalSeconds: 0, totalAmountDkk: 0, creators: [] };
    }

    // Sekunder pr. film først — satsen hentes ét opslag for alle slugene
    const secondsBySlug = new Map<string, number>();
    for (const row of valid) {
      secondsBySlug.set(
        row.documentary_slug,
        (secondsBySlug.get(row.documentary_slug) ?? 0) + row.watched_seconds,
      );
    }

    const { data: filmRows, error: filmError } = await supabase
      .from("documentaries")
      .select("slug, creator_handle, payout_rate_dkk")
      .in("slug", [...secondsBySlug.keys()]);
    if (filmError) throw new Error(filmError.message);

    const filmBySlug = new Map(
      (filmRows ?? []).map((row) => [row.slug, row] as const),
    );

    // Aggregér pr. skaber; ukendt slug (slettet film) springes over
    const byCreator = new Map<string, SupportEntry>();
    let totalSeconds = 0;
    let totalAmountDkk = 0;
    for (const [slug, seconds] of secondsBySlug) {
      const film = filmBySlug.get(slug);
      if (!film) {
        console.warn(`getSupportLedger: ukendt film-slug ${slug}`);
        continue;
      }
      const amountDkk = (seconds * Number(film.payout_rate_dkk)) / 60 / 100;
      const entry = byCreator.get(film.creator_handle);
      if (entry) {
        entry.filmCount += 1;
        entry.watchedSeconds += seconds;
        entry.amountDkk += amountDkk;
      } else {
        byCreator.set(film.creator_handle, {
          creatorHandle: film.creator_handle,
          creatorName: null,
          filmCount: 1,
          watchedSeconds: seconds,
          amountDkk,
        });
      }
      totalSeconds += seconds;
      totalAmountDkk += amountDkk;
    }

    // Skaber-navne — ét opslag pr. handle; mangler profilen, vises
    // posten stadig med @handle (navnet er pynt, regnskabet er kernen)
    const creators = await Promise.all(
      [...byCreator.values()].map(async (entry) => {
        const creator = await getCreatorByHandle(entry.creatorHandle);
        return { ...entry, creatorName: creator?.name ?? null };
      }),
    );

    return {
      totalSeconds,
      totalAmountDkk,
      creators: creators.sort((a, b) => b.amountDkk - a.amountDkk),
    };
  } catch (err) {
    console.warn("getSupportLedger:", err);
    return null;
  }
}