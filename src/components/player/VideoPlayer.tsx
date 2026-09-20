"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type {
  DeviceMetadata,
  FilmSubtitleTrack,
  PlaybackEvent,
  PlaybackEventType,
  SessionVerdict,
} from "@/lib/types";
import { LOCALE_LANGUAGE_NAMES } from "@/lib/i18n/languageNames";
import { formatCurrency } from "@/lib/utils/format";
import {
  seekFromUrlParam,
  setSharedWatchSeconds,
} from "@/lib/player/shareTime";

const HEARTBEAT_INTERVAL_SEC = 10;

interface VideoPlayerProps {
  documentarySlug: string;
  videoUrl: string;
  /** Skaberens navn til støtte-beviset (undefined → unævnt i teksten) */
  creatorName?: string;
  /** Filmens sats pr. 100 sete minutter — bevisets beløb regnes heraf */
  payoutRateDkk: number;
  /**
   * Klar-undertekster (kun 'ready'-rækker). Native <track>-elementer
   * giver browserens egen CC-menu gratis — ingen afspiller-UI at
   * vedligeholde. Tomt/undefined = ingen undertekster, som før.
   */
  subtitleTracks?: FilmSubtitleTrack[];
}

/** Bevis-data fra validate-ruten — kun sat når afregningen lykkedes */
interface WatchProof {
  verdict: SessionVerdict["verdict"];
  watchedSeconds: number;
}

type EventExtra = Partial<
  Pick<PlaybackEvent, "playbackRate" | "seekFromSec" | "seekToSec">
> & { raw?: Record<string, unknown> };

/** Indsamler enhedsmetadata til anti-fraud-loggen — kun på klienten. */
function collectDeviceMetadata(): DeviceMetadata {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    touchPoints: navigator.maxTouchPoints,
  };
}

/**
 * Doccys' afspiller. Udover almindelig playback logger den struktureret
 * alle rå hændelser (afspil, pause, spoling, hjerteslag, tidsstempler,
 * enhedsmetadata) til anti-fraud-API'et. Ved enden afregnes sessionen
 * server-side (pay-per-minute), og støtte-beviset viser hvor mange
 * minutter seeren så — og hvad der gik direkte til skaberen.
 */
