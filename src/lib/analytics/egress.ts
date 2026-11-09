/**
 * Egress-estimat: omsætter sete sekunder til leverede bytes.
 *
 * Videoen strømmes direkte fra video-lagret til browseren (i dag:
 * Bunny Stream-CDN for 9/11-film, Supabase Storage for seed-filmene) —
 * serveren ser aldrig byterne, og et eksakt mål kræver enten en proxy
 * gennem API-ruten (dobbelt egress + latens) eller Resource Timing
 * (upålideligt cross-origin). Derfor skønnet:
 *
 *   bytes ≈ sete sekunder × (filens størrelse / filmens længde)
 *
 * Filens størrelse er Bunny's reelle storageSize ved upload (9/11-
 * integrationen) — samme værdi som tidligere HEAD. Reelle CDN-bygter
 * via Bunny's Analytics/Usage-API er lancering-backlog.
 *
 * Antagelser (bevidst konservative):
 * - CBR-agtig mp4: progressiv download, ingen adaptiv strøm endnu.
 * - Browsers range-overshoot (~10-20%) ignoreres — skønnet
 *   undervurderer dermed let; det kalibreres mod Bunny's/Supabases
 *   dashboaredets samlede båndbredde, når der er rigtige seere.
 * - Ukendt størrelse (seed/placeholder) giver 0 — aldrig et digt.
 */
export function estimateEgressBytes(
  watchedSec: number,
  fileSizeBytes: number | null,
  durationSec: number,
): number {
  if (!fileSizeBytes || durationSec <= 0 || watchedSec <= 0) return 0;
  return Math.round((fileSizeBytes / durationSec) * watchedSec);
}