-- ============================================================
-- Doccys: slet konto — købsdata kan anonymiseres
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: DROP NOT NULL på en
-- allerede nullable kolonne er en no-op i Postgres.
--
-- Formål (28/9): selvbetjent kontosletning (DELETE /api/account).
-- Ved sletning nulstiller ruten user_id på brugerens credit_
-- purchases- og credit_ledger-rækker, FØR admin.deleteUser
-- kaskaderer dem væk (begge FK'er er on delete cascade). Rækkerne
-- overlever ANONYME: bogføringslovens 5-års-regel + privatlivs-
-- politikkens løfte (legal.privacy.sections.s6: "Købsdata og
-- beviser opbevares i fem år"). NULL-kolonnen er selve grænse-
-- fladen — beviset (beløb, stripe-id, moms-grundlag) består,
-- koblingen til personen brydes.
--
-- Sikkerhed: rækker med user_id = null er ulæselige for alle
-- (policies kræver auth.uid() = user_id, som aldrig er sandt for
-- null) — anonymiserede rækker er dermed MERE private end da de
-- var bundet til kontoen. saldo_sekunder() og indfri_koeb() permer
-- uændret: deres user_id = auth.uid()-filtre rammer aldrig null-
-- rækker. Der ændres intet ved policies, grants eller funktioner.
--
-- FAIL CLOSED: indtil denne migration er kørt, stopper ruten med
-- en NOT NULL-fejl i anonymiseringstrinnet — FØR noget som helst
-- slettes (kommentarer, konto). Best rute-rækkefølgen i
-- src/app/api/account/route.ts.

alter table public.credit_ledger
  alter column user_id drop not null;

alter table public.credit_purchases
  alter column user_id drop not null;

-- ------------------------------------------------------------
-- Verifikation (kør hver del for sig):
-- 1) Begge kolonner skal svare is_nullable = YES (2 rækker):
--    select table_name, is_nullable
--      from information_schema.columns
--     where table_schema = 'public'
--       and column_name = 'user_id'
--       and table_name in ('credit_ledger', 'credit_purchases');
--
-- 2) Fail-closed-runden (kun på et test-projekt/testkonto):
--    update public.credit_ledger set user_id = null
--     where false;  -- fejler kun hvis kolonnen stadig er NOT NULL
-- ------------------------------------------------------------