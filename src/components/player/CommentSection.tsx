"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Comment } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";

interface CommentSectionProps {
  slug: string;
  /** Er den besøgende filmens creator-ejer? (afgøres server-side) */
  isCreatorOwner: boolean;
}

/** GET-svaret fra /api/comments — seerens skrive-ret afgøres server-side. */
interface CommentsResponse {
  comments: Comment[];
  viewer: { canComment: boolean };
}

/**
 * Diskussion under afspilleren — med svar-tråde (maks ét niveau).
 *
 * Kvalitetsfilteret: kun kendte konti, der HAR SET filmen, kan skrive
 * (serveren afgør det mod den manipulationssikre forbrugs-ledger via
 * har_set_film-RPC'en) — det gælder svar som indlæg. Gæster og
 * ikke-seere ser en gate-boks i stedet for formularen; kommentar-
 * dataen forbliver guld for creatoren.
 *
 * Er seeren filmens creator-ejer, vises fastgør/slet-knapper pr.
 * indlæg (ét fastgjort indlæg pr. film, DB-håndhævet; 409 ved race).
 * Svar kan slettes men aldrig fastgøres — pin-knappen findes kun på
 * topindlæg, og DB-triggeren vagter det samme mod direkte PostgREST.
 */
export default function CommentSection({ slug, isCreatorOwner }: CommentSectionProps) {
  const t = useTranslations("comments");
  const locale = useLocale();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Kortfattet besked under én kommentars like-knap (login-hint/fejl). */
  const [likeHint, setLikeHint] = useState<{ id: string; message: string } | null>(null);
  /** Moderation: id på det indlæg, der er i arbejde (deaktiverer knapperne). */
  const [workingId, setWorkingId] = useState<string | null>(null);
  /** Svar-tråde: topindlægget hvis svar-formularen er åben (null = lukket). */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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
        const data = (await res.json()) as CommentsResponse;
        if (!cancelled) {
          setComments(data.comments);
          setCanComment(data.viewer.canComment);
        }
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

  const canSubmit = body.trim().length > 0;
  const canReplySubmit = replyBody.trim().length > 0;

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
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentarySlug: slug, body: body.trim() }),
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

  /**
   * Svar på et topindlæg — maks ét niveau; API'en og DB-triggeren
   * afviser svar på svar. Svaret appendes til den flade liste;
   * grupperingen i renderet placerer det under sin forælder.
   */
  const handleReplySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replyTo || !replyBody.trim()) return;
    setReplySubmitting(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentarySlug: slug,
          body: replyBody.trim(),
          parentId: replyTo,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comment: Comment };
      setComments((prev) => [...prev, data.comment]);
      setReplyBody("");
      setReplyTo(null);
    } catch {
      setReplyError(t("replyError"));
    } finally {
      setReplySubmitting(false);
    }
  };

  /** Fastgør/frigør — 409 hvis et andet indlæg netop blev fastgjort. */
  const handlePinToggle = async (comment: Comment) => {
    setWorkingId(comment.id);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !comment.pinned }),
      });
      if (!res.ok) {
        setError(res.status === 409 ? t("pinError") : t("deleteError"));
        return;
      }
      const data = (await res.json()) as { comment: Comment };
      setComments((prev) => {
        const updated = prev.map((c) => (c.id === data.comment.id ? data.comment : c));
        // fastgjorte øverst, derefter nyeste først — én sorterings-sandhed
        return [...updated].sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
        );
      });
    } catch {
      setError(t("pinError"));
    } finally {
      setWorkingId(null);
    }
  };

  const handleDelete = async (comment: Comment) => {
    if (!confirm(t("deleteConfirm"))) return;
    setWorkingId(comment.id);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(t("deleteError"));
        return;
      }
      // DB'en kaskaderer sletningen til svarene (on delete cascade) —
      // det spejles her, så ingen forladte svar bliver hængende.
      setComments((prev) =>
        prev.filter((c) => c.id !== comment.id && c.parentId !== comment.id),
      );
    } catch {
      setError(t("deleteError"));
    } finally {
      setWorkingId(null);
    }
  };

  // Tråde: topindlæg i den eksisterende rækkefølge (fastgjort øverst,
  // derefter nyeste først) med svarene ÆLDSTE først under deres
  // forælder — naturlig læseretning i en samtale.
  const threads = comments
    .filter((comment) => !comment.parentId)
    .map((comment) => ({
      comment,
      replies: comments
        .filter((reply) => reply.parentId === comment.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));

  /** Ét indlægskort — genbruges til topindlæg og (mere afdæmpede) svar. */
  const renderCard = (comment: Comment, isReply: boolean) => {
    const isWorking = workingId === comment.id;
    return (
      <article
        className={
          isReply
            ? "rounded-lg border border-smoke/70 bg-onyx/60 p-4"
            : "rounded-lg border border-smoke bg-onyx p-5"
        }
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="break-all font-medium text-champagne">
            {comment.authorName}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {isCreatorOwner && (
              <>
                {/* Svar kan aldrig fastgøres — pin-knappen findes kun
                    på topindlæg (DB-triggeren vagter det samme). */}
                {!isReply && (
                  <button
                    type="button"
                    onClick={() => void handlePinToggle(comment)}
                    disabled={isWorking}
                    aria-label={comment.pinned ? t("unpin") : t("pin")}
                    className="rounded-full border border-smoke px-3 py-1 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {comment.pinned ? t("unpin") : t("pin")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(comment)}
                  disabled={isWorking}
                  className="rounded-full border border-smoke px-3 py-1 text-xs text-red-400/80 transition-colors hover:border-red-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("delete")}
                </button>
              </>
            )}
            <p className="text-xs text-ash/70">
              {formatDate(comment.createdAt, locale)}
            </p>
          </div>
        </div>
        {comment.pinned && (
          <p className="mt-2">
            <span className="rounded-full border border-champagne/60 px-2 py-0.5 text-xs font-medium text-champagne">
              📌 {t("pinnedLabel")}
            </span>
          </p>
        )}
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
          {/* Svar-knappen findes kun på topindlæg (maks ét niveau) og
              kun for seere der må skrive. */}
          {!isReply && canComment && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(replyTo === comment.id ? null : comment.id);
                setReplyBody("");
                setReplyError(null);
              }}
              className="rounded-full border border-smoke px-3 py-1 text-xs text-ash transition-colors hover:border-champagne/60 hover:text-champagne"
            >
              {t("reply")}
            </button>
          )}
          {likeHint?.id === comment.id && (
            <span className="text-xs text-ash/80">{likeHint.message}</span>
          )}
        </div>

        {/* Svarets inline-formular — åbnes under det indlæg, der
            svares på, i stedet for at rulle til toppen. */}
        {!isReply && replyTo === comment.id && (
          <form onSubmit={handleReplySubmit} className="mt-3 space-y-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={t("bodyPlaceholder")}
              rows={2}
              maxLength={2000}
              className="w-full rounded-lg border border-smoke bg-onyx px-4 py-3 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={replySubmitting || !canReplySubmit}
                className="rounded-full bg-champagne px-5 py-2 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
              >
                {replySubmitting ? t("submitting") : t("reply")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  setReplyBody("");
                  setReplyError(null);
                }}
                className="rounded-full border border-smoke px-5 py-2 text-sm text-ash transition-colors hover:text-bone"
              >
                {t("cancel")}
              </button>
            </div>
            {replyError && <p className="text-sm text-red-400">{replyError}</p>}
          </form>
        )}
      </article>
    );
  };

  // Brugernavnet fra metadata — e-mailen vises aldrig. Navnløse konti
  // (oprettet før feltet kom til) ser kort-fallbacken indtil de sætter
  // navnet på profilen; API'et afviser alligevel kommentaren pænt (422).
  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    (user ? t("noNameShort") : "");

  const gateBox = (
    <div className="mt-8 rounded-lg border border-smoke bg-onyx px-6 py-5 text-sm text-ash">
      {user ? (
        <p>{t("gateWatch")}</p>
      ) : (
        <p>
          <Link
            href="/login"
            className="text-champagne underline underline-offset-4 transition-colors hover:text-bone"
          >
            {t("gateLogin")}
          </Link>{" "}
          {t("gateLoginSuffix")}
        </p>
      )}
    </div>
  );

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-bone">{t("title")}</h2>
      <p className="mt-2 text-sm text-ash">{t("subtitle")}</p>

      {canComment ? (
        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <div className="flex items-center gap-2.5 text-sm text-ash">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-champagne/50 text-[11px] font-medium text-champagne">
              {(displayName || "?").charAt(0).toUpperCase()}
            </span>
            <span>
              {t("postingAs")}{" "}
              <span className="break-all text-champagne">{displayName}</span>
            </span>
          </div>
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
            <span className="text-xs text-ash/70">{t("loggedInNote")}</span>
          </div>
        </form>
      ) : (
        gateBox
      )}

      <div className="mt-10 space-y-4">
        {loading && <p className="text-sm text-ash">{t("loading")}</p>}
        {!loading && comments.length === 0 && (
          <p className="text-sm text-ash">{t("empty")}</p>
        )}
        {threads.map(({ comment, replies }) => (
          <div key={comment.id}>
            {renderCard(comment, false)}
            {replies.length > 0 && (
              <div className="mt-3 space-y-3 border-l border-smoke pl-4 sm:pl-6">
                {replies.map((reply) => (
                  <div key={reply.id}>{renderCard(reply, true)}</div>
                ))}
              </div>
            )}
          </div>
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