"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CreatorPost } from "@/lib/types";
import type { CreatorPostRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";

interface BulletinBoardProps {
  creatorId: string;
  /** Server-renderet starttilstand — tavlen er aldrig tom-flashende. */
  initialPosts: CreatorPost[];
  /** Er den besøgende creatorens ejer-konto? (afgøres server-side) */
  isOwner: boolean;
}

/** Pinned øverst, derefter nyeste først — én sorterings-sandhed. */
function sortPosts(list: CreatorPost[]): CreatorPost[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
}

function rowToPost(row: CreatorPostRow): CreatorPost {
  return {
    id: row.id,
    creatorId: row.creator_id,
    body: row.body,
    pinned: row.pinned,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/**
 * Opslagstavlen på creatorsiden: beskeder fra creatoren til dens
 * seere. Kun ejeren ser formularen og rediger/slet/fastgør-knapper.
 *
 * Startdata er server-renderet; et Supabase Realtime-abonnement
 * holder tavlen live i alle åbne faner (opret, rediger, fastgør,
 * slet) uden reload. Et refetch ved visibilitychange fanger
 * hændelser, der er smuttet, mens fanen var i baggrunden.
 */
export default function BulletinBoard({
  creatorId,
  initialPosts,
  isOwner,
}: BulletinBoardProps) {
  const t = useTranslations("bulletinBoard");
  const locale = useLocale();
  const [posts, setPosts] = useState<CreatorPost[]>(() => sortPosts(initialPosts));
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Rediger-mode for ét opslag: { id, body, pinned } */
  const [editing, setEditing] = useState<CreatorPost | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/creator-posts?creatorId=${encodeURIComponent(creatorId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { posts: CreatorPost[] };
      setPosts(sortPosts(data.posts));
    } catch {
      // stille — realtime-abonnementet tager over igen ved næste hændelse
    }
  }, [creatorId]);

  // Realtime: alle ændringer for denne creator strømmer til alle
  // åbne faner. Realtime afspiller ikke hændelser, der er smuttet,
  // mens fanen var skjult — derfor refetch ved visibilitychange.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`creator-posts-${creatorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creator_posts",
          filter: `creator_id=eq.${creatorId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const post = rowToPost(payload.new as unknown as CreatorPostRow);
            setPosts((prev) =>
              prev.some((p) => p.id === post.id)
                ? prev // dedupe: API-svaret nåede først
                : sortPosts([...prev, post]),
            );
          } else if (payload.eventType === "UPDATE") {
            const post = rowToPost(payload.new as unknown as CreatorPostRow);
            setPosts((prev) =>
              sortPosts(prev.map((p) => (p.id === post.id ? post : p))),
            );
          } else if (payload.eventType === "DELETE") {
            const { id } = payload.old as unknown as CreatorPostRow;
            setPosts((prev) => prev.filter((p) => p.id !== id));
          }
        },
      )
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [creatorId, refetch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/creator-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, body: body.trim() }),
      });
      const data = (await res.json()) as { post?: CreatorPost; error?: string };
      if (!res.ok || !data.post) {
        setError(data.error ?? t("submitError"));
        return;
      }
      const post = data.post;
      setPosts((prev) =>
        prev.some((p) => p.id === post.id)
          ? prev // realtime var hurtigst
          : sortPosts([...prev, post]),
      );
      setBody("");
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(post: CreatorPost, newBody: string) {
    if (!newBody.trim()) return;
    setWorkingId(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/creator-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newBody.trim() }),
      });
      if (!res.ok) {
        setError(t("updateError"));
        return;
      }
      setEditing(null);
      // realtime opdaterer tavlen; svaret her er kun ejers sikkerhed
    } catch {
      setError(t("updateError"));
    } finally {
      setWorkingId(null);
    }
  }

  async function handlePinToggle(post: CreatorPost) {
    setWorkingId(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/creator-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !post.pinned }),
      });
      if (!res.ok) {
        setError(res.status === 409 ? t("pinError") : t("updateError"));
        return;
      }
    } catch {
      setError(t("updateError"));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDelete(post: CreatorPost) {
    if (!confirm(t("deleteConfirm"))) return;
    setWorkingId(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/creator-posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(t("deleteError"));
        return;
      }
      // realtime fjerner opslaget i alle faner
    } catch {
      setError(t("deleteError"));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section>
      <h2 className="font-display text-2xl text-bone">{t("title")}</h2>
      <p className="mt-1 text-sm text-ash">{t("subtitle")}</p>

      {isOwner && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-smoke bg-onyx px-4 py-3 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>
      )}

      <div className="mt-5 space-y-4">
        {posts.length === 0 && (
          <p className="text-sm text-ash">{isOwner ? t("emptyOwner") : t("empty")}</p>
        )}
        {posts.map((post) => {
          const isEditing = editing?.id === post.id;
          const isWorking = workingId === post.id;
          const edited = post.updatedAt > post.createdAt;
          return (
            <article
              key={post.id}
              className="rounded-lg border border-smoke bg-onyx p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="flex items-center gap-2 text-xs text-ash/70">
                  {post.pinned && (
                    <span className="rounded-full border border-champagne/60 px-2 py-0.5 font-medium text-champagne">
                      📌 {t("pinnedLabel")}
                    </span>
                  )}
                  {formatDate(post.createdAt, locale)}
                  {edited && (
                    <span className="text-ash/60">
                      · {t("editedLabel")} {formatDate(post.updatedAt, locale)}
                    </span>
                  )}
                </p>
                {isOwner && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePinToggle(post)}
                      disabled={isWorking}
                      aria-label={post.pinned ? t("unpin") : t("pin")}
                      className="rounded-full border border-smoke px-3 py-1 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {post.pinned ? t("unpin") : t("pin")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(isEditing ? null : post)}
                      disabled={isWorking}
                      className="rounded-full border border-smoke px-3 py-1 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(post)}
                      disabled={isWorking}
                      className="rounded-full border border-smoke px-3 py-1 text-xs text-red-400/80 transition-colors hover:border-red-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("delete")}
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-3">
                  <textarea
                    defaultValue={post.body}
                    onChange={(e) => setEditing({ ...post, body: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder={t("editingPlaceholder")}
                    className="w-full rounded-lg border border-smoke bg-noir px-4 py-3 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(post, editing.body)}
                      disabled={isWorking || !editing.body.trim()}
                      className="rounded-full bg-champagne px-4 py-1.5 text-xs font-semibold text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isWorking ? t("saving") : t("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-full border border-smoke px-4 py-1.5 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 leading-relaxed text-bone/90">{post.body}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}