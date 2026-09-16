/**
 * Oversættelse af kontrollerede vocabularer (genrer, lande) fra databasen.
 *
 * Databasen gemmer altid den *danske* værdi (f.eks. 'Klima', 'Island') —
 * det er den kanoniske nøgle. Beskedefilerne har et namespace pr. vocabular
 * (`genres`, `countries`), hvor den danske værdi er selve nøglen. Kender
 * beskederne ikke værdien (ny genre i databasen, ingen oversættelse endnu),
 * vises den rå danske værdi — aldrig en fejl.
 *
 * Hjælperne tager eksplicit `locale` (som alt andet i datalaget — API-routes
 * og ikke-intl-kontekster har intet request-sprog at hente implicit).
 */

type VocabularyNamespace = "genres" | "countries";

function isSupportedLocale(locale: string | undefined): locale is string {
  return (
    locale !== undefined &&
    ["da", "en", "es", "fr", "de", "no", "sv", "fi"].includes(locale)
  );
}

async function vocabulary(
  namespace: VocabularyNamespace,
  locale?: string,
): Promise<Record<string, string>> {
  if (!isSupportedLocale(locale) || locale === "da") {
    return {};
  }
  const messages = (await import(`../../../messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;
  const table = messages[namespace] as Record<string, string> | undefined;
  return table ?? {};
}

async function lookup(
  namespace: VocabularyNamespace,
  value: string,
  locale?: string,
): Promise<string> {
  if (!value) return value;
  const table = await vocabulary(namespace, locale);
  const translated = table[value];
  return typeof translated === "string" && translated.length > 0 ? translated : value;
}

/** Oversæt en liste af genrer ('Klima', 'Portræt', …) til visningssproget. */
export async function localizedGenres(
  genres: readonly string[],
  locale?: string,
): Promise<string[]> {
  return Promise.all(genres.map((genre) => lookup("genres", genre, locale)));
}

/** Oversæt et landenavn ('Island', 'Danmark') til visningssproget. */
export async function localizedCountry(
  country: string,
  locale?: string,
): Promise<string> {
  return lookup("countries", country, locale);
}