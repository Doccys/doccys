"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { detectLocalCurrency, fetchDkkRates } from "@/lib/fx/localCurrency";

interface CurrencyHintProps {
  availableDkk: number;
}

/**
 * Vejledende valutakurs for creatorens LOKALE valuta — kun som
 * orientering. Hovedtallene på siden er altid DKK (optjeningen er
 * defineret som 2 kr pr. 100 min og udbetales i kroner); denne
 * boks oversætter til dagens middelkurs, så en creator i fx
 * Mexico kan læse sin saldo i MXN. Kurserne mærkes tydeligt
 * som ca. — det er information, ikke løfte om et udbetalingsbeløb.
 *
 * Region-detektion + kurskilde ligger i det delte modul
 * (src/lib/fx/localCurrency.ts) — LocalPriceHint genbruger dem til
 * seer-siden af platformen. Kurserne caches i localStorage pr.
 * kalenderdag, da kurserne skifter én gang i døgnet.
 */

export default function CurrencyHint({ availableDkk }: CurrencyHintProps) {
  const t = useTranslations("currencyHint");
  const locale = useLocale();
  const [state, setState] = useState<{ rate: number; currency: string } | null>(
    null,
  );

  useEffect(() => {
    const local = detectLocalCurrency();
    if (!local) return;
    let cancelled = false;
    void (async () => {
      const rates = await fetchDkkRates();
      const rate = rates?.[local];
      if (!cancelled && typeof rate === "number" && rate > 0) {
        setState({ rate, currency: local });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // intet at vise: dansk seer, ukendt region eller fejlende kurskilde
  if (!state) return null;

  const intlTag = `${locale}-DK`;
  const rateText = new Intl.NumberFormat(intlTag, {
    maximumFractionDigits: 2,
  }).format(state.rate);
  const saldoText = new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: 2,
  }).format(availableDkk * state.rate);

  return (
    <div className="mt-3 rounded-xl border border-smoke/70 bg-noir p-5 text-xs leading-relaxed text-ash">
      <p className="uppercase tracking-widest text-ash">{t("title")}</p>
      <p className="mt-2 text-bone/90">
        {t("rate", { rate: rateText, currency: state.currency })}
        {" · "}
        {t("balance", { amount: saldoText })}
      </p>
      <p className="mt-2 text-ash/70">{t("disclaimer")}</p>
    </div>
  );
}