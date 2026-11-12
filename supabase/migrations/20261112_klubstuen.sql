-- 20261112_klubstuen.sql — KLUBSTUEN: eksklusiv væg for seere i Legende-ti-
-- er (brugerens beslutninger 12/11: klubstue-væg [én indsæt-kun fælles væg,
-- BulletinBoard-mønsteret] · låst dør-teaser for alle under Legende · KUN
-- Legender kan læse OG skrive).
--
-- TILLIDSMODEL: medlemskab kan ikke lyves af klienten. seer_flair-view'et
-- (20261110) er sandhedskilden (tier 3 = 600.000 afregnede sekunder =
-- 10.000 min, samled af view_sessions via status <>'active' + watched_
-- seconds > 0) — er_klub_medlem() læser det som security definer, fordi
-- en almindelig brugers RLS ellers ville gøre view_sessions ulæselig i
-- policyen (har_set_film-præcedensen). funktionen er PARAMETRELØS: den
-- kan kun afsløre den kaldendes egen status — ingen "er X Legende? "-probe.
--
-- MODERATION (redaktions-arbejdsgang, i SQL Editor/service role — der
-- findes INGEN update/delete-policies, så RLS er vægten):
--   fastgør (kun hvis intet er fastgjort — ellers 23505):
--     update klub_posts set pinned = true where id = '<uuid>';
--   slet spam:
--     delete from klub_posts where id = '<uuid>';
--
-- TÆRSKEL-SYNKRONISERING: 600.000 s bor i seer_flair (denne migrations
-- foretrukne kilde) + SEER_TRAE i src/lib/viewerStatus.ts. Ændres et
-- trin, skal seer_flair-view'et (20261110) med.
--
-- KODEN FØR MIGRATION (graceful, flair-mønsteret): klub_posts er
-- PGRST205 for browser-klienten → væg/dør renderes uden tællere;
-- er_klub_medlem-kaldet fejler → døren vises som lukket. Intet knækker.
--
-- VERIFIKATION (kør efter — 1-2 i SQL Editor, 3-6 udefra/anon):
--   1) select * from information_schema.columns
--        where table_name = 'klub_posts';            -- 5 kolonner
--   2) select proname, proacl from pg_proc
--        where proname in ('er_klub_medlem','klub_taeler');
--        -- proacl: postgres, service_role, anon, authenticated —
--        -- ALDRIG public (EXECUTE-hullet, 20260920-rutinen)
--   3) anon-røgtest: GET /rest/v1/klub_posts?select=id
--        → 200 [ ] (policyen afviser pænt — IKKE 500/permission denied)
--   4) anon-røgtest: POST /rest/v1/rpc/er_klub_medlem {} → false
--   5) anon-røgtest: POST /rest/v1/rpc/klub_taeler {}
--        → {"medlemmer":0 (eller mere),"indlaeg":0,"seneste_tid":null}
--   6) positiv test: hejs en test-konto til Legende (SQL-editor under
--      postgres: en afregnede session, status <> 'active', user_id =
--      kontoiden, watched_seconds = 600000; check seer_flair.tier = 3)
--      → væggen åbner i sitet, indlæg kan skrives og vises live i en
--        anden fane (realtime). Ryd test-sessionen bagefter.
--   7) race-test (som postgres i begin/rollback):
--        update klub_posts set pinned = true where id in (to rækker)
--        → 23505 på den anden (partial unique index).

-- 1) TABELLEN — én indsæt-kun væg; ingen updated_at (der redigeres
--    aldrig; fastgørelse/sletning er dashboard-arbejde).
create table if not exists public.klub_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,  -- kontosletning rydder indlæggene (privacy, comments-mønsteret)
  body text not null
    check (length(trim(body)) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_klub_posts_tid
  on public.klub_posts (created_at desc);

-- Ét fastgjort indlæg — DB-håndhævelse, ikke app-logik (TOCTOU-vagt)
create unique index if not exists uq_klub_posts_pinned
  on public.klub_posts (pinned) where pinned;

alter table public.klub_posts enable row level security;

-- 2) MEDLEMSFUNKTIONEN — parametreløs: kigger på auth.uid() og svarer,
--    om NETOP den bruger er i Legende-ti-eren (seer_flair.tier = 3).
--    security definer: RLS på view_sessions ville ellers gøre view'et
--    tomt for subquery'en i policyen (har_set_film-præcedensen).
create or replace function public.er_klub_medlem()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.seer_flair
    where user_id = auth.uid() and tier = 3
  );
$$;

-- 3) POLICIES — døren selv: medlemmer læser og skriver; ingen anden.
drop policy if exists "klub_laese_som_medlem" on public.klub_posts;
create policy "klub_laese_som_medlem" on public.klub_posts
  for select using (er_klub_medlem());

drop policy if exists "klub_skrive_som_medlem" on public.klub_posts;
create policy "klub_skrive_som_medlem" on public.klub_posts
  for insert with check (er_klub_medlem());

-- NB: INGEN update/delete-policies — moderation/fastgørelse er
-- service-role-arbejde (redaktions-arbejdsgangen i filens hoved).

-- 4) TÆLLERNE — offentlig RPC (top_creators/film_faedighedsstats-
--    mønsteret) som den låste dør bruger: MEDLEMSTAL + INDLÆG-TAL +
--    seneste_tid (hvor ny klubben er) — INGEN navne/indhold bag låst dør.
create or replace function public.klub_taeler()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'medlemmer',   (select count(*) from public.seer_flair where tier = 3),
    'indlaeg',     (select count(*) from public.klub_posts),
    'seneste_tid', (select max(created_at) from public.klub_posts)
  );
$$;

-- 5) EXECUTE-HULLET — 20260920-rutinen stoppede auto-grants på nye
--    funktioner, så begge får grants eksplícit, og ALLE funktioner er
--    oprettet FØR grants. NB: anon SKAL have execute på er_klub_medlem,
--    fordi RLS-policier evaluerer med den kaldende rolles privilegier —
--    uden grant ville anon-SELECT på klub_posts give permission denied
--    (ikke et pænt tomt svar).
--    Funktionerne kan kun afsløre DEN KALDENDES egen status.
revoke execute on function public.er_klub_medlem() from public;
grant execute on function public.er_klub_medlem() to anon, authenticated;

revoke execute on function public.klub_taeler() from public;
grant execute on function public.klub_taeler() to anon, authenticated;

-- 6) REALTIME — fuld rækkeidentitet (så DELETE-eventer kan filtreres i
--    "old" af klientabonnementet) + idempotent publication-tilføjelse.
alter table public.klub_posts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'klub_posts'
  ) then
    alter publication supabase_realtime add table public.klub_posts;
  end if;
end $$;
