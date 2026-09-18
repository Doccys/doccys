/**
 * Transskriptions-trinnet i undertekst-pipelinen — server-side kun.
 *
 * 1. downloadVideoToDisk: streamer videoen til disk (store filer
 *    buffers ALDRIG i RAM — kun MP3'en, der er ~21 MB/90 min).
 * 2. extractMp3: ffmpeg → 32 kbps mono MP3. 32 kbps er rigeligt
 *    til tale og holder selv en 90 min film under OpenAI's 25 MB-
 *    grænse (90 min * 32 kbps / 8 ≈ 21,6 MB).
 * 3. transcribeDanish: whisper-1 med verbose_json + segment-
 *    granularitet, låst til dansk — filmene er danske, så en
 *    automatisk sprogdetektion kun kan ramme ved siden af.
 *
 * NB: Pipelinen er designet til den selv-hostede server. Under
 * serverless (Vercel) kræver kørslen en anden arkitektur
 * (baggrundsjob + længere timeout) — se API-rutens kommentar.
 */
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { getOpenAiApiKey, OPENAI_API_BASE } from "@/lib/openai/client";
import type { SubtitleSegment } from "@/lib/subtitles/vtt";

const execFileAsync = promisify(execFile);

/** Streamer video-URL'en ned på disk — aldrig mere end én chunk i RAM. */
export async function downloadVideoToDisk(
  videoUrl: string,
  targetPath: string,
): Promise<void> {
  const res = await fetch(videoUrl, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(
      `Videoen kunne ikke hentes (${res.status}) — tjek at video-URL'en stadig virker.`,
    );
  }

  // Node-fetchens body er en web-stream; pipeline() spolerer den
  // direkte til filen, så hukommelsesforbruget er konstant.
  await pipeline(
    Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(targetPath),
  );
}

/** Video → 32 kbps mono MP3 (tale klar til whisper). */
export async function extractMp3(
  videoPath: string,
  mp3Path: string,
): Promise<void> {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-b:a",
      "32k",
      "-f",
      "mp3",
      mp3Path,
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      throw new Error(
        "ffmpeg er ikke installeret på serveren — installér det med: winget install ffmpeg",
      );
    }
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(
      `ffmpeg kunne ikke lave lydsporet${stderr ? `: ${stderr.trim()}` : "."}`,
    );
  }
}

/** Henter filmens lyd ind som MP3-bytes klar til whisper. */
export async function readMp3(mp3Path: string): Promise<Buffer> {
  return readFile(mp3Path);
}

interface WhisperResponse {
  language?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

/**
 * Dansk transskription via whisper-1. Returnerer segmenterne med
 * sekund-nøjagtige tidsstempler — timing-sandheden for ALLE sprog.
 * Generøs timeout: en lang film tager flere minutter at skrive ud.
 */
export async function transcribeDanish(mp3Bytes: Buffer): Promise<SubtitleSegment[]> {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("language", "da");
  form.append("timestamp_granularities[]", "segment");
  // Navnet er kun metadata for OpenAI — men filnavnet skal have en
  // lyd-endelse, så API'et accepterer blob'en.
  form.append("file", new Blob([new Uint8Array(mp3Bytes)], { type: "audio/mpeg" }), "audio.mp3");

  const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getOpenAiApiKey()}` },
    body: form,
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OpenAI-transskriptionen fejlede (${res.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`,
    );
  }

  const data = (await res.json()) as WhisperResponse;
  return (data.segments ?? [])
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      // whisper lader gerne et indledende mellemrum stå i teksten
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text.length > 0);
}