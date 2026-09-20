/**
 * Database-backend data-lag — afløser mockData 1:1.
 *
 * Alle opslagsfunktioner er async og læser fra Supabase
 * (katalog + skabere: offentlig læsning; historik + watchlist:
 * brugerens egne rækker via RLS). Row → domæne-typer mappes her,
 * så resten af appen mærker ikke forskellen på mock og database.
 *
 * Biografier og synopser findes på flere sprog: den danske kolonne
 * er canonical, *_i18n-kolonnerne indeholder oversættelser pr.
 * sprog. Tekst-returnerende funktioner tager et valgfrit `locale`;
 * uden det (fx i API-ruter) eller hvis oversættelsen mangler, falder
 * indholdet tilbage til dansk. Titler og navne er altid original-
 * sproget — de er en del af værket.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  CreatorApplicationRow,
  CreatorRow,
  DocumentaryRow,
  SavedFilmRow,
  WatchHistoryRow,
} from "@/lib/supabase/database.types";
import type {
  ContinueWatchingItem,
  Creator,
  CreatorApplication,
  CreatorStats,
  Documentary,
  WatchHistoryEntry,
} from "@/lib/types";

/* ---------- Row → domæne-mapping ---------- */

/** Vælger oversættelsen for `locale` — ellers dansk canonical tekst. */
function localizedText(da: string, i18n: unknown, locale?: string): string {
  if (!locale || !i18n) return da;
  const map = i18n as Record<string, unknown>;
  const text = map[locale];
  return typeof text === "string" ? text : da;
}

function toCreator(row: CreatorRow, locale?: string): Creator {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: localizedText(row.bio, row.bio_i18n, locale),
    foundedYear: row.founded_year,
    country: row.country,
    ownerUserId: row.owner_user_id,
  };
}

function toDocumentary(row: DocumentaryRow, locale?: string): Documentary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: localizedText(row.synopsis, row.synopsis_i18n, locale),
    year: row.year,
    durationSec: row.duration_sec,
    genres: row.genres,
    creatorHandle: row.creator_handle,
    spokenLanguage: row.spoken_language,
    gradient: row.gradient,
    posterUrl: row.poster_url,
    videoUrl: row.video_url,
    status: row.status as Documentary["status"],
    createdAt: row.created_at,
    stats: {
      totalViews: row.total_views,
      totalCompletions: row.total_completions,
      validCompletions: row.valid_completions,
    },
  };
}

function toCreatorApplication(row: CreatorApplicationRow): CreatorApplication {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    foundedYear: row.founded_year,
    country: row.country,
    motivation: row.motivation,
    status: row.status as CreatorApplication["status"],
    createdAt: Date.parse(row.created_at),
    decidedAt: row.decided_at ? Date.parse(row.decided_at) : null,
  };
}

/* ---------- Katalog & skabere ---------- */
/*
 * Offentlige kataloglæsninger viser KUN publicerede film — kladder
 * er eksklusivt for deres skaber (studiet) og redaktionen. Filtret
 * er forsvar oveni RLS: det sikrer samme semantik uanset hvem der
 * kalder, og holder watch-siden og historikken kladde-fri.
 */

export async function getDocumentaries(
  locale?: string,
): Promise<Documentary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentaries")
    .select("*")
    .eq("status", "published")
    .order("sort_order");
  if (error) {
    console.warn("getDocumentaries:", error.message);
    return [];
  }
  return (data ?? []).map((row) => toDocumentary(row, locale));
}

export async function getDocumentaryBySlug(
  slug: string,
  locale?: string,
): Promise<Documentary | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentaries")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("getDocumentaryBySlug:", error.message);
    return undefined;
  }
  return toDocumentary(data, locale);
}

export async function getCreators(locale?: string): Promise<Creator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .order("name");
  if (error) {
    console.warn("getCreators:", error.message);
    return [];
  }
  return (data ?? []).map((row) => toCreator(row, locale));
}

export async function getCreatorByHandle(
  handle: string,
  locale?: string,
): Promise<Creator | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("getCreatorByHandle:", error.message);
    return undefined;
  }
  return toCreator(data, locale);
}

export async function getFilmsByCreator(
  handle: string,
  locale?: string,
): Promise<Documentary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentaries")
    .select("*")
    .eq("creator_handle", handle)
    .eq("status", "published")
    .order("sort_order");
  if (error) {
    console.warn("getFilmsByCreator:", error.message);
    return [];
  }
  return (data ?? []).map((row) => toDocumentary(row, locale));
}

/**
 * Alle film for én skaber — inklusiv kladder. KUN til studiet:
 * RLS viser allerede kun publicerede film til andre end ejeren,
 * men denne funktion er bevidst uden statusfilter, så ejeren ser
 * sine kladder med badge i studiet. Skal ikke bruges på offentlige
 * sider.
 */
export async function getCreatorFilmsIncludingDrafts(
  handle: string,
  locale?: string,
): Promise<Documentary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentaries")
    .select("*")
    .eq("creator_handle", handle)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("getCreatorFilmsIncludingDrafts:", error.message);
    return [];
  }
  return (data ?? []).map((row) => toDocumentary(row, locale));
}

