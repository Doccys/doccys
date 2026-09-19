/**
 * Bro mellem afspilleren og delingsknapperne: seerens aktuelle
 * position i filmen (hele sekunder). VideoPlayer skriver ved hvert
 * timeupdate, ShareButtons læser ved klik-tid og sætter ?t= på det
 * delte link — så modtageren lander på det øjeblik, der deles.
 *
 * Modul-scope er bevidst: begge er klient-komponenter på samme
 * watch-side, og en simpel variabel er hele broen — ingen context
 * eller props-kæden fra server-komponenten nødvendig.
 */
let sharedWatchSeconds = 0;

export function setSharedWatchSeconds(seconds: number): void {
  sharedWatchSeconds = Math.max(0, Math.floor(seconds));
}

export function getSharedWatchSeconds(): number {
  return sharedWatchSeconds;
}

/**
 * Fra et delings-link til en afspiller-startposition. Kun gyldige,
 * hele sekunder accepteres (0 og negative = intet søg). Skriv altid
 * dette format: `?t=123` — samme læsemåde som VideoPlayer.
 */
export function seekFromUrlParam(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("t");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 86_400) {
    return null;
  }
  return seconds;
}