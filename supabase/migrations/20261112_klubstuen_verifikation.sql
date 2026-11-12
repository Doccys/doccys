-- 20261112_klubstuen_verifikation.sql — TJEK-FIL (IKKE en migration!)
-- Læs-only SELECT'er der bekræfter, at 20261112_klubstuen.sql landede
-- komlet. Kør i SQL Editor efter migrations-filen — ingen af tjekken
-- ændrer noget, og de kan køres hvor ofte du vil.
--
-- Forventet: ALLE 5 SELECT'er giver det tal/ja-svar, der står i
-- kommentaren ovenover hver blok. En tom række = det led mangler og
-- kan rettes ved at køre HELE 20261112_klubstuen.sql igen (idempotent).

-- 1) TABELLEN (forventet 5 rækker: id, user_id, body, pinned, created_at)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'klub_posts'
order by ordinal_position;

-- 2) FUNKTIONERNE + GRANTS (forventet 2 rækker; proacl viser alle 4
--    roller — postgres, service_role, anon, authenticated ALDRIG public)
select proname, proacl
from pg_proc
where proname in ('er_klub_medlem','klub_taeler');

-- 3) POLITIKERNE (forventet 2 rækker: klub_laese_som_medlem = SELECT,
--    klub_skrive_som_medlem = INSERT — aldrig UPDATE/DELETE)
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'klub_posts';

-- 4) REALTIME (forventet 1 række: klub_posts) + replica identity
--    (forventet 'full')
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'klub_posts';
select relname, relreplident
from pg_class
where relname = 'klub_posts';

-- 5) SÁRHELINJEN — de to indexes (forventet 2 rækker: idx_klub_posts_tid
--    + uq_klub_posts_pinned [partial, hvor pinned = true])
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'klub_posts';

-- ------------------------------------------------------------ --
-- BONUS — levende røgtests (kør gerne bagefter):

-- A) tælleren kaldbar (som postgres her; anon-røgtesten udefra er
--    særskilt - API-svar: {"medlemmer":0,"indlaeg":0,"seneste_tid":null})
select public.klub_taeler();

-- B) medlemsfunktionen for dig selv (postgres-session har IKKE
--    auth.uid() → forventet false — den svarer om login-brugeren,
--    ikke om dig i SQL Editor)
select public.er_klub_medlem();

-- C) POSITIV TEST (valgfri, kræver en rigtigt login-konto) — hejs en
--    test-konto til Legende: erstat <konto-uuid> med kontoens id fra
--    Authentication → Users, afregn en 600.000-sekunder-session (10.000
--    min), og se at er_klub_medlem() for DEN bruger derefter er true:
-- select public.er_klub_medlem();  -- som den pågældende bruger i sitet
-- insert into public.view_sessions
--   (documentary_slug, user_id, status, watched_seconds)
-- values ('isens-sidste-vinter', '<konto-uuid>', 'finished', 600000)
-- on conflict do nothing;  -- NB: sæt kun relevante kolonner for din
--                           -- skema-version — tjek først med
-- select column_name from information_schema.columns
--   where table_name = 'view_sessions';
-- NB: hejste-sessionen SKAL ryddes igen bagefter (test-data skal ikke
-- bo i afregningens regnskab) — slet rækken hvis du kun ville teste,
-- og skriv i stedet bare et rigtigt indlæg fra sitet, når væggen er åbnet.
