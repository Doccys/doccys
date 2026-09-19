"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
// typen ligger i types.ts (ikke data/trailers) — den importerer
// supabase-server-klienten og må aldrig ind i en klient-komponent
import type { FilmTrailerStatus } from "@/lib/types";

/**
 * "Generér trailer"-knappen i studiet — med valgfrit start-tidspunkt.
 *
 * Som undertekst-knappen: pipelinen kører synkront (download + ffmpeg
 * kan tage et par minutter), fetch-kaldet får ingen AbortController,
 * og knappen er disabled undervejs. Fejlteksten fra ruten vises
 * direkte; ellers router.refresh() opdaterer status-badge + paywall-
 * smagsprøven er live på watch-siden med det samme.
 */
export default function StudioTrailerGenerator({
  slug,
  status,
}: {
  slug: string;
  /** Sidst kendte status — null = aldrig genereret */
  status: FilmTrailerStatus | null;
}) {
  const t = useTranslations("creatorStudio");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startSec, setStartSec] = useState(status?.startSec ?? 0);

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/films/${slug}/trailer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startSec }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? t("trailerError"));
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError(t("trailerError"));
    } finally {
      setBusy(false);
    }
  };

  const statusText = !status
    ? t("trailerMissing")
    : status.status === "ready"
      ? t("trailerReady")
      : status.status === "failed"
        ? t("trailerFailed")
        : t("subtitlesProcessing");
  const statusClass = !status
    ? "border-smoke text-ash/70"
    : status.status === "ready"
      ? "border-champagne/60 text-champagne"
      : status.status === "failed"
        ? "border-red-400/60 text-red-400"
        : "border-smoke text-ash";

  return (
    <div className="mt-4 max-w-xl">
      <p className="text-xs uppercase tracking-[0.3em] text-ash">
        {t("trailerHeading")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ash/70">
        {t("trailerIntro")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-ash">
          {t("trailerStartLabel")}
          <input
            type="number"
            min={0}
            step={1}
            value={startSec}
            onChange={(event) =>
              setStartSec(Math.max(0, Math.floor(Number(event.target.value) || 0)))
            }
            className="ml-2 w-24 rounded-lg border border-smoke/60 bg-noir px-2.5 py-1.5 text-sm text-bone"
          />
        </label>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusClass}`}>
          {statusText}
        </span>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="rounded-full bg-champagne px-5 py-2 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status ? t("trailerRegenerate") : t("trailerGenerate")}
        </button>
        {busy && (
          <p className="mt-2 text-xs text-ash/70">{t("trailerWorking")}</p>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}