import { getLocale, getTranslations } from "next-intl/server";
import type { CreatorStats } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

/**
 * Viser skaberens indtjening under pay-per-completion:
 * kun *validerede* færdigsetninger udbetales — det er her
 * anti-fraud-systemet og forretningsmodellen mødes.
 */
export default async function EarningsPanel({ stats }: { stats: CreatorStats }) {
  const t = await getTranslations("earningsPanel");
  const locale = await getLocale();
  const rejected = stats.totalCompletions - stats.validCompletions;
  const rejectionRate =
    stats.totalCompletions > 0
      ? (rejected / stats.totalCompletions) * 100
      : 0;

  return (
    <div className="rounded-xl border border-champagne/30 bg-linear-to-br from-onyx to-noir p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-champagne">
        {t("eyebrow")}
      </p>
      <p className="mt-3 font-display text-5xl text-bone">
        {formatCurrency(stats.totalEarningsDkk, locale)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ash">{t("explainer")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("validCompletions")}</p>
          <p className="mt-1 text-xl tabular-nums text-bone">
            {formatNumber(stats.validCompletions, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("rejected")}</p>
          <p className="mt-1 text-xl tabular-nums text-bone">
            {formatNumber(rejected, locale)}{" "}
            <span className="text-sm text-ash">({rejectionRate.toFixed(1)}%)</span>
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("payout")}</p>
          <p className="mt-1 text-xl tabular-nums text-champagne">
            {formatCurrency(stats.totalEarningsDkk, locale)}
          </p>
        </div>
      </div>
    </div>
  );
}