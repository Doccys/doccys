/**
 * Fælles konstanter/hjælpere for film-subtitles-bucketet.
 *
 * Objekt-sti er altid {user_id}/{slug}/{locale}.vtt — de samme
 * per-bruger-policies som film-videos og film-posters håndhæver,
 * at man kun kan skrive i sin egen mappe. Bucketen er offentlig,
 * så afspilleren henter VTT'erne direkte via URL.
 */
export const FILM_SUBTITLES_BUCKET = "film-subtitles";

/**
 * Afleder objekt-stien fra en public URL (omvendt af getPublicUrl).
 * Returnerer null, hvis URL'en ikke peger i film-subtitles-bucketet.
 */
export function subtitlePublicUrlToStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${FILM_SUBTITLES_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length) || null;
}