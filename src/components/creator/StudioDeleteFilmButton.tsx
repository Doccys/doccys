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

/**
 * Sletter en KLADDE — direkte via browser-klienten ala SaveFilmButton:
 * RLS tillader kun sletning af egne kladder (publicerede film er
 * redaktionens). Storage-objekterne (video + forsidebillede)
 * fjernes bedst muligt først; dør klienten imellem kaldene, bliver
 * objekterne forældreløse — usynlige og harmløse.
 */
export default function StudioDeleteFilmButton({
  documentaryId,
  videoUrl,
  posterUrl,
}: {
  documentaryId: string;
  videoUrl: string;
  posterUrl: string | null;
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
      const posterPath = posterUrl
        ? posterPublicUrlToStoragePath(posterUrl)
        : null;
      if (posterPath) {
        await supabase.storage.from(FILM_POSTERS_BUCKET).remove([posterPath]);
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