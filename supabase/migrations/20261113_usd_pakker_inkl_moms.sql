-- 20261113_usd_pakker_inkl_moms.sql — prismatchen FULDT FÆRDIG: pakkens
-- pris er inkl. moms (brugerens gamle model — "priser sat inkl. moms
-- med lokationsbestemt mom"), nu i USD.
--
-- Model: checkout'en sender brutto-beløbet (6.99/10.99/13.99 USD) med
-- tax_behavior "inclusive" — Stripe udreder lokal moms (eks. 25 % DK)
-- INGEN beløbet, så kunden betaler PRÆCIS det tal, UI'et viser, i alle
-- lande. Danskerens pack-1000 er dermed $6.99 med ~$1.40 indbagt DK-
-- moms (kompenserer for 49 kr's øre-problematik med ekskl.-priser).
--
-- Kodeændringen (allerede skrevet): checkout-ruten + minutePacks.ts +
-- types læser kolonnen price_usd (gross) — NEDENSTÅENDE SKAL KØRES
-- FØR push.
--
-- Idempotent: vogtet af information_schema-tjek.
--
-- VERIFIKATION:
--   1) information_schema-tjek: ingen kolonner med 'price_usd_excl'
--      (og én kolonne 'price_usd'):
--      select column_name from information_schema.columns
--       where table_schema='public' and table_name='credit_purchases'
--         and column_name like 'price%';
--   2) Test-køb i Stripe TEST-mode: UI $6.99 → checkout $6.99 inkl.
--      moms-linje (DK-adresse) → credit_purchases.price_usd = 6.99.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'credit_purchases'
       and column_name = 'price_usd_excl'
  ) then
    -- gamle (test-)rækker var omregnet til ekskl.-basis (÷7,00 i
    -- 20261113_usd_repricing); giv dem tilbage DK-grossen (×1,25,
    -- round 2 — test-rækker, bogførelsen bor i Stripe uanset).
    update public.credit_purchases
       set price_usd_excl = round(price_usd_excl * 1.25, 2);
    alter table public.credit_purchases
      rename column price_usd_excl to price_usd;
  end if;
end $$;
