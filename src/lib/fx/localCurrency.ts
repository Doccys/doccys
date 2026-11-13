/**
 * Delt valuta-visning: detekterer seerens LOKALE valuta ud fra
 * browserens region og henter dagens USD-middelkurer.
 *
 * USD er Doccys' afregningsvaluta (brugerens beslutning 13/11 —
 * Stripe-priser, payout-satsen $0.30/100 min, ledger, $25-tærsklen) og
 * er det kanoniske tal overalt. Dette modul giver kun en vejledende
 * oversættelse — "≈ €6.50" — så prisen kan læses i seerens egen
 * valuta. Danske seere ser tilsvarende "≈ kr 47" (USD er ikke dansk).
 *
 * Kilde: open.er-api.com med USD-basis (gratis, keyless, daglig
 * middelkurs, CORS: * — kaldes fra browseren, ikke serveren). Kurserne
 * caches i localStorage pr. kalenderdag (én hentning pr. seer pr. dag).
 */

export const FX_STORAGE_KEY = "doccys-fx-usd";

/** landskode (fra browserens locale) → ISO-valuta */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", MX: "MXN", CA: "CAD", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN", UY: "UYU", GB: "GBP", IE: "EUR", DE: "EUR",
  FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR",
  PT: "EUR", GR: "EUR", FI: "EUR", SK: "EUR", SI: "EUR", LT: "EUR",
  LV: "EUR", EE: "EUR", HR: "EUR", SE: "SEK", NO: "NOK", IS: "ISK",
  DK: "DKK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", CH: "CHF",
  AU: "AUD", NZ: "NZD", IN: "INR", PK: "PKR", BD: "BDT", ID: "IDR",
  MY: "MYR", SG: "SGD", TH: "THB", VN: "VND", PH: "PHP", KR: "KRW",
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", TR: "TRY", IL: "ILS",
  AE: "AED", SA: "SAR", QA: "QAR", EG: "EGP", MA: "MAD", TN: "TND",
  DZ: "DZD", ZA: "ZAR", NG: "NGN", KE: "KES", ET: "ETB",
};

/**
 * Detekterer seerens valuta ud fra browserens locale. DK er IKKE længere
 * undtaget (afregningsvalutaen er USD, så danskerne ser en DKK-omregning
 * som alle andre), og ukendte regioner får ingen oversættelse.
 */
export function detectLocalCurrency(): string | null {
  try {
    const localeTag = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new Intl.Locale(localeTag).region?.toUpperCase() ?? null;
    if (!region) return null;
    return COUNTRY_TO_CURRENCY[region] ?? null;
  } catch {
    return null;
  }
}

/** Henter dagens USD-kurser (cache pr. kalenderdag); null ved fejl. */
export async function fetchUsdRates(): Promise<Record<string, number> | null> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = localStorage.getItem(FX_STORAGE_KEY);
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
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    if (data.result !== "success" || !data.rates) return null;
    try {
      localStorage.setItem(
        FX_STORAGE_KEY,
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
