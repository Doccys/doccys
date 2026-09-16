-- ============================================================
-- Doccys — grundskema (dokumentarer, skabere, visningshistorik,
-- gemte film) til Supabase/Postgres.
--
-- Kørsel: Supabase-dashboardet → SQL Editor → New query → klistr
-- hele filen ind → Run. Filen er idempotent — den kan køres igen.
--
-- Adgangsmodel (RLS):
--   creators, documentaries   → alle kan læse, ingen skriver via API'en
--   watch_history, saved_films → brugeren ser/skriver KUN egne rækker
-- ============================================================

-- ---------- Skabere ----------
create table if not exists public.creators (
  id           text primary key,
  handle       text not null unique,
  name         text not null,
  bio          text not null,
  founded_year int  not null,
  country      text not null,
  created_at   timestamptz not null default now()
);

-- ---------- Dokumentarer ----------
-- Statistik-felterne er redaktionelle (seedede) indtil en service-role
-- opgør dem ud fra view-sessions. sort_order styrer rækkefølgen i
-- kataloget; nr. 1 er "månedens udvalgte" på forsiden.
create table if not exists public.documentaries (
  id                text primary key,
  slug              text not null unique,
  title             text not null,
  synopsis          text not null,
  year              int not null,
  duration_sec      int not null check (duration_sec > 0),
  genres            text[] not null default '{}',
  creator_handle    text not null references public.creators(handle) on delete cascade,
  gradient          text not null,
  video_url         text not null,
  total_views       int not null default 0 check (total_views >= 0),
  total_completions int not null default 0 check (total_completions >= 0),
  valid_completions int not null default 0 check (valid_completions >= 0),
  payout_rate_dkk   numeric(5,2) not null default 0 check (payout_rate_dkk >= 0),
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists documentaries_sort_idx on public.documentaries (sort_order);

-- ---------- Visningshistorik ----------
-- Én række pr. (bruger, film). Skrives i dag, når en færdigsetning
-- valideres som ægte af anti-fraud-systemet (API-ruten /validate).
create table if not exists public.watch_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  documentary_slug text not null references public.documentaries(slug) on delete cascade,
  watched_at       timestamptz not null default now(),
  progress_ratio   numeric(4,3) not null default 0 check (progress_ratio between 0 and 1),
  completed        boolean not null default false
);

create unique index if not exists watch_history_user_doc_idx
  on public.watch_history (user_id, documentary_slug);
create index if not exists watch_history_user_recent_idx
  on public.watch_history (user_id, watched_at desc);

