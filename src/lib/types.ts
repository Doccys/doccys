/* ============================================================
 * Doccys — kernetyper
 *
 * Filen er opdelt i to domæner:
 *   1. Kerne-domænet (film, skabere, brugere, kommentarer)
 *   2. View-validation / anti-fraud (ML-klar rådata + features)
 * ============================================================ */

/* ---------- 1. Kerne-domæne ---------- */

export interface Creator {
  id: string;
  handle: string; // URL-identifikator, f.eks. "nordlys-film"
  name: string;
  bio: string;
  foundedYear: number;
  country: string;
  /**
   * Kontoen der ejer profilen (null = redaktionel/seedet skaber).
   * Sættes af godkendelses-triggeren — en bruger kan kun uploade
   * film til sin EGEN skaber-profil.
   */
  ownerUserId: string | null;
}

/** Redaktionelle seertal — display-only, indtjeningen beregnes separat. */
export interface DocumentaryStats {
  totalViews: number;
  totalCompletions: number;
  validCompletions: number;
}

export type DocumentaryStatus = "draft" | "published";

export interface Documentary {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  year: number;
  durationSec: number;
  genres: string[];
  creatorHandle: string;
  /**
   * Sproget der TALES i filmen (ISO 639-1) — ikke appens sprog.
   * Undertekst-pipelinen skriver lyden af på dette sprog og bruger
   * resultatet som oversættelseskilde til alle platformssprog.
   */
  spokenLanguage: string;
  /** Tailwind-gradient-klasse brugt som plakat indtil rigtige assets findes */
  gradient: string;
  /** Uploadet plakat-billede (film-posters) — null = gradienten bruges */
  posterUrl: string | null;
  /** Placeholder-video indtil medie-server/CDN kobles på */
  videoUrl: string;
  /**
   * Kladde/offentlig: nye uploads oprettes altid som 'draft' og
   * vises først offentligt, når redaktionen godkender dem.
   */
  status: DocumentaryStatus;
  stats: DocumentaryStats;
  /**
   * "Så X % den færdig" fra film_faedighedsstats-RPC'en — null når
   * der er under 5 afsluttede afspilninger (intet statistisk grund-
   * lag) eller statistikken ikke kan hentes. REELLE sessioner, ikke
   * de seedede stats-kolonner.
   */
  finishRate: number | null;
  /** ISO-tidsstempel fra created_at — bruges af VideoObject-JSON-LD */
  createdAt: string;
}

/** Trailer-status pr. film — klient-sikker (studiet), jf. subtitles-advarslene */
export interface FilmTrailerStatus {
  startSec: number;
  lengthSec: number;
  trailerUrl: string | null;
  status: "processing" | "ready" | "failed";
  error: string | null;
}

export interface Comment {
  id: string;
  documentarySlug: string;
  authorName: string;
  /** Sættes server-side, når kommentaren kommer fra en logget-in bruger. */
  userId?: string | null;
  body: string;
  createdAt: number; // ms epoch
  /** Samlet antal likes — likes kræver en logget-ind konto. */
  likeCount: number;
  /** Har DENNE seer (logget ind) liket kommentaren? */
  likedByMe: boolean;
  /** Fremhævet af creatoren — ét fastgjort indlæg pr. film. */
  pinned: boolean;
}

export interface WatchHistoryEntry {
  documentarySlug: string;
  watchedAtMs: number;
  /** 0–1: hvor stor en del af filmen der er set */
  progressRatio: number;
  completed: boolean;
}

/**
 * Ét punkt i forsiden "Fortsæt se"-rille: filmen + hvor langt
 * seeren kom. Positionen skrives af afregn_session ved afspilningens
 * afslutning — se 20260920_fortsaet_se.
 */
export interface ContinueWatchingItem {
  documentary: Documentary;
  progressRatio: number;
}

/**
 * Én kurateret samling (tematisk rille). Titel og beskrivelse er
 * oversat pr. sprog af redaktionen; preview er FØRSTE publicerede
 * films plakat/gradient — samlingen har ikke egen grafik. Kurate-
 * ring sker kun i dashboardet; app'en læser.
 */
export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** antal PUBLICEREDE film i samlingen (kladder tæller aldrig) */
  filmCount: number;
  /** første publicerede films gradient — fallback hvis ingen film */
  previewGradient: string;
  /** første publicerede films plakat — null = kun gradienten */
  previewPosterUrl: string | null;
  /** første publicerede films slug (og-billede-fallback) — null hvis tom */
  previewFilmSlug: string | null;
}

/**
 * Ét opslag fra en creator til dens seere (opslagstavlen på
 * creatorsiden). Kun creatorens ejer-konto kan skrive — seere
 * læser. `pinned`-opslag vises øverst (ét pr. creator).
 */
export interface CreatorPost {
  id: string;
  creatorId: string;
  body: string;
  pinned: boolean;
  createdAt: number; // ms epoch
  /** > createdAt, hvis opslaget er redigeret (DB-trigger) */
  updatedAt: number; // ms epoch
}

export type CreatorApplicationStatus = "pending" | "approved" | "rejected";

/** Pipeline-status pr. (film, sprog) i film_subtitles. */
export type FilmSubtitleStatus = "processing" | "ready" | "failed";

