"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * "Generér undertekster"-knappen i studiet.
 *
 * Pipelinen kører synkront i API-ruten og kan tage flere minutter —
 * fetch-kaldet gives derfor INGEN AbortController (browsere har
 * ingen default-timeout), og knappen er disabled undervejs. Efter
 * kørslen vises serverens fejltekst direkte; ellers router.refresh()
 * så de server-renderede sprog-badges opdaterer sig.
 */
export default function StudioSubtitleGenerator({
  slug,
  hasExisting,
}: {
  slug: string;
  /** Findes der allerede rækker? → "Generér igen"-tekst. */
  hasExisting: boolean;
}) {
  const t = useTranslations("creatorStudio");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/films/${slug}/subtitles`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Sprog der fejlede kan prøves igen med samme knap —
        // fejlteksten fra ruten er mere præcis end en generisk.
        setError(data?.error ?? t("subtitlesError"));
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError(t("subtitlesError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="rounded-full bg-champagne px-5 py-2 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
      >
        {hasExisting ? t("subtitlesRegenerate") : t("subtitlesGenerate")}
      </button>
      {busy && (
        <p className="mt-2 text-xs text-ash/70">{t("subtitlesWorking")}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}