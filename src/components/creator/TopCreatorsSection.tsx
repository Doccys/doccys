import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SectionHeading from "@/components/ui/SectionHeading";
import type { TopCreator } from "@/lib/types";
import { formatNumber } from "@/lib/utils/format";
import { localizedCountry } from "@/lib/i18n/content";

/**
 * Top 10-leaderboard på /creators — rangeret efter gyldige
 * sete minutter de seneste 30 dage (top_creators-RPC'en).
 *
 * Bevidst offentligt: adfærds-aggregater er OK (præcedens:
 * film_faedighedsstats), mens kr forbliver private i studiet.
 * Listen er redaktionel bevisføring — placeringer kan aldrig
 * købes. Tom liste (ingen gyldige minutter i vinduet, fx når
 * alle film er kladder) giver en venlig empty-state, ikke fejl.
 */
export default async function TopCreatorsSection({
  top,
}: {
  top: TopCreator[];
}) {
  const t = await getTranslations("creators");
  const locale = await getLocale();

  const rows = await Promise.all(
    top.map(async (c) => ({
      ...c,
      country: await localizedCountry(c.country, locale),
    })),
  );

  return (
    <section className="mt-16">
      <SectionHeading
        eyebrow={t("topEyebrow")}
        title={t("topHeading")}
        subtitle={t("topIntro")}
      />

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ash">{t("topEmpty")}</p>
      ) : (
        <ol className="mt-8 divide-y divide-smoke/60 overflow-hidden rounded-xl border border-smoke bg-onyx">
          {rows.map((c, i) => (
            <li key={c.handle}>
              <Link
                href={`/creator/${c.handle}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-smoke/40"
              >
                <span
                  className={`w-8 shrink-0 text-center font-display text-xl tabular-nums ${
                    i === 0 ? "text-champagne" : "text-ash"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-bone">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-ash">
                    @{c.handle} · {c.country}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums text-ash">
                  {t("topMinutes", {
                    minutes: formatNumber(c.minutes, locale),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}