import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Documentary } from "@/lib/types";
import { formatDuration } from "@/lib/utils/format";
import { localizedGenres } from "@/lib/i18n/content";

export default async function DocumentaryCard({
  documentary,
  progressRatio,
}: {
  documentary: Documentary;
  /** 0–1 hvis filmen er påbegyndt ("Fortsæt se") — linket genoptager da ved positionen */
  progressRatio?: number;
}) {
  const locale = await getLocale();
  const badgeT = await getTranslations("finishBadge");
  const genres = await localizedGenres(documentary.genres, locale);

  // Genoptagelses-position: seekFromUrlParam kræver et HELTAL > 0,
  // derfor Math.floor + guard — små ratioer (eller 0) linker normalt.
  const resumeSec =
    progressRatio && progressRatio > 0 && documentary.durationSec > 0
      ? Math.floor(progressRatio * documentary.durationSec)
      : 0;
  const href =
    resumeSec > 0
      ? `/watch/${documentary.slug}?t=${resumeSec}`
      : `/watch/${documentary.slug}`;

  return (
    <Link href={href} className="group block">
      <div
        className={`relative aspect-[16/9] overflow-hidden rounded-lg border border-smoke bg-linear-to-br ${documentary.gradient} transition-transform duration-300 group-hover:-translate-y-1`}
      >
        {/* uploadet forsidebillede ligger oveni gradienten (object-cover);
            mangler det, viser gradienten + typografisk vandmærke som før */}
        {documentary.posterUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */
          <img
            src={documentary.posterUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!documentary.posterUrl && (
          <span className="absolute left-3 top-2 select-none font-display text-4xl text-bone/10">
            {documentary.title[0]}
          </span>
        )}
        {/* færdigheds-badge — reelle sessioner, kun ved >= 5 afsluttede
            afspilninger (film_faedighedsstats); pillen viser kun
            procenten, title-attributten forklarer den for hover/skærmlæser */}
        {documentary.finishRate !== null && (
          <span
            title={badgeT("label", { percent: documentary.finishRate })}
            className="absolute right-2 top-2 rounded-full border border-champagne/60 bg-noir/80 px-2 py-0.5 text-[10px] font-medium text-champagne"
          >
            {documentary.finishRate} %
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-noir via-noir/80 to-transparent p-3 pt-8">
          <h3 className="font-display text-base leading-snug text-bone">
            {documentary.title}
          </h3>
          <p className="mt-1 text-xs text-ash">
            {genres.join(" · ")}
          </p>
        </div>
        {/* hvor langt seeren kom (WatchHistoryList-stil) — kun for
            påbegyndte film i "Fortsæt se"-rillen */}
        {progressRatio !== undefined && progressRatio > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-smoke/60">
            <div
              className="h-full bg-champagne"
              style={{
                width: `${Math.min(100, Math.round(progressRatio * 100))}%`,
              }}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-ash">
        <span>{documentary.year}</span>
        <span>{formatDuration(documentary.durationSec)}</span>
      </div>
    </Link>
  );
}