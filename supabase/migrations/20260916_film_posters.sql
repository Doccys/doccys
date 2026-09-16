-- ============================================================
-- Doccys: forsidebilleder (plakater) til dokumentarer
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- Flowet spejler film-videos-bucketet: skaberen uploader et
-- valgfrit plakat-billede til SIN EGEN mappe ({user_id}/…) i
-- bucketet film-posters, og API-ruten binder URL'en til uploaderens
-- mappe ligesom video-URL'en.
--
-- gradient-kolonnen forbliver palet-fallback: seedede film uden
-- plakat (og uploads uden billede) viser gradienten som før —
-- plakaten ligger oveni med object-cover, når den findes.

-- 1) Kolonnen: null = ingen plakat → gradienten bruges
alter table public.documentaries
  add column if not exists poster_url text;

-- 2) Bucket: public (afspilles/vises direkte via URL), 10 MB,
--    billeder alene. NB: file_size_limit — default er ellers 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('film-posters', 'film-posters', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 3) Policies — samme per-bruger-mønster som film-videos.
--    BEMÆRK: SELECT-policyen er med fra dag ét! Storage-API'et
--    læser objekt-rækken FØR sletning/opdatering — uden den
--    rammer remove() 0 rækker lydløst (jf. select-policy-
--    migrationen på film-videos).

drop policy if exists "laes_egne_plakater" on storage.objects;
create policy "laes_egne_plakater" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'film-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "upload_egne_plakater" on storage.objects;
create policy "upload_egne_plakater" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'film-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "slet_egne_plakater" on storage.objects;
create policy "slet_egne_plakater" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'film-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ret_egne_plakater" on storage.objects;
create policy "ret_egne_plakater" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'film-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'film-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );