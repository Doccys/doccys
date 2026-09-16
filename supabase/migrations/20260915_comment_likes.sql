-- ============================================================
-- Doccys: likes på kommentarer (kun loggede brugere)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabel og policies oprettes kun hvis de mangler).
--
-- Tillidsmodel: den sammensatte primærnøgle (comment_id,
-- user_id) gør én like pr. konto pr. kommentar til en
-- databasestyring — ikke noget API'et selv skal holde styr på.
-- RLS sikrer, at man kun kan like og fjerne egne likes.

create table if not exists public.comment_likes (
  comment_id uuid not null
    references public.comments (id) on delete cascade,
  -- null er ikke tilladt: likes kræver en logget-ind konto
  user_id uuid not null
    references auth.users (id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_comment_likes_user
  on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- Alle må læse likes (så antal og "du har liket" kan vises)
drop policy if exists "laes_likes" on public.comment_likes;
create policy "laes_likes" on public.comment_likes
  for select using (true);

-- Kun egne likes kan oprettes
drop policy if exists "opret_egne_likes" on public.comment_likes;
create policy "opret_egne_likes" on public.comment_likes
  for insert with check (user_id = auth.uid());

-- Kun egne likes kan fjernes
drop policy if exists "fjern_egne_likes" on public.comment_likes;
create policy "fjern_egne_likes" on public.comment_likes
  for delete using (user_id = auth.uid());