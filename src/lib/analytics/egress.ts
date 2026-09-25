/**
 * Egress-estimat: omsætter sete sekunder til leverede bytes.
 *
 * Video stråmmes direkte fra Supabase Storage til browseren —
 * serveren ser aldrig byterne, og et eksakt mål kræver enten en
 * proxy gennem API-ruten (dobbelt egress + latens) eller
 * Resource Timing (upålideligt cross-origin). Derfor skønnet:
 *
 *   bytes ≈ sete sekunder × (filens størrelse / filmens længde)
 *
 * Antagelser (bevidst konservative):
 * - CBR-agtig mp4: progressiv download, ingen adaptiv strøm endnu.
 * - Browsers range-overshoot (~10-20%) ignoreres — skønnet
 *   undervurderer dermed let; det kalibreres mod Supabase-
 *   dashbordets samlede båndbredde, når der er rigtige seere.
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