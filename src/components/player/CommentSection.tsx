"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import type { Comment } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";

/**
 * Diskussion under afspilleren.
 *
 * Er seeren logget ind (supabase.auth), kommenteres der med profilens
 * identitet — navnefeltet er væk, og API'en sætter forfatteren ud fra
 * sessionen server-side. Gæster kan stadig skrive under et frit navn.
 */
export default function CommentSection({ slug }: { slug: string }) {
  const t = useTranslations("comments");
  const locale = useLocale();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Kortfattet besked under én kommentars like-knap (login-hint/fejl). */
  const [likeHint, setLikeHint] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`);
        const data = (await res.json()) as { comments: Comment[] };
        if (!cancelled) setComments(data.comments);
      } catch {
        if (!cancelled) setError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  const canSubmit = body.trim().length > 0 && (user !== null || name.trim().length > 0);

  /**
   * Likes kan kun afgives af loggede brugere — gæster får et login-hint.
   * Opdateringen er optimalistisk; fejler kaldet, rulles den tilbage.
   */
  const handleToggleLike = async (comment: Comment) => {
    setLikeHint(null);
    if (!user) {
      setLikeHint({ id: comment.id, message: t("likeGuestHint") });
      return;
    }

    const liked = !comment.likedByMe;
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? { ...c, likedByMe: liked, likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)) }
          : c,
      ),
    );

    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, {
        method: liked ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comment: Comment };
      setComments((prev) =>
        prev.map((c) => (c.id === data.comment.id ? data.comment : c)),
      );
    } catch {
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? { ...c, likedByMe: comment.likedByMe, likeCount: comment.likeCount }
            : c,
        ),
      );
      setLikeHint({ id: comment.id, message: t("likeError") });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim() || (!user && !name.trim())) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          user
            ? { documentarySlug: slug, body: body.trim() }
            : { documentarySlug: slug, authorName: name.trim(), body: body.trim() },
        ),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comment: Comment };
      setComments((prev) => [data.comment, ...prev]);
      setBody("");
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-bone">{t("title")}</h2>
      <p className="mt-2 text-sm text-ash">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        {user ? (
          <div className="flex items-center gap-2.5 text-sm text-ash">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-champagne/50 text-[11px] font-medium text-champagne">
              {(user.email ?? "?").charAt(0).toUpperCase()}
            </span>
            <span>
              {t("postingAs")}{" "}
              <span className="break-all text-champagne">{user.email}</span>
            </span>
          </div>
        ) : (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={60}
            className="w-full max-w-xs rounded-lg border border-smoke bg-onyx px-4 py-2.5 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-smoke bg-onyx px-4 py-3 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
          <span className="text-xs text-ash/70">
            {user ? t("loggedInNote") : t("guestNote")}
          </span>
        </div>
      </form>

      <div className="mt-10 space-y-4">
        {loading && <p className="text-sm text-ash">{t("loading")}</p>}
        {!loading && comments.length === 0 && (
          <p className="text-sm text-ash">{t("empty")}</p>
        )}
        {comments.map((comment) => (
          <article
            key={comment.id}
            className="rounded-lg border border-smoke bg-onyx p-5"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="break-all font-medium text-champagne">
                {comment.authorName}
              </p>
              <p className="shrink-0 text-xs text-ash/70">
                {formatDate(comment.createdAt, locale)}
              </p>
            </div>
            <p className="mt-2 leading-relaxed text-bone/90">{comment.body}</p>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleToggleLike(comment)}
                aria-label={t("likeAria")}
                aria-pressed={comment.likedByMe}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  comment.likedByMe
                    ? "border-champagne/60 text-champagne"
                    : "border-smoke text-ash hover:border-champagne/60 hover:text-champagne"
                }`}
              >
                <HeartIcon filled={comment.likedByMe} />
                {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
              </button>
              {likeHint?.id === comment.id && (
                <span className="text-xs text-ash/80">{likeHint.message}</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}