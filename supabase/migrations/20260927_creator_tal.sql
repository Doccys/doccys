-- ============================================================
-- Doccys: creator_tal — studiets "Dine tal": indtjeningens
--                       bevisfoering (minutter → kr)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: create or replace med
-- uændret signatur; grants idempotente.
--
-- Formål (26/9): skaberen skal kunne efterprøve sin indtjening.
-- I dag viser studiet kun retention-kurven, og profilens
-- visninger/færdigseende er SEEDEDE pyntetal — pengene kommer
-- reelt fra view_sessions. Denne RPC leverer alt til studiets
-- nye "Dine tal"-sektion i ét kald:
--   ialt   — gyldige minutter + kr (hele perioden)
--   film   — pr. film: afspilninger, unikke seere, gyldige
--            minutter, optjent kr, sats, færdigsået %, kommentarer,
--            likes (også kladder — de viser 0 og beviser at intet
--            betaler før publicering)
--   daglig — seneste 30 dage: dato (DK-døgn), minutter, kr;
--            0-dage medtages (flad kurve er information)
--   seere  — sprog (top 5) + enhed fra device-metadata, over
--            ALLE sessioner inkl. gæster — "hvem ser", ikke "hvem
--            betaler"
--
-- Tillidsmodel: security definer efter film_retention-skabelonen —
-- view_sessions står under bruger-RLS og kan ikke summeres direkte
-- af creatoren. Definer omgår RLS med vilje men returnerer KUN
-- aggregater, aldrig rådata; ejerskabet tjekkes eksplicit (42501
-- for alle undtagen auth.uid() = owner_user_id; seed-profiler med
-- owner null afvises).
--
-- PENGEBEGREBET — SKAL holdes i sync med creator_indtjening
-- (20260920_payout_rate): kun sessioner med user_id not null,
-- status <> 'active' og verdict->>'verdict' = 'valid' tæller;
-- kr = sum(watched_seconds * filmens payout_rate_dkk) / 60 / 100,
-- summeret FØR afrunding. Formlen findes i to funktioner indtil
-- den skal ændres — så refaktoreres til fælles SQL-hjælper.

