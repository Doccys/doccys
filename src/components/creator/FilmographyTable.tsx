import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { CreatorFilmEarnings, Documentary } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface FilmographyTableProps {
  films: Documentary[];
  /** true når den besøgende er creatorens ejer — ellers skjules ALLE tal */
  isOwner: boolean;
  /**
   * per-film sete minutter + optjent kr fra creator_indtjening-RPC'en.
   * Gives kun med på creatorens egen side (isOwner) — udefra er
   * kolonnerne skjult.
   */
  earningsBySlug?: Record<string, CreatorFilmEarnings>;
}

export default async function FilmographyTable({
  films,
  isOwner,
  earningsBySlug,
}: FilmographyTableProps) {
  const t = await getTranslations("filmography");
  const locale = await getLocale();

  return (
    <div className="overflow-x-auto rounded-xl border border-smoke">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-onyx text-xs uppercase tracking-widest text-ash">
          <tr>
            <th className="px-5 py-3">{t("film")}</th>
            <th className="px-5 py-3">{t("year")}</th>
            {isOwner && (
              <th className="px-5 py-3 text-right">{t("views")}</th>
            )}
            {isOwner && (
              <th className="px-5 py-3 text-right">{t("completions")}</th>
            )}
            {isOwner && (
              <th className="px-5 py-3 text-right">{t("watchedMinutes")}</th>
            )}
            {isOwner && (
              <th className="px-5 py-3 text-right">{t("earnings")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {films.map((film) => {
            const filmEarnings = earningsBySlug?.[film.slug];
            return (
              <tr
                key={film.id}
                className="border-t border-smoke/60 transition-colors hover:bg-onyx/60"
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/watch/${film.slug}`}
                    className="font-display text-base text-bone hover:text-champagne"
                  >
                    {film.title}
                  </Link>
                </td>
                <td className="px-5 py-4 text-ash">{film.year}</td>
                {isOwner && (
                  <td className="px-5 py-4 text-right tabular-nums text-bone">
                    {formatNumber(film.stats.totalViews, locale)}
                  </td>
                )}
                {isOwner && (
                  <td className="px-5 py-4 text-right tabular-nums text-bone">
                    {formatNumber(film.stats.totalCompletions, locale)}
                  </td>
                )}
                {isOwner && (
                  <td className="px-5 py-4 text-right tabular-nums text-champagne">
                    {formatNumber(filmEarnings?.watchedMinutes ?? 0, locale)}
                  </td>
                )}
                {isOwner && (
                  <td className="px-5 py-4 text-right tabular-nums text-bone">
                    {formatCurrency(filmEarnings?.earnedDkk ?? 0, locale)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}