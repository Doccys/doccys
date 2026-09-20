/**
 * Fast palette af plakat-gradienter til film-uploads.
 *
 * Tailwind v4 genererer klasser fra det, der kan ses i de scannede
 * kildefiler — gradient-strenge, der kun lever i databasen, bliver
 * IKKE genereret (de seedede film virker i dag, fordi deres
 * strengene bogstaveligt står i migrations-filerne). Derfor SKAL
 * paletten leve her som et importeret modul:
 *
 * - /api/films tager palettens standard, når feltet mangler
 *   (tapetvalget er fjernet fra studie-UI'et 20/9 — gradienten er
 *   nu blot et skjult baggrundslag under plakaten).
 *
 * Tilføj nye gradienter her — aldrig direkte i databasen.
 */
export const POSTER_GRADIENTS = [
  "from-[#0f2027] via-[#203a43] to-[#2c5364]",
  "from-[#134e5e] via-[#155e63] to-[#71b280]",
  "from-[#232526] via-[#414345] to-[#6b6d70]",
  "from-[#0b486b] via-[#135058] to-[#1d7891]",
  "from-[#093028] via-[#237a57] to-[#4a9d6b]",
  "from-[#1f1c2c] via-[#4e3a59] to-[#928dab]",
] as const;

export type PosterGradient = (typeof POSTER_GRADIENTS)[number];

export function isPosterGradient(value: string): value is PosterGradient {
  return (POSTER_GRADIENTS as readonly string[]).includes(value);
}