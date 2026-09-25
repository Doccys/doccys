/**
 * Databaseret implementation af DoccysStore-kontrakten
 * (src/lib/store/memoryStore.ts) — sessions, rå hændelseslog
 * og kommentarer bor i Supabase og overlever genstarter.
 *
 * Adgangsmodellen:
 * - view_sessions/view_events skrives med den enkelte seers
 *   token via RLS (anonyme sessioner har user_id = null og
 *   fungerer som bearer-tokens — jf. migrations-filen).
 * - comments er offentligt læsbare; user_id kan ikke forfalskes
 *   (RLS kræver ens eget id eller null).
 *
 * Råloggen i view_events er append-only: hændelser indsættes med
 * løbende `seq` og redigeres eller sorteres ALDRIG om bagefter —
 * det er datasettet, en fremtidig ML-model trænes direkte på.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  CommentRow,
  CreatorPostRow,
  ViewEventRow,
  ViewSessionRow,
} from "@/lib/supabase/database.types";
import type { DoccysStore } from "@/lib/store/memoryStore";
import type {
  Comment,
  CreatorPost,
  DeviceMetadata,
  PlaybackEvent,
  SessionStatus,
  SessionVerdict,
  ViewSession,
} from "@/lib/types";

/* ---------- Row → domæne-mapping ---------- */

function toSession(row: ViewSessionRow, events: PlaybackEvent[]): ViewSession {
  return {
    id: row.id,
    documentarySlug: row.documentary_slug,
    userId: row.user_id,
    startedAt: Date.parse(row.started_at),
    endedAt: row.ended_at ? Date.parse(row.ended_at) : null,
    status: row.status as ViewSession["status"],
    device: (row.device ?? {}) as DeviceMetadata,
    events,
    verdict: (row.verdict ?? null) as SessionVerdict | null,
  };
}

function toPlaybackEvent(row: ViewEventRow): PlaybackEvent {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const event: PlaybackEvent = {
    type: row.type as PlaybackEvent["type"],
    clientTimestamp: row.client_timestamp,
    videoTimeSec: row.video_time_sec,
  };
  if (typeof payload.playbackRate === "number") {
    event.playbackRate = payload.playbackRate;
  }
  if (typeof payload.seekFromSec === "number") {
    event.seekFromSec = payload.seekFromSec;
  }
  if (typeof payload.seekToSec === "number") {
    event.seekToSec = payload.seekToSec;
  }
  if (payload.raw && typeof payload.raw === "object") {
    event.raw = payload.raw as Record<string, unknown>;
  }
  return event;
}

function toComment(
  row: CommentRow,
  likeCount = 0,
  likedByMe = false,
): Comment {
  return {
    id: row.id,
    documentarySlug: row.documentary_slug,
    authorName: row.author_name,
    userId: row.user_id,
    body: row.body,
    createdAt: Date.parse(row.created_at),
    likeCount,
    likedByMe,
    pinned: row.pinned,
    parentId: row.parent_id,
  };
}

/** Row fra et select med comment_likes(count)-aggregat. */
type CommentRowWithLikes = CommentRow & {
  comment_likes?: { count: number }[];
};

function likeCountOf(row: CommentRowWithLikes): number {
  return row.comment_likes?.[0]?.count ?? 0;
}

