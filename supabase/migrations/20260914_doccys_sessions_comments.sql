-- ============================================================
-- Doccys: view-sessions, rå hændelseslog og kommentarer
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabeller/ Policies oprettes kun hvis de mangler,
-- seeds bruger faste id'er med on conflict do nothing).
--
-- Tillidsmodel: en session behandles som en "bearer token" —
-- den, der kender sessionens uuid, må læse og vedlægge
-- hændelser til den (samme model som in-memory-versionen).
-- Loggede brugeres sessioner er derudover bundet til deres
-- user_id og kan kun røres af dem selv.

-- ------------------------------------------------------------
-- 1) VIEW-SESSIONS — én række pr. afspilning
-- ------------------------------------------------------------
create table if not exists public.view_sessions (
  id uuid primary key default gen_random_uuid(),
  documentary_slug text not null
    references public.documentaries (slug) on delete cascade,
  -- null = anonym seer; identiteten sættes server-side i API-ruten
  user_id uuid references auth.users (id) on delete set null,
  -- enhedsmetadata som jsonb: intet felt kasseres (ML-ready)
  device jsonb not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  -- hele SessionVerdict-dommet (features, signals, modelVersion)
  verdict jsonb
);

create index if not exists idx_view_sessions_user
  on public.view_sessions (user_id);
create index if not exists idx_view_sessions_slug
  on public.view_sessions (documentary_slug);
create index if not exists idx_view_sessions_started
  on public.view_sessions (started_at desc);

alter table public.view_sessions enable row level security;

drop policy if exists "laes_egne_eller_gaeste_sessions" on public.view_sessions;
create policy "laes_egne_eller_gaeste_sessions" on public.view_sessions
  for select using (user_id is null or user_id = auth.uid());

drop policy if exists "opret_session" on public.view_sessions;
create policy "opret_session" on public.view_sessions
  for insert with check (user_id is null or user_id = auth.uid());

drop policy if exists "opdater_egne_eller_gaeste_sessions" on public.view_sessions;
create policy "opdater_egne_eller_gaeste_sessions" on public.view_sessions
  for update
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) VIEW-EVENTS — append-only rålog (ML-træningsdata)
-- ------------------------------------------------------------
-- Råloggen redigeres og sorteres ALDRIG om; seq er rækkefølgen
-- hændelserne modtoges i. payload opbevarer alle ekstra felter
-- (playbackRate, seekFrom/To, klientens rå-felter) ustruktureret.

create table if not exists public.view_events (
  id bigint generated always as identity primary key,
  session_id uuid not null
    references public.view_sessions (id) on delete cascade,
  seq integer not null,
  type text not null,
  -- klientens ur i ms epoch — bevares uændret til jitter-analyse
  client_timestamp double precision not null,
  video_time_sec double precision not null,
  payload jsonb
);

create index if not exists idx_view_events_session
  on public.view_events (session_id, seq);

alter table public.view_events enable row level security;

drop policy if exists "laes_events" on public.view_events;
create policy "laes_events" on public.view_events
  for select using (
    exists (
      select 1 from public.view_sessions s
      where s.id = session_id
        and (s.user_id is null or s.user_id = auth.uid())
    )
  );

drop policy if exists "tilfoej_events" on public.view_events;
create policy "tilfoej_events" on public.view_events
  for insert with check (
    exists (
      select 1 from public.view_sessions s
      where s.id = session_id
        and (s.user_id is null or s.user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 3) COMMENTS — offentlig diskussion under hver film
-- ------------------------------------------------------------
-- authorName afgøres server-side i API-ruten (e-mail for
-- loggede brugere, frit navn for gæster) — RLS sikrer blot, at
-- user_id aldrig kan forfalskes: enten ens egen eller null.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  documentary_slug text not null
    references public.documentaries (slug) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_name text not null
    check (length(trim(author_name)) between 1 and 120),
  body text not null
    check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_slug
  on public.comments (documentary_slug, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "alle_kan_laese_kommentarer" on public.comments;
create policy "alle_kan_laese_kommentarer" on public.comments
  for select using (true);

drop policy if exists "skriv_kommentar" on public.comments;
create policy "skriv_kommentar" on public.comments
  for insert with check (user_id is null or user_id = auth.uid());

-- ------------------------------------------------------------
-- 4) Seed: de fire udstillede diskussionsindlæg
--    (faste id'er gør seeding-idempotent)
-- ------------------------------------------------------------
insert into public.comments (id, documentary_slug, author_name, body, created_at) values
  ('00000000-0000-0000-0000-0000000000c1',
   'isens-sidste-vinter', 'Mette',
   'Scenen hvor hun lægger båndoptageren på isen og bare venter. Jeg sad helt stille i to minutter efter.',
   '2026-09-08T12:00:00+00:00'),
  ('00000000-0000-0000-0000-0000000000c2',
   'isens-sidste-vinter', 'Klaus',
   'Ser den anden gang. Bemærk hvor lidt musik der bruges — det gør isen mere nærværende.',
   '2026-09-11T12:00:00+00:00'),
  ('00000000-0000-0000-0000-0000000000c3',
   'saltmaleren', 'Anna',
   'Hendes sidste penselstrøg på marsken gik mig på. Smukt om at miste sit motiv med dignitet.',
   '2026-09-02T12:00:00+00:00'),
  ('00000000-0000-0000-0000-0000000000c4',
   'byen-under-betonen', 'Jeppe',
   'Arkivklippene fra sporvejen ved Blågårds Plads er rene guld. Nogen der ved, hvor de stammer fra?',
   '2026-08-30T12:00:00+00:00')
on conflict (id) do nothing;