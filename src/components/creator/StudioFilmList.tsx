import { getTranslations } from "next-intl/server";
import StudioDeleteFilmButton from "@/components/creator/StudioDeleteFilmButton";
import StudioSubtitleGenerator from "@/components/creator/StudioSubtitleGenerator";
import StudioTrailerGenerator from "@/components/creator/StudioTrailerGenerator";
import { getFilmSubtitleStatuses } from "@/lib/data/subtitles";
import { getFilmTrailerStatus } from "@/lib/data/trailers";
import { LOCALE_LANGUAGE_NAMES } from "@/lib/i18n/languageNames";
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

  // Undertekst- OG trailer-status hentes pr. film her — én gang til
  // knapper, badges og sletning. Kun ejeren ser studiet, så alle
  // rækker (også failed med fejlbesked) er relevante her.
  const filmsWithExtras = await Promise.all(
    films.map(async (film) => ({
      film,
      subtitleStatuses: await getFilmSubtitleStatuses(film.slug),
      trailerStatus: await getFilmTrailerStatus(film.slug),
    })),
  );

  return (
    <ul className="space-y-4">
      {filmsWithExtras.map(({ film, subtitleStatuses, trailerStatus }) => {
        const draft = film.status === "draft";
        const statusByLocale = new Map(
          subtitleStatuses.map((entry) => [entry.locale, entry]),
        );
        const subtitleVttUrls = subtitleStatuses
          .map((entry) => entry.vttUrl)
          .filter((url): url is string => url !== null);
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

            {/* Undertekster: AI-pipelinen pr. film — 8 sprog-badges
                (kode, ikke oversatte navne — koderne er genkendelige
                på alle sprog) + generér-knap. Intro-teksten nævner
                filmens TALESPROG: pipelinen skriver lyden af på
                det sprog og oversætter derfra til alle andre. */}
            <div className="mt-4 max-w-xl">
              <p className="text-xs uppercase tracking-[0.3em] text-ash">
                {t("subtitlesHeading")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ash/70">
                {t("subtitlesIntro", {
                  language:
                    LOCALE_LANGUAGE_NAMES[film.spokenLanguage] ??
                    film.spokenLanguage,
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.keys(LOCALE_LANGUAGE_NAMES).map((locale) => {
                  const entry = statusByLocale.get(locale);
                  const statusText = !entry
                    ? t("subtitlesMissing")
                    : entry.status === "ready"
                      ? t("subtitlesReady")
                      : entry.status === "failed"
                        ? t("subtitlesFailed")
                        : t("subtitlesProcessing");
                  const badgeClass = !entry
                    ? "border-smoke text-ash/70"
                    : entry.status === "ready"
                      ? "border-champagne/60 text-champagne"
                      : entry.status === "failed"
                        ? "border-red-400/60 text-red-400"
                        : "border-smoke text-ash";
                  return (
                    <span
                      key={locale}
                      title={
                        entry?.error ??
                        LOCALE_LANGUAGE_NAMES[locale] ??
                        locale
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${badgeClass}`}
                    >
                      {locale.toUpperCase()} · {statusText}
                    </span>
                  );
                })}
              </div>
              <StudioSubtitleGenerator
                slug={film.slug}
                hasExisting={subtitleStatuses.length > 0}
              />
            </div>

            {/* Trailer: 90 sekunder af filmen som gratis smagsprøve —
                det er det, gæster ser bag paywallen, og det, der
                vises som video-kort, når filmen deles. */}
            <StudioTrailerGenerator slug={film.slug} status={trailerStatus} />

            {draft && (
              <div className="mt-4 flex items-center gap-4">
                <StudioDeleteFilmButton
                  documentaryId={film.id}
                  videoUrl={film.videoUrl}
                  posterUrl={film.posterUrl}
                  subtitleVttUrls={subtitleVttUrls}
                  trailerUrl={trailerStatus?.trailerUrl}
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