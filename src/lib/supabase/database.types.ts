/**
 * Typede skemaer for Doccys' Supabase-tabeller.
 *
 * Spejler migrations-filerne i supabase/migrations/ 1:1. Når
 * skemaet ændres, kan filen regenereres med Supabase-CLI'et:
 *   npx supabase gen types --lang=typescript
 * (og tilpasses projektets navnerum), eller håndredigeres her.
 *
 * Bemærk: alle typer er `type`-aliasser (ikke `interface`) —
 * interfaces får ikke implicitte index-signaturer i TypeScript,
 * hvilket får supabase-js' GenericSchema-check til at kollapse,
 * så alle query-resultater types `never`.
 */

export type CreatorRow = {
  id: string;
  handle: string;
  name: string;
  /** dansk canonical tekst */
  bio: string;
  /** jsonb: { [locale]: text } — bio-oversættelser, dansk nøgle findes ikke */
  bio_i18n: unknown;
  founded_year: number;
  country: string;
  /** kontoen der ejer profilen; null = redaktionel/seedet skaber. Sættes af godkendelses-triggeren. */
  owner_user_id: string | null;
  created_at: string;
};

export type CreatorInsert = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  bio_i18n?: unknown;
  founded_year: number;
  country: string;
  /** sættes normalt af triggeren — ikke af klienter */
  owner_user_id?: string | null;
  created_at?: string;
};

export type CreatorUpdate = {
  id?: string;
  handle?: string;
  name?: string;
  bio?: string;
  founded_year?: number;
  country?: string;
  owner_user_id?: string | null;
};

export type DocumentaryRow = {
  id: string;
  slug: string;
  title: string;
  /** dansk canonical tekst */
  synopsis: string;
  /** jsonb: { [locale]: text } — synopsis-oversættelser, dansk nøgle findes ikke */
  synopsis_i18n: unknown;
  year: number;
  duration_sec: number;
  genres: string[];
  creator_handle: string;
  gradient: string;
  video_url: string;
  /** plakat-billede i film-posters — null = gradienten bruges */
  poster_url: string | null;
  total_views: number;
  total_completions: number;
  valid_completions: number;
  /** numeric returneres som string fra Postgres — mappes med Number() */
  payout_rate_dkk: string;
  sort_order: number;
  /** kladde/offentlig — nye uploads oprettes altid som 'draft' (RLS tvinger) */
  status: string;
  created_at: string;
};

export type DocumentaryInsert = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  synopsis_i18n?: unknown;
  year: number;
  duration_sec: number;
  genres: string[];
  creator_handle: string;
  gradient: string;
  video_url: string;
  /** plakat-billede i film-posters — null = gradienten bruges */
  poster_url?: string | null;
  total_views?: number;
  total_completions?: number;
  valid_completions?: number;
  payout_rate_dkk?: string | number;
  sort_order?: number;
  /** RLS tvinger 'draft' for skaber-oprettede rækker */
  status?: string;
  created_at?: string;
};

export type DocumentaryUpdate = {
  id?: string;
  slug?: string;
  title?: string;
  synopsis?: string;
  year?: number;
  duration_sec?: number;
  genres?: string[];
  creator_handle?: string;
  gradient?: string;
  video_url?: string;
  poster_url?: string | null;
  total_views?: number;
  total_completions?: number;
  valid_completions?: number;
  payout_rate_dkk?: string | number;
  sort_order?: number;
  /** RLS: skaberen kan kun opdatere rækker med status = 'draft', og kun til 'draft' */
  status?: string;
  created_at?: string;
};

export type WatchHistoryRow = {
  id: string;
  user_id: string;
  documentary_slug: string;
  watched_at: string;
  /** numeric → string fra Postgres */
  progress_ratio: string;
  completed: boolean;
};

export type WatchHistoryInsert = {
  id?: string;
  user_id: string;
  documentary_slug: string;
  watched_at?: string;
  progress_ratio?: string | number;
  completed?: boolean;
};

export type WatchHistoryUpdate = {
  watched_at?: string;
  progress_ratio?: string | number;
  completed?: boolean;
};

export type SavedFilmRow = {
  user_id: string;
  documentary_slug: string;
  saved_at: string;
};

export type SavedFilmInsert = {
  user_id: string;
  documentary_slug: string;
  saved_at?: string;
};

export type SavedFilmUpdate = {
  saved_at?: string;
};

/* ---------- creator_applications ---------- */

export type CreatorApplicationRow = {
  id: string;
  /** altid ansøgerens egen konto — RLS håndhæver auth.uid() = user_id */
  user_id: string;
  name: string;
  handle: string;
  bio: string;
  founded_year: number;
  country: string;
  motivation: string;
  /** pending → approved/rejected (dashboard); afvist → pending igen (genafsendelse) */
  status: string;
  created_at: string;
  decided_at: string | null;
};

