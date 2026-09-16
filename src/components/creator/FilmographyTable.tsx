import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Documentary } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

export default async function FilmographyTable({ films }: { films: Documentary[] }) {
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
            <th className="px-5 py-3 text-right">{t("valid")}</th>
            <th className="px-5 py-3 text-right">{t("payout")}</th>
          </tr>
        </thead>
        <tbody>
          {films.map((film) => {
            const earnings = film.stats.validCompletions * film.stats.payoutRateDkk;
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
                  {formatNumber(film.stats.validCompletions, locale)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-bone">
                  {formatCurrency(earnings, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}