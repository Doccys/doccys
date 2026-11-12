import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { localizedGenres } from "@/lib/i18n/content";
import type { ViewerAarbog } from "@/lib/data/viewerAarbog";
import { formatNumber } from "@/lib/utils/format";

interface AarbogSectionProps {
  locale: string;
  aarbog: ViewerAarbog;
}

/**
 * Din årbog — Pioner-gaven (vises FØRST når Pioner-trinnet er nået;
 * profilen styrer tærsklen). Måned-for-måned-søjlerne er ren CSS
 * (intet chart-lib, ingen "use client" — server-renderet, som
 * StudioRetentionChart-præcedensen), og genrer/skabere vises som
 * nummererede lister.
 */
export default async function AarbogSection({
  locale,
  aarbog,
}: AarbogSectionProps) {
  const t = await getTranslations("viewerAarbog");
  const maxMinutes = Math.max(1, ...aarbog.months.map((m) => m.minutes));
  const maanedFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
  });
  // Genre-navne resolves ÉN gang her (én batch, som ViewerStatusSection)
  // — .map(async …) i JSX ville give Promise-elementer, React ikke kan
  // rendere.
  const genreNavne = await localizedGenres(
    aarbog.topGenres.map((g) => g.genre),
    locale,
  );

  return (
    <section className="mt-16" id="aarbog">
      <h2 className="font-display text-2xl text-bone">{t("heading")}</h2>
      <p className="mt-2 text-sm text-ash">{t("subtitle")}</p>

      <div className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-ash">
          {t("totalLine", {
            minutes: formatNumber(aarbog.totalMinutes, locale),
          })}
        </p>

        {/* 12 måneder ældst → nyest; tomme måneder vises med så tynd
            en stub, at rækkefølgen kan aflæses med det samme. */}
        {aarbog.months.some((m) => m.minutes > 0) ? (
          <div className="mt-6 flex items-end gap-1.5" style={{ height: 120 }}>
            {aarbog.months.map((m) => {
              const pct = m.minutes > 0 ? Math.max(4, Math.round((m.minutes / maxMinutes) * 100)) : 2;
              const label = maanedFormat.format(new Date(`${m.key}-01T00:00:00Z`));
              return (
                <div
                  key={m.key}
                  className="flex h-full flex-1 flex-col justify-end"
                  title={`${label} — ${formatNumber(m.minutes, locale)} min`}
                >
                  <div
                    className={
                      m.minutes > 0
                        ? "rounded-t-sm bg-champagne/70"
                        : "rounded-t-sm bg-smoke/40"
                    }
                    style={{ height: `${pct}%` }}
                  />
                  <span className="mt-1 text-center text-[10px] leading-none text-ash/70">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-ash">{t("empty")}</p>
        )}

        {/* Top-listernes ordning kan ikke flakke: datalaget determineret
            (minutter faldende, dansk nøgle stigende ved lige store). */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ash">
              {t("topGenres")}
            </p>
            {aarbog.topGenres.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {aarbog.topGenres.map((g, ix) => (
                  <li
                    key={g.genre}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-bone/90">
                      <span className="text-ash/70">{ix + 1}. </span>
                      {genreNavne[ix]}
                    </span>
                    <span className="shrink-0 text-ash tabular-nums">
                      {formatNumber(g.minutes, locale)} min
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ash">{t("topEmpty")}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ash">
              {t("topCreators")}
            </p>
            {aarbog.topCreators.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {aarbog.topCreators.map((c, ix) => (
                  <li
                    key={c.handle}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <Link
                      href={`/creator/${c.handle}`}
                      className="truncate text-bone/90 transition-colors hover:text-champagne"
                    >
                      <span className="text-ash/70">{ix + 1}. </span>@{c.handle}
                    </Link>
                    <span className="shrink-0 text-ash tabular-nums">
                      {formatNumber(c.minutes, locale)} min
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ash">{t("topEmpty")}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
