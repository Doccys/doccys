-- ============================================================
-- Doccys: AI-undertekster — transskription + oversættelse pr. film
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: tabellen, policies og
-- trigger oprettes kun hvis de mangler; bucketen beskyttes af
-- on conflict do nothing.
--
-- Tillidsmodel: undertekster læses offentligt (status-filteret
-- 'ready' lægges i appens QUERY, ikke i select-policynet — ellers
-- ville ejeren ikke kunne se egne processing/failed-rækker i
-- studiet). Al skrivning er bundet til filmens creator-ejer via
-- documentaries → creator_handle → creators.owner_user_id (samme
-- subquery-mønster som creator_posts). VTT-filerne ligger i en
-- offentlig bucket med per-bruger-mappe {user_id}/{slug}/{locale}.vtt
-- — samme per-bruger-mønster som film-videos og film-posters.
-- Genereringen (API-ruten) kører med creatorens egen session, så
-- alle skrivninger går igennem RLS — ingen service-role.

-- 1) film_subtitles — én række pr. (film, sprog)
create table if not exists public.film_subtitles (
  id uuid primary key default gen_random_uuid(),
  documentary_slug text not null
    references public.documentaries (slug) on delete cascade,
  locale text not null
    check (locale in ('da', 'en', 'de', 'es', 'fr', 'fi', 'no', 'sv')),
  -- public Storage-URL på VTT-filen; null mens status ikke er 'ready'
  vtt_url text,
  -- pipeline-status: 'processing' under kørsel, 'ready' når VTT'en
  -- findes, 'failed' ved fejl (error-holder fejlbeskeden)
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  -- 'ai' = genereret af pipelinen; 'manual' reserveret til fremtidig
  -- creator-upload af egne undertekster
  source text not null default 'ai'
    check (source in ('ai', 'manual')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (documentary_slug, locale)
);

create index if not exists idx_film_subtitles_slug
  on public.film_subtitles (documentary_slug);

alter table public.film_subtitles enable row level security;

-- 2) Policies — alle kan læse (app'en filtrerer på status='ready');
--    kun filmens creator-ejer skriver
drop policy if exists "laes_undertekster" on public.film_subtitles;
create policy "laes_undertekster" on public.film_subtitles
  for select using (true);

drop policy if exists "opret_undertekster_som_creator_ejer" on public.film_subtitles;
create policy "opret_undertekster_som_creator_ejer" on public.film_subtitles
  for insert with check (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "rediger_undertekster_som_creator_ejer" on public.film_subtitles;
create policy "rediger_undertekster_som_creator_ejer" on public.film_subtitles
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

drop policy if exists "slet_undertekster_som_creator_ejer" on public.film_subtitles;
create policy "slet_undertekster_som_creator_ejer" on public.film_subtitles
  for delete using (
    exists (
      select 1 from public.documentaries d
      join public.creators c on c.handle = d.creator_handle
      where d.slug = documentary_slug
        and c.owner_user_id = auth.uid()
    )
  );

-- 3) updated_at røres automatisk ved UPDATE (én gang-og-ferdig)
create or replace function public.touch_film_subtitle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_film_subtitle_touch on public.film_subtitles;
create trigger trg_film_subtitle_touch
  before update on public.film_subtitles
  for each row execute function public.touch_film_subtitle_updated_at();

-- 4) Bucket: offentlig (afspilleren henter VTT'er direkte via URL),
--    1 MB rigeligt til undertekster, text/vtt alene.
--    NB: file_size_limit — default er ellers 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('film-subtitles', 'film-subtitles', true, 1048576, array['text/vtt'])
on conflict (id) do nothing;

-- 5) Storage-policies — samme per-bruger-mønster som film-posters.
--    BEMÆRK: SELECT-policyen er med fra dag ét! Storage-API'et
--    læser objekt-rækken FØR sletning/opdatering — uden den
--    rammer remove() 0 rækker lydløst.

drop policy if exists "laes_egne_undertekster" on storage.objects;
create policy "laes_egne_undertekster" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'film-subtitles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "upload_egne_undertekster" on storage.objects;
create policy "upload_egne_undertekster" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'film-subtitles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ret_egne_undertekster" on storage.objects;
create policy "ret_egne_undertekster" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'film-subtitles'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'film-subtitles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "slet_egne_undertekster" on storage.objects;
create policy "slet_egne_undertekster" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'film-subtitles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );