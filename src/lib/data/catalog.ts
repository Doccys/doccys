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
  Collection,
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
    finishRate: null,
    stats: {
      totalViews: row.total_views,
      totalCompletions: row.total_completions,
      validCompletions: row.valid_completions,
    },
  };
}

/*
 * Færdigheds-badge: reelt view_sessions-aggregat fra
 * film_faedighedsstats-RPC'en (security definer — view_sessions er
 * ikke sommerbar under bruger-RLS). De seedede stats-kolonner må
 * ALDRIG bruges hertil. Ét kald pr. katalogside (p_slug = null →
 * alle publicerede film); tærsklen ≥ 5 afsluttede forhindrer
 * "1 seer = 100 %"-social proof. Pre-migration (RPC mangler)
 * fejler funktionen graceful: filmene returneres uden badges.
 */
const FAERDIG_MIN_AFSLUTTEDE = 5;

interface FaerdighedsRow {
  documentary_slug: string;
  /** bigint fra Postgres kan komme som string via PostgREST */
  afsluttede: string | number;
  faerdige: string | number;
}

async function mergeFinishRates(
  films: Documentary[],
  slug?: string,
): Promise<Documentary[]> {
  if (films.length === 0) return films;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("film_faedighedsstats", {
      p_slug: slug ?? null,
    });
    if (error) throw new Error(error.message);
    const bySlug = new Map(
      (data as unknown as FaerdighedsRow[]).map((row) => [
        row.documentary_slug,
        row,
      ]),
    );
    return films.map((film) => {
      const row = bySlug.get(film.slug);
      const afsluttede = row ? Number(row.afsluttede) : 0;
      if (!row || afsluttede < FAERDIG_MIN_AFSLUTTEDE) return film;
      return {
        ...film,
        finishRate: Math.round((Number(row.faerdige) * 100) / afsluttede),
      };
    });
  } catch (err) {
    // graceful: badges er pynt, aldrig en fejlside
    console.warn("mergeFinishRates:", err);
    return films;
  }
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
  return mergeFinishRates(
    (data ?? []).map((row) => toDocumentary(row, locale)),
  );
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
  return (await mergeFinishRates([toDocumentary(data, locale)], slug))[0];
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
  return mergeFinishRates(
    (data ?? []).map((row) => toDocumentary(row, locale)),
  );
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

/* ---------- Kuraterede samlinger ---------- */
/*
 * Samlinger er redaktionsdata (dashboard-only, offentlig læsning).
 * documentaries' RLS er select using (true) — kladder skjules HER
 * af status-filtret i koden, ikke af databasen, så en kladde
 * aldrig kan dukke op i en offentlig samling.
 */

/** indre join-type fra det indlejrede katalog-kald nedenfor */
interface CollectionJoinRow {
  id: string;
  slug: string;
  title: string;
  title_i18n: Record<string, string> | null;
  description: string;
  description_i18n: Record<string, string> | null;
  sort_order: number;
  collection_films: {
    sort_order: number;
    documentary_slug: string;
    documentaries: {
      slug: string;
      status: string;
      gradient: string;
      poster_url: string | null;
    } | null;
  }[] | null;
}

function toCollection(row: CollectionJoinRow, locale?: string): Collection {
  const films = (row.collection_films ?? [])
    .filter((f) => f.documentaries?.status === "published")
    .sort((a, b) => a.sort_order - b.sort_order);
  const first = films[0]?.documentaries ?? null;
  return {
    id: row.id,
    slug: row.slug,
    title: localizedText(row.title, row.title_i18n, locale),
    description: localizedText(row.description, row.description_i18n, locale),
    filmCount: films.length,
    previewGradient: first?.gradient ?? "from-[#232526] via-[#414345] to-[#6b6d70]",
    previewPosterUrl: first?.poster_url ?? null,
    previewFilmSlug: first?.slug ?? null,
  };
}

/** Alle samlinger i redaktionens rækkefølge — med filmantal og preview. */
export async function getCollections(locale?: string): Promise<Collection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, slug, title, title_i18n, description, description_i18n, sort_order, "
        + "collection_films(sort_order, documentary_slug, "
        + "documentaries(slug, status, gradient, poster_url))",
    )
    .order("sort_order");
  if (error) {
    console.warn("getCollections:", error.message);
    return [];
  }
  return (data as unknown as CollectionJoinRow[]).map((row) =>
    toCollection(row, locale),
  );
}

/**
 * Én samling + dens publicerede film i redaktionens rækkefølge.
 * Null = ukendt slug. Tom film-liste er gyldig (empty-tilstand på
 * temasiden) — f.eks. mens redaktionen bygger samlingen op.
 */
export async function getCollectionBySlug(
  slug: string,
  locale?: string,
): Promise<{ collection: Collection; films: Documentary[] } | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("collections")
    .select(
      "id, slug, title, title_i18n, description, description_i18n, sort_order, "
        + "collection_films(sort_order, documentary_slug, "
        + "documentaries(slug, status, gradient, poster_url))",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error || !row) {
    if (error) console.warn("getCollectionBySlug:", error.message);
    return null;
  }
  const joinRow = row as unknown as CollectionJoinRow;
  const collection = toCollection(joinRow, locale);
  // fulde Documentary-objekter hentes som i getSavedFilms: slugs
  // først (redaktionens rækkefølge), derefter filmene — og tilbage
  // i samlingens orden
  const slugs = (joinRow.collection_films ?? []).map(
    (f) => f.documentary_slug,
  );
  if (slugs.length === 0) return { collection, films: [] };
  const { data: films, error: filmsError } = await supabase
    .from("documentaries")
    .select("*")
    .eq("status", "published")
    .in("slug", slugs);
  if (filmsError || !films) {
    if (filmsError) console.warn("getCollectionBySlug:", filmsError.message);
    return { collection, films: [] };
  }
  const bySlug = new Map(
    films.map((f) => [f.slug, toDocumentary(f, locale)]),
  );
  const ordered = slugs
    .map((s) => bySlug.get(s))
    .filter((d): d is Documentary => d !== undefined);
  const collectionFilms = await mergeFinishRates(ordered);
  return {
    collection: { ...collection, filmCount: collectionFilms.length },
    films: collectionFilms,
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
  return mergeFinishRates(
    slugs
      .map((slug) => bySlug.get(slug))
      .filter((d): d is Documentary => d !== undefined),
  );
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