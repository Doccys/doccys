/**
 * Fælles konstanter/hjælpere for film-posters-bucketet (forsidebilleder).
 *
 * Objekt-sti er altid {user_id}/{uuid}.{jpg|png|webp} — storage-
 * policies håndhæver, at man kun kan skrive i sin egen mappe.
 */
export const FILM_POSTERS_BUCKET = "film-posters";

/** Mime-typer bucketen tillader — og filendelsen for hver. */
export const POSTER_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Minimumsstørrelse for plakater — smaller afvises i formularen. */
export const POSTER_MIN_WIDTH = 640;
export const POSTER_MIN_HEIGHT = 360;

/** Klient-tjek af størrelsen (bucketens hårde grænse er 10 MB). */
export const POSTER_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Afleder objekt-stien fra en public URL (omvendt af getPublicUrl).
 * Returnerer null, hvis URL'en ikke peger i film-posters-bucketet.
 */
export function posterPublicUrlToStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${FILM_POSTERS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length) || null;
}