/**
 * Bunny Stream-serverhjælpere (9/11-integrationen) — KUN server-side:
 * bibliotekets AccessKey-nøgle (getBunnyEnv) må aldrig nå klienten.
 *
 * Formler/quirks verificeret mod bibliotek 804139 (memory
 * bunny-stream-setup):
 * - opret-svarets id-felt hedder "guid" (ikke VideoId)
 * - uploaden går via TUS (tusupload) med signaturen
 *   SHA256(libraryId + apiKey + expires + guid) som hex —
 *   headere: AuthorizationSignature / AuthorizationExpire /
 *   LibraryId / VideoId
 * - delete er DELETE /library/{id}/videos/{guid} → 200 "success":true
 * - video-objektets "status": 0 Created · 2 Processing · 3 Finished ·
 *   4 Error (1-sec-klippers quirk: 4 med afspilbar 240p alligevel)
 * - "availableResolutions" er en komma-adskilt streng ("1080p,720p,…")
 */

import { createHash } from "node:crypto";
import { getBunnyEnv } from "./config";

export interface BunnyVideoInfo {
  guid: string;
  /** 0=Created 1=Uploaded 2=Processing 3=Finished 4=Error 5/6=JIT */
  status: number;
  encodeProgress: number;
  /** f.eks. "1080p,720p,480p,360p,240p" eller null */
  availableResolutions: string | null;
  storageSize: number;
  lengthSec: number;
  title: string;
}

async function bunnyFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { streamApiKey, libraryId, videoApiBase } = getBunnyEnv();
  const res = await fetch(`${videoApiBase}/library/${libraryId}${path}`, {
    ...init,
    headers: {
      AccessKey: streamApiKey,
      ...init.headers,
    },
  });
  return res;
}

/** Opretter et Bunny-video-objekt (kladen/klippet) — guid'et er
 *  identiteten; TUS-signaturen hænger på uploaden. */
export async function createBunnyVideo(title: string): Promise<string> {
  const res = await bunnyFetch("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`Bunny-opret foreslog fejlet (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { guid?: string };
  if (!data.guid) {
    throw new Error("Bunny-opret svarede uden guid");
  }
  return data.guid;
}

export async function getBunnyVideo(
  guid: string,
): Promise<BunnyVideoInfo | null> {
  const res = await bunnyFetch(`/videos/${guid}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Bunny-status fejl (HTTP ${res.status})`);
  }
  const d = (await res.json()) as {
    guid: string;
    status: number;
    encodeProgress: number;
    availableResolutions: string | null;
    storageSize: number;
    length: number;
    title: string;
  };
  return {
    guid: d.guid,
    status: d.status,
    encodeProgress: d.encodeProgress,
    availableResolutions: d.availableResolutions,
    storageSize: d.storageSize,
    lengthSec: d.length,
    title: d.title,
  };
}

/** TUS-genoptageligt upload-støtte + helper: genkender en Bunny-
 *  playback-URL og trækker guiden ud (trailer-sletning, kladsletning). */
export function bunnyGuidFromUrl(url: string): string | null {
  const match = /^https:\/\/[a-z0-9.-]+b-cdn\.net\/([0-9a-f-]{36})\//.exec(url);
  return match ? match[1] : null;
}

/** Venter på, at Bunny er færdig med encodningen (status 3). */
export async function waitForBunnyEncode(
  guid: string,
  timeoutMs = 300_000,
): Promise<"ready" | "failed" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const video = await getBunnyVideo(guid);
    if (video && video.status >= 3) {
      return video.status === 3 ? "ready" : "failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return "timeout";
}

/** Direkte upload til et Bunny-video-objekt (server-side — små videoer
 *  som 90 sec-trailere: ~20-40 MB buffer er fint for funktionens
 *  hukommelse; TUS er kun for browserens store uploads). Kaldet er
 *  verificeret: curl -T-formen = PUT med AccessKey. */
export async function uploadBunnyBytes(guid: string, bytes: Buffer): Promise<void> {
  const { streamApiKey, videoApiBase, libraryId } = getBunnyEnv();
  const res = await fetch(`${videoApiBase}/library/${libraryId}/videos/${guid}`, {
    method: "PUT",
    headers: { AccessKey: streamApiKey },
    body: new Uint8Array(bytes) as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`Bunny-uploaden af klippet fejlede (HTTP ${res.status})`);
  }
}

export async function deleteBunnyVideo(guid: string): Promise<void> {
  await bunnyFetch(`/videos/${guid}`, { method: "DELETE" });
}

/** TUS-presignaturen: SHA256(libraryId + apiKey + expires + guid) hex —
 *  KUN her (server), aldrig i klient-koden. */
export function tusSignature(guid: string, expiresSec: number): string {
  const { libraryId, streamApiKey } = getBunnyEnv();
  return createHash("sha256")
    .update(`${libraryId}${streamApiKey}${expiresSec}${guid}`)
    .digest("hex");
}

/** Vælger den fineste direkte-MP4-opløsning en Bunny-video reelt har
 *  encodet — foretrækker 720p (afspillerens v1-standard), faldt til
 *  de laveste som findes. Returnerer fx "720p" eller null hvis
 *  intet er encodet endnu (publiceringsgaten tager det fra her). */
export function pickMp4Resolution(
  availableResolutions: string | null,
): string | null {
  if (!availableResolutions) return null;
  const liste = availableResolutions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (liste.includes("720p")) return "720p";
  const tallene = liste
    .map((s) => /^\D*(\d+)p$/.exec(s)?.[1])
    .filter((s): s is string => Boolean(s))
    .map((s) => Number(s));
  if (tallene.length === 0) return null;
  const lavere = tallene.filter((n) => n <= 720);
  const valgt = Math.max(...(lavere.length ? lavere : tallene));
  return `${valgt}p`;
}
