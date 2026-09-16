/**
 * View-validation: afgør om en session er en ægte færdigsetning.
 *
 * I dag: regelbaserede heuristikker oven på den ML-klare feature-vektor.
 * Fremover: en trænet model (anomaly detection / klassifikation) kan
 * erstatte `applyHeuristics` og uændret genbruge både råloggen
 * (ViewSession.events) og `extractFeatures`.
 */
import { extractFeatures } from "@/lib/analytics/features";
import type {
  FraudSignal,
  SessionVerdict,
  SignalSeverity,
  ViewFeatures,
  ViewSession,
} from "@/lib/types";

/** Bumpes når logikken ændres, så gamle domme kan skelnes fra nye. */
export const VALIDATION_MODEL_VERSION = "heuristics-v1";

const TRUST_VALID_THRESHOLD = 70;
const TRUST_SUSPICIOUS_THRESHOLD = 35;

export const isCompletionCounted = (verdict: SessionVerdict) =>
  verdict.verdict === "valid";

/**
 * Validerer én session og returnerer et dom med ML-klar
 * feature-vektor, menneskeligt læsbare mistanker og en trust-score.
 */
export function validateSession(
  session: ViewSession,
  documentaryDurationSec: number,
): SessionVerdict {
  const features = extractFeatures(session, documentaryDurationSec);
  let trustScore = 100;
  const signals: FraudSignal[] = [];

  const penalize = (
    points: number,
    code: string,
    description: string,
    severity: SignalSeverity,
  ) => {
    trustScore -= points;
    signals.push({ code, description, severity });
  };

  // 1) Umulig tidslinje: klienten påstår mere set tid end der er gået
  //    på væguret. Kan kun ske ved manipulation (manipuleret klient, bots).
  if (features.timelineAnomaly === 1) {
    penalize(
      100,
      "impossible_timeline",
      `Set tid (${Math.round(features.estimatedWatchedSec)}s) overstiger sessionens reelle længde (${Math.round(
        features.sessionDurationSec,
      )}s).`,
      "high",
    );
  }

  // 2) Lav dækning ved completion: filmen blev "færdigset", men store
  //    dele blev aldrig rørt — klassisk spol-fraud (venne-loops der
  //    spolede filmen igennem for at kreditere skaberen).
  if (features.uniqueWatchedRatio < 0.75) {
    penalize(
      25,
      "low_completion_coverage",
      `Kun ${Math.round(features.uniqueWatchedRatio * 100)}% af filmen har reelt været afspillet.`,
      "medium",
    );
  }

  // 3) Bot-agtig kadence: scripted playback gentager mekanisk identiske
  //    intervaller (eller har jitter tæt på nul). Bemærk: en ægte browser
  //    udløser timeupdate i ~250 ms-kvanter, så der er ALTD ms-støj —
  //    derfor kræver vi enten mikro-jitter eller høj interval-uniformitet.
  const botlikeCadence =
    features.heartbeatCount >= 6 &&
    (features.heartbeatJitterSec < 0.05 ||
      features.identicalIntervalRatio >= 0.8);
  if (botlikeCadence) {
    penalize(
      45,
      "botlike_cadence",
      `Hjerteslagsintervallerne er mekanisk ensartede (jitter: ${features.heartbeatJitterSec.toFixed(
        3,
      )}s, identiske intervaller: ${Math.round(features.identicalIntervalRatio * 100)}%).`,
      "high",
    );
  }

  // 4) Spol-mønster: konstant spoling fremad er et typisk loop-mærke,
  //    når én bruger "ser" mange film på kort tid for en ven.
  if (features.seeksPerHour > 30) {
    penalize(
      15,
      "excessive_seeking",
      `Usædvanligt mange spolinger (${features.seeksPerHour.toFixed(0)}/time).`,
      "medium",
    );
  }
  if (features.avgSeekDistanceSec > 240) {
    penalize(
      10,
      "long_skips",
      `Gennemsnitligt spring på ${Math.round(features.avgSeekDistanceSec)}s tyder på at springe over indhold.`,
      "low",
    );
  }

  // 5) Hændelsesflod: automatiserede klienter sender ofte langt flere
  //    hændelser, end en rigtig bruger kan generere.
  if (features.eventsPerMinute > 90) {
    penalize(
      20,
      "event_flood",
      `${features.eventsPerMinute.toFixed(0)} hændelser/min er over det menneskeligt plausible.`,
      "medium",
    );
  }

  // 6) Enhedsanomalier: headless-UA, manglende tidszone m.m.
  if (features.deviceSuspicionScore >= 0.5) {
    penalize(
      15,
      "device_anomaly",
      "Enhedsmetadata peger på automatiseret afspiller (headless/inkonsistent klient).",
      "medium",
    );
  }

  // 7) Pause-storm: mekanisk tænd/sluk uden reel visning.
  if (features.pausesPerHour > 60) {
    penalize(
      10,
      "pause_storm",
      `${features.pausesPerHour.toFixed(0)} pauser/time tyder på mekanisk playback.`,
      "low",
    );
  }

  trustScore = Math.max(0, Math.min(trustScore, 100));
  const verdict: SessionVerdict["verdict"] =
    trustScore >= TRUST_VALID_THRESHOLD
      ? "valid"
      : trustScore >= TRUST_SUSPICIOUS_THRESHOLD
        ? "suspicious"
        : "invalid";

  return {
    verdict,
    trustScore,
    signals,
    features,
    decidedAt: Date.now(),
    modelVersion: VALIDATION_MODEL_VERSION,
  };
}