-- ============================================================
-- Doccys: top_creators — offentligt Top 10-leaderboard
--                       (gyldige minutter, seneste 30 dage)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: create or replace med
-- uændret signatur; grants idempotente.
--
-- Formål (26/9): automatisk opdateret Top 10-liste over skabere
-- på /creators — indtjeningens bevisføring, ikke annonceplads
-- (listen kan aldrig købes). Rangeres på GYLDIGE MINUTTER de
-- seneste 30 dage: tættest på indtjening uden at offentliggøre kr
-- — penge forbliver private i studiet (præcedens:
-- creator_indtjening blev gjort privat i 20260919), mens
-- adfærds-aggregater er offentlige (film_faedighedsstats).
--
-- PENGEBEGREBET — samme gyldigheds-filter som creator_tal og
-- creator_indtjening: user_id is not null, status <> 'active' og
-- verdict->>'verdict' = 'valid'. Kun publicerede film tæller —
-- kladder kan aldrig rangere.
--
-- Tillidsmodel: security definer (view_sessions står under
-- bruger-RLS og kan ikke summeres direkte af anonyme kald), men
-- funktionen returnerer KUN aggregater, aldrig rådata. Til
-- forskel fra creator_tal er der INGEN ejer-tjek: kaldet er
-- offentligt (anon), så /creators-siden kan læse det uden login.
-- Automatiseringen er Next.js ISR (revalidate = 3600) — ingen
-- cron; RPC'en er billig (én aggregation over 30 dages rækker).

create or replace function public.top_creators()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'handle', t.handle, 'navn', t.navn, 'land', t.land,
               'minutter', t.minutter, 'afspilninger', t.afspilninger)
             order by t.minutter desc, t.navn)
      from (
        select c.handle, c.name as navn, c.country as land,
               round(sum(s.watched_seconds) / 60.0) as minutter,
               count(*) as afspilninger
          from public.view_sessions s
          join public.documentaries d on d.slug = s.documentary_slug
          join public.creators c on c.handle = d.creator_handle
         where s.started_at >= now() - interval '30 days'
           and s.user_id is not null
           and s.status <> 'active'
           and s.verdict ->> 'verdict' = 'valid'
           and d.status = 'published'
         group by c.handle, c.name, c.country
        having round(sum(s.watched_seconds) / 60.0) > 0
         order by minutter desc, navn asc
         limit 10
      ) t
  ), '[]'::jsonb);
end;
$$;

-- Offentlig læsning: 20260920_rpc_tilladelser fjernede
-- default-grants (ingen grant = 42501), så anon skal have
-- eksplicit grant — ellers viser /creators aldrig listen.
revoke execute on function public.top_creators() from public;
grant execute on function public.top_creators() to anon, authenticated;

-- ------------------------------------------------------------
-- Verifikation (kør hver del for sig):
-- 1) Positiv test — SQL Editor kører som postgres (har execute
--    som ejer). Forventer max 10 rækker, kun skabere med
--    gyldige minutter > 0 i vinduet (tom liste er korrekt, hvis
--    alle test-film er kladder — flip én til published for at
--    se data):
--    select public.top_creators();
--
-- 2) Grants — viser {postgres,service_role,anon,authenticated}
--    og intet public (information_schema.routines har INGEN
--    proacl-kolonne — brug pg_proc, jf. 20260927-erfaringen):
--    select p.proname, p.proacl
--      from pg_catalog.pg_proc p
--     where p.proname = 'top_creators';
--
-- 3) E2E (browseren): /da/creators → Top 10-sektionen øverst;
--    minuttal kan efterprøves mod:
--    select c.handle, round(sum(s.watched_seconds) / 60.0) as min
--      from public.view_sessions s
--      join public.documentaries d on d.slug = s.documentary_slug
--      join public.creators c on c.handle = d.creator_handle
--     where s.started_at >= now() - interval '30 days'
--       and s.user_id is not null and s.status <> 'active'
--       and s.verdict ->> 'verdict' = 'valid'
--       and d.status = 'published'
--     group by c.handle
--     order by min desc;
-- ------------------------------------------------------------