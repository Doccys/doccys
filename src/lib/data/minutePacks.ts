/**
 * Minutpakker — Doccys' pris-model.
 *
 * Prispointene er fastlagt INKLUSIV dansk moms (25 %) som global
 * standard: 49 / 75 / 99 kr. Basisprisen ekskl. moms er bag-udregnet
 * herfra (39,20 / 60,00 / 79,20 kr) og er det, der sendes til Stripe
 * (med tax_behavior: exclusive) og gemmes i credit_purchases.
 * Stripe Tax lægger kundens lands moms oveni — danske kunder ser
 * derved præcis pakkeprisen, kunder i lande med lavere moms ser
 * mindre. De ekskl.-moms-baser er valgt så øre-beløbene bliver
 * heltal (3920/6000/7920).
 *
 * pack-id'erne matcher check-constraintet i
 * supabase/migrations/20260917_minutpakker_ledger.sql.
 */

export type MinutePack = {
  id: "pack-1000" | "pack-2000" | "pack-3000";
  minutes: number;
  /** DKK ekskl. moms — sendes til Stripe og gemmes i DB */
  priceDkkExcl: number;
  /** Dansk standardpris inkl. 25 % moms — vises i UI */
  priceDkkInclDkVat: number;
};

export const MINUTE_PACKS: MinutePack[] = [
  { id: "pack-1000", minutes: 1000, priceDkkExcl: 39.2, priceDkkInclDkVat: 49 },
  { id: "pack-2000", minutes: 2000, priceDkkExcl: 60, priceDkkInclDkVat: 75 },
  { id: "pack-3000", minutes: 3000, priceDkkExcl: 79.2, priceDkkInclDkVat: 99 },
];

/** Affiliate-belønning: 250 minutter til koderens ejer ved køberens første køb */
export const AFFILIATE_REWARD_SECONDS = 15_000;

/** Finder en pakke ud fra dens id (null = ukendt id) */
export function findMinutePack(packId: string): MinutePack | null {
  return MINUTE_PACKS.find((pack) => pack.id === packId) ?? null;
}