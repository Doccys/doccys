-- ============================================================
-- Doccys: kvalitetskommentarer — kun seere skriver, creator modererer
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kolonnen, indexet,
-- policies, trigger og funktionen kan oprettes igen uden fejl
-- (drop/create-par-par er med vilje — genkørsel opfrisker dem).
--
-- Tillidsmodel: kommentarfeltet er kun for folk der HAR SET
-- filmen. Gatet tjekkes app-side med har_set_film(), som læser
-- den append-only credit_ledger — den kan kun skrives af
-- afregn_session (security definer) og Stripe-webhooken, så en
-- klient kan ikke forfalske "har set filmen". Gæstekommentarer
-- lukkes samtidig på DB-niveau: insert kræver user_id = auth.uid().
-- Creator-ejeren kan fastgøre ÉT indlæg pr. film (partial unique
-- index, som på opslagstavlen) og slette — triggeren håndhæver,
-- at UPDATE kun må flippe pinned, aldrig omskrive indholdet.

-- 1) pinned-kolonne + ét fastgjort indlæg pr. film
alter table public.comments
  add column if not exists pinned boolean not null default false;

create unique index if not exists uq_comments_pinned
  on public.comments (documentary_slug)
  where pinned;

-- 2) Gæster lukkes: kommentar-forfatteren skal være en kendt konto
--    (gamle gæstekommentarer forbliver læsbare — historik beholdes)
drop policy if exists "skriv_kommentar" on public.comments;
create policy "skriv_kommentar" on public.comments
  for insert with check (user_id = auth.uid());

-- 3) Moderator-policies: filmens creator-ejer kan fastgøre og slette
--    (ejerskab via filmen → creator_handle → creators.owner_user_id)
drop policy if exists "fastgoer_som_creator_ejer" on public.comments;
create policy "fastgoer_som_creator_ejer" on public.comments
  for update
  using (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "slet_som_creator_ejer" on public.comments;
create policy "slet_som_creator_ejer" on public.comments
  for delete using (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

-- 4) Trigger mod historie-omskrivning: UPDATE på comments kan kun
--    ændre pinned — ordlyd, forfatter, film og tidspunkt er låst
create or replace function public.kun_pin_aendring()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body
     or new.author_name is distinct from old.author_name
     or new.documentary_slug is distinct from old.documentary_slug
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Kommentarer kan kun fastgøres — indholdet må aldrig ændres';
  end if;
  return new;
end $$;

drop trigger if exists trg_comment_pin_kun on public.comments;
create trigger trg_comment_pin_kun
  before update on public.comments
  for each row execute function public.kun_pin_aendring();

-- 5) har_set_film: manipulationssikkert seer-tjek mod forbrugs-
--    rækkerne (source_key 'forbrug:{sessionId}' → view_sessions).
--    security definer, fordi joinet går uden om RLS — funktionen
--    returnerer kun en boolean, intet data lækkess.
create or replace function public.har_set_film(p_slug text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.credit_ledger l
    join public.view_sessions s
      on l.source_key = 'forbrug:' || s.id::text
    where l.user_id = auth.uid()
      and l.reason = 'consumption'
      and l.seconds < 0
      and s.documentary_slug = p_slug
  );
$$;

revoke all on function public.har_set_film(text) from public;
grant execute on function public.har_set_film(text) to authenticated;