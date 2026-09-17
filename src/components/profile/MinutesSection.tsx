import { getTranslations } from "next-intl/server";
import PackPurchase from "@/components/profile/PackPurchase";
import ReferralCard from "@/components/profile/ReferralCard";
import { formatNumber } from "@/lib/utils/format";

interface MinutesSectionProps {
  locale: string;
  /** saldo i sekunder — negativ ved multi-tab-forbrug */
  balanceSeconds: number;
  /** brugerens henvisningskode — null hvis den ikke kunne oprettes */
  referralCode: string | null;
  /** true når brugeren er redirectet tilbage fra et gennemført køb */
  purchaseSuccess: boolean;
}

/**
 * Minut-saldo-sektionen i profilen (erstatter de gamle
 * abonnements-kort). Viser saldoen (kilde: append-only
 * credit_ledger via saldo_sekunder-RPC), de tre pakker og
 * affiliate-kortet.
 */
export default async function MinutesSection({
  locale,
  balanceSeconds,
  referralCode,
  purchaseSuccess,
}: MinutesSectionProps) {
  const t = await getTranslations("minutes");

  // Negative saldi vises som 0 (saldoen er brugt op — nye film
  // blokeres), men tal-præcisionen beholdes nedadtil i UI-teksten
  const displayMinutes = Math.max(Math.floor(balanceSeconds / 60), 0);

  return (
    <section className="mt-12" id="minutter">
      <h2 className="font-display text-2xl text-bone">{t("heading")}</h2>
      {purchaseSuccess && (
        <p className="mt-4 rounded-xl border border-champagne/50 bg-champagne/10 px-6 py-4 text-sm leading-relaxed text-champagne">
          {t("purchaseSuccess")}
        </p>
      )}
      <div className="mt-5 rounded-xl border border-smoke bg-onyx px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-ash">
          {t("balanceLabel")}
        </p>
        <p className="mt-2 font-display text-4xl text-bone">
          {t("balanceValue", {
            minutes: formatNumber(displayMinutes, locale),
          })}
        </p>
      </div>
      <div className="mt-5">
        <PackPurchase locale={locale} />
      </div>
      <div className="mt-5">
        {referralCode ? (
          <ReferralCard code={referralCode} />
        ) : (
          <p className="rounded-xl border border-smoke bg-onyx px-6 py-6 text-sm leading-relaxed text-ash">
            {t("referralUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}