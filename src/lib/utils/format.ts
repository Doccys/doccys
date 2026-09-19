/**
 * Formateringshjælpere. `locale` er valgfri og forventes et Doccys-sprog
 * ("da", "en", …) — der formateres da i `<sprog>-DK`, så beløb stadig
 * vises i kroner. Udelades locale, bruges dansk (standardssproget).
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
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "DKK",
    // Beløbet er ALTID DKK — der omregnes aldrig til lokal valuta
    // (optjeningen er defineret og udbetales i kroner; en omregnet
    // visning ville aldrig matche udbetalingen). Kun dansk bruger
    // det native "kr." — alle andre sprog ser ISO-koden DKK, så en
    // svensk/norsk seer ikke forveksler den med SEK/NOK.
    currencyDisplay: locale === "da" ? "symbol" : "code",
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