"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { KlubPost } from "@/lib/types";
import type { KlubPostRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";

interface KlubWallProps {
  /** forfatteren er altid den indlogge selv — server-side bruger-id */
  userId: string;
  /** Server-renderet starttilstand — væggen er aldrig tom-flashende. */
  initialPosts: KlubPost[];
}

function sortPosts(list: KlubPost[]): KlubPost[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
}

function rowToPost(row: KlubPostRow): KlubPost {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    pinned: row.pinned,
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * Klubstuen — Legende-gaven. Én indsæt-kun væg: medlemmer skriver, ingen
 * redigerer (ingen update/delete-sti findes i UI'et — moderation er
 * dashboard-arbejde, som migrationen dokumenterer). Forfattere vises
 * som @handle (user_handles er offentligt læsbart, og alle skribenter
 * er i Legende-ti-eren — ingen ekstra flair-tjek behøves).
 *
 * Realtime: HELE tabellen abonneres (den er lille — kun Legender
 * skriver), samme mønster som BulletinBoard (dedupe mod egne POST-svar,
 * refetch ved visibilitychange er ikke nødvendig her — væggen er
 * medlems-only).
 */
export default function KlubWall({ userId, initialPosts }: KlubWallProps) {
  const t = useTranslations("klub");
  const locale = useLocale();
  const [posts, setPosts] = useState<KlubPost[]>(() => sortPosts(initialPosts));
  /** @handle pr. user_id — løses asynkront (offentligt læsbar tabel). */
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forfatternavne: @handle fra user_handles (RLS: select using(true)).
  // Mangler tag → forfald til "Legende" (authorFallback).
  useEffect(() => {
    const udeforfattere = [...new Set(initialPosts.map((p) => p.userId))];
    if (udeforfattere.length === 0) return;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("user_handles")
        .select("user_id, handle")
        .in("user_id", udeforfattere);
      if (data) {
        setNames(
          new Map(data.map((row) => [row.user_id, row.handle] as const)),
        );
      }
    })();
  }, [initialPosts]);

  // Realtime for ALLE klubbens hændelser (INSERT/UPDATE fastgørelse/
  // DELETE) — hele tabellen, intet filter behøves.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("klub-posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "klub_posts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const post = rowToPost(payload.new as unknown as KlubPostRow);
            setPosts((prev) =>
              prev.some((p) => p.id === post.id)
                ? prev // egne POST-svar var hurtigst
                : sortPosts([...prev, post]),
            );
          } else if (payload.eventType === "UPDATE") {
            const post = rowToPost(payload.new as unknown as KlubPostRow);
            setPosts((prev) =>
              sortPosts(prev.map((p) => (p.id === post.id ? post : p))),
            );
          } else if (payload.eventType === "DELETE") {
            const { id } = payload.old as unknown as KlubPostRow;
            setPosts((prev) => prev.filter((p) => p.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      // RLS-politikken (klub_skrive_som_medlem) er autoriteten — et
      // afvist insert (ikke-Legende, fejlform) vises som submitError.
      const { data, error: insertError } = await supabase
        .from("klub_posts")
        .insert({ user_id: userId, body: body.trim() })
        .select("id, user_id, body, pinned, created_at")
        .single();
      if (insertError || !data) {
        setError(t("submitError"));
        return;
      }
      const post = rowToPost(data as unknown as KlubPostRow);
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

  return (
    <div>
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

      <div className="mt-8 space-y-4">
        {posts.length === 0 && <p className="text-sm text-ash">{t("empty")}</p>}
        {posts.map((post) => {
          const handle = names.get(post.userId);
          return (
            <article
              key={post.id}
              className="rounded-lg border border-smoke bg-onyx p-5"
            >
              <p className="flex items-baseline gap-3 text-xs text-ash/70">
                <span className="font-medium text-champagne">
                  {handle ? `@${handle}` : t("authorFallback")}
                </span>
                {post.pinned && (
                  <span className="rounded-full border border-champagne/60 px-2 py-0.5 font-medium text-champagne">
                    📌
                  </span>
                )}
                {formatDate(post.createdAt, locale)}
              </p>
              <p className="mt-2 leading-relaxed text-bone/90">{post.body}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
