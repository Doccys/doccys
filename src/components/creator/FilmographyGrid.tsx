import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { CreatorFilmEarnings, Documentary } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface FilmographyGridProps {
  films: Documentary[];
  /** true når den besøgende er creatorens ejer — ellers skjules ALLE tal */
  isOwner: boolean;
  /**
   * per-film sete minutter + optjent kr fra creator_indtjening-RPC'en.
   * Gives kun med på creatorens egen side (isOwner) — udefra er
   * tallene skjult.
   */
  earningsBySlug?: Record<string, CreatorFilmEarnings>;
}

/**
 * Filmografien som små poster-kort (gradient eller uploadet
 * forsidebillede) der linker direkte til filmen — samme udtryk som
 * DocumentaryCard, bare mere kompakt. Ejeren får sine private tal
 * (visninger/færdigsete/sete min./kr.) under hvert kort; gæster
 * ser kun filmen og året.
 */
export default async function FilmographyGrid({
  films,
  isOwner,
  earningsBySlug,
}: FilmographyGridProps) {
  const t = await getTranslations("filmography");
  const locale = await getLocale();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {films.map((film) => {
        const filmEarnings = earningsBySlug?.[film.slug];
        return (
          <Link key={film.id} href={`/watch/${film.slug}`} className="group block">
            <div
              className={`relative aspect-[16/9] overflow-hidden rounded-lg border border-smoke bg-linear-to-br ${film.gradient} transition-transform duration-300 group-hover:-translate-y-1`}
            >
              {/* uploadet forsidebillede ligger oveni gradienten
                  (object-cover); mangler det, viser gradienten +
                  typografisk vandmærke som i DocumentaryCard */}
              {film.posterUrl && (
                /* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */
                <img
                  src={film.posterUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {!film.posterUrl && (
                <span className="absolute left-3 top-2 select-none font-display text-3xl text-bone/10">
                  {film.title[0]}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-noir via-noir/80 to-transparent p-2.5 pt-6">
                <h3 className="font-display text-sm leading-snug text-bone">
                  {film.title}
                </h3>
              </div>
            </div>
            <p className="mt-2 text-xs text-ash">{film.year}</p>
            {isOwner && (
              <p className="mt-1 text-xs tabular-nums text-ash">
                {formatNumber(film.stats.totalViews, locale)} {t("views")} ·{" "}
                {formatNumber(film.stats.totalCompletions, locale)}{" "}
                {t("completions")}
              </p>
            )}
            {isOwner && (
              <p className="text-xs tabular-nums text-champagne">
                {formatNumber(filmEarnings?.watchedMinutes ?? 0, locale)}{" "}
                {t("watchedMinutes")} ·{" "}
                {formatCurrency(filmEarnings?.earnedDkk ?? 0, locale)}{" "}
                {t("earnings")}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}