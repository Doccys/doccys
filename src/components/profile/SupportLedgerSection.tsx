import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import type { SupportLedger } from "@/lib/data/support";

interface SupportLedgerSectionProps {
  /** Regnskabet er beregnt på forhånd i profilen — null udelader sektionen */
  ledger: SupportLedger;
}

/**
 * "Din støtte" — seerens minutregnskab i profilen. Totalen viser de
 * afregnede minutter og beløbet der er gået direkte til skaberne;
 * listen bryder det ned pr. skaber (dybeste beløb først). Kun sete
 * minutter, der er valideret af anti-fraud, tæller — regnskabet
 * viser reelle penge, ikke målt tid.
 */
export default async function SupportLedgerSection({
  ledger,
}: SupportLedgerSectionProps) {
  const t = await getTranslations("support");
  const locale = await getLocale();

  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl text-bone">{t("heading")}</h2>
      <p className="mt-2 text-sm text-ash">{t("subtitle")}</p>

      {ledger.creators.length === 0 ? (
        <p className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-8 text-sm leading-relaxed text-ash">
          {t("empty")} {t("emptyHint")}
        </p>
      ) : (
        <>
          <div className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-6">
            <p className="text-xs uppercase tracking-[0.3em] text-ash">
              {t("totalMinutes", {
                minutes: formatNumber(Math.round(ledger.totalSeconds / 60), locale),
              })}
            </p>
            <p className="mt-2 font-display text-4xl text-bone">
              {t("totalAmount", {
                amount: formatCurrency(ledger.totalAmountDkk, locale),
              })}
            </p>
          </div>

          <ul className="mt-5 space-y-3">
            {ledger.creators.map((entry) => (
              <li key={entry.creatorHandle}>
                <Link
                  href={`/creator/${entry.creatorHandle}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-smoke bg-onyx px-5 py-4 transition-colors hover:border-champagne/40"
                >
                  <div>
                    <p className="font-display text-lg text-bone">
                      {entry.creatorName ?? `@${entry.creatorHandle}`}
                    </p>
                    <p className="mt-0.5 text-xs text-ash">
                      {t("creatorFilms", { count: entry.filmCount })}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums text-champagne">
                    {t("entryMeta", {
                      minutes: formatNumber(
                        Math.round(entry.watchedSeconds / 60),
                        locale,
                      ),
                      amount: formatCurrency(entry.amountDkk, locale),
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}