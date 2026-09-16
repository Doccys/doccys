-- ============================================================
-- Doccys: SELECT-policy på film-videos-objekter (storage)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- Hvorfor: Supabases storage-API læser (SELECT) objekt-rækken,
-- FØR den sletter eller opdaterer den — og storage-API'et
-- respekterer SELECT-policiesne under RLS. Uden en SELECT-policy
-- ser en logget-ind bruger derfor ALDRIG sine egne objekter:
--   • remove() rammer 0 rækker og returnerer stille [] —
--     objektet forbliver i bucketen
--   • PUT/replace på eget objekt afvises
--   • upsert fejler (kræver både SELECT- og UPDATE-rettigheder)
--
-- App'et rammer især det første: StudioDeleteFilmButton fjerner
-- storage-objektet FØR film-rækken — uden denne policy efterlader
-- hver slettet kladde et forældeløst video-objekt.
--
-- Policyen er fortsat per bruger: man kan kun se objekter i sin
-- EGEN mappe ({user_id}/...) i bucketen film-videos.

drop policy if exists "laes_egne_filmobjekter" on storage.objects;
create policy "laes_egne_filmobjekter" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'film-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );