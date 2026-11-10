import { getTranslations } from "next-intl/server";
import { localizedGenres } from "@/lib/i18n/content";
import {
  seerTrae,
  SEER_TRAE,
  type ViewerStatus,
} from "@/lib/viewerStatus";
import { formatNumber } from "@/lib/utils/format";

interface ViewerStatusSectionProps {
  locale: string;
  /** Status er beregnet på forhånd i profilen — null udelader sektionen */
  status: ViewerStatus;
}

/**
 * Seer-status i profilen — gamificering af forbruget: titlerne
 * belønner sete minutter, der på pay-per-minut er det samme som penge
 * brugt på platformen. Træ-kortet viser altid vejen til næste trin
 * (også for en helt ny konto — teaseren ER motivationen), og
 * genre-kortet udløses ved 100+ minutter i den mest sete genre.
 *
 * Trin-titlerne hentes DYNAMISK via seerTrae()'s nøgler (tier1-3) —
 * projektet typ'er ikke next-intl strengt, så t(nøgle) er tryg.
 */
export default async function ViewerStatusSection({
  locale,
  status,
}: ViewerStatusSectionProps) {
  const t = await getTranslations("viewerStatus");
  const trin = seerTrae(status.totalMinutes);

  return (
    <section className="mt-16" id="seer-status">
      <h2 className="font-display text-2xl text-bone">{t("heading")}</h2>
      <p className="mt-2 text-sm text-ash">{t("subtitle")}</p>

      <div className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-ash">
          {t("minutesLine", {
            minutes: formatNumber(status.totalMinutes, locale),
          })}
        </p>
        {trin.titelNoegle && (
          <p className="mt-2 font-display text-4xl text-champagne">
            {t(trin.titelNoegle)}
          </p>
        )}
        <p className="mt-2 text-sm text-ash">
          {trin.naesteNoegle !== null && trin.minutterTilNaeste !== null
            ? t("toNextTier", {
                minutes: formatNumber(trin.minutterTilNaeste, locale),
                title: t(trin.naesteNoegle),
              })
            : t("topTierReached")}
        </p>

        {/* Milepæls-badges (brugerens ønske 10/11): optjenes løbende —
            nåede trin i champagne-guld (hårlinjesammengraf med
            plakat-rammerne), u-nåede svage med tærsklen som mål.
            Genre-titlen lænes bagerst som en ekstra "nørd"-
            kategori-badge. */}
        <p className="mt-5 text-xs uppercase tracking-[0.3em] text-ash">
          {t("badgesShelf")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SEER_TRAE.map((et, ix) => {
            const naaet = ix < trin.index;
            return naaet ? (
              <span
                key={et.titelNoegle}
                className="inline-flex items-center gap-2 rounded-full border border-champagne/60 bg-champagne/10 px-4 py-1.5 text-xs font-medium text-champagne"
              >
                {t(et.titelNoegle)}
                <span className="text-[10px] font-normal text-champagne/60">
                  {formatNumber(et.minMinutter, locale)} min
                </span>
              </span>
            ) : (
              <span
                key={et.titelNoegle}
                className="inline-flex items-center gap-2 rounded-full border border-smoke px-4 py-1.5 text-xs text-ash/50"
              >
                {t(et.titelNoegle)}
                <span className="text-[10px] font-normal">
                  {formatNumber(et.minMinutter, locale)} min
                </span>
              </span>
            );
          })}
          {status.genre && (
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne/60 bg-champagne/10 px-4 py-1.5 text-xs font-medium text-champagne">
              {t("genreTitle", {
                genre: (await localizedGenres([status.genre.genre], locale))[0],
              })}
            </span>
          )}
        </div>
      </div>

      {/* Genre-titel: den mest sete genre ved 100+ minutter i den.
          Status-nøglen er dansk kanonisk (FILM_GENRES) og oversættes
          her via genres-namespacet; genreTitle-mønsteret ("{genre}-
          nørd") sørger for sprogets egen sammensætning. */}
      {status.genre && (
        <div className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-6">
          <p className="font-display text-xl text-bone">
            {t("genreTitle", {
              genre: (await localizedGenres([status.genre.genre], locale))[0],
            })}
          </p>
          <p className="mt-1 text-sm text-ash">
            {t("genreSubtitle", {
              minutes: formatNumber(status.genre.minutes, locale),
            })}
          </p>
        </div>
      )}
    </section>
  );
}