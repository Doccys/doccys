import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { CreatorFilmEarnings, Documentary } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface FilmographyTableProps {
  films: Documentary[];
  /** per-film sete minutter + optjent kr fra creator_indtjening-RPC'en */
  earningsBySlug?: Record<string, CreatorFilmEarnings>;
}

export default async function FilmographyTable({
  films,
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
            <th className="px-5 py-3 text-right">{t("views")}</th>
            <th className="px-5 py-3 text-right">{t("completions")}</th>
            <th className="px-5 py-3 text-right">{t("watchedMinutes")}</th>
            <th className="px-5 py-3 text-right">{t("earnings")}</th>
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
                <td className="px-5 py-4 text-right tabular-nums text-bone">
                  {formatNumber(film.stats.totalViews, locale)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-bone">
                  {formatNumber(film.stats.totalCompletions, locale)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-champagne">
                  {formatNumber(filmEarnings?.watchedMinutes ?? 0, locale)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-bone">
                  {formatCurrency(filmEarnings?.earnedDkk ?? 0, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}