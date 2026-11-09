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
 * redaktionens). Storage-objekterne (trailer + forsidebillede +
 * undertekst-VTT'er) fjernes bedst muligt først; Bunny-videoerne
 * (9/11) slettes via bunny-delete-ruten (titeltbundet ejerskab, API'
 * nøglen må aldrig i klienten); Supabase-videoen i film-videos
 * afledes af URL'en — dør klienten imellem kaldene, bliver objekterne
 * forældreløse — usynlige og harmløse.
 */
export default function StudioDeleteFilmButton({
  documentaryId,
  videoUrl,
  bunnyVideoId,
  posterUrl,
  subtitleVttUrls,
  trailerUrl,
  trailerBunnyVideoId,
}: {
  documentaryId: string;
  videoUrl: string;
  /** Bunny-videoens guid (9/11) — null = legacy Supabase-video */
  bunnyVideoId: string | null;
  posterUrl: string | null;
  /** Public-URL'er på filmens VTT-filer — ryddes sammen med resten. */
  subtitleVttUrls: string[];
  /** Public-URL på trailer-MP4'en — film-videos (legacy) eller Bunny. */
  trailerUrl?: string | null;
  trailerBunnyVideoId?: string | null;
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
      // Bunny-videoerne: slettes via server-ruten (API-nøglen bor kun
      // server-side) — idempotent, fejl forhindrer IKKE sletningen.
      if (bunnyVideoId) {
        await fetch(`/api/films/bunny-delete?id=${bunnyVideoId}`, {
          method: "POST",
        }).catch(() => undefined);
      }
      if (trailerBunnyVideoId) {
        await fetch(`/api/films/bunny-delete?id=${trailerBunnyVideoId}`, {
          method: "POST",
        }).catch(() => undefined);
      }
      // Legacy-videoen/traileren (film-videos) afledes af URL'en.
      const path = publicUrlToStoragePath(videoUrl);
      if (path) {
        await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([path]);
      }
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