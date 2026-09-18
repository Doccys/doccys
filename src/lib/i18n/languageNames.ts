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