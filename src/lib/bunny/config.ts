/**
 * Fælles adgang til Bunny Stream-opsætningen (beslutning 9/11 — SKEMA
 * sektion J: video-egress flytter fra Supabase til Bunny Stream).
 *
 * BUNNY_STREAM_LIBRARY_ID / BUNNY_CDN_HOSTNAME er ikke-hemmelige
 * (playback-URL er offentlig, som Supabase-bucketet var); nøglerne
 * BUNNY_API_KEY (biblioteks-nøglen — opret/slet/TUS-signatur) og
 * BUNNY_ACCOUNT_KEY (konto-nøglen — zone-opsætning) er SERVER-ONLY
 * og må ALDRIG være NEXT_PUBLIC_.
 *
 * Indtil nøglerne er udfyldt er hasBunnyEnv() false og de Bunny-
 * koblinger, der bygges, degraderer pænt (som getSupabaseEnv).
 */

export interface BunnyEnv {
  /** Stream-bibliotekets ID (doccys-biblioteket: numerisk streng). */
  libraryId: string;
  /** KUN biblioteks-nøglen (video.bunnycdn.com AccessKey). */
  streamApiKey: string;
  /** CDN-hostnavn for playback (fx vz-d6678dae-1f6.b-cdn.net). */
  cdnHostname: string;
  /** Stream-API'ens base. */
  videoApiBase: string;
}

export function hasBunnyEnv(): boolean {
  return Boolean(
    process.env.BUNNY_STREAM_LIBRARY_ID &&
      process.env.BUNNY_API_KEY &&
      process.env.BUNNY_CDN_HOSTNAME,
  );
}

export function getBunnyEnv(): BunnyEnv {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const streamApiKey = process.env.BUNNY_API_KEY;
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;

  if (!libraryId || !streamApiKey || !cdnHostname) {
    throw new Error(
      "Bunny Stream er ikke konfigureret. Sæt BUNNY_STREAM_LIBRARY_ID, " +
        "BUNNY_API_KEY og BUNNY_CDN_HOSTNAME (Bunny Stream → bibliotekets " +
        "API-nøgle + Pull Zone-hostname) — og genstart dev-serveren.",
    );
  }

  return {
    libraryId,
    streamApiKey,
    cdnHostname,
    videoApiBase: "https://video.bunnycdn.com",
  };
}

/** TUS-presignaturens levetid i sekunder (Bunnys doku anbefaler lang —
 *  brugeren kan pause/gennemstarte en 2 GB-upload i timevis). */
export const TUS_SIGNATURE_TTL_SEC = 24 * 60 * 60;
