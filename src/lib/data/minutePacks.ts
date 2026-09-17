/**
 * Minutpakker — Doccys' pris-model.
 *
 * Priserne er globale baseline i DKK ekskl. moms; moms tilføjes
 * pr. land af Stripe Tax i checkout (tax_behavior: exclusive).
 * pack-id'erne matcher check-constraintet i
 * supabase/migrations/20260917_minutpakker_ledger.sql.
 */

export type MinutePack = {
  id: "pack-1000" | "pack-2000" | "pack-3000";
  minutes: number;
  /** DKK ekskl. moms */
  priceDkkExcl: number;
};

export const MINUTE_PACKS: MinutePack[] = [
  { id: "pack-1000", minutes: 1000, priceDkkExcl: 39 },
  { id: "pack-2000", minutes: 2000, priceDkkExcl: 59 },
  { id: "pack-3000", minutes: 3000, priceDkkExcl: 79 },
];

/** Affiliate-belønning: 250 minutter til koderens ejer ved køberens første køb */
export const AFFILIATE_REWARD_SECONDS = 15_000;

/** Finder en pakke ud fra dens id (null = ukendt id) */
export function findMinutePack(packId: string): MinutePack | null {
  return MINUTE_PACKS.find((pack) => pack.id === packId) ?? null;
}