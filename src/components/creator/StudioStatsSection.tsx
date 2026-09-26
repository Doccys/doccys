import { getLocale, getTranslations } from "next-intl/server";
import type { CreatorTal, CreatorTalFilm } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import StudioTidsserieChart from "@/components/creator/StudioTidsserieChart";

/**
 * Studiets "Dine tal"-sektion: indtjeningens bevisføring. Alle tal
 * er REELLE aggregater fra creator_tal-RPC'en — aldrig de seedede
 * pyntetal, der vises på den offentlige profil til feedback-runden.
 *
 * Det bevidste skel, gæstenoten også forklarer: adfærd (afspilninger,
 * unikke seere) tæller alle sessioner, mens minutter og kr KUN
 * kommer fra loggede, gyldige sessioner — dem der kan afregnes.
 * Dermed kan skaberen efterprøve hvert kron-beløb tilbage til
 * gyldige minutter × filmens sats.
 */
export default async function StudioStatsSection({
  tal,
}: {
  tal: CreatorTal;
}) {
  const t = await getTranslations("creatorStudio");
  const locale = await getLocale();

  // 30-dagssummer regnes på serien (DK-døgn), totalerne er altid
  const kr30 = tal.daily.reduce((sum, d) => sum + d.dkk, 0);
  const min30 = tal.daily.reduce((sum, d) => sum + d.minutes, 0);
  const plays = tal.films.reduce((sum, f) => sum + f.plays, 0);

  // Intet data endnu → venlig empty-state i stedet for nuller
  if (plays === 0 && tal.totalDkk === 0 && tal.totalMinutes === 0) {
    return (
      <section className="mt-16">
        <h2 className="font-display text-2xl text-bone">{t("talHeading")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-ash">{t("talEmpty")}</p>
      </section>
    );
  }

  // Intro-satsen: filmenes sats (max, hvis de en dag varierer)
  const maxRate = tal.films.length
    ? Math.max(...tal.films.map((f) => f.rateDkk))
    : 2;

  const deviceRows = [
    { label: t("talDeviceMobile"), count: tal.seere.devices.mobile },
    { label: t("talDeviceTablet"), count: tal.seere.devices.tablet },
    { label: t("talDeviceDesktop"), count: tal.seere.devices.desktop },
    { label: t("talDeviceUnknown"), count: tal.seere.devices.unknown },
  ];
  const deviceMax = Math.max(1, ...deviceRows.map((r) => r.count));
  const langMax = Math.max(1, ...tal.seere.languages.map((l) => l.count));

  const summary = [
    { label: t("talSummary30dKr"), value: formatCurrency(kr30, locale) },
    {
      label: t("talSummary30dMin"),
      value: `${formatNumber(min30, locale)} min`,
    },
    { label: t("talSummaryTotalKr"), value: formatCurrency(tal.totalDkk, locale) },
    {
      label: t("talSummaryTotalMin"),
      value: `${formatNumber(tal.totalMinutes, locale)} min`,
    },
  ];

  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl text-bone">{t("talHeading")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash">
        {t("talIntro", { rate: formatCurrency(maxRate, locale) })}
      </p>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ash/80">
        {t("talGuestNote")}
      </p>

      {/* Sammendrag — fire tal, EarningsPanel-grid-stil */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-smoke bg-onyx p-5"
          >
            <p className="text-xs uppercase tracking-widest text-ash">
              {card.label}
            </p>
            <p className="mt-2 font-display text-2xl tabular-nums text-bone">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* 30-dages kurven */}
      <div className="mt-10">
        <h3 className="text-sm font-medium text-bone">
          {t("talChartHeading")}
        </h3>
        <div className="mt-3 max-w-2xl">
          <StudioTidsserieChart daily={tal.daily} />
        </div>
      </div>

      {/* Seer-opdeling — håndbyggede champagne-søjle-rækker */}
      <div className="mt-10">
        <h3 className="text-sm font-medium text-bone">
          {t("talSeereHeading")}
        </h3>
        <div className="mt-3 grid max-w-2xl gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-ash">
              {t("talLanguage")}
            </p>
            <ul className="mt-3 space-y-2">
              {tal.seere.languages.length === 0 && (
                <li className="text-sm text-ash">{t("talNoSessions")}</li>
              )}
              {tal.seere.languages.map((lang) => (
                <li key={lang.name} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-ash">
                    {lang.name}
                  </span>
                  <span className="h-2.5 flex-1 rounded-full bg-smoke">
                    <span
                      className="block h-2.5 rounded-full bg-champagne/80"
                      style={{ width: `${(lang.count / langMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ash">
                    {formatNumber(lang.count, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-ash">
              {t("talDevice")}
            </p>
            <ul className="mt-3 space-y-2">
              {deviceRows.map((row) => (
                <li key={row.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-ash">
                    {row.label}
                  </span>
                  <span className="h-2.5 flex-1 rounded-full bg-smoke">
                    <span
                      className="block h-2.5 rounded-full bg-champagne/80"
                      style={{ width: `${(row.count / deviceMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ash">
                    {formatNumber(row.count, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Pr. film — bevisføringen: gyldige minutter × sats = kr */}
      <div className="mt-10">
        <h3 className="text-sm font-medium text-bone">{t("talFilmHeading")}</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-smoke bg-onyx">
          <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-smoke text-xs uppercase tracking-widest text-ash">
                <th className="px-4 py-3 font-medium">{t("talThFilm")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThViews")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThMinutes")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThRate")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThEarnings")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThFinish")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThComments")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("talThLikes")}</th>
              </tr>
            </thead>
            <tbody>
              {tal.films.map((film) => (
                <FilmRow
                  key={film.slug}
                  film={film}
                  locale={locale}
                  draftLabel={t("statusDraft")}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FilmRow({
  film,
  locale,
  draftLabel,
}: {
  film: CreatorTalFilm;
  locale: string;
  draftLabel: string;
}) {
  return (
    <tr className="border-b border-smoke/60 last:border-0">
      <td className="px-4 py-3">
        <span className="font-medium text-bone">{film.title}</span>
        {film.status === "draft" && (
          <span className="ml-2 text-xs text-ash/70">({draftLabel})</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-ash">
        {formatNumber(film.plays, locale)}
      </td>
      <td className="px-4 py-3 text-right text-ash">
        {formatNumber(film.validMinutes, locale)}
      </td>
      <td className="px-4 py-3 text-right text-ash">
        {formatCurrency(film.rateDkk, locale)}
      </td>
      <td className="px-4 py-3 text-right font-medium text-champagne">
        {formatCurrency(film.earnedDkk, locale)}
      </td>
      <td className="px-4 py-3 text-right text-ash">{film.finishPct} %</td>
      <td className="px-4 py-3 text-right text-ash">
        {formatNumber(film.comments, locale)}
      </td>
      <td className="px-4 py-3 text-right text-ash">
        {formatNumber(film.likes, locale)}
      </td>
    </tr>
  );
}