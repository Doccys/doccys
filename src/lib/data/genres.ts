/**
 * Kanonisk genre-vokabular til film-uploads.
 *
 * Databasen gemmer altid den *danske* værdi som canonical nøgle
 * (jf. src/lib/i18n/content.ts) — besgedefilerne oversætter den
 * samme nøgle i `genres`-namespacet. Nye genrer tilføjes her OG
 * i alle messages-filers `genres`-namespace.
 */
export const FILM_GENRES = [
  "Klima",
  "Portræt",
  "Kunst",
  "Historie",
  "Byrum",
  "Fællesskab",
  "Natur",
  "Eksperimentel",
  "Teknologi",
  "Kultur",
  "Mad",
  "Musik",
  "Sand krim",
  "Rejse",
  "Videnskab",
  "Sport",
  "Samfund",
] as const;

export type FilmGenre = (typeof FILM_GENRES)[number];

export function isFilmGenre(value: string): value is FilmGenre {
  return (FILM_GENRES as readonly string[]).includes(value);
}