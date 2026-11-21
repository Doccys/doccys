/**
 * Batteri-læsning (Battery Status API) til studiets advarsel.
 *
 * SAGEN (brugerens spørgsmål 21/11): en fuld film-upload + de på-
 * krævede pipeline-runder (undertekster ×13 sprog og traileren —
 * publiceringskravet) tager minutter ad gangen på telefonen. Lavt
 * batteri + systemets strømbesparelse dræber både skærm-vaagn-låsen
 * og selve uploaden. Studiet viser derfor en ADVARSEL (ikken en
 * spærring) når batteriet er lavt og enheden ikke lader.
 *
 * Graceful: API'en findes ikke (iOS Safari leverer den af privatlivs-
 * hensyn — ALDI iPhones), kaldet fejler, eller siden er server-rendered
 * → null, og komponenten viser ingenting. Ingen skøn uden måling.
 */

interface BatteriInfo {
  /** 0.0–1.0 */
  level: number;
  /** Lader enheden lige nu? */
  charging: boolean;
}

interface BatteriManager extends EventTarget {
  level: number;
  charging: boolean;
}

type BatteriNavigator = Navigator & {
  getBattery?: () => Promise<BatteriManager>;
};

/** Advar når under 40 % og ikke lader (brugerens sikre margin 21/11 —
 *  nok plads til den fulde arbejdsgang: upload → undertekster → trailer). */
export const BATTERI_ADVARSGRAENSE = 0.4;

/** Batteri-niveau + lader-status, eller null når API'en mangler/fejler. */
export async function laesBatteri(): Promise<BatteriInfo | null> {
  if (typeof navigator === "undefined") return null;
  const getBattery = (navigator as BatteriNavigator).getBattery;
  if (!getBattery) return null;
  try {
    const b = await getBattery();
    // level ligger i [0, 1]; afvigende værdier (fx -1 på enkelte
    // emulators) behandles som "ikke målt".
    if (typeof b.level !== "number" || b.level < 0 || b.level > 1) return null;
    return { level: b.level, charging: Boolean(b.charging) };
  } catch {
    return null;
  }
}