-- ---------- Gemte film (watchlist) ----------
create table if not exists public.saved_films (
  user_id          uuid not null references auth.users(id) on delete cascade,
  documentary_slug text not null references public.documentaries(slug) on delete cascade,
  saved_at         timestamptz not null default now(),
  primary key (user_id, documentary_slug)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.creators     enable row level security;
alter table public.documentaries enable row level security;
alter table public.watch_history enable row level security;
alter table public.saved_films  enable row level security;

-- Katalog + skabere: offentlig læsning, ingen klient-skrivning
drop policy if exists "offentlig laesning" on public.creators;
create policy "offentlig laesning" on public.creators
  for select using (true);

drop policy if exists "offentlig laesning" on public.documentaries;
create policy "offentlig laesning" on public.documentaries
  for select using (true);

-- Visningshistorik: kun egne rækker
drop policy if exists "egen historik" on public.watch_history;
create policy "egen historik" on public.watch_history
  for select using (auth.uid() = user_id);

drop policy if exists "indsaet egen historik" on public.watch_history;
create policy "indsaet egen historik" on public.watch_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "opdater egen historik" on public.watch_history;
create policy "opdater egen historik" on public.watch_history
  for update using (auth.uid() = user_id);

drop policy if exists "slet egen historik" on public.watch_history;
create policy "slet egen historik" on public.watch_history
  for delete using (auth.uid() = user_id);

-- Gemte film: kun egne rækker
drop policy if exists "egen watchlist" on public.saved_films;
create policy "egen watchlist" on public.saved_films
  for select using (auth.uid() = user_id);

drop policy if exists "gem film" on public.saved_films;
create policy "gem film" on public.saved_films
  for insert with check (auth.uid() = user_id);

drop policy if exists "fjern gemt film" on public.saved_films;
create policy "fjern gemt film" on public.saved_films
  for delete using (auth.uid() = user_id);

-- ============================================================
-- Seed — det nuværende katalog fra mock-data'et
-- ============================================================

insert into public.creators (id, handle, name, bio, founded_year, country) values
  ('c-nordlys', 'nordlys-film', 'Nordlys Film',
   'Et tomands filmselskab fra Island, der dokumenterer klima, landskab og de mennesker der lever midt i forandringen. Optaget på 16mm, klippet i Reykjavik.',
   2016, 'Island'),
  ('c-havblik', 'havblik-medier', 'Havblik Medier',
   'Havblik Medier fortæller historier fra kysten: fiskere, malere, arkiver og de stemmer der sjældent når land. Grundlagt af to dokumentarister fra Thyborøn.',
   2019, 'Danmark'),
  ('c-beton', 'betonvaerket', 'Betonværket',
   'Kollektiv i København der laver arkitektur- og arbejderhistoriske dokumentarer om byer, maskiner og det byggede miljø.',
   2021, 'Danmark')
on conflict do nothing;

insert into public.documentaries
  (id, slug, title, synopsis, year, duration_sec, genres, creator_handle, gradient, video_url,
   total_views, total_completions, valid_completions, payout_rate_dkk, sort_order)
values
  ('d-01', 'isens-sidste-vinter', 'Isens Sidste Vinter',
   'I tre år fulgte Nordlys Film glaciologen Elín på hendes sidste feltmission på Vatnajökull. En stille film om is, der forsvinder, og et liv, der bliver tilbage.',
   2024, 5340, array['Klima','Portræt'], 'nordlys-film',
   'from-[#0f2027] via-[#203a43] to-[#2c5364]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
   28400, 19100, 18320, 2.10, 1),
  ('d-02', 'saltmaleren', 'Saltmaleren',
   'Maleren Agnes har malet det samme saltmarsk i 42 år. Da havet stiger, begynder hendes motiver at forsvinde under vandet — og hendes sidste udstilling bliver et farvel.',
   2025, 4620, array['Kunst','Portræt'], 'havblik-medier',
   'from-[#134e5e] via-[#155e63] to-[#71b280]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
   12900, 9400, 9110, 1.85, 2),
  ('d-03', 'byen-under-betonen', 'Byen under Betonen',
   'Under Københavns betonflader ligger en by, ingen længere husker: fabrikker, sporveje og lejligheder. Betonværket graver i arkiver og taler med de sidste, der boede der.',
   2023, 6180, array['Historie','Byrum'], 'betonvaerket',
   'from-[#232526] via-[#414345] to-[#6b6d70]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
   41200, 24700, 23560, 1.60, 3),
  ('d-04', 'havets-arkiv', 'Havets Arkiv',
   'På Havblik Mediers loft ligger 300 timers båndoptagelser med forsvundne kystsamfund. Redaktøren Marianne genlæser lyden og bygger et arkiv af stemmer, havet tog.',
   2025, 4980, array['Historie','Fællesskab'], 'havblik-medier',
   'from-[#0b486b] via-[#135058] to-[#1d7891]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
   17600, 11800, 11450, 1.95, 4),
  ('d-05', 'skovens-lys', 'Skovens Lys',
   'Et år i en gammel dansk løvskov, optaget uden interview og voiceover. Kun dyr, vejr og lys — og en skovbruger, der holder øje med alt.',
   2024, 4020, array['Natur','Eksperimentel'], 'nordlys-film',
   'from-[#093028] via-[#237a57] to-[#4a9d6b]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
   22100, 15300, 14870, 2.25, 5),
  ('d-06', 'maskinen-der-dromte', 'Maskinen der Drømte',
   'På et lukket automatiseringsværksted i Jylland sidder en 40 år gammel stencilingsmaskine og tegner. Betonværket følger teknikeren, der tror, maskinen har intentioner.',
   2026, 5220, array['Teknologi','Portræt'], 'betonvaerket',
   'from-[#1f1c2c] via-[#4e3a59] to-[#928dab]',
   'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
   9800, 6200, 5940, 2.40, 6)
on conflict do nothing;