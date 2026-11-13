"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { detectLocalCurrency, fetchUsdRates } from "@/lib/fx/localCurrency";

interface LocalPriceHintProps {
  /** Beløbet i USD — det kanoniske tal renderes altid af serveren */
  usd: number;
  /** Style på selve hintet (komponenten renderer ingenting uden kurs) */
  className?: string;
}

/**
 * Vejledende lokal-valuta-oversættelse af et USD-beløb: "(≈ €6.50)".
 *
 * Serveren renderer altid USD — dette er progressive enhancement for
 * seere, hvis lokale valuta afviger: browserens region vælger valutaen
 * (danskerne ser "(≈ kr 47)"), dagens middelkurs hentes klient-side
 * (localStorage-cache pr. dag). Ukendte regioner og fejlende kurskilde
 * renders ingenting — der opstår aldrig et hul i layoutet, og $-tallet
 * står aldrig alene om kurserne fejler.
 */
export default function LocalPriceHint({ usd, className }: LocalPriceHintProps) {
  const locale = useLocale();
  const [state, setState] = useState<{ rate: number; currency: string } | null>(
    null,
  );

  useEffect(() => {
    const currency = detectLocalCurrency();
    if (!currency) return;
    let cancelled = false;
    void (async () => {
      const rates = await fetchUsdRates();
      const rate = rates?.[currency];
      if (!cancelled && typeof rate === "number" && rate > 0) {
        setState({ rate, currency });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const text = new Intl.NumberFormat(`${locale}-US`, {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: 2,
  }).format(usd * state.rate);

  return (
    <span className={className}>
      (≈ {text})
    </span>
  );
}