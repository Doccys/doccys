-- ============================================================
-- Doccys: opslagstavle — creators skriver opslag på egen side
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabel, index, policies og trigger oprettes kun
-- hvis de mangler; publication-tilføjelsen beskyttes af DO-blok).
--
-- Tillidsmodel: opslag er offentligt læsbare for alle, men kun
-- kontoen bag creatorens owner_user_id kan skrive (subquery-tjek
-- mod creators, der er offentligt læsbart, så tjekket virker
-- under RLS). Ét fastgjort opslag pr. creator håndhæves af et
-- partial unique index — ikke app-logik (undgår TOCTOU-race).
-- Realtime: tabellen tilføjes supabase_realtime-publicationen, og
-- replica identity full sørger for at DELETE-eventer kan
-- filtreres på creator_id (med default identitet indeholder
-- "old" kun id'et, og sletninger når aldrig frem til abonnenter).

-- 1) creator_posts — opslag fra creatoren til dens seere.
--    NB: creators.id er text (slug-agtigt id), ikke uuid — creator_id
--    følger samme type, så fremmednøglen kan implementeres.
create table if not exists public.creator_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null
    references public.creators (id) on delete cascade,
  body text not null
    check (length(trim(body)) between 1 and 2000),
  -- fastgjort øverst på tavlen; ét pr. creator (se index herunder)
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_posts_creator
  on public.creator_posts (creator_id, created_at desc);

-- Ét fastgjort opslag pr. creator — DB-håndhævelse, ikke app-logik
create unique index if not exists uq_creator_posts_pinned
  on public.creator_posts (creator_id)
  where pinned;

alter table public.creator_posts enable row level security;

-- 2) Policies — alle kan læse; kun creatorens ejer-konto skriver
drop policy if exists "alle_kan_laese_opslag" on public.creator_posts;
create policy "alle_kan_laese_opslag" on public.creator_posts
  for select using (true);

drop policy if exists "opret_opslag_som_creator_ejer" on public.creator_posts;
create policy "opret_opslag_som_creator_ejer" on public.creator_posts
  for insert with check (
    exists (
      select 1 from public.creators c
      where c.id = creator_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "rediger_opslag_som_creator_ejer" on public.creator_posts;
create policy "rediger_opslag_som_creator_ejer" on public.creator_posts
  for update
  using (
    exists (
      select 1 from public.creators c
      where c.id = creator_id
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.creators c
      where c.id = creator_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "slet_opslag_som_creator_ejer" on public.creator_posts;
create policy "slet_opslag_som_creator_ejer" on public.creator_posts
  for delete using (
    exists (
      select 1 from public.creators c
      where c.id = creator_id
        and c.owner_user_id = auth.uid()
    )
  );

-- 3) updated_at røres automatisk ved UPDATE (én gang-og-ferdig —
--    glemmes af ingen fremtidig skrivevej)
create or replace function public.touch_creator_post_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_creator_post_touch on public.creator_posts;
create trigger trg_creator_post_touch
  before update on public.creator_posts
  for each row execute function public.touch_creator_post_updated_at();

-- 4) REALTIME — fuld rækkeidentitet, så DELETE-eventer kan
--    filtreres på creator_id af klientabonnementet
alter table public.creator_posts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'creator_posts'
  ) then
    alter publication supabase_realtime add table public.creator_posts;
  end if;
end $$;