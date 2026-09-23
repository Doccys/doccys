import { defineRouting } from "next-intl/routing";

/**
 * Doccys' sprog-konfiguration. URL'erne er altid sprog-prefikset,
 * f.eks. /da/watch/... eller /ja/watch/... — dansk er standardsprog.
 *
 * NB: hver locale SKAL have en messages/<locale>.json (request.ts
 * importerer den dynamisk) — udvid aldrig denne liste uden at filen
 * findes først, ellers crasher appen for det nye sprog.
 */
export const routing = defineRouting({
  locales: [
    "da",
    "en",
    "es",
    "fr",
    "de",
    "no",
    "sv",
    "fi",
    "ja",
    "zh",
    "it",
    "pt",
    "hi",
  ],
  defaultLocale: "da",
});

export type Locale = (typeof routing.locales)[number];