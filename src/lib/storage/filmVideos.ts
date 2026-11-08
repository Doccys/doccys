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
 * Afleder objekt-stien fra en public URL (omvendt af getPublicUrl).
 * Returnerer null, hvis URL'en ikke peger i film-videos-bucketet.
 */
export function publicUrlToStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${FILM_VIDEOS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length) || null;
}