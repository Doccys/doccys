"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

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
 * Kilde: open.er-api.com (gratis, keyless, daglig middelkurs,
 * CORS: * — kaldes fra browseren, ikke serveren). Caches i
 * localStorage pr. kalenderdag, da kurserne skifter én gang i døgnet.
 */

const STORAGE_KEY = "doccys-fx-dkk";

/** landskode (fra browserens locale) → ISO-valuta */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", MX: "MXN", CA: "CAD", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN", UY: "UYU", GB: "GBP", IE: "EUR", DE: "EUR",
  FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR",
  PT: "EUR", GR: "EUR", FI: "EUR", SK: "EUR", SI: "EUR", LT: "EUR",
  LV: "EUR", EE: "EUR", HR: "EUR", SE: "SEK", NO: "NOK", IS: "ISK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", CH: "CHF",
  AU: "AUD", NZ: "NZD", IN: "INR", PK: "PKR", BD: "BDT", ID: "IDR",
  MY: "MYR", SG: "SGD", TH: "THB", VN: "VND", PH: "PHP", KR: "KRW",
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", TR: "TRY", IL: "ILS",
  AE: "AED", SA: "SAR", QA: "QAR", EG: "EGP", MA: "MAD", TN: "TND",
  DZ: "DZD", ZA: "ZAR", NG: "NGN", KE: "KES", ET: "ETB",
};

/**
 * Detekterer seerens valuta ud fra browserens locale. DK er undtaget
 * — der er intet at omregne (DKK ER den lokale valuta), og ukendte
 * regioner viser slet ingen boks.
 */
function detectCurrency(): string | null {
  try {
    const localeTag = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new Intl.Locale(localeTag).region?.toUpperCase() ?? null;
    if (!region || region === "DK") return null;
    return COUNTRY_TO_CURRENCY[region] ?? null;
  } catch {
    return null;
  }
}

async function fetchRates(): Promise<Record<string, number> | null> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        date: string;
        rates: Record<string, number>;
      };
      if (parsed.date === today) return parsed.rates;
    }
  } catch {
    // storage kan være blokeret (private vinduer) — fald igennem til fetch
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/DKK");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    if (data.result !== "success" || !data.rates) return null;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ date: today, rates: data.rates }),
      );
    } catch {
      // caching er optional — svaret virker uden
    }
    return data.rates;
  } catch {
    return null;
  }
}

export default function CurrencyHint({ availableDkk }: CurrencyHintProps) {
  const t = useTranslations("currencyHint");
  const locale = useLocale();
  const [state, setState] = useState<{ rate: number; currency: string } | null>(
    null,
  );

  useEffect(() => {
    const local = detectCurrency();
    if (!local) return;
    let cancelled = false;
    void (async () => {
      const rates = await fetchRates();
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