function toCreatorPost(row: CreatorPostRow): CreatorPost {
  return {
    id: row.id,
    creatorId: row.creator_id,
    body: row.body,
    pinned: row.pinned,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/* ---------- Store ---------- */

class SupabaseStore implements DoccysStore {
  async createSession(input: {
    documentarySlug: string;
    device: DeviceMetadata;
    userId?: string | null;
  }): Promise<ViewSession> {
    const supabase = await createClient();
    const now = Date.now();
    const { data, error } = await supabase
      .from("view_sessions")
      .insert({
        documentary_slug: input.documentarySlug,
        user_id: input.userId ?? null,
        device: input.device,
        started_at: new Date(now).toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) {
      console.warn("createSession:", error?.message);
      throw new Error("Kunne ikke oprette session");
    }

    // session_start logges server-side, så råloggen altid er komplet
    const sessionStart: PlaybackEvent = {
      type: "session_start",
      clientTimestamp: now,
      videoTimeSec: 0,
    };
    await supabase.from("view_events").insert({
      session_id: data.id,
      seq: 1,
      type: "session_start",
      client_timestamp: now,
      video_time_sec: 0,
    });

    return toSession(data, [sessionStart]);
  }

  async appendEvents(
    sessionId: string,
    events: PlaybackEvent[],
  ): Promise<number> {
    if (events.length === 0) return 0;
    const supabase = await createClient();

    // fortsæt seq-løben efter sidst gemte hændelse
    const { data: last } = await supabase
      .from("view_events")
      .select("seq")
      .eq("session_id", sessionId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = last?.seq ?? 0;

    const rows = events.map((event, i) => ({
      session_id: sessionId,
      seq: base + i + 1,
      type: event.type,
      client_timestamp: event.clientTimestamp,
      video_time_sec: event.videoTimeSec,
      payload: {
        ...(event.playbackRate !== undefined && { playbackRate: event.playbackRate }),
        ...(event.seekFromSec !== undefined && { seekFromSec: event.seekFromSec }),
        ...(event.seekToSec !== undefined && { seekToSec: event.seekToSec }),
        ...(event.raw !== undefined && { raw: event.raw }),
      },
    }));

    const { error } = await supabase.from("view_events").insert(rows);
    if (error) {
      // ukendt session (RLS/FK) eller DB-fejl → 0 lagrede
      console.warn("appendEvents:", error.message);
      return 0;
    }
    return events.length;
  }

  async getSession(sessionId: string): Promise<ViewSession | undefined> {
    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("view_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error || !session) {
      if (error) console.warn("getSession:", error.message);
      return undefined;
    }

    const { data: events, error: eventsError } = await supabase
      .from("view_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("seq");
    if (eventsError) console.warn("getSession (events):", eventsError.message);

    return toSession(session, (events ?? []).map(toPlaybackEvent));
  }

  async finishSession(
    sessionId: string,
    status: SessionStatus,
  ): Promise<ViewSession | undefined> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("view_sessions")
      .update({ status, ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) {
      console.warn("finishSession:", error.message);
      return undefined;
    }
    return this.getSession(sessionId);
  }

  async setVerdict(
    sessionId: string,
    verdict: SessionVerdict,
    estimatedEgressBytes?: number,
  ): Promise<ViewSession | undefined> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("view_sessions")
      // skønnet skrives sammen med dommet (én round-trip); undefined =
      // uændret (kolonnen har default 0)
      .update({
        verdict,
        ...(estimatedEgressBytes !== undefined && {
          estimated_egress_bytes: estimatedEgressBytes,
        }),
      })
      .eq("id", sessionId);
    if (error) {
      console.warn("setVerdict:", error.message);
      return undefined;
    }
    return this.getSession(sessionId);
  }

  async listComments(
    documentarySlug: string,
    userId?: string | null,
  ): Promise<Comment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("*, comment_likes(count)")
      .eq("documentary_slug", documentarySlug)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("listComments:", error.message);
      return [];
    }

    const rows = (data ?? []) as CommentRowWithLikes[];

    // Seerens egne likes findes i ét opslag — kun relevante kommentarer.
    const commentIds = rows.map((row) => row.id);
    let likedIds = new Set<string>();
    if (userId && commentIds.length > 0) {
      const { data: likes } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .eq("user_id", userId)
        .in("comment_id", commentIds);
      likedIds = new Set((likes ?? []).map((like) => like.comment_id));
    }

    return rows.map((row) =>
      toComment(row, likeCountOf(row), likedIds.has(row.id)),
    );
  }

  async addComment(input: {
    documentarySlug: string;
    authorName: string;
    userId?: string | null;
    body: string;
    /** Svar-tråde: forældre-indlægget (null = almindeligt topindlæg). */
    parentId?: string | null;
  }): Promise<Comment> {
    const supabase = await createClient();
    // parent_id sendes KUN ved svar — ellers opfører topposts sig
    // uændret, også før svartraade-migrationen er kørt (PostgREST
    // afviser ellers kolonnen, som endnu ikke findes).
    const { data, error } = await supabase
      .from("comments")
      .insert({
        documentary_slug: input.documentarySlug,
        user_id: input.userId ?? null,
        author_name: input.authorName,
        body: input.body,
        ...(input.parentId ? { parent_id: input.parentId } : {}),
      })
      .select("*")
      .single();
    if (error || !data) {
      console.warn("addComment:", error.message);
      throw new Error("Kunne ikke gemme kommentaren");
    }
    return toComment(data);
  }

  /** Ett enkelt indlæg — forældre-validering ved svar (RLS: select er offentlig). */
  async getCommentById(commentId: string): Promise<Comment | undefined> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("id", commentId)
      .maybeSingle();
    return data ? toComment(data) : undefined;
  }

  async setCommentLike(input: {
    commentId: string;
    userId: string;
    liked: boolean;
  }): Promise<Comment | undefined> {
    const supabase = await createClient();

    // 404 håndteres i API-ruten — findes kommentaren ikke, er der intet at like.
    const { data: existing } = await supabase
      .from("comments")
      .select("id")
      .eq("id", input.commentId)
      .maybeSingle();
    if (!existing) return undefined;

    // Den sammensatte primærnøgle (comment_id, user_id) gør én like
    // pr. konto pr. kommentar til en databasestyring — upsert med
    // ignoreDuplicates gør et dobbelt-klik harmløst.
    const { error } = input.liked
      ? await supabase
          .from("comment_likes")
          .upsert(
            { comment_id: input.commentId, user_id: input.userId },
            { onConflict: "comment_id,user_id", ignoreDuplicates: true },
          )
      : await supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", input.userId);
    if (error) {
      console.warn("setCommentLike:", error.message);
      throw new Error("Kunne ikke registrere liket");
    }

    // Kommentaren returneres med friske like-tal.
    const { data: row } = await supabase
      .from("comments")
      .select("*, comment_likes(count)")
      .eq("id", input.commentId)
      .maybeSingle();
    if (!row) return undefined;

    const { data: mine } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("comment_id", input.commentId)
      .eq("user_id", input.userId)
      .maybeSingle();

    const withLikes = row as CommentRowWithLikes;
    return toComment(withLikes, likeCountOf(withLikes), Boolean(mine));
  }

  async pinComment(input: {
    commentId: string;
    pinned: boolean;
  }): Promise<Comment | "konflikt" | undefined> {
    const supabase = await createClient();

    // 404 afgøres i API-ruten — findes kommentaren ikke (eller ejes
    // filmen ikke af den kaldende konto, hvormed RLS skjuler den),
    // er der intet at fastgøre.
    const { data: existing } = await supabase
      .from("comments")
      .select("id, documentary_slug")
      .eq("id", input.commentId)
      .maybeSingle();
    if (!existing) return undefined;

    // Fastgør: frigør først filmens øvrige pinned-kommentarer —
    // ét fastgjort indlæg pr. film håndhæves af partial unique index,
    // som fanger en evt. race (→ "konflikt").
    if (input.pinned) {
      const { error: unpinError } = await supabase
        .from("comments")
        .update({ pinned: false })
        .eq("documentary_slug", existing.documentary_slug)
        .eq("pinned", true)
        .neq("id", input.commentId);
      if (unpinError) {
        console.warn("pinComment (unpin):", unpinError.message);
        throw new Error("Kunne ikke fastgøre kommentaren");
      }
    }

    const { data, error } = await supabase
      .from("comments")
      .update({ pinned: input.pinned })
      .eq("id", input.commentId)
      .select("*, comment_likes(count)")
      .maybeSingle();
    if (error) {
      // Race: en anden kommentar blev fastgjort i samme øjeblik.
      if (error.code === "23505") return "konflikt";
      console.warn("pinComment:", error.message);
      throw new Error("Kunne ikke fastgøre kommentaren");
    }
    if (!data) return undefined;

    // Triggeren trg_comment_pin_kun låser alt undtagen pinned —
    // ordlyden kan aldrig have ændret sig, men likes kan have.
    const withLikes = data as CommentRowWithLikes;
    return toComment(withLikes, likeCountOf(withLikes), false);
  }

  async deleteComment(commentId: string): Promise<boolean> {
    const supabase = await createClient();
    // RLS (slet_som_creator_ejer) afviser ikke-ejere — de svarer false.
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);
    if (error) {
      console.warn("deleteComment:", error.message);
      return false;
    }
    return true;
  }

  async listCreatorPosts(creatorId: string): Promise<CreatorPost[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("creator_posts")
      .select("*")
      .eq("creator_id", creatorId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("listCreatorPosts:", error.message);
      return [];
    }
    return (data ?? []).map(toCreatorPost);
  }

  async addCreatorPost(input: {
    creatorId: string;
    body: string;
  }): Promise<CreatorPost> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("creator_posts")
      .insert({ creator_id: input.creatorId, body: input.body })
      .select("*")
      .single();
    if (error || !data) {
      console.warn("addCreatorPost:", error?.message);
      throw new Error("Kunne ikke gemme opslaget");
    }
    return toCreatorPost(data);
  }

  async updateCreatorPost(input: {
    postId: string;
    body?: string;
    pinned?: boolean;
  }): Promise<CreatorPost | "konflikt" | undefined> {
    const supabase = await createClient();

    // 404 afgøres i API-ruten — findes opslaget ikke (eller ejes det ikke
    // af den kaldende konto, hvormed RLS skjuler det), er der intet at rette.
    const { data: existing } = await supabase
      .from("creator_posts")
      .select("*")
      .eq("id", input.postId)
      .maybeSingle();
    if (!existing) return undefined;

    // Fastgør: frigør først de øvrige pinned-rækker for creatoren —
    // ét pinned opslag pr. creator håndhæves af partial unique index,
    // som fanger en evt. race (→ "konflikt").
    if (input.pinned === true) {
      const { error: unpinError } = await supabase
        .from("creator_posts")
        .update({ pinned: false })
        .eq("creator_id", existing.creator_id)
        .eq("pinned", true)
        .neq("id", input.postId);
      if (unpinError) {
        console.warn("updateCreatorPost (unpin):", unpinError.message);
        throw new Error("Kunne ikke gemme opslaget");
      }
    }

    const patch: { body?: string; pinned?: boolean } = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.pinned !== undefined) patch.pinned = input.pinned;
    const { data, error } = await supabase
      .from("creator_posts")
      .update(patch)
      .eq("id", input.postId)
      .select("*")
      .maybeSingle();

    // 23505 = unique-violation på pin-indexet (race med et andet
    // pinned-opslag) — API-ruten oversætter til en dansk 409.
    if (error) {
      if (error.code === "23505") return "konflikt";
      console.warn("updateCreatorPost:", error.message);
      throw new Error("Kunne ikke gemme opslaget");
    }
    return data ? toCreatorPost(data) : undefined;
  }

  async deleteCreatorPost(postId: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("creator_posts")
      .delete()
      .eq("id", postId);
    if (error) {
      console.warn("deleteCreatorPost:", error.message);
      return false;
    }
    return true;
  }
}

export const doccysStore: DoccysStore = new SupabaseStore();