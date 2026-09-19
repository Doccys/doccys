-- ============================================================
-- Doccys: film-trailer — gratis smagsprøve + indlejring + deling
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen uden
-- fejl (tabel, policies og trigger oprettes kun hvis de mangler).
--
-- Formålet er ORGANISK: et delt watch-link lander bag paywallen,
-- og uden noget gratis at smage på konverterer det dårligt. Med
-- en 90 sekunders trailer kan gæster se smagsprøven direkte
-- (paywall-kortet + /api/embed-indlejringen), og Facebook kan
-- vise filmen som video-kort (og:video). Filmen SELV er stadig
-- låst bag konto + fuld dækning — der er ingen gratis minutter.
--
-- NB: Læs PROJEKTSTATUS-reglen: FILMNAVNENE LIGNER HINANDEN —
-- dette er TRAILER-migrationen (film_trailer), ikke
-- 20260919_creator_udbetaling eller 20260919_indtjening_privat.
--
-- Tillidsmodel: traileren læses offentligt (den ER reklamen), men
-- skrives kun af filmens creator-ejer — samme subquery-mønster som
-- film_subtitles. Videoen klippes af API-ruten fra filmens egen
-- fil med ffmpeg og lægges i film-videos-bucketet under creatorens
-- egen mappe (RLS håndhæver {user_id}-præfikset). Ruten kører med
-- creatorens session — ingen service-role.
--
-- Kendt, accepteret egenskab (svarer til film_subtitles): en
-- trailer til en KLADDE er teknisk offentligt læsbar via PostgREST
-- for den der kender slug'en — app'en viser den kun på
-- published-film (watch/embed filtrerer), og slug er obskur.

-- 1) film_trailers — ÉN række pr. film (slug er primærnøgle)
create table if not exists public.film_trailers (
  documentary_slug text primary key
    references public.documentaries (slug) on delete cascade,
  -- hvor i filmen klippet starter (valgfrit valg i studiet)
  start_sec int not null default 0
    check (start_sec >= 0),
  -- klippets længde i sekunder (fast pr. generation fra API'et,
  -- kolonnen gør genoplæsning i studiet selvbeskrivende)
  length_sec int not null default 90
    check (length_sec between 10 and 300),
  -- public Storage-URL på trailer-MP4'en; null = ikke færdig
  trailer_url text,
  -- pipeline-status som film_subtitles: processing/ready/failed
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.film_trailers enable row level security;

-- 2) Policies — alle kan læse (traileren er reklame); kun filmens
--    creator-ejer skriver
drop policy if exists "laes_trailer" on public.film_trailers;
create policy "laes_trailer" on public.film_trailers
  for select using (true);

drop policy if exists "opret_trailer_som_creator_ejer" on public.film_trailers;
create policy "opret_trailer_som_creator_ejer" on public.film_trailers
  for insert with check (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "rediger_trailer_som_creator_ejer" on public.film_trailers;
create policy "rediger_trailer_som_creator_ejer" on public.film_trailers
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

drop policy if exists "slet_trailer_som_creator_ejer" on public.film_trailers;
create policy "slet_trailer_som_creator_ejer" on public.film_trailers
  for delete using (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

-- 3) updated_at røres automatisk ved UPDATE
create or replace function public.touch_film_trailer_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_film_trailer_touch on public.film_trailers;
create trigger trg_film_trailer_touch
  before update on public.film_trailers
  for each row
  execute function public.touch_film_trailer_updated_at();

-- 4) INGEN ny bucket: traileren bor i film-videos (public bucket,
--    {user_id}-mapper, video/mp4, 2 GB loft) — politikkerne der
--    dækker upload/upsert/slet i egen mappe gælder uændret, og
--    kladsletning i studiet rydder trailer-objektet med samme kode.