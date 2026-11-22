-- 20261122_ai_deklaration.sql
-- ============================================================
-- AI-DEKLARATION PR. FILM (brugerens ønske 22/11 — EU AI Act-
-- praksis: synlig mærkning af AI-genereret indhold + gemt
-- erklæring som bevis).
--
-- Mønster: film-licens-migrationen (20260923_film_licens) —
-- kolonner WITHOUT default-dato (falsk bevisføring er udelukket);
-- beviset (hvad + hvornår + hvilken version) skrives af POST
-- /api/films fra SERVERTID ved upload:
--   ai_declared      — skaberens erklæring: true = filmens indhold
--                      indeholder AI-genereret materiale (billeder,
--                      stemmer, musik).
--   ai_declared_at   — servertid for erklæringen (ALSKETTILSTANDE,
--                      også ved false — beviset gælder begge stater).
--   ai_policy_version — tekstversion ('2026-11-22') bundet til
--                      API-konstanten AI_POLICY_VERSION.
-- UDEBLIVER: backfill — eksisterende film får ai_declared = false
-- (default) med ai_declared_at = null; det er korrekt: seed-filmene
-- og brugerens egne er lavet uden AI-genereret indhold, og der er
-- ikke afgivet erklæring for de gamle rækker. Redaktionen kan flips
-- i dashboardet når som helst (som payout_rate).
-- KODEN FEJLER PÆNT PRE-MIGRATION: insert med de nye kolonner
-- genforsøges uden dem, hvis kolonnerne mangler (PGRST-afvisning
-- med kolonne-navnet).
--
-- VERIFIKATIONS-SQL (efter kørsel):
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'documentaries'
--      and column_name like 'ai_%';
--     forventes: ai_declared (boolean, 'false', 'NO')
--                ai_declared_at (timestamptz, null, 'YES')
--                ai_policy_version (text, null, 'YES')

alter table documentaries
  add column if not exists ai_declared boolean not null default false,
  add column if not exists ai_declared_at timestamptz,
  add column if not exists ai_policy_version text;
