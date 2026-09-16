/**
 * Feature-ekstraktion: omsætter en sessions rå hændelseslog til en
 * numerisk feature-vektor, der kan bruges direkte til ML.
 *
 * Alle features er rene tal (eller 0/1-flag), så vektoren uden
 * forarbejde kan bruges til anomaly detection eller klassifikation,
 * når der er indsamlet nok ægte data.
 */
import type { DeviceMetadata, PlaybackEvent, ViewFeatures, ViewSession } from "@/lib/types";

/** Størrelsen på de "spande" af filmen, vi registrerer som set. */
export const WATCH_BUCKET_SEC = 10;
/** Max naturligt fremskridt mellem to hændelser — større spring er spoling. */
const NATURAL_PROGRESS_LIMIT_SEC = 20;

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Enheds-mistanke (0–1). Bots og automatiserede afspillere afslører sig
 * ofte via manglende/inkonsistente klientmetadata.
 */
function deviceSuspicion(device: DeviceMetadata): number {
  let score = 0;
  if (/headless/i.test(device.userAgent)) score += 0.6;
  if (!device.timezone) score += 0.2;
  if (!device.language) score += 0.2;
  if (device.hardwareConcurrency === 0) score += 0.3;
  return Math.min(score, 1);
}

export function extractFeatures(
  session: ViewSession,
  documentaryDurationSec: number,
): ViewFeatures {
  const events: PlaybackEvent[] = session.events;
  const totalEvents = events.length;

  // --- Vægurstid (fra klientens egne tidsstempler) ---
  const firstTs = events[0]?.clientTimestamp ?? session.startedAt;
  const lastTs = events[events.length - 1]?.clientTimestamp ?? firstTs;
  const sessionDurationSec = Math.max((lastTs - firstTs) / 1000, 0);

  // --- Estimeret reelt set tid: kun naturlige fremskridt mellem hændelser tæller ---
  let estimatedWatchedSec = 0;
  for (let i = 1; i < totalEvents; i++) {
    const prev = events[i - 1];
    const cur = events[i];
    if (prev.type === "pause") continue; // afspilleren stod stille i dette interval
    const delta = cur.videoTimeSec - prev.videoTimeSec;
    if (delta > 0 && delta <= NATURAL_PROGRESS_LIMIT_SEC) {
      estimatedWatchedSec += delta;
    }
  }

  // --- Dækning: hvor stor en del af filmen har der været aktivitet i? ---
  const watchedBuckets = new Set<number>();
  for (const e of events) {
    if (e.type !== "pause" && e.type !== "session_end") {
      watchedBuckets.add(Math.floor(e.videoTimeSec / WATCH_BUCKET_SEC));
    }
  }
  const durationBuckets = Math.max(
    Math.ceil(documentaryDurationSec / WATCH_BUCKET_SEC),
    1,
  );

  // --- Pauser, spoling og hjerteslag ---
  let pauseCount = 0;
  let seekCount = 0;
  let forwardSeekCount = 0;
  let seekDistances: number[] = [];
  let heartbeatTimestamps: number[] = [];
  const playbackRates = new Set<number>();

  for (const e of events) {
    switch (e.type) {
      case "pause":
        pauseCount++;
        break;
      case "heartbeat":
        heartbeatTimestamps.push(e.clientTimestamp);
        if (e.playbackRate !== undefined) playbackRates.add(e.playbackRate);
        break;
      case "seek": {
        seekCount++;
        if (e.seekFromSec !== undefined && e.seekToSec !== undefined) {
          const distance = Math.abs(e.seekToSec - e.seekFromSec);
          seekDistances.push(distance);
          if (e.seekToSec > e.seekFromSec) forwardSeekCount++;
        }
        break;
      }
      default:
        break;
    }
  }

  // Hjerteslags-jitter: rigtige mennesker har aldrig perfectly regelmæssige intervaller
  const heartbeatIntervals: number[] = [];
  for (let i = 1; i < heartbeatTimestamps.length; i++) {
    heartbeatIntervals.push((heartbeatTimestamps[i] - heartbeatTimestamps[i - 1]) / 1000);
  }

  // Andel intervaller, der er helt identiske — scripted playback gentager
  // det samme interval mekanisk, mens rigtige klienter altid har ms-støj.
  const intervalCounts = new Map<string, number>();
  for (const interval of heartbeatIntervals) {
    const key = interval.toFixed(3);
    intervalCounts.set(key, (intervalCounts.get(key) ?? 0) + 1);
  }
  const mostCommonCount = Math.max(0, ...intervalCounts.values());

  const hours = sessionDurationSec / 3600;
  const perHour = (count: number) => (hours > 0 ? count / hours : 0);
  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

  return {
    totalEvents,
    sessionDurationSec,
    estimatedWatchedSec,
    watchedRatio: safeDiv(estimatedWatchedSec, documentaryDurationSec),
    uniqueWatchedRatio: safeDiv(watchedBuckets.size, durationBuckets),
    pauseCount,
    pausesPerHour: perHour(pauseCount),
    seekCount,
    seeksPerHour: perHour(seekCount),
    forwardSeekRatio: safeDiv(forwardSeekCount, seekCount),
    avgSeekDistanceSec: seekDistances.length > 0
      ? seekDistances.reduce((a, b) => a + b, 0) / seekDistances.length
      : 0,
    maxSeekDistanceSec: seekDistances.length > 0 ? Math.max(...seekDistances) : 0,
    heartbeatCount: heartbeatTimestamps.length,
    heartbeatJitterSec: stdDev(heartbeatIntervals),
    identicalIntervalRatio: heartbeatIntervals.length > 0
      ? mostCommonCount / heartbeatIntervals.length
      : 0,
    eventsPerMinute: sessionDurationSec > 0 ? (totalEvents / sessionDurationSec) * 60 : 0,
    playbackRateChanges: Math.max(playbackRates.size, 0),
    timelineAnomaly:
      estimatedWatchedSec > sessionDurationSec + 15 ? 1 : 0,
    deviceSuspicionScore: deviceSuspicion(session.device),
  };
}