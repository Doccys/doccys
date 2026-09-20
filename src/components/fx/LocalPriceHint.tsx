"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { detectLocalCurrency, fetchDkkRates } from "@/lib/fx/localCurrency";

interface LocalPriceHintProps {
  /** Beløbet i DKK — det kanoniske tal renderes altid af serveren */
  dkk: number;
  /** Style på selve hintet (komponenten renderer ingenting uden kurs) */
  className?: string;
}

/**
 * Vejledende lokal-valuta-oversættelse af et DKK-beløb: "(≈ €0,59)".
 *
 * Serveren renderer altid DKK — dette er progressive enhancement for
 * internationale seere: browserens region vælger valutaen, dagens
 * middelkurs hentes klient-side (localStorage-cache pr. dag). Danske
 * seere, ukendte regioner og fejlende kurskilde renderet ingenting —
 * der opstår aldrig et hul i layoutet, og DKK-tallet står aldrig
 * alene om kurserne fejler.
 */
export default function LocalPriceHint({ dkk, className }: LocalPriceHintProps) {
  const locale = useLocale();
  const [state, setState] = useState<{ rate: number; currency: string } | null>(
    null,
  );

  useEffect(() => {
    const currency = detectLocalCurrency();
    if (!currency) return;
    let cancelled = false;
    void (async () => {
      const rates = await fetchDkkRates();
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

  const text = new Intl.NumberFormat(`${locale}-DK`, {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: 2,
  }).format(dkk * state.rate);

  return (
    <span className={className}>
      (≈ {text})
    </span>
  );
}