/**
 * Sprogenes EGET navn — bruges til <track label> i afspilleren og
 * sprog-badges i studiet.
 *
 * Bevidst uden i18n-maskine: en seer skal altid se sit sprogs navn
 * som det staves på sproget, uanset appens locale (samme konvention
 * som Netflix/YouTube's CC-menu). Modulet er ren data med ingen
 * imports, så det er sikkert at bruge fra både klient- og
 * server-komponenter.
 */

/**
 * Platformens 8 sprog — ÉN kilde til sandhed for:
 * - undertekst-pipelinen (én VTT pr. sprog, film_subtitles-rækker)
 * - talesprog-vælgeren i upload-formularen
 * - sprog-badgene i studiet
 *
 * Skal ALTID matche check-constrainten på documentaries.spoken_language
 * og film_subtitles.locale i migrationerne — udvidelse af listen er et
 * bevidst trin (migration + dette modul), ikke en tilfældighed.
 * Dansk står først: default talesprog og CC-fallback.
 */
export const PLATFORM_LOCALES = [
  "da",
  "en",
  "de",
  "es",
  "fr",
  "fi",
  "no",
  "sv",
] as const;

export type PlatformLocale = (typeof PLATFORM_LOCALES)[number];

/** Er `value` ét af platformens sprog? (type-guard til API-validering) */
export function isPlatformLocale(value: unknown): value is PlatformLocale {
  return (
    typeof value === "string" &&
    (PLATFORM_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * sprogene → sprogenes egne navn. Løst tastet (Record<string, string>)
 * med vilje: opslags-stederne (badges, <track label>, talesprog i
 * studiet) arbejder med runtime-strenge fra databasen — ukendte
 * koder falder pænt tilbage til koden selv. Typesikkerheden på de
 * GYLDIGE koder ligger i isPlatformLocale/PLATFORM_LOCALES.
 */
export const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  da: "Dansk",
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  fi: "Suomi",
  no: "Norsk",
  sv: "Svenska",
};