export default function VideoPlayer({
  documentarySlug,
  videoUrl,
  creatorName,
  payoutRateDkk,
  subtitleTracks,
}: VideoPlayerProps) {
  const t = useTranslations("watch");
  const locale = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const eventBufferRef = useRef<PlaybackEvent[]>([]);
  const lastVideoTimeRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const pendingSeekFromRef = useRef<number | null>(null);
  // Startposition fra et delt tidskode-link (?t=123) — læses én gang
  // ved mount og søges til, når videoens metadata er klar. Null = intet
  // søg (det gælder også ugyldige/for store tal).
  const initialSeekRef = useRef<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Støtte-beviset: vises som overlay over videoen, når en
  // afregnet afspilning er slut (null = skjult)
  const [proof, setProof] = useState<WatchProof | null>(null);

  // Delings-tidskoden læses ved første klient-render — window findes
  // ikke under SSR, og seekFromUrlParam vogter selv på det.
  useEffect(() => {
    initialSeekRef.current = seekFromUrlParam();
  }, []);

  const recordEvent = useCallback(
    (type: PlaybackEventType, extra: EventExtra = {}) => {
      const video = videoRef.current;
      if (!video) return;
      eventBufferRef.current.push({
        type,
        clientTimestamp: Date.now(),
        videoTimeSec: video.currentTime,
        ...extra,
      });
    },
    [],
  );

  // Skyl hændelsesbufferen til serveren. Med sendBeacon ved side-lukning.
  const flushEvents = useCallback(async (useBeacon = false) => {
    const sessionId = sessionRef.current;
    const events = eventBufferRef.current;
    if (!sessionId || events.length === 0) return;
    eventBufferRef.current = [];
    const payload = JSON.stringify({ events });

    if (useBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        `/api/views/sessions/${sessionId}/events`,
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    try {
      await fetch(`/api/views/sessions/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    } catch {
      // Log-levering er best-effort og må aldrig blokere afspilningen.
    }
  }, []);

  // 1) Sessionen oprettes LAZY ved første play — ikke ved mount. En
  //    mount-oprettelse efterlod en forladt 'active'-række, hver gang
  //    en side blev åbnet uden at der blev set noget (og i dev to
  //    rækker pga. StrictMode-dobbeltmount). Først ved reelt play er
  //    der noget at logge; tidlige hændelser (selve play-eventet) ligger
  //    allerede i bufferen og skylles straks efter, at ID'et findes.
  const sessionStartingRef = useRef<Promise<void> | null>(null);
  const ensureSession = useCallback(async () => {
    if (sessionRef.current || sessionStartingRef.current) return;
    sessionStartingRef.current = (async () => {
      try {
        const res = await fetch("/api/views/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentarySlug,
            device: collectDeviceMetadata(),
          }),
        });
        const data = (await res.json()) as { sessionId: string };
        sessionRef.current = data.sessionId;
        void flushEvents();
      } catch {
        setStatus(t("playerStartFailed"));
      } finally {
        // Nulstilles også ved fejl, så et nyt play-forsøg kan prøve igen.
        sessionStartingRef.current = null;
      }
    })();
    await sessionStartingRef.current;
  }, [documentarySlug, flushEvents, t]);

  // 2) Ved side-lukning: log session_end, skyl bufferen og send en
  //    validate-beacon, så forbruget afregnes selv når taben lukkes
  //    midt i filmen. Validate-ruten er idempotent (RPC-guard), så
  //    en senere handleEnded efter et afbrudt beacon er et no-op.
  useEffect(() => {
    const handlePageHide = () => {
      recordEvent("session_end");
      void flushEvents(true);
      const sessionId = sessionRef.current;
      if (sessionId && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          `/api/views/sessions/${sessionId}/validate`,
          new Blob([], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [recordEvent, flushEvents]);

  // 3) Færdigset: log completion, valider sessionen og vis resultatet.
  //    Svaret fra validate-ruten bærer de afregnede sekunder med —
  //    beløbsgrundlaget til støtte-beviset (kun for loggede seere;
  //    anonyme får watchedSeconds null og intet bevis).
  const handleEnded = useCallback(async () => {
    recordEvent("complete");
    recordEvent("session_end");
    await flushEvents();
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/views/sessions/${sessionId}/validate`, {
        method: "POST",
      });
      const verdict = (await res.json()) as SessionVerdict & {
        watchedSeconds?: number | null;
      };
      setStatus(
        verdict.verdict === "valid"
          ? t("verdictValid")
          : verdict.verdict === "suspicious"
            ? t("verdictSuspicious")
            : t("verdictInvalid"),
      );
      if (verdict.watchedSeconds && verdict.watchedSeconds > 0) {
        setProof({
          verdict: verdict.verdict,
          watchedSeconds: verdict.watchedSeconds,
        });
      }
    } catch {
      setStatus(t("verdictError"));
    }
  }, [recordEvent, flushEvents, t]);

  return (
    <div className="mx-auto w-full max-w-[calc((100dvh-12rem)*16/9)]">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-smoke bg-black shadow-2xl shadow-black/60">
        {/* crossOrigin er PÅKRÆVET for underteksterne: <track> hentes
            med CORS-tvang, men kun hvis MEDET-elementet har attributten
            — ellers foretages kaldet i no-cors-tilstand, browseren kan
            ikke læse den cross-origin VTT, og sporet fejler og FORSVINDER
            fra CC-menuen idet det vælges. Supabases public buckets sender
            Access-Control-Allow-Origin: * (verificeret), så videoen tåler
            det CORS-kald, attributten også giver den. */}
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={() => {
            // Delt tidskode: søg til ?t=-øjeblikket én gang, når
            // duration er kendt (kun hvis t ligger inde i filmen).
            const video = videoRef.current;
            const target = initialSeekRef.current;
            if (video && target !== null && target < video.duration) {
              video.currentTime = target;
              initialSeekRef.current = null;
            }
          }}
          onPlay={() => {
            const video = videoRef.current;
            lastHeartbeatRef.current = video?.currentTime ?? 0;
            void ensureSession();
            recordEvent("play", { playbackRate: video?.playbackRate });
          }}
          onPause={() => {
            recordEvent("pause");
            void flushEvents();
          }}
          onSeeking={() => {
            pendingSeekFromRef.current = lastVideoTimeRef.current;
          }}
          onSeeked={() => {
            const video = videoRef.current;
            if (!video) return;
            recordEvent("seek", {
              seekFromSec: pendingSeekFromRef.current ?? undefined,
              seekToSec: video.currentTime,
            });
            lastVideoTimeRef.current = video.currentTime;
          }}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (!video) return;
            lastVideoTimeRef.current = video.currentTime;
            // Positionen deles videre via ShareButtons (?t=) — hold
            // den opdateret ved hvert timeupdate (billigt: ét tal).
            setSharedWatchSeconds(video.currentTime);
            if (
              !video.paused &&
              video.currentTime - lastHeartbeatRef.current >= HEARTBEAT_INTERVAL_SEC
            ) {
              lastHeartbeatRef.current = video.currentTime;
              recordEvent("heartbeat", { playbackRate: video.playbackRate });
              void flushEvents();
            }
          }}
          onEnded={() => {
            void handleEnded();
          }}
          onError={() => {
            recordEvent("error", { raw: { reason: "video-load-failed" } });
          }}
        >
          {subtitleTracks?.map((track) => (
            <track
              key={track.locale}
              kind="captions"
              src={track.vttUrl}
              srcLang={track.locale}
              label={LOCALE_LANGUAGE_NAMES[track.locale] ?? track.locale}
              default={track.isDefault}
            />
          ))}
        </video>

        {/* Støtte-beviset: end-skærm over videoen efter en afregnet
            afspilning. Beløbs-claimet ("gik direkte til skaberen")
            vises KUN ved verdict 'valid' — creator_indtjening tæller
            kun valid-sessioner, så andet ville være løgn; invalid/
            suspicious får den neutrale variant. */}
        {proof && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-noir/90 px-6">
            <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-champagne/40 bg-onyx px-8 py-8 text-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-champagne">
                {t("proofEyebrow")}
              </p>
              <p className="font-display text-2xl text-bone">
                {t("proofMinutes", {
                  minutes: Math.round(proof.watchedSeconds / 60),
                })}
              </p>
              {proof.verdict === "valid" ? (
                <p className="text-sm leading-relaxed text-ash">
                  {creatorName
                    ? t("proofSupport", {
                        amount: formatCurrency(
                          (proof.watchedSeconds / 60) * payoutRateDkk / 100,
                          locale,
                        ),
                        creator: creatorName,
                      })
                    : t("proofSupportUnnamed", {
                        amount: formatCurrency(
                          (proof.watchedSeconds / 60) * payoutRateDkk / 100,
                          locale,
                        ),
                      })}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-ash">
                  {t("proofNeutral", {
                    minutes: Math.round(proof.watchedSeconds / 60),
                  })}
                </p>
              )}
              <button
                type="button"
                onClick={() => setProof(null)}
                className="mt-2 rounded-full bg-champagne px-6 py-2.5 text-sm font-semibold text-onyx transition-colors hover:bg-champagne/85"
              >
                {t("proofClose")}
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ash">
        {status ?? t("playerNote")}
      </p>
    </div>
  );
}