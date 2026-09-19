"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FILM_VIDEOS_BUCKET,
  publicUrlToStoragePath,
} from "@/lib/storage/filmVideos";
import {
  FILM_POSTERS_BUCKET,
  posterPublicUrlToStoragePath,
} from "@/lib/storage/filmPosters";
import {
  FILM_SUBTITLES_BUCKET,
  subtitlePublicUrlToStoragePath,
} from "@/lib/storage/filmSubtitles";

/**
 * Sletter en KLADDE — direkte via browser-klienten ala SaveFilmButton:
 * RLS tillader kun sletning af egne kladder (publicerede film er
 * redaktionens). Storage-objekterne (video + trailer + forsidebillede +
 * undertekst-VTT'er) fjernes bedst muligt først; dør klienten
 * imellem kaldene, bliver objekterne forældreløse — usynlige og
 * harmløse.
 */
export default function StudioDeleteFilmButton({
  documentaryId,
  videoUrl,
  posterUrl,
  subtitleVttUrls,
  trailerUrl,
}: {
  documentaryId: string;
  videoUrl: string;
  posterUrl: string | null;
  /** Public-URL'er på filmens VTT-filer — ryddes sammen med resten. */
  subtitleVttUrls: string[];
  /** Public-URL på trailer-MP4'en (film-videos) — samme ryddelogik. */
  trailerUrl?: string | null;
}) {
  const t = useTranslations("creatorStudio");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const path = publicUrlToStoragePath(videoUrl);
      if (path) {
        await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([path]);
      }
      // Traileren bor i samme bucket som videoen — én sti-udledning til.
      const trailerPath = trailerUrl
        ? publicUrlToStoragePath(trailerUrl)
        : null;
      if (trailerPath) {
        await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([trailerPath]);
      }
      const posterPath = posterUrl
        ? posterPublicUrlToStoragePath(posterUrl)
        : null;
      if (posterPath) {
        await supabase.storage.from(FILM_POSTERS_BUCKET).remove([posterPath]);
      }
      const subtitlePaths = subtitleVttUrls
        .map((url) => subtitlePublicUrlToStoragePath(url))
        .filter((p): p is string => p !== null);
      if (subtitlePaths.length > 0) {
        await supabase.storage
          .from(FILM_SUBTITLES_BUCKET)
          .remove(subtitlePaths);
      }
      const { error } = await supabase
        .from("documentaries")
        .delete()
        .eq("id", documentaryId);
      if (error) {
        console.warn("StudioDeleteFilmButton:", error.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="rounded-full border border-smoke px-4 py-1.5 text-xs text-ash transition-colors hover:border-red-400/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? t("working") : t("delete")}
    </button>
  );
}