/**
 * Ét undertekstspor til afspilleren. Kun rækker med status 'ready'
 * bliver til tracks — processing/failed nårer aldrig ud til seerne.
 */
export interface FilmSubtitleTrack {
  locale: string;
  vttUrl: string;
  /** Seererens foretrukne sprog vælges som default i CC-menuen. */
  isDefault: boolean;
}

/**
 * Én skaber-ansøgning, bundet til kontoen (én pr. konto — unikt i DB).
 * Status kan kun ændres af redaktionen i Supabase-dashboardet;
 * en afvist ansøgning kan rettes og genafsendes (status → 'pending').
 */
export interface CreatorApplication {
  id: string;
  userId: string;
  name: string;
  handle: string;
  bio: string;
  foundedYear: number;
  country: string;
  motivation: string;
  status: CreatorApplicationStatus;
  createdAt: number; // ms epoch
  decidedAt: number | null; // ms epoch; null mens den afventer
}

/** Aggregeret skaberstatistik — redaktionelle tal, display-only. */
export interface CreatorStats {
  totalViews: number;
  totalCompletions: number;
  validCompletions: number;
  avgCompletionRate: number;
}

/**
 * Creator-økonomi fra creator_indtjening-RPC'en: 2 kr pr. 100
 * gyldigt sete minutter, udbetalt manuelt i dashboardet ved
 * tilgængelig saldo ≥ 150 kr.
 */
export interface CreatorFilmEarnings {
  slug: string;
  watchedMinutes: number;
  earnedDkk: number;
}

export interface CreatorEarnings {
  earnedDkk: number;
  paidDkk: number;
  availableDkk: number;
  validWatchedMinutes: number;
  films: CreatorFilmEarnings[];
}

/* ---------- 2. View-validation / anti-fraud ---------- */

/**
 * Rå hændelsestyper fra afspilleren. Alle logges uændret server-side,
 * så en fremtidig model kan trænes på den komplette adfærd.
 */
export type PlaybackEventType =
  | "session_start"
  | "play"
  | "pause"
  | "seek"
  | "heartbeat" // fast interval-hjerteslag mens filmen afspilles
  | "complete"
  | "session_end"
  | "error";

/** Enheds- og klientmetadata, indsamlet ved sessionens start. */
export interface DeviceMetadata {
  userAgent: string;
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  timezone?: string;
  language?: string;
  hardwareConcurrency?: number;
  touchPoints?: number;
}

/**
 * EN rå afspilningshændelse. `raw` opbevarer alle ekstra felter fra
 * klienten ustruktureret — intet kasseres, alt er ML-ready.
 */
export interface PlaybackEvent {
  type: PlaybackEventType;
  clientTimestamp: number; // ms epoch (klientens ur — beholdes uændret)
  videoTimeSec: number; // position i filmen da hændelsen skete
  playbackRate?: number;
  seekFromSec?: number;
  seekToSec?: number;
  raw?: Record<string, unknown>;
}

export type SessionStatus = "active" | "completed" | "abandoned";

/**
 * Én samlet afspilningssession. `events` er den append-only rålog,
 * som både heuristikker og fremtidige modeller læser fra.
 */
export interface ViewSession {
  id: string;
  documentarySlug: string;
  userId: string | null;
  startedAt: number; // ms epoch (serverur)
  endedAt: number | null;
  status: SessionStatus;
  device: DeviceMetadata;
  events: PlaybackEvent[];
  verdict: SessionVerdict | null;
}

export type ViewVerdict = "valid" | "suspicious" | "invalid";

/**
 * ML-klar feature-vektor for én session.
 * Alle felter er numeriske og kan sendes direkte til en model
 * (anomaly detection / klassifikation) uden yderligere forarbejde.
 */
export interface ViewFeatures {
  totalEvents: number;
  sessionDurationSec: number;
  estimatedWatchedSec: number;
  watchedRatio: number; // estimeret set tid / filmens længde
  uniqueWatchedRatio: number; // dækkede 10-sek-spande / filmens længde
  pauseCount: number;
  pausesPerHour: number;
  seekCount: number;
  seeksPerHour: number;
  forwardSeekRatio: number;
  avgSeekDistanceSec: number;
  maxSeekDistanceSec: number;
  heartbeatCount: number;
  heartbeatJitterSec: number; // std.afv. på hjerteslagsintervaller (bots ≈ 0)
  identicalIntervalRatio: number; // andel identiske intervaller (scripted playback ≈ 1)
  eventsPerMinute: number;
  playbackRateChanges: number;
  /** 1 hvis påstået set tid overstiger vægurstiden — umuligt uden manipulation */
  timelineAnomaly: number;
  /** 0–1: samlet mistanke-score ud fra enhedsmetadata */
  deviceSuspicionScore: number;
}

export type SignalSeverity = "low" | "medium" | "high";

/** En enkelt, menneskelig læsbar mistanke i sessionen. */
export interface FraudSignal {
  code: string;
  description: string;
  severity: SignalSeverity;
}

/** Heuristik-domæne: validering af én session og resultat heraf. */
export interface SessionVerdict {
  verdict: ViewVerdict;
  trustScore: number; // 0–100
  signals: FraudSignal[];
  features: ViewFeatures;
  decidedAt: number;
  /** Angiver hvilken model der traf beslutningen ("heuristics-v1" indtil ML trænes) */
  modelVersion: string;
}