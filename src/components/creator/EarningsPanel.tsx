import { getLocale, getTranslations } from "next-intl/server";
import type { CreatorEarnings } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

/**
 * Viser skaberens indtjening under minut-modellen: 2 kr pr. 100
 * gyldigt sete minutter (kun loggede sessioner med verdict 'valid').
 * Tilgængelig saldo udbetales manuelt af redaktionen, når den
 * når 150 kr — optjent/udbetalt/tilgængelig kommer atomisk fra
 * creator_indtjening-RPC'en (security definer: kun aggregater,
 * ingen persondata).
 */
export default async function EarningsPanel({
  earnings,
}: {
  earnings: CreatorEarnings;
}) {
  const t = await getTranslations("earningsPanel");
  const locale = await getLocale();

  return (
    <div className="rounded-xl border border-champagne/30 bg-linear-to-br from-onyx to-noir p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-champagne">
        {t("eyebrow")}
      </p>
      <p className="mt-3 font-display text-5xl text-bone">
        {formatCurrency(earnings.availableDkk, locale)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ash">
        {t("explainer", { rate: t("rate") })}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("earned")}</p>
          <p className="mt-1 text-xl tabular-nums text-bone">
            {formatCurrency(earnings.earnedDkk, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("paidOut")}</p>
          <p className="mt-1 text-xl tabular-nums text-bone">
            {formatCurrency(earnings.paidDkk, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-ash">{t("watchedMinutes")}</p>
          <p className="mt-1 text-xl tabular-nums text-bone">
            {formatNumber(earnings.validWatchedMinutes, locale)}
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-ash">{t("threshold")}</p>
    </div>
  );
}