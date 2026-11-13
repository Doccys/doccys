/**
 * Formateringshjælpere. `locale` er valgfri og forventes et Doccys-sprog
 * ("da", "en", …). Valutaen er USD overalt (brugerens beslutning 13/
 * 11) — beløb formateres "$X" med sprogets egen decimal-notation.
 */

function intlLocale(locale?: string): string {
  return locale ? `${locale}-DK` : "da-DK";
}

export function formatDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.round((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}t ${minutes}min`;
  return `${minutes}min`;
}

export function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatCurrency(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale ? `${locale}-US` : "en-US", {
    style: "currency",
    // USD er Doccys' ene afregningsvaluta (brugerens beslutning 13/
    // 11) — beløbene er defineret, gemt og udbetalt i USD, og der
    // omregnes aldrig ("$6.99"); en vejledende lokalvaluta-omregning
    // klarer LocalPriceHint/CurrencyHint oveni.
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  }).format(value);
}

export function formatDate(timestampMs: number, locale?: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(
    new Date(timestampMs),
  );
}

/**
 * Sekunder → ISO 8601-varighed (PT1H23M45S), som schema.org
 * VideoObject.duration forventer. Ingen decimaler: schema-standarden
 * tillader dem teknisk, men heltalsekunder er det sikre kompatible.
 */
export function toIsoDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  let iso = "PT";
  if (hours > 0) iso += `${hours}H`;
  if (minutes > 0) iso += `${minutes}M`;
  if (seconds > 0 || iso === "PT") iso += `${seconds}S`;
  return iso;
}