/** status udelades — databasens default er 'pending', og RLS afviser andet */
export type CreatorApplicationInsert = {
  id?: string;
  user_id: string;
  name: string;
  handle: string;
  bio: string;
  founded_year: number;
  country: string;
  motivation: string;
  created_at?: string;
};

/** kun relevant ved genafsendelse: RLS tvinger status tilbage til 'pending' */
export type CreatorApplicationUpdate = {
  name?: string;
  handle?: string;
  bio?: string;
  founded_year?: number;
  country?: string;
  motivation?: string;
  status?: string;
};

/* ---------- view_sessions (anti-fraud) ---------- */

export type ViewSessionRow = {
  id: string;
  documentary_slug: string;
  /** null = anonym seer; identiteten sættes altid server-side */
  user_id: string | null;
  /** jsonb: DeviceMetadata — alle felter bevares ustruktureret */
  device: unknown;
  started_at: string;
  ended_at: string | null;
  status: string;
  /** reelt sete sekunder — skrives af afregn_session, aldrig af klienter */
  watched_seconds: number;
  /** jsonb: SessionVerdict (features, signals, modelVersion) */
  verdict: unknown;
};

export type ViewSessionInsert = {
  id?: string;
  documentary_slug: string;
  user_id?: string | null;
  device: unknown;
  started_at?: string;
  ended_at?: string | null;
  status?: string;
  watched_seconds?: number;
  verdict?: unknown;
};

export type ViewSessionUpdate = {
  ended_at?: string | null;
  status?: string;
  /** skrives kun af afregn_session (security definer) — aldrig direkte */
  watched_seconds?: number;
  verdict?: unknown;
};

/* ---------- view_events (append-only rålog) ---------- */

export type ViewEventRow = {
  id: number;
  session_id: string;
  /** rækkefølgen hændelsen modtoges i — loggen sorteres aldrig om */
  seq: number;
  type: string;
  /** klientens ur, ms epoch — bevares uændret til jitter-analyse */
  client_timestamp: number;
  video_time_sec: number;
  /** jsonb: playbackRate, seekFrom/To, rå-felter fra klienten */
  payload: unknown;
};

export type ViewEventInsert = {
  session_id: string;
  seq: number;
  type: string;
  client_timestamp: number;
  video_time_sec: number;
  payload?: unknown;
};

/* ---------- comments ---------- */

