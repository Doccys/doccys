-- ============================================================
-- Doccys: user_handles — reserverede @ tags ved signup
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Kør EFTER koden er deployet (app'et
-- fejler graceful på PGRST205 indtil da). Idempotent: kan køres
-- igen uden fejl.
--
-- Formål: alle nye konti kan vælge et unikt @ tag allerede ved
-- signup (valgfrit felt) — tag'et reserverer brugerens fremtidige
-- skaber-handle, så andre ikke kan tage det i mellemtiden. Konti
-- uden tag kan kræve et senere fra profilen (RLS: insert egen).
--
-- Flow:
--   1. Signup-ruten (service role) eller profilens claim-form
--      (browser, RLS) reserverer tag'et. ÉN fælles prædikat-
--      funktion handle_optaget() tjekker på tværs af creators,
--      creator_applications og user_handles — samme sandhed for
--      rutens for-tjek, triggerne og godkendelsen.
--   2. Uforanderlighed: ingen update/delete-policy; PK = user_id
--      (én konto, ét tag). on delete cascade rydder rækken ved
--      kontosletning (admin.deleteUser i /api/account).
--
-- Grænsedrag / kendte forhold:
--   - Anon kan læse (user_id, handle) — krævet af det uloggede
--     live-tjek ved signup. Samme stilling som comment_likes og
--     creators.owner_user_id (accepteret precedent: kun uuid'er,
--     intet personhenførbart indhold).
--   - ALLE statusser i creator_applications blokerer deres handle
--     (afviste ansøgninger blokerer i forvejen via deres egen
--     unique-constraint) — konsistent navnerum.
--   - Rest-race (to samtidige commits på tværs af tabeller) kan
--     before-triggers ikke lukke — godkendelsestriggerens
--     handle_optaget-tjek er det obligatoriske sidste led.
--   - 20260920_rpc_tilladelser fjernede anon/authenticated fra
--     default-privilegierne; revoke-sætningerne her er sikkerheds-
--     net. service_role-defaulten fra Supabase består (kun backend
--     har nøglen) — signup-rutens RPC-kald virker altså uden
--     eksplicit grant.

create table if not exists public.user_handles (
  user_id uuid primary key
    references auth.users (id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
           and char_length(handle) between 3 and 40),
  created_at timestamptz not null default now()
);

alter table public.user_handles enable row level security;

-- Offentlig læsning: live ledighedstjek + visning af @ tag
drop policy if exists "laes_handles" on public.user_handles;
create policy "laes_handles" on public.user_handles
  for select using (true);

-- Egen reservation: signup-ruten skriver som service role (omgår
-- RLS), profilens claim-form som sig selv. Ingen update/delete =
-- tag'et er uforanderligt.
drop policy if exists "opret_eget_handle" on public.user_handles;
create policy "opret_eget_handle" on public.user_handles
  for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Fælles prædikat: er handle optaget, fratrukket p_user_ids egne
-- rækker? (egen skaberprofil, egen ansøgning og egen reservation er
-- tilladt — det er netop fremtidsskaberens tag.)
-- p_user_id = null betyder "ingen ejerrelation" — signup-tjekket
-- blokerer ALT (en ny bruger ejer intet).
-- SECURITY DEFINER er tvunget: creator_applications er kun læsbar
-- for ejeren under RLS — uden den ville krydstjekket fejle stille.
-- ------------------------------------------------------------
create or replace function public.handle_optaget(
  p_handle text, p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.creators c
            where c.handle = p_handle
              and (p_user_id is null
                   or c.owner_user_id is distinct from p_user_id))
    or exists (select 1 from public.creator_applications a
               where a.handle = p_handle
                 and (p_user_id is null or a.user_id <> p_user_id))
    or exists (select 1 from public.user_handles h
               where h.handle = p_handle
                 and (p_user_id is null or h.user_id <> p_user_id));
$$;

-- 1) Reservations-trigger: dansk fejl; unique-constrainten er backstop.
--    Fanger racer mod dashboard-godkendelser (service-tjekket i
--    signup-ruten er UX, dette er håndhævelsen).
create or replace function public.user_handles_tjek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.handle_optaget(new.handle, new.user_id) then
    raise exception
      'Handle "%" er allerede i brug — vælg et andet',
      new.handle;
  end if;
  return new;
end $$;

drop trigger if exists user_handles_tjek_trg on public.user_handles;
create trigger user_handles_tjek_trg
  before insert on public.user_handles
  for each row
  execute function public.user_handles_tjek();

-- 2) Ansøgnings-trigger: en ansøgning må ikke tage en ANDEN kontos
--    reserverede tag (egen reservation er tilladt — det er netop
--    fremtidsskaberens handle). Fanger også seedede creators-handles
--    tidligere end godkendelsen. NB: genafsendelse af egen afvist
--    ansøgning rammer ikke sig selv — p_user_id er ansøgeren.
create or replace function public.creator_ansoegning_handle_tjek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.handle_optaget(new.handle, new.user_id) then
    raise exception
      'Handle "%" er allerede i brug — vælg et andet',
      new.handle;
  end if;
  return new;
end $$;

drop trigger if exists creator_ansoegning_handle_trg
  on public.creator_applications;
create trigger creator_ansoegning_handle_trg
  before insert or update of handle on public.creator_applications
  for each row
  execute function public.creator_ansoegning_handle_tjek();

-- 3) Godkendelsestriggeren — erstatter 20260915-versionen wholesale
--    med samme krop (decided_at-case, bio_i18n, unique_violation-
--    besked) + handle_optaget-tjek FØR creators-rækken oprettes:
--    godkendelse af et tag en anden konto har reserveret fejler med
--    dansk besked, og unique_violation forbliver backstop.
create or replace function public.creator_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.decided_at := case new.status
    when 'pending' then null
    else now()
  end;

  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and not exists (
       select 1 from public.creators
       where owner_user_id = new.user_id
     )
  then
    if public.handle_optaget(new.handle, new.user_id) then
      raise exception
        'Handle "%" er allerede i brug af en anden konto — rediger handle i ansøgningen, før du godkender',
        new.handle;
    end if;
    begin
      insert into public.creators
        (id, handle, name, bio, bio_i18n, founded_year, country, owner_user_id)
      values
        ('c-' || new.handle, new.handle, new.name, new.bio,
         '{}'::jsonb, new.founded_year, new.country, new.user_id);
    exception when unique_violation then
      raise exception
        'Handle "%" er allerede brugt — rediger handle i ansøgningen, før du godkender',
        new.handle;
    end;
  end if;

  return new;
end $$;

drop trigger if exists creator_application_status_trg
  on public.creator_applications;
create trigger creator_application_status_trg
  before update of status on public.creator_applications
  for each row
  execute function public.creator_application_status();

-- 4) EXECUTE-hullet: platform-setup grant'er execute som default —
--    vi revoquer direkte på alle fire funktioner. Trigger-udførelse
--    tjekker ikke EXECUTE; RPC-kald via PostgREST gør — kun
--    service_role beholder adgangen (til handle_optaget, som
--    signup-ruten kalder via sin service-klient).
revoke execute on function public.handle_optaget(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.user_handles_tjek()
  from public, anon, authenticated;
revoke execute on function public.creator_ansoegning_handle_tjek()
  from public, anon, authenticated;
revoke execute on function public.creator_application_status()
  from public, anon, authenticated;

-- ============================================================
-- Verifikation (kør separat i SQL Editor, efter migrationen):
-- 1) Forventet PRÆCIS 2 policies (select + insert — ingen
--    update/delete, tag'et er uforanderligt):
--   select policyname, cmd from pg_policies
--   where tablename = 'user_handles' order by cmd;
-- 2) Ingen af de fire funktioner må have execute til
--    anon/authenticated (service_role-defaulten består):
--   select proname, coalesce(proacl::text, 'null') as proacl
--   from pg_proc
--   where proname in ('handle_optaget', 'user_handles_tjek',
--     'creator_ansoegning_handle_tjek', 'creator_application_status');
-- 3) Negativ test — NB: SQL Editor kører SOM POSTGRES, som ejer
--    tabellen og dermed OMGÅR RLS (owner-bypass). 42501-tjekket
--    kræver rolleskift — anon er ikke ejer, og uden JWT er
--    auth.uid() null, så insert-policyn bestås aldrig. RLS-tjekket
--    afvikles FØR fremmednøglen, så uuid'et er ligegyldigt her:
--   set role anon;
--   insert into public.user_handles (user_id, handle)
--   values ('00000000-0000-0000-0000-000000000000', 'test-helt-ny');
--   reset role;
--   → forventet: ERROR 42501 (row-level security)
--   (Kører du insert'en UDEN set role, rammer du i stedet FK-fejl
--   23503 — det beviser cascade-referencen, ikke RLS.)
-- 4) Negativ test 2 — postgres omgår RLS, men triggeren fanger et
--    seedet skaber-handle med DANSK fejl:
--   insert into public.user_handles (user_id, handle)
--   values ((select id from auth.users limit 1),
--           (select handle from public.creators limit 1));
--   → forventet: EXCEPTION 'Handle "…" er allerede i brug — …'
-- 5) Triggerne er på plads (begge 'O' = enabled):
--   select tgname, tgenabled from pg_trigger
--   where tgname in ('user_handles_tjek_trg',
--     'creator_ansoegning_handle_trg', 'creator_application_status_trg');
-- Rul altid test 3+4 tilbage i en begin/rollback-blok, så intet
-- persisteres:
--   begin; … rollback;
-- ============================================================