/**
 * In-memory implementation of the data store.
 *
 * The store is deliberately built behind a repository interface so that it can
 * be swapped out for a real database (Prisma, Drizzle, Postgres …) without
 * changes to components, pages, or API routes — the interface below is the
 * contract that a database implementation must fulfill.
 *
 * Note: The store lives in `globalThis` so that Hot Module Reload
 * does not lose data during development.
 */
import type {
  Comment,
  CreatorPost,
  DeviceMetadata,
  PlaybackEvent,
  SessionStatus,
  SessionVerdict,
  ViewSession,
} from "@/lib/types";

/**
 * Alle metoder er async, så en databaseret implementation kan
 * opfylde kontrakten uden at rute-signaturerne ændres.
 */
export interface DoccysStore {
  // — View-sessions (anti-fraud) —
  createSession(input: {
    documentarySlug: string;
    device: DeviceMetadata;
    userId?: string | null;
  }): Promise<ViewSession>;
  appendEvents(sessionId: string, events: PlaybackEvent[]): Promise<number>;
  getSession(sessionId: string): Promise<ViewSession | undefined>;
  finishSession(
    sessionId: string,
    status: SessionStatus,
  ): Promise<ViewSession | undefined>;
  setVerdict(
    sessionId: string,
    verdict: SessionVerdict,
  ): Promise<ViewSession | undefined>;

  // — Comments —
  listComments(
    documentarySlug: string,
    /** Den aktuelle seer — afgør likedByMe (null = gæst). */
    userId?: string | null,
  ): Promise<Comment[]>;
  addComment(input: {
    documentarySlug: string;
    authorName: string;
    /** Supabase-bruger-id, når forfatteren er logget ind (ellers null). */
    userId?: string | null;
    body: string;
  }): Promise<Comment>;
  /**
   * Sætter eller fjerner den givne brugers like på en kommentar.
   * Returnerer den opdaterede kommentar, eller undefined hvis den ikke findes.
   */
  setCommentLike(input: {
    commentId: string;
    /** Likes kræver altid en logget-ind konto. */
    userId: string;
    liked: boolean;
  }): Promise<Comment | undefined>;
  /**
   * Fastgør/frigør en kommentar på vegne af filmens creator-ejer.
   * Returnerer den opdaterede kommentar, "konflikt" hvis et andet
   * indlæg allerede er fastgjort, eller undefined hvis den ikke findes.
   */
  pinComment(input: {
    commentId: string;
    pinned: boolean;
  }): Promise<Comment | "konflikt" | undefined>;
  /** Sletter en kommentar på vegne af filmens creator-ejer. */
  deleteComment(commentId: string): Promise<boolean>;

  // — Creator-opslag (opslagstavlen på creatorsiden) —
  listCreatorPosts(creatorId: string): Promise<CreatorPost[]>;
  addCreatorPost(input: { creatorId: string; body: string }): Promise<CreatorPost>;
  /**
   * Redigerer eller fastgør/frigør et opslag. Returnerer det
   * opdaterede opslag, "konflikt" hvis et andet opslag allerede
   * er fastgjort, eller undefined hvis opslaget ikke findes.
   */
  updateCreatorPost(input: {
    postId: string;
    body?: string;
    pinned?: boolean;
  }): Promise<CreatorPost | "konflikt" | undefined>;
  deleteCreatorPost(postId: string): Promise<boolean>;
}

class MemoryStore implements DoccysStore {
  private sessions = new Map<string, ViewSession>();
  private comments: Comment[] = [
    {
      id: "c-seed-01",
      documentarySlug: "isens-sidste-vinter",
      authorName: "Mette",
      body: "Scenen hvor hun lægger båndoptageren på isen og bare venter. Jeg sad helt stille i to minutter efter.",
      createdAt: Date.parse("2026-09-08"),
      likeCount: 0,
      likedByMe: false,
      pinned: false,
    },
    {
      id: "c-seed-02",
      documentarySlug: "isens-sidste-vinter",
      authorName: "Klaus",
      body: "Ser den anden gang. Bemærk hvor lidt musik der bruges — det gør isen mere nærværende.",
      createdAt: Date.parse("2026-09-11"),
      likeCount: 0,
      likedByMe: false,
      pinned: false,
    },
    {
      id: "c-seed-03",
      documentarySlug: "saltmaleren",
      authorName: "Anna",
      body: "Hendes sidste penselstrøg på marsken gik mig på. Smukt om at miste sit motiv med dignitet.",
      createdAt: Date.parse("2026-09-02"),
      likeCount: 0,
      likedByMe: false,
      pinned: false,
    },
    {
      id: "c-seed-04",
      documentarySlug: "byen-under-betonen",
      authorName: "Jeppe",
      body: "Arkivklippene fra sporvejen ved Blågårds Plads er rene guld. Nogen der ved, hvor de stammer fra?",
      createdAt: Date.parse("2026-08-30"),
      likeCount: 0,
      likedByMe: false,
      pinned: false,
    },
  ];
  /** commentId → sæt af bruger-id'er der har liket (én like pr. konto). */
  private commentLikes = new Map<string, Set<string>>();
  private creatorPosts: CreatorPost[] = [];