export type CommentRow = {
  id: string;
  documentary_slug: string;
  /** null = gæst; identiteten afgøres altid server-side */
  user_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type CommentInsert = {
  id?: string;
  documentary_slug: string;
  user_id?: string | null;
  author_name: string;
  body: string;
  created_at?: string;
};

export type CommentUpdate = {
  author_name?: string;
  body?: string;
};

/* ---------- comment_likes ---------- */

export type CommentLikeRow = {
  comment_id: string;
  /** aldrig null: likes kræver en logget-ind konto */
  user_id: string;
  liked_at: string;
};

export type CommentLikeInsert = {
  comment_id: string;
  user_id: string;
  liked_at?: string;
};

/** likes er insert/delete-only — de opdateres aldrig */
export type CommentLikeUpdate = never;

/* ---------- credit_ledger (append-only minut-saldo) ---------- */

export type CreditLedgerRow = {
  id: string;
  user_id: string;
  /** positiv = kredit (køb/affiliate/admin), negativ = forbrug */
  seconds: number;
  reason: string;
  /** 'koeb:{purchaseId}' | 'affiliate:{purchaseId}' | 'forbrug:{sessionId}' | 'admin:{uuid}' */
  source_key: string;
  created_at: string;
};

/**
 * Insert/Update sker KUN via service-role (webhook) eller
 * security definer-RPC'er — der findes ingen klient-policy,
 * så Insert/Update er `never` for app-klienter.
 */
export type CreditLedgerInsert = never;
export type CreditLedgerUpdate = never;

/* ---------- credit_purchases (engangs-køb af minutpakker) ---------- */

export type CreditPurchaseRow = {
  id: string;
  user_id: string;
  pack_id: string;
  minutes: number;
  /** numeric → string fra Postgres — mappes med Number() */
  price_dkk_excl: string;
  stripe_session_id: string;
  status: string;
  /** koderens ejer hvis købet indfri en affiliate-henvisning */
  referrer_user_id: string | null;
  created_at: string;
  paid_at: string | null;
};

/** appen indsætter kun pending-rækker; paid/failed sker via webhook */
export type CreditPurchaseInsert = {
  id?: string;
  user_id: string;
  pack_id: string;
  minutes: number;
  price_dkk_excl: string | number;
  stripe_session_id: string;
  status?: string;
  referrer_user_id?: string | null;
  created_at?: string;
};

/**
 * Der findes ingen update-policy — typen findes kun fordi
 * webhook-ruten (service-role) markerer udløbne køb 'failed'.
 */
export type CreditPurchaseUpdate = {
  status?: string;
};

/* ---------- user_referral_codes (affiliate) ---------- */

export type UserReferralCodeRow = {
  user_id: string;
  code: string;
  created_at: string;
};

export type UserReferralCodeInsert = {
  user_id: string;
  code: string;
  created_at?: string;
};

/** koden er permanent — der opdateres aldrig */
export type UserReferralCodeUpdate = never;

/* ---------- creator_payouts (manuelle udbetalinger) ---------- */

export type CreatorPayoutRow = {
  id: string;
  user_id: string;
  /** numeric → string fra Postgres — mappes med Number() */
  amount_dkk: string;
  note: string | null;
  paid_at: string;
};

/** indsættes kun manuelt i dashboardet — aldrig af app-klienter */
export type CreatorPayoutInsert = never;

/** udbetalinger korrigeres aldrig fra app'en */
export type CreatorPayoutUpdate = never;

/* ---------- creator_posts (opslagstavle på creatorsiden) ---------- */

export type CreatorPostRow = {
  id: string;
  creator_id: string;
  /** 1..2000 tegn efter trim — håndhæves af check-constraint */
  body: string;
  /** fastgjort øverst på tavlen; ét pr. creator (partial unique index) */
  pinned: boolean;
  created_at: string;
  /** røres automatisk af trg_creator_post_touch ved UPDATE */
  updated_at: string;
};

export type CreatorPostInsert = {
  id?: string;
  creator_id: string;
  body: string;
  pinned?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CreatorPostUpdate = {
  body?: string;
  pinned?: boolean;
  /** sættes normalt af DB-triggeren, men accepteres ved insert */
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      creators: {
        Row: CreatorRow;
        Insert: CreatorInsert;
        Update: CreatorUpdate;
        Relationships: [];
      };
      documentaries: {
        Row: DocumentaryRow;
        Insert: DocumentaryInsert;
        Update: DocumentaryUpdate;
        Relationships: [];
      };
      watch_history: {
        Row: WatchHistoryRow;
        Insert: WatchHistoryInsert;
        Update: WatchHistoryUpdate;
        Relationships: [];
      };
      saved_films: {
        Row: SavedFilmRow;
        Insert: SavedFilmInsert;
        Update: SavedFilmUpdate;
        Relationships: [];
      };
      view_sessions: {
        Row: ViewSessionRow;
        Insert: ViewSessionInsert;
        Update: ViewSessionUpdate;
        Relationships: [];
      };
      view_events: {
        Row: ViewEventRow;
        Insert: ViewEventInsert;
        /** append-only — hændelser opdateres aldrig */
        Update: never;
        Relationships: [];
      };
      comments: {
        Row: CommentRow;
        Insert: CommentInsert;
        Update: CommentUpdate;
        Relationships: [];
      };
      comment_likes: {
        Row: CommentLikeRow;
        Insert: CommentLikeInsert;
        Update: CommentLikeUpdate;
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_applications: {
        Row: CreatorApplicationRow;
        Insert: CreatorApplicationInsert;
        Update: CreatorApplicationUpdate;
        Relationships: [];
      };
      credit_ledger: {
        Row: CreditLedgerRow;
        Insert: CreditLedgerInsert;
        Update: CreditLedgerUpdate;
        Relationships: [];
      };
      credit_purchases: {
        Row: CreditPurchaseRow;
        Insert: CreditPurchaseInsert;
        Update: CreditPurchaseUpdate;
        Relationships: [];
      };
      user_referral_codes: {
        Row: UserReferralCodeRow;
        Insert: UserReferralCodeInsert;
        Update: UserReferralCodeUpdate;
        Relationships: [];
      };
      creator_payouts: {
        Row: CreatorPayoutRow;
        Insert: CreatorPayoutInsert;
        Update: CreatorPayoutUpdate;
        Relationships: [];
      };
      creator_posts: {
        Row: CreatorPostRow;
        Insert: CreatorPostInsert;
        Update: CreatorPostUpdate;
        Relationships: [
          {
            foreignKeyName: "creator_posts_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creators";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      saldo_sekunder: {
        Args: Record<string, never>;
        Returns: number;
      };
      afregn_session: {
        Args: { p_session_id: string };
        /** jsonb: { watched_seconds } | { allerede_afregnet } */
        Returns: unknown;
      };
      indfri_koeb: {
        Args: { p_stripe_session_id: string };
        /** jsonb: { fundet, indfriet? } — kaldes kun af webhook-ruten */
        Returns: unknown;
      };
      creator_indtjening: {
        Args: { p_creator_handle: string };
        /** jsonb: { optjent_dkk, udbetalt_dkk, tilgaengelig_dkk, sete_minutter, film } */
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};