"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeviceMetadata,
  PlaybackEvent,
  PlaybackEventType,
  SessionVerdict,
} from "@/lib/types";

const HEARTBEAT_INTERVAL_SEC = 10;

interface VideoPlayerProps {
  documentarySlug: string;
  videoUrl: string;
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
 * enhedsmetadata) til anti-fraud-API'et, så en completion kan valideres,
 * før den udbetales til skaberen via pay-per-completion.
 */
export default function VideoPlayer({ documentarySlug, videoUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const eventBufferRef = useRef<PlaybackEvent[]>([]);
  const lastVideoTimeRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const pendingSeekFromRef = useRef<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

  // 1) Start session hos serveren, så alle hændelser kan tilordnes ét ID.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        if (!cancelled) sessionRef.current = data.sessionId;
      } catch {
        setStatus("Visningsdata kunne ikke startes — afspilningen virker stadig.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentarySlug]);

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
      const verdict = (await res.json()) as SessionVerdict;
      setStatus(
        verdict.verdict === "valid"
          ? "✓ Visning valideret — completion tæller med til skaberens indtjening."
          : verdict.verdict === "suspicious"
            ? "△ Visningen er markeret til manuel gennemgang af anti-fraud-systemet."
            : "✗ Visning afvist — completion er ikke talt med i statistikken.",
      );
    } catch {
      setStatus("Valideringen kunne ikke gennemføres lige nu.");
    }
  }, [recordEvent, flushEvents]);

  return (
    <div className="mx-auto w-full max-w-[calc((100dvh-12rem)*16/9)]">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-smoke bg-black shadow-2xl shadow-black/60">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onPlay={() => {
            const video = videoRef.current;
            lastHeartbeatRef.current = video?.currentTime ?? 0;
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
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ash">
        {status ??
          "Visningsdata logges struktureret (pauser, spoling, hjerteslag, enhedsmetadata og tidsstempler) og valideres af Doccys' anti-fraud-system, før en completion udbetales."}
      </p>
    </div>
  );
}