  async createSession(input: {
    documentarySlug: string;
    device: DeviceMetadata;
    userId?: string | null;
  }): Promise<ViewSession> {
    const now = Date.now();
    const session: ViewSession = {
      id: crypto.randomUUID(),
      documentarySlug: input.documentarySlug,
      userId: input.userId ?? null,
      startedAt: now,
      endedAt: null,
      status: "active",
      device: input.device,
      // session_start logges server-side, så råloggen altid er komplet
      events: [
        {
          type: "session_start",
          clientTimestamp: now,
          videoTimeSec: 0,
        },
      ],
      verdict: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async appendEvents(sessionId: string, events: PlaybackEvent[]): Promise<number> {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    // Append-only: the raw log is never edited or trimmed — this is what
    // makes the dataset usable for future ML training.
    session.events.push(...events);
    return events.length;
  }

  async getSession(sessionId: string): Promise<ViewSession | undefined> {
    return this.sessions.get(sessionId);
  }

  async finishSession(
    sessionId: string,
    status: SessionStatus,
  ): Promise<ViewSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.status = status;
    session.endedAt = Date.now();
    return session;
  }

  async setVerdict(
    sessionId: string,
    verdict: SessionVerdict,
  ): Promise<ViewSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.verdict = verdict;
    return session;
  }

  async listComments(
    documentarySlug: string,
    userId?: string | null,
  ): Promise<Comment[]> {
    return this.comments
      .filter((c) => c.documentarySlug === documentarySlug)
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
      )
      .map((c) => ({
        ...c,
        likeCount: this.commentLikes.get(c.id)?.size ?? 0,
        likedByMe: userId ? (this.commentLikes.get(c.id)?.has(userId) ?? false) : false,
      }));
  }

  async addComment(input: {
    documentarySlug: string;
    authorName: string;
    userId?: string | null;
    body: string;
  }): Promise<Comment> {
    const comment: Comment = {
      id: crypto.randomUUID(),
      documentarySlug: input.documentarySlug,
      authorName: input.authorName,
      userId: input.userId ?? null,
      body: input.body,
      createdAt: Date.now(),
      likeCount: 0,
      likedByMe: false,
      pinned: false,
    };
    this.comments.unshift(comment);
    return comment;
  }

  async setCommentLike(input: {
    commentId: string;
    userId: string;
    liked: boolean;
  }): Promise<Comment | undefined> {
    const comment = this.comments.find((c) => c.id === input.commentId);
    if (!comment) return undefined;

    let likers = this.commentLikes.get(comment.id);
    if (!likers) {
      likers = new Set();
      this.commentLikes.set(comment.id, likers);
    }
    if (input.liked) {
      likers.add(input.userId);
    } else {
      likers.delete(input.userId);
    }

    return {
      ...comment,
      likeCount: likers.size,
      likedByMe: likers.has(input.userId),
    };
  }

  async pinComment(input: {
    commentId: string;
    pinned: boolean;
  }): Promise<Comment | "konflikt" | undefined> {
    const comment = this.comments.find((c) => c.id === input.commentId);
    if (!comment) return undefined;

    if (input.pinned) {
      const existing = this.comments.find(
        (c) =>
          c.documentarySlug === comment.documentarySlug &&
          c.pinned &&
          c.id !== comment.id,
      );
      if (existing) return "konflikt";
    }

    comment.pinned = input.pinned;
    return { ...comment };
  }

  async deleteComment(commentId: string): Promise<boolean> {
    const index = this.comments.findIndex((c) => c.id === commentId);
    if (index === -1) return false;
    this.comments.splice(index, 1);
    this.commentLikes.delete(commentId);
    return true;
  }

  async listCreatorPosts(creatorId: string): Promise<CreatorPost[]> {
    return this.creatorPosts
      .filter((p) => p.creatorId === creatorId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  }

  async addCreatorPost(input: {
    creatorId: string;
    body: string;
  }): Promise<CreatorPost> {
    const now = Date.now();
    const post: CreatorPost = {
      id: crypto.randomUUID(),
      creatorId: input.creatorId,
      body: input.body,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.creatorPosts.push(post);
    return post;
  }

  async updateCreatorPost(input: {
    postId: string;
    body?: string;
    pinned?: boolean;
  }): Promise<CreatorPost | "konflikt" | undefined> {
    const post = this.creatorPosts.find((p) => p.id === input.postId);
    if (!post) return undefined;
    if (input.pinned === true) {
      // ét fastgjort opslag pr. creator — frigør de øvrige først
      this.creatorPosts
        .filter((p) => p.creatorId === post.creatorId && p.pinned && p.id !== post.id)
        .forEach((p) => {
          p.pinned = false;
        });
    }
    if (input.body !== undefined) post.body = input.body;
    if (input.pinned !== undefined) post.pinned = input.pinned;
    post.updatedAt = Date.now();
    return post;
  }

  async deleteCreatorPost(postId: string): Promise<boolean> {
    const before = this.creatorPosts.length;
    this.creatorPosts = this.creatorPosts.filter((p) => p.id !== postId);
    return this.creatorPosts.length < before;
  }
}

const globalStore = globalThis as typeof globalThis & {
  __doccysMemoryStore?: MemoryStore;
};

const store = globalStore.__doccysMemoryStore ?? new MemoryStore();
globalStore.__doccysMemoryStore = store;

export const memoryStore: DoccysStore = store;