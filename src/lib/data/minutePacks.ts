/**
 * Minutpakker — Doccys' pris-model (USD-repricing 13/11; prismatchen
 * FULDT FÆRDIG med brugerens oprindelige "inkl. moms"-model).
 *
 * USD er Doccys' ENE afregningsvaluta. Pakkernes priser er BRUTTO
 * (prisen kunden betaler, inkludering lokal moms): checkout'en sender
 * beløbet (6.99/10.99/13.99 USD) med tax_behavior: "inclusive", og
 * Stripe udreder moms efter kundens faktureringsland — en dansker
 * betaler præcis $6.99 med dansk moms indbagt, en amerikaner $6.99
 * uden moms. UI'et viser nøjaktig det samme tal → visning = betaling
 * i 100 % af tilfældene. Øre-beløbene er heltal (699/1099/1399).
 *
 * TALLENE er PRIS-PARITET med de gamle DKK-priser (beslutning 13/11,
 * 2. gang: $6.99/$10.99/$13.99 blev først skiftet ned til $5.99-
 * stigen efter et "110 kr"-tjek, der byggede på en forkert kurs —
 * dagskursen 6,744 kr/USD giver 47/74/94 kr, dvs. paritet med
 * 49/75/99 — og pakkens NETTO i DK (brutto ÷ 1,25 = $5.59/$8.79/
 * $11.19) genvinder samtidig de gamle netto-tal (39,20/60,00/79,20
 * kr), som den billigere stige havde ædt. Worst-caserne (G-regnskabet
 * i SKEMA-INDTJENING) bliver samtidig grønne i EU).
 *
 * Skabernes sats er stadig $0.30 pr. 100 gyldige minutter (net-økonomi
 * afleder momsen, som før) og selvbetjenings-tærsklen $25.
 *
 * pack-id'erne matcher check-constraintet i
 * supabase/migrations/20260917_minutpakker_ledger.sql.
 */

export type MinutePack = {
  id: "pack-1000" | "pack-2000" | "pack-3000";
  minutes: number;
  /** USD BRUTTO (inkl. lokal moms) — sendes til Stripe og gemmes i DB */
  priceUsd: number;
};

export const MINUTE_PACKS: MinutePack[] = [
  { id: "pack-1000", minutes: 1000, priceUsd: 6.99 },
  { id: "pack-2000", minutes: 2000, priceUsd: 10.99 },
  { id: "pack-3000", minutes: 3000, priceUsd: 13.99 },
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
 * ser du den aldrig, koster den $0"). Beløbet er BRUTTO (inkl. lokal
 * moms) — præcis som pakkens pris, så estimer og checkout viser samme.
 */
export function estimateFilmPriceUsd(requiredMinutes: number): number {
  const pack = MINUTE_PACKS[0];
  return (requiredMinutes * pack.priceUsd) / pack.minutes;
}
