-- ============================================================
-- Doccys: seere kan følge skabere (creator_followers)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabel og policies oprettes kun hvis de mangler).
--
-- Tillidsmodel: den sammensatte primærnøgle (creator_id,
-- user_id) gør ét følge-forhold pr. konto pr. skaber til en
-- databasestyring — ikke noget API'et selv skal holde styr på.
-- RLS sikrer, at man kun kan følge og afølge med sin egen
-- konto, og at en skaber-ejer ikke kan følge sin egen profil.
--
-- NB: creators.id er TEXT (ikke uuid) — creator_id arver den.
--
-- Følgerækker er offentligt læsbare, så follower-tallet kan
-- vises for alle (comment_likes-præcedens — kun uuid'er,
-- intet personhenførbart indhold i tabellen).
--
-- Index-behov: primærnøglens prefix (creator_id) dækker tælling
-- pr. skaber og join til creators — KUN user_id-indexet skal
-- tilføjes (dækker "hvilke skabere følger jeg" og profil-
-- listens sortering på followed_at).

create table if not exists public.creator_followers (
  creator_id text not null
    references public.creators (id) on delete cascade,
  -- null er ikke tilladt: følge kræver en logget-ind konto
  user_id uuid not null
    references auth.users (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);

create index if not exists idx_creator_followers_user
  on public.creator_followers (user_id, followed_at desc);

alter table public.creator_followers enable row level security;

-- Alle må læse følger (så antallet kan vises for alle)
drop policy if exists "laes_follows" on public.creator_followers;
create policy "laes_follows" on public.creator_followers
  for select using (true);

-- Kun egne følger kan oprettes — og aldrig sin egen skaberprofil
-- (creators er offentligt læsbart, så subqueryet virker under
-- RLS; creator_posts-forbuddet er samme mønster)
drop policy if exists "opret_egne_follows" on public.creator_followers;
create policy "opret_egne_follows" on public.creator_followers
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.creators c
      where c.id = creator_id
        and c.owner_user_id = auth.uid()
    )
  );

-- Kun egne følger kan fjernes
drop policy if exists "fjern_egne_follows" on public.creator_followers;
create policy "fjern_egne_follows" on public.creator_followers
  for delete using (user_id = auth.uid());

-- ============================================================
-- Verifikation (kør separat i SQL Editor):
--
-- 1) Forventet præcis 3 policies (select/insert/delete — ingen
--    update, tabellen er insert/delete-only):
--   select policyname, cmd from pg_policies
--   where tablename = 'creator_followers' order by cmd;
--
-- 2) Forventet 2 indexe (PK + user_id):
--   select indexname from pg_indexes
--   where tablename = 'creator_followers' order by indexname;
--
-- 3) Negativ test — SQL Editor har ingen auth.uid(), så et
--    forsøg på at indsætte en række SKAL fejle (fail-closed):
--   insert into public.creator_followers (creator_id, user_id)
--   values ('nordlys-film', '00000000-0000-0000-0000-000000000000');
--   → forventet: ERROR 42501 (row-level security policy)
-- ============================================================