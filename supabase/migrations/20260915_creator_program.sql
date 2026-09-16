-- ============================================================
-- Doccys: creator-program — ansøgning, godkendelse, film-upload
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabeller/kolonner/policies oprettes kun hvis de
-- mangler).
--
-- Flow:
--   1. En logget-ind bruger ansøger om at blive skaber
--      (app: /creator/apply) → status 'pending'.
--   2. Redaktionen godkender HER I DASHBOARDET ved at sætte
--      status = 'approved' — triggeren opretter creators-rækken
--      med owner_user_id og sætter decided_at.
--   3. Skaberen uploader en video (app: /creator/studio) til
--      storage-bucketet film-videos og opretter en FILM-RÆKKE
--      MED STATUS 'draft' — den vises ikke offentligt.
--   4. Redaktionen publicerer filmen ved at sætte
--      documentaries.status = 'published' (og en fornuftig
--      sort_order samt payout_rate_dkk).
--
-- Tillidsmodel: bruger-identiteten kommer altid fra sessionen
-- (RLS: auth.uid()), og status-maskinen er databasestyring —
-- en ansøger kan aldrig selv skrive andet end 'pending', og en
-- film oprettes altid som kladde. Godkendelse sker udelukkende
-- her i dashboardet (service role omgår RLS).
--
-- Kendte, accepterede begrænsninger: owner_user_id er offentligt
-- læsbar (som comments.user_id); draft-videoer ligger i en public
-- bucket (obskur sti, usynlige via kataloget); MIME-typen er
-- klient-erklæret.

-- ------------------------------------------------------------
-- 1) CREATOR-APPLICATIONS — én ansøgning pr. konto
-- ------------------------------------------------------------
-- unique(user_id) gør "én ansøgning pr. konto" til en database-
-- styring; handle-formatet håndhæves af et check-constraint.
-- char_length-checks afløser server-validering i den direkte
-- browser-skrivningssti (app'et indsætter selv via RLS).

create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  -- én ansøgning pr. konto; identiteten kan aldrig forfalskes (RLS)
  user_id uuid not null unique
    references auth.users (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 2 and 120),
  -- URL-identifikator: kun små bogstaver, tal og bindestreger
  handle text not null unique
    check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
           and char_length(handle) between 3 and 40),
  bio text not null
    check (char_length(btrim(bio)) between 1 and 2000),
  founded_year int not null
    check (founded_year between 1900 and extract(year from now()) + 1),
  country text not null
    check (char_length(btrim(country)) between 2 and 60),
  motivation text not null
    check (char_length(btrim(motivation)) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.creator_applications enable row level security;

-- Ansøgeren kan kun se egne rækker
drop policy if exists "laes_egne_ansoegninger" on public.creator_applications;
create policy "laes_egne_ansoegninger" on public.creator_applications
  for select using (auth.uid() = user_id);

-- Opret ansøgning: altid som pending, altid som sig selv
drop policy if exists "opret_ansoegning" on public.creator_applications;
create policy "opret_ansoegning" on public.creator_applications
  for insert with check (auth.uid() = user_id and status = 'pending');

-- GENAFSENDELSE ved afslag: en afvist ansøgning kan rettes og
-- sendes igen — og kun tilbage til pending. En pending ansøgning
-- kan ikke redigeres (using fejler), en godkendt er urørlig, og
-- ingen kan nogensinde skrive en status selv.
drop policy if exists "genafsend_afvist_ansoegning" on public.creator_applications;
create policy "genafsend_afvist_ansoegning" on public.creator_applications
  for update
  using (auth.uid() = user_id and status = 'rejected')
  with check (auth.uid() = user_id and status = 'pending');

-- Ingen delete-policy: ansøgninger slettes ikke fra app'en

-- ------------------------------------------------------------
-- 2) CREATORS — ejerskab mellem konto og skaber-profil
-- ------------------------------------------------------------
-- owner_user_id sættes af triggeren ved godkendelse. Bemærk:
-- kolonnen er offentligt læsbar (skaber-profiler er offentlige)
-- — samme stilling som comments.user_id. on delete set null:
-- slettes en konto, overlever profilen og filmene; kladder
-- bliver kun ejerløse (skjult af RLS, synlige her i dashboardet).

