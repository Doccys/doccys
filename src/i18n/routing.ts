import { defineRouting } from "next-intl/routing";

/**
 * Doccys' sprog-konfiguration. URL'erne er altid sprog-prefikset,
 * f.eks. /da/watch/... eller /en/watch/... — dansk er standardsprog.
 */
export const routing = defineRouting({
  locales: ["da", "en", "es", "fr", "de", "no", "sv", "fi"],
  defaultLocale: "da",
});

export type Locale = (typeof routing.locales)[number];