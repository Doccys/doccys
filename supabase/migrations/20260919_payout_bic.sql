-- ============================================================
-- Doccys: valgfrit BIC/SWIFT-felt til creator-udbetaling
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- Formål (19/9): IBAN er alene nok inden for SEPA (alle platformens
-- 8 lande), men creatorer med konto UDEN for SEPA (fx i USA) skal
-- bruge bankens BIC/SWIFT-kode. Feltet er VALGFRIT — det udfyldes
-- kun, hvis banken kræver det. Ingen ny constraint: check-
-- constrainten fra 20260919_creator_udbetaling (reg.nr.-par ELLER
-- IBAN) røres ikke — BIC er et supplement, alene en erstatning.
--
-- ARBEJDSGANG for redaktionen er uændret: select pending →
-- overfør i banken (BIC med i overførslen, hvis oplyst) →
-- kvitter via creator_payouts + status 'paid' (se den gamle
-- migrations kommentarer).

alter table public.creator_payout_methods
  add column if not exists bic text;