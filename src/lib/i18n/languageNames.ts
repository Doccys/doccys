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
 * Platformens 13 sprog — ÉN kilde til sandhed for:
 * - undertekst-pipelinen (én VTT pr. sprog, film_subtitles-rækker)
 * - talesprog-vælgeren i upload-formularen
 * - sprog-badgene i studiet
 *
 * Skal ALTID matche check-constrainten på documentaries.spoken_language
 * og film_subtitles.locale i migrationerne (20260923_global_sprog.sql)
 * — udvidelse af listen er et bevidst trin (migration + dette modul),
 * ikke en tilfældighed. Dansk står først: default talesprog og
 * CC-fallback.
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
  "ja",
  "zh",
  "it",
  "pt",
  "hi",
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
  ja: "日本語",
  zh: "中文",
  it: "Italiano",
  pt: "Português",
  hi: "हिन्दी",
};

/**
 * Oversættelses-mål pr. sprogkode, med eksplicit variant der hvor det
 * betyder noget for undertekst-pipelinen: "português" alene kunne give
 * europæisk portugisisk, og kinesisk SKAL være forenklet. Dansk ordlyd,
 * fordi undertekst-prompts er danske. Display-navne forbliver de
 * egne navne ovenfor — hintet bruges kun mod GPT.
 */
export const TRANSLATION_LANGUAGE_HINTS: Record<string, string> = {
  da: "dansk",
  en: "engelsk",
  de: "tysk",
  es: "spansk",
  fr: "fransk",
  fi: "finsk",
  no: "norsk",
  sv: "svensk",
  ja: "japansk",
  zh: "forenklet kinesisk (简体中文, ikke traditionelle tegn)",
  it: "italiensk",
  pt: "brasiliansk portugisisk",
  hi: "hindi",
};