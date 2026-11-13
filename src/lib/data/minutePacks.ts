/**
 * Minutpakker — Doccys' pris-model (USD-repricing, brugerens beslutning
 * 13/11: $6.99/$10.99/$13.99, sats $0.30 pr. 100 min, USD overalt).
 *
 * USD er Doccys' ENE afregningsvaluta: pakkernes basis-priser sendes
 * til Stripe i USD (tax_behavior: exclusive) og gemmes i
 * credit_purchases.price_usd_excl — DANSK moms (25 %) lægges IKKE
 * oveni på forhånd længere. Stripe Tax beregner kundens lands moms pr.
 * faktureringsland over basisprisen, så checkout-visningen altid er
 * "$X + moms" — og UI'et viser nøjagtig samme $X (visning = betaling).
 * Basis-tallene er valgt så øre-beløbene bliver heltal
 * (699/1099/1399).
 *
 * Skabernes sats er $0.30 pr. 100 gyldige minutter
 * (documentaries.payout_rate_usd, default — migrations-konstant), og
 * selvbetjenings-tærsklen er $25 (creator_payout_requests + /api/payouts
 * + PayoutPanel konstanten HERUNDER er de tre sandhedssteder).
 *
 * pack-id'erne matcher check-constraintet i
 * supabase/migrations/20260917_minutpakker_ledger.sql.
 */

export type MinutePack = {
  id: "pack-1000" | "pack-2000" | "pack-3000";
  minutes: number;
  /** USD ekskl. moms — sendes til Stripe og gemmes i DB */
  priceUsdExcl: number;
};

export const MINUTE_PACKS: MinutePack[] = [
  { id: "pack-1000", minutes: 1000, priceUsdExcl: 6.99 },
  { id: "pack-2000", minutes: 2000, priceUsdExcl: 10.99 },
  { id: "pack-3000", minutes: 3000, priceUsdExcl: 13.99 },
];

/** Affiliate-belønning: 250 minutter til koderens ejer ved køberens første køb */
export const AFFILIATE_REWARD_SECONDS = 15_000;

/** Finder en pakke ud fra dens id (null = ukendt id) */
export function findMinutePack(packId: string): MinutePack | null {
  return MINUTE_PACKS.find((pack) => pack.id === packId) ?? null;
}

/**
 * Konservativt pris-estimat for en hel film i USD: regnet med MINDSTE
 * pakkes $/min — større pakker gør filmen billigere, så estimatet
 * aldrig lover for lidt. Bruges på paywallen ("ca. X for hele filmen —
 * ser du den aldrig, koster den $0"). Basisprisen er ekskl. moms,
 * som checkout'en (Stripe Tax lægger kundens lands moms oveni).
 */
export function estimateFilmPriceUsd(requiredMinutes: number): number {
  const pack = MINUTE_PACKS[0];
  return (requiredMinutes * pack.priceUsdExcl) / pack.minutes;
}