create or replace function public.creator_tal(p_creator_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

  if v_owner is null or auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese tallene'
      using errcode = '42501';
  end if;

  return jsonb_build_object(

    -- 1) I alt: gyldige minutter + kr over hele perioden
    'ialt', (
      select jsonb_build_object(
               'minutter', coalesce(round(sum(s.watched_seconds) / 60.0), 0),
               'kr', coalesce(round(sum(s.watched_seconds * d.payout_rate_dkk)
                                   / 60.0 / 100.0, 2), 0))
        from public.view_sessions s
        join public.documentaries d on d.slug = s.documentary_slug
       where d.creator_handle = p_creator_handle
         and s.user_id is not null
         and s.status <> 'active'
         and s.verdict ->> 'verdict' = 'valid'
    ),

    -- 2) Pr. film: adfærd (alle sessioner) + penge (gyldige) +
    --    engagement. Kladder medtages — de får 0 og viser at intet
    --    betaler før publicering.
    'film', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'slug', f.slug, 'titel', f.titel, 'status', f.status,
                 'sats', f.sats, 'afspilninger', f.afspilninger,
                 'unikke_seere', f.unikke_seere,
                 'gyldige_minutter', f.gyldige_minutter,
                 'optjent_dkk', f.optjent_dkk, 'faerdigspct', f.faerdigspct,
                 'kommentarer', f.kommentarer, 'likes', f.likes)
                 order by f.optjent_dkk desc, f.titel),
               '[]'::jsonb)
        from (
          select d.slug, d.title as titel, d.status,
                 d.payout_rate_dkk as sats,
                 coalesce(fs.afspilninger, 0) as afspilninger,
                 coalesce(fs.unikke_seere, 0) as unikke_seere,
                 coalesce(gy.minutter, 0) as gyldige_minutter,
                 coalesce(gy.kr, 0) as optjent_dkk,
                 case when coalesce(fs.afsluttede, 0) > 0
                      then round(fs.faerdige * 100.0 / fs.afsluttede)
                      else 0 end as faerdigspct,
                 coalesce(en.kommentarer, 0) as kommentarer,
                 coalesce(en.likes, 0) as likes
            from public.documentaries d
            -- alle sessioner pr. film: afspilninger + unikke loggede
            left join (
              select documentary_slug,
                     count(*) as afspilninger,
                     count(distinct user_id) as unikke_seere,
                     count(*) filter (where status <> 'active') as afsluttede,
                     count(*) filter (where status = 'completed') as faerdige
                from public.view_sessions
               group by documentary_slug
            ) fs on fs.documentary_slug = d.slug
            -- penge-grundlaget: KUN gyldige, loggede, afregnede
            left join (
              select s.documentary_slug,
                     round(sum(s.watched_seconds) / 60.0) as minutter,
                     round(sum(s.watched_seconds * d2.payout_rate_dkk)
                           / 60.0 / 100.0, 2) as kr
                from public.view_sessions s
                join public.documentaries d2 on d2.slug = s.documentary_slug
               where d2.creator_handle = p_creator_handle
                 and s.user_id is not null
                 and s.status <> 'active'
                 and s.verdict ->> 'verdict' = 'valid'
               group by s.documentary_slug
            ) gy on gy.documentary_slug = d.slug
            -- engagement: kommentarer + likes (offentlige optællinger)
            left join (
              select c.documentary_slug,
                     count(distinct c.id) as kommentarer,
                     count(cl.comment_id) as likes
                from public.comments c
                left join public.comment_likes cl on cl.comment_id = c.id
               group by c.documentary_slug
            ) en on en.documentary_slug = d.slug
           where d.creator_handle = p_creator_handle
        ) f
    ),

    -- 3) Daglig serie, seneste 30 dage. Døgngrænser i DK-tid —
    --    dato-nøglen er teksten af (started_at at time zone
    --    'Europe/Copenhagen')::date.
    'daglig', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'dato', ds.dato::text,
                 'minutter', coalesce(round(g.sum_sec / 60.0), 0),
                 'kr', coalesce(round(g.sum_kr, 2), 0))
                 order by ds.dato),
               '[]'::jsonb)
        from generate_series(
               (now() at time zone 'Europe/Copenhagen')::date - 29,
               (now() at time zone 'Europe/Copenhagen')::date,
               interval '1 day'
             ) as ds(dato)
        left join (
          select (s.started_at at time zone 'Europe/Copenhagen')::date as dag,
                 sum(s.watched_seconds) as sum_sec,
                 sum(s.watched_seconds * d.payout_rate_dkk) / 60.0 / 100.0 as sum_kr
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
             and s.user_id is not null
             and s.status <> 'active'
             and s.verdict ->> 'verdict' = 'valid'
           group by 1
        ) g on g.dag = ds.dato
    ),

    -- 4) Seer-opdeling over ALLE sessioner (gæster inkl.) —
    --    sprog = browserens sprog, top 5; enhed = skærmbredde-
    --    proxy (≤600 mobil, ≤1024 tablet, >1024 computer,
    --    mangler = ukendt). Aggregater, ingen identiteter.
    'seere', (
      select jsonb_build_object(
        'sprog', (
          select coalesce(jsonb_agg(
                   jsonb_build_object('navn', l.sprog, 'antal', l.antal)
                     order by l.antal desc, l.sprog),
                   '[]'::jsonb)
            from (
              select s.device ->> 'language' as sprog, count(*) as antal
                from public.view_sessions s
                join public.documentaries d on d.slug = s.documentary_slug
               where d.creator_handle = p_creator_handle
                 and s.device ->> 'language' is not null
               group by 1
               order by antal desc, sprog
               limit 5
            ) l
        ),
        'enhed', (
          select jsonb_build_object(
            'mobil', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) > 0
                and (s.device ->> 'screenWidth')::int <= 600),
            'tablet', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) > 600
                and (s.device ->> 'screenWidth')::int <= 1024),
            'computer', count(*) filter (
              where (s.device ->> 'screenWidth')::int > 1024),
            'ukendt', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) = 0))
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
        )
      )
    )
  );
end;
$$;

-- Ejer-privat: revoke fra anon og PUBLIC (20260920_rpc_tilladelser
-- fjernede defaults — uden grant er funktionen lukket), kun
-- authenticated; ejerskabs-tjekket gælder stadig oveni.
revoke execute on function public.creator_tal(text) from anon, public;
grant execute on function public.creator_tal(text) to authenticated;

-- ------------------------------------------------------------
-- Verifikation (kør hver del for sig):
-- 1) Negativ test — SQL Editor har ingen auth.uid(), så ejerskabs-
--    tjekket skal afvise (også for en seed-profil med owner null):
--    select public.creator_tal('nordlys-film');
--    Forvent: ERROR 42501 "Kun creatorens ejer kan laese tallene"
--
-- 2) Grants — creator_tal rækken viser kun authenticated:
--    select routine_name, proacl
--      from information_schema.routines
--     where routine_name = 'creator_tal';
--
-- 3) E2E (browseren, logget ind som ejer): /da/creator/studio →
--    "Dine tal" viser reelle tal; efterprøv totalen mod:
--    select round(sum(s.watched_seconds) / 60.0) as minutter,
--           round(sum(s.watched_seconds * d.payout_rate_dkk)
--                 / 60.0 / 100.0, 2) as kr
--      from public.view_sessions s
--      join public.documentaries d on d.slug = s.documentary_slug
--     where d.creator_handle = '<dit handle>'
--       and s.user_id is not null and s.status <> 'active'
--       and s.verdict ->> 'verdict' = 'valid';
-- ------------------------------------------------------------