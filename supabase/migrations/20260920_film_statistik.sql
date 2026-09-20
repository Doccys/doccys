-- ============================================================
-- Doccys: film-statistik — færdigheds-badge (offentligt) og
--                  retention pr. decil (ejer-privat)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: funktionerne er
-- create or replace med uændrede signaturer; grants idempotente.
--
-- Formål (20/9): to features deler denne fil, fordi de læser den
-- samme kilde (view_sessions + view_events):
--   1) film_faedighedsstats — "87 % så den færdig"-badget på
--      plakaterne. OFFENTLIGT aggregat.
--   2) film_retention       — drop-off-graf pr. decil i studiet.
--      KUN creatorens ejer.
--
-- Tillidsmodel: begge er security definer, fordi view_sessions
-- står under bruger-RLS (kun egne sessioner læsbart) og derfor
-- ikke kan summeres anonymt. De omgår RLS med vilje — men
-- returnerer KUN aggregater, aldrig rådata:
--   film_faedighedsstats lækker på samme niveau som de seedede
--   total_views/total_completions-kolonner (offentlig adfærds-
--   statistik, adskilt fra penge-statistikken i creator_indtjening).
--   film_retention tjekker ejerskabet eksplicit (creator_indtjening-
--   skabelonen) og er revoked fra anon/public — kun authenticated.
-- Begge filtreer på documentaries.status = 'published' hhv.
-- tjekker filmen via creatorens ejer, så kladder aldrig tælles.

-- 1) film_faedighedsstats(p_slug) — pr. film: hvor mange afsluttede
--    afspilninger, og hvor mange af dem der er set FÆRDIG.
--    p_slug = null → alle publicerede film (ét kald pr. katalogside);
--    ellers kun den ene film. 'afsluttede' = status <> 'active'
--    (både completed og abandoned), 'faerdige' = status = 'completed'.
create or replace function public.film_faedighedsstats(p_slug text default null)
returns table (documentary_slug text, afsluttede bigint, faerdige bigint)
language sql
security definer
set search_path = public
as $$
  select s.documentary_slug,
         count(*) filter (where s.status <> 'active') as afsluttede,
         count(*) filter (where s.status = 'completed') as faerdige
    from public.view_sessions s
    join public.documentaries d on d.slug = s.documentary_slug
   where d.status = 'published'
     and (p_slug is null or s.documentary_slug = p_slug)
   group by s.documentary_slug;
$$;

revoke execute on function public.film_faedighedsstats(text) from anon, public;
grant execute on function public.film_faedighedsstats(text) to anon, authenticated;

-- 2) film_retention(p_slug) — hvor mange af de afsluttede afspilninger
--    der NÅEDE hhv. 10 %, 20 %, … 100 % af filmen. Bucket = den længste
--    nåede position (max(video_time_sec)), IKKE de fakturerbare
--    sekunder: drop-off handler om hvor langt seeren kom. Sessioner
--    uden events tæller med som "nåede intet" (coalesce → 0) — en
--    ærlig kurve. Returnerer jsonb:
--      { "afsluttede": <n>, "naaede": [<10 pct-tal>] }
create or replace function public.film_retention(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration integer;
  v_owner uuid;
  v_total bigint;
  v_naarede bigint;
  v_deciler jsonb := '[]'::jsonb;
  v_i integer;
begin
  -- filmen + dens ejende skaber (seedede skabere har owner null →
  -- ingen kan læse retention for dem; studiet viser intet)
  select d.duration_sec, c.owner_user_id
    into v_duration, v_owner
    from public.documentaries d
    join public.creators c on c.handle = d.creator_handle
   where d.slug = p_slug;

  if v_owner is null then
    raise exception 'Filmen findes ikke eller har ingen ejende skaber'
      using errcode = '42501';
  end if;

  -- Definer omgår RLS — ejerskabet tjekkes eksplicit
  if auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese retention'
      using errcode = '42501';
  end if;

  select count(*) into v_total
    from public.view_sessions
   where documentary_slug = p_slug
     and status <> 'active';

  if v_total = 0 then
    return jsonb_build_object('afsluttede', 0, 'naaede', v_deciler);
  end if;

  for v_i in 1..10 loop
    select count(*) into v_naarede
      from (
        select greatest(0, least(
                 coalesce(max(ve.video_time_sec), 0), v_duration)) as naaet
          from public.view_sessions s
          left join public.view_events ve on ve.session_id = s.id
         where s.documentary_slug = p_slug
           and s.status <> 'active'
         group by s.id
      ) pos
     where pos.naaet >= v_duration * v_i / 10.0;
    v_deciler := v_deciler || to_jsonb(round(v_naarede * 100.0 / v_total)::int);
  end loop;

  return jsonb_build_object('afsluttede', v_total, 'naaede', v_deciler);
end;
$$;

-- ejer-privat: anon og PUBLIC er revoked, kun authenticated — og
-- ejerskabs-tjekket ovenfor gælder stadig
revoke execute on function public.film_retention(text) from anon, public;
grant execute on function public.film_retention(text) to authenticated;