-- 20261109_bunny_stream.sql — Bunny Stream-integration (beslutning 9/11;
-- SKEMA-INDTAENGNING.txt sektion J): video-egress flytter til Bunny Stream,
-- Supabase beholder konti/DB/undertekster/plakater. Seed-filmene forbliver
-- bevidst i Supabase (bunny_video_id = null på dem — de røres ikke).
--
-- Nye kolonner (nullable, ingen default):
--   documentaries.bunny_video_id — Stream-videoens GUID; playback-URL'en
--     i video_url henviser til {BUNNY_CDN_HOSTNAME}/{guid}/play_{res}.mp4
--   film_trailers.bunny_video_id — traileren oprettes som eget Bunny-video-
--     objekt (90 sec-klippet) med samme guid-mønster
-- NB: kolonnerne læses/skrives KUN fra server-side ruter (der validerer
-- ejerskab selv via creator-ejer-tjekket) — INGEN RLS-policies behøves,
-- skaber-klienterne rører dem aldrig direkte.
--
-- VERIFIKATION (kør efter):
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'documentaries' and column_name = 'bunny_video_id';
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'film_trailers' and column_name = 'bunny_video_id';
--   → begge: 'bunny_video_id', 'YES' (nullable)

alter table public.documentaries
  add column if not exists bunny_video_id text;

alter table public.film_trailers
  add column if not exists bunny_video_id text;
