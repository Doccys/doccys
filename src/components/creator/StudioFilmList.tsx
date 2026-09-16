import { getTranslations } from "next-intl/server";
import StudioDeleteFilmButton from "@/components/creator/StudioDeleteFilmButton";
import type { Documentary } from "@/lib/types";

/**
 * Skaberens egen film-liste i studiet — inklusiv kladder, som er
 * usynlige alle andre steder i app'en. Preview afspilles direkte
 * fra den public bucket-URL (drafts har ingen watch-side — anti-
 * fraud-sessioner kan dermed aldrig sættes på en kladde).
 */
export default async function StudioFilmList({ films }: { films: Documentary[] }) {
  const t = await getTranslations("creatorStudio");

  if (films.length === 0) {
    return (
      <p className="rounded-xl border border-smoke bg-onyx px-6 py-8 text-sm leading-relaxed text-ash">
        {t("empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {films.map((film) => {
        const draft = film.status === "draft";
        return (
          <li
            key={film.id}
            className="rounded-lg border border-smoke bg-onyx p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="font-medium text-bone">
                {film.title}{" "}
                <span className="text-ash/70">({film.year})</span>
              </p>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${
                  draft
                    ? "border-smoke text-ash"
                    : "border-champagne/60 text-champagne"
                }`}
              >
                {draft ? t("statusDraft") : t("statusPublished")}
              </span>
            </div>

            <video
              src={film.videoUrl}
              poster={film.posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="mt-4 aspect-video w-full max-w-xl rounded-lg border border-smoke"
            />

            {draft && (
              <div className="mt-4 flex items-center gap-4">
                <StudioDeleteFilmButton
                  documentaryId={film.id}
                  videoUrl={film.videoUrl}
                  posterUrl={film.posterUrl}
                />
                <span className="text-xs text-ash/70">{t("draftNote")}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}