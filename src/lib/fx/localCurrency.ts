/**
 * Delt valuta-visning: detekterer seerens LOKALE valuta ud fra
 * browserens region og henter dagens DKK-middelkurer.
 *
 * DKK er Doccys' afregningsvaluta (Stripe, payout-rater, ledger) og
 * forbliver det kanoniske tal overalt. Dette modul giver kun en
 * vejledende oversættelse til internationale seere — "≈ €0,59" — så
 * prisen kan læses i deres egen valuta.
 *
 * Kilde: open.er-api.com (gratis, keyless, daglig middelkurs,
 * CORS: * — kaldes fra browseren, ikke serveren). Kurserne caches i
 * localStorage pr. kalenderdag (én hentning pr. seer pr. dag).
 */

export const FX_STORAGE_KEY = "doccys-fx-dkk";

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
 * regioner får ingen oversættelse.
 */
export function detectLocalCurrency(): string | null {
  try {
    const localeTag = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new Intl.Locale(localeTag).region?.toUpperCase() ?? null;
    if (!region || region === "DK") return null;
    return COUNTRY_TO_CURRENCY[region] ?? null;
  } catch {
    return null;
  }
}

/** Henter dagens DKK-kurser (cache pr. kalenderdag); null ved fejl. */
export async function fetchDkkRates(): Promise<Record<string, number> | null> {
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
    const res = await fetch("https://open.er-api.com/v6/latest/DKK");
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