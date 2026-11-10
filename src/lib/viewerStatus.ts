/**
 * Ren træ-logik til seer-status (ingen DB-import). Træ-tabellen og
 * beregningen holdes her, så tærsklerne kun redigeres ét sted —
 * både datalaget (getViewerStatus) og profilkortet deler kilden.
 */

/** Ét trin i seer-status. titelNoegle er en nøgle i
 * viewerStatus-namespacet i messages-filerne. */
interface SeerTrin {
  /** samlede sete minutter før trinet nås */
  minMinutter: number;
  titelNoegle: string;
}

/** Trinene i stigende rækkefølge — titlerne: Opdager / Nysgerrig /
 *  Pioner / Legende. Tier 0 (Opdager) kræver 0 minutter: titlen er
 *  brugerens FRA START (brugerens ønske 10/11) — badges-skålen har
 *  aldrig en tom række, og profilens titellinje er aldrig skjult. */
export const SEER_TRAE: readonly SeerTrin[] = [
  { minMinutter: 0, titelNoegle: "tier0" },
  { minMinutter: 100, titelNoegle: "tier1" },
  { minMinutter: 1000, titelNoegle: "tier2" },
  { minMinutter: 10000, titelNoegle: "tier3" },
];

/** Minutter i genren, før genre-titlen vises (fx "Natur-nørd"). */
export const GENRE_TITEL_MIN_MINUTTER = 100;

/** Mest sete genre — genre er den DANSKE kanoniske nøgle (FILM_GENRES),
 * som først lokaliseres i præsentationslaget. */
export interface ViewerGenreStatus {
  genre: string;
  minutes: number;
}

/** Seerens status — beregnet af getViewerStatus i datalaget. */
export interface ViewerStatus {
  totalMinutes: number;
  /** antal NÅEDE trin: 0 = under første trin, 1–3 = trins-indeks */
  tierIndex: number;
  /** null når genre-grænsen ikke er nået endnu */
  genre: ViewerGenreStatus | null;
}

/** Resultat af seerTrae() — trin-titel og vejen til det næste. */
export interface SeerTraeResult {
  /** antal nåede trin (0–3), spejler ViewerStatus.tierIndex */
  index: number;
  /** titlen på det SENESTE nåede trin — null under første trin */
  titelNoegle: string | null;
  /** titlen på det NÆSTE trin — null ved øverste trin */
  naesteNoegle: string | null;
  /** minutter til næste trin — motivationen; null ved øverste trin */
  minutterTilNaeste: number | null;
}

/**
 * Find seerens trin ud fra samlede sete minutter. minutterTilNaeste
 * er motivationen: "660 minutter til at blive Pioner" — kortet viser
 * straks målet, også for en helt ny konto (0 min → 100 min til Nysgerrig).
 */
export function seerTrae(totalMinutes: number): SeerTraeResult {
  let naaet = 0;
  while (
    naaet < SEER_TRAE.length &&
    totalMinutes >= SEER_TRAE[naaet].minMinutter
  ) {
    naaet += 1;
  }
  const naeste = SEER_TRAE[naaet]; // undefined ved øverste trin
  return {
    index: naaet,
    titelNoegle: naaet > 0 ? SEER_TRAE[naaet - 1].titelNoegle : null,
    naesteNoegle: naeste ? naeste.titelNoegle : null,
    minutterTilNaeste: naeste
      ? naeste.minMinutter - totalMinutes
      : null,
  };
}