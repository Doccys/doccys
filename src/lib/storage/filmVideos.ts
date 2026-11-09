/**
 * Fælles konstanter/hjælpere for film-videos-bucketet.
 *
 * Objekt-sti er altid {user_id}/{uuid}.mp4 — storage-policies
 * håndhæver, at man kun kan skrive i sin egen mappe.
 */
export const FILM_VIDEOS_BUCKET = "film-videos";

/**
 * HÅNDHÆVET 2 GB-grænse for videofiler (punkt 16 i TING-JE) — i dag
 * to steder: ved filvalg i StudioUploadForm (koster intet egress,
 * stopper før uploaden) og på POST /api/films (HEAD'ens content-
 * length = den reelle sandhed; klientens File.size kan lyves om).
 * 2 GiB = 2.147.483.648 byte — grænsen disciplinerer bitraten
 * naturligt; 720p-hintet forbliver VEJLEDNING (ingen hård 1080p-mur,
 * af hensyn til fremtidig adaptiv streaming).
 */
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Bunny Stream (9/11-beslutningen, SKEMA sektion J): playback-URL'en
 * for en Bunny-video er {cdn-hostname}/{guid}/play_{res}.mp4 —
 * encoding-udvalget (availableResolutions) aflæses via Video-API'en
 * og ruten vælger den fineste som findes. For Bunnys vedkommende
 * er guid-identiteten gemt separat (documentaries.bunny_video_id),
 * så sletning/kladsletning gå via Video-API'en i stedet for
 * storage-path-parsing.
 */

/** Direkte MP4-playback for en Bunny-video (public + Referer-låsen
 *  i CDN-værtsnavnen — browsere sender Referer, API-klienter 403'er,
 *  og afspillerens crossOrigin/Range-flow er verificeret 200/206). */
export function bunnyDirectPlayUrl(
  guid: string,
  resolution: string,
): string {
  return `https://${process.env.BUNNY_CDN_HOSTNAME}/${guid}/play_${resolution}.mp4`;
}

/** Genkender en Bunny-playback-URL (modsat publicUrlToStoragePath,
 *  som returnerer null for Bunny — seed-filmene i Supabase deler
 *  begge formater fredeligt, og toDocumentary rørsg dem ikke). */
export function isBunnyVideoUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.b-cdn\.net\/[0-9a-f-]{36}\/play_\d+p\.mp4$/.test(
    url,
  );
}

/**
 * Afleder objekt-stien fra en public URL (omvendt af getPublicUrl).
 * Returnerer null, hvis URL'en ikke peger i film-videos-bucketet.
 */
export function publicUrlToStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${FILM_VIDEOS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length) || null;
}