alter table public.creators
  add column if not exists owner_user_id uuid
    references auth.users (id) on delete set null;

-- unik pr. konto (en konto ejer højest én skaber-profil)
drop index if exists creators_owner_uniq;
create unique index if not exists creators_owner_uniq
  on public.creators (owner_user_id)
  where owner_user_id is not null;

-- ------------------------------------------------------------
-- 3) DOCUMENTARIES — kladde/offentlig-status
-- ------------------------------------------------------------
-- Nye uploads oprettes altid som 'draft' og vises ikke i
-- kataloget, før redaktionen flipper til 'published'. Default
-- 'published' fylder de seks seedede rækker korrekt.

alter table public.documentaries
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published'));

-- ------------------------------------------------------------
-- 4) TRIGGER — godkendelse = én celle-redigering
-- ------------------------------------------------------------
-- Ved status = 'approved' oprettes creators-rækken automatisk,
-- så godkendelse kræver kun dette: UPDATE creator_applications
-- SET status = 'approved' WHERE ... (og 'rejected' ved afslag).
-- Funktionen er idempotent: gen-godkendelse eller genansøgning
-- efter approval skaber aldrig en dublet-profil. Er handle
-- taget af en anden skaber undervejs, fejler godkendelsen med
-- en brugbar, dansk besked — rediger handle FØR du godkender.

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

-- ------------------------------------------------------------
-- 5) DOCUMENTARIES — RLS (erstatter select-only-politikken)
-- ------------------------------------------------------------
-- Ejerskab: findes der en skaber-profil ejet af brugeren med
-- samme handle som filmens creator_handle — så og kun så er
-- brugeren filmens skaber. Subqueryet sikrer også, at man kun
-- kan tilknytte film til SIN EGEN profil, ikke andres handles.

drop policy if exists "offentlig laesning" on public.documentaries;

-- Offentligt katalog: publicerede film for alle — kladder kun
-- for deres ejer (studiet skal kunne se egne kladder).
drop policy if exists "offentligt_katalog" on public.documentaries;
create policy "offentligt_katalog" on public.documentaries
  for select using (
    status = 'published'
    or exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- Opret KUN egne kladder: tvungen draft-status, statistikken
-- starter fra nul — skaberen kan ikke publicere sig selv eller
-- give sig selv seertal.
drop policy if exists "opret_egne_kladder" on public.documentaries;
create policy "opret_egne_kladder" on public.documentaries
  for insert with check (
    status = 'draft'
    and total_views = 0
    and total_completions = 0
    and valid_completions = 0
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- Rediger KUN egne kladder: draft-kravet i både using og with
-- check betyder, at rækken forbliver en kladde — når redaktionen
-- publicerer (her i dashboardet), mister skaberen skriveretten.
drop policy if exists "rediger_egne_kladder" on public.documentaries;
create policy "rediger_egne_kladder" on public.documentaries
  for update
  using (
    status = 'draft'
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    status = 'draft'
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- Slet KUN egne kladder (publicerede film er redaktionens)
drop policy if exists "slet_egne_kladder" on public.documentaries;
create policy "slet_egne_kladder" on public.documentaries
  for delete using (
    status = 'draft'
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- Bemærk: handle-orden 'apply' og 'studio' er reserverede (de
-- statiske ruter /creator/apply og /creator/studio skygger for
-- /creator/[handle]) — app'et afviser dem allerede i formularen.

-- ------------------------------------------------------------
-- 6) STORAGE — bucket til filmuploads
-- ------------------------------------------------------------
-- Objekt-sti: {user_id}/{uuid}.mp4 — policies sikrer, at man
-- kun kan skrive i SIN EGEN mappe. file_size_limit er vigtig:
-- en buckets default-grænse er ellers kun 50 MB. Public bucket =
-- afspilning direkte via <video src={publicUrl}>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('film-videos', 'film-videos', true, 2147483648, array['video/mp4'])
on conflict (id) do nothing;

drop policy if exists "upload_til_egen_filmmappe" on storage.objects;
create policy "upload_til_egen_filmmappe" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'film-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "slet_fra_egen_filmmappe" on storage.objects;
create policy "slet_fra_egen_filmmappe" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'film-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ret_i_egen_filmmappe" on storage.objects;
create policy "ret_i_egen_filmmappe" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'film-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'film-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );