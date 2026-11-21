/**
 * Skærm-vaagn-lås (Wake Lock API) til synkrone pipelines i studiet.
 *
 * RODSAG (bevist fra produktionen, se PROJEKTSTATUS FFMPEG-sektionen):
 * undertekster/trailer-pipelinen kører synkront i API-ruten — lægger
 * telefonens skærm sig til at dvale, kasseres anmodningen og fetch-
 * kaldet fra klienten dør, selvom serveren stadig arbejder. Klienten
 * beder derfor om en "wake lock", mens jobbet kører.
 *
 * Konvention: kald holdSkarmenVagen() når jobbet starter og
 * slipSkarmenVagen() i finally. Referencetælling, så overlappende
 * jobs (fx undertekster og trailer på én gang) ikke slipper hinandens
 * lås.
 *
 * Graceful overalt: API'en mangler (fx ældre Safari), låsen afvises
 * (strømbesparelse/brugerindstilling) eller siden er skjult → stille
 * no-op. Browseren frigiver selv låsen når fanen skjules — vi prøver
 * igen ved retur. Tekstvarselet ved knapperne står stadig.
 */

interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
};

let sentinel: WakeLockSentinel | null = null;
let holders = 0;

async function soegLaas(): Promise<void> {
  // Låsen kan kun tages på et synligt dokument — ellers afvises kaldet
  // (visibilityChangeListeneren prøver igen, når siden vender tilbage).
  if (sentinel || holders < 1 || document.visibilityState !== "visible") {
    return;
  }
  const wakeLock = (navigator as WakeLockNavigator).wakeLock;
  if (!wakeLock) return;
  try {
    const ny = await wakeLock.request("screen");
    ny.addEventListener("release", () => {
      // Browseren kan frigive låsen udenom os (fx skjult fane) —
      // da står den som "fri", så næste synlighed prøver nyt kald.
      if (sentinel === ny) sentinel = null;
    });
    sentinel = ny;
  } catch {
    // Afvist (indstilling/sleep-mode) — no-op; varsel-teksten står.
  }
}

/** Bed om at skærmen bliver vågen, mens jobbet kører. */
export function holdSkarmenVagen(): void {
  holders += 1;
  void soegLaas();
}

/** Slip låsen igen — matcher ét holdSkarmenVagen-kald. */
export function slipSkarmenVagen(): void {
  if (holders > 0) holders -= 1;
  if (holders === 0) {
    const s = sentinel;
    sentinel = null;
    if (s) {
      void s.release().catch(() => {
        // Allerede frigivet af browseren — no-op.
      });
    }
  }
}

// Kun i browseren (hjælperen importeres i klient-komponenter).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void soegLaas();
  });
}