/** Aggregeret skaberstatistik — redaktionelle tal, display-only. */
export async function getCreatorStats(handle: string): Promise<CreatorStats> {
  const films = await getFilmsByCreator(handle);
  const totalViews = films.reduce((sum, f) => sum + f.stats.totalViews, 0);
  const totalCompletions = films.reduce(
    (sum, f) => sum + f.stats.totalCompletions,
    0,
  );
  const validCompletions = films.reduce(
    (sum, f) => sum + f.stats.validCompletions,
    0,
  );
  return {
    totalViews,
    totalCompletions,
    validCompletions,
    avgCompletionRate: totalViews > 0 ? totalCompletions / totalViews : 0,
  };
}

/* ---------- Brugerdata (RLS: kun egne rækker) ---------- */

/**
 * Brugerens skaber-ansøgning (én pr. konto — unikt i DB).
 * Null = der er endnu ikke ansøgt. RLS sikrer, at brugeren kun
 * kan læse sin egen; redaktionen læser alle i dashboardet.
 */
export async function getMyApplication(
  userId: string,
): Promise<CreatorApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creator_applications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("getMyApplication:", error.message);
    return null;
  }
  return toCreatorApplication(data);
}

/**
 * Den skaber-profil, kontoen ejer — oprettes af godkendelses-
 * triggeren. Null = kontoen er ikke (endnu) godkendt skaber og
 * kan ikke uploade film.
 */
export async function getOwnedCreator(
  userId: string,
  locale?: string,
): Promise<Creator | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("getOwnedCreator:", error.message);
    return null;
  }
  return toCreator(data, locale);
}

export async function getWatchHistory(
  userId: string,
): Promise<WatchHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watch_history")
    .select("*")
    .eq("user_id", userId)
    .order("watched_at", { ascending: false });
  if (error) {
    console.warn("getWatchHistory:", error.message);
    return [];
  }
  return (data ?? []).map((row: WatchHistoryRow) => ({
    documentarySlug: row.documentary_slug,
    watchedAtMs: Date.parse(row.watched_at),
    progressRatio: Number(row.progress_ratio),
    completed: row.completed,
  }));
}

export async function getSavedFilms(
  userId: string,
  locale?: string,
): Promise<Documentary[]> {
  const supabase = await createClient();
  const { data: saved, error: savedError } = await supabase
    .from("saved_films")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (savedError || !saved || saved.length === 0) {
    if (savedError) console.warn("getSavedFilms:", savedError.message);
    return [];
  }
  const slugs = saved.map((row: SavedFilmRow) => row.documentary_slug);
  const { data: films, error: filmsError } = await supabase
    .from("documentaries")
    .select("*")
    .eq("status", "published")
    .in("slug", slugs);
  if (filmsError || !films) {
    if (filmsError) console.warn("getSavedFilms:", filmsError.message);
    return [];
  }
  // bevare rækkefølgen fra watchlisten (senest gemt først)
  const bySlug = new Map(
    films.map((row) => [row.slug, toDocumentary(row, locale)]),
  );
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((d): d is Documentary => d !== undefined);
}

/**
 * "Fortsæt se"-rillen til forsiden: uafsluttede film, hvor seeren
 * var kommet i gang (ratio ≥ 3 %) men ikke ( næsten ) færdig (< 95 %).
 * Positionen skrives af afregn_session ved afspilningens afslutning.
 * RLS sikrer, at kun egne rækker læses; kun publicerede film vises —
 * en film der er trukket tilbage eller stadig kladde kan ikke
 * genoptages fra forsiden.
 */
export async function getContinueWatching(
  userId: string,
  locale?: string,
  limit = 10,
): Promise<ContinueWatchingItem[]> {
  const supabase = await createClient();
  const { data: history, error } = await supabase
    .from("watch_history")
    .select("documentary_slug, progress_ratio")
    .eq("user_id", userId)
    .eq("completed", false)
    .gte("progress_ratio", 0.03)
    .lt("progress_ratio", 0.95)
    .order("watched_at", { ascending: false })
    .limit(limit);
  if (error || !history || history.length === 0) {
    if (error) console.warn("getContinueWatching:", error.message);
    return [];
  }
  // watch_history er unik pr. (user, film) — slugs er distinkte
  const slugs = history.map(
    (row: { documentary_slug: string }) => row.documentary_slug,
  );
  const { data: films, error: filmsError } = await supabase
    .from("documentaries")
    .select("*")
    .eq("status", "published")
    .in("slug", slugs);
  if (filmsError || !films) {
    if (filmsError) console.warn("getContinueWatching:", filmsError.message);
    return [];
  }
  const bySlug = new Map(
    films.map((row) => [row.slug, toDocumentary(row, locale)]),
  );
  return history
    .map(
      (row: { documentary_slug: string; progress_ratio: string | number }) => {
        const documentary = bySlug.get(row.documentary_slug);
        return documentary
          ? { documentary, progressRatio: Number(row.progress_ratio) }
          : null;
      },
    )
    .filter((i): i is ContinueWatchingItem => i !== null);
}

/**
 * Registrerer en gyldig, færdigset visning i brugerens historik.
 * Skrives af validate-API'en når anti-fraud har godkendt completion.
 * Upsert: en re-watch opdaterer blot rækken ( én pr. film ).
 */
export async function recordValidCompletion(
  userId: string,
  documentarySlug: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("watch_history")
    .upsert(
      {
        user_id: userId,
        documentary_slug: documentarySlug,
        progress_ratio: 1,
        completed: true,
        watched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,documentary_slug" },
    );
  if (error) console.warn("recordValidCompletion:", error.message);
}