/**
 * Fælles konstanter/hjælpere for film-videos-bucketet.
 *
 * Objekt-sti er altid {user_id}/{uuid}.mp4 — storage-policies
 * håndhæver, at man kun kan skrive i sin egen mappe.
 */
export const FILM_VIDEOS_BUCKET = "film-videos";

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