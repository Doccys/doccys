-- ============================================================
-- Doccys: egress-estimat pr. session (GB-pr-time-måling)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kolonnerne oprettes
-- kun hvis de mangler; backfillen rører kun rækker, hvor
-- video_file_size_bytes stadig er null.
--
-- Formål (26/9): margin-regnskabet (≈17 kr pr. pakke) mangler
-- den ene store variable omkostning — båndbredde. Video stråmmes
-- direkte fra Supabase Storage til browseren, så serveren ser
-- aldrig byterne, og et eksakt mål kræver enten en proxy (dobbelt
-- egress + latens) eller Resource Timing (upålideligt cross-origin).
-- Derfor et SERVER-SIDE SKØN pr. session:
--
--   bytes ≈ sete sekunder × (filens størrelse / filmens længde)
--
-- Skønnet skrives ved validate (kører for ALLE sessioner — til
-- forskel fra afregn_session, der kun rammer loggede) og bygger
-- på verdict.features.estimatedWatchedSec, der spejler
-- afregn_session's watched_seconds. Kalibreres fremover mod
-- Supabase-dashbordets samlede båndbredde-tal.
--
-- Skønnet er bevidst konservativt: en film UDEN kendt størrelse
-- (seed/placeholder-indhold) giver 0 — hellere undervurdere end
-- digte. Browsers range-overshoot gør reelt forbrug ~10-20%
-- højere end skønnet.

-- 1) Filstørrelsen på filmen — nullable, ingen default.
--    Sættes af POST /api/films (server-side HEAD på den
--    offentlige URL) og af backfillen nedenfor.
alter table public.documentaries
  add column if not exists video_file_size_bytes bigint;

-- 2) Egress-skønnet pr. afspilningssession. Default 0 = ikke
--    skønnet endnu (aktiv session eller film uden kendt størrelse).
alter table public.view_sessions
  add column if not exists estimated_egress_bytes bigint not null default 0
    check (estimated_egress_bytes >= 0);

-- 3) Én gang-backfill: film med et reelt objekt i film-videos
--    får størrelsen fra storage-objektets metadata. SQL Editor
--    kører som postgres, så storage-skemaet er læsbart. Navn-
--    matchet: video_url slutter med .../object/public/film-videos/
--    efterfulgt af objektnavnet (bruger-mappe/uuid.mp4).
--    Seed-filmene har ingen reelle objekter → forbliver null.
update public.documentaries d
   set video_file_size_bytes = (o.metadata->>'size')::bigint
  from storage.objects o
 where o.bucket_id = 'film-videos'
   and d.video_url like '%/object/public/film-videos/' || o.name
   and d.video_file_size_bytes is null;

-- ------------------------------------------------------------
-- Verifikation (kør hver del for sig):
-- 1) Begge kolonner findes → 2 rækker:
--    select column_name from information_schema.columns
--     where table_schema = 'public'
--       and ((table_name, column_name) in
--            (('documentaries','video_file_size_bytes'),
--             ('view_sessions','estimated_egress_bytes')))
--     order by table_name;
--
-- 2) Backfillen ramte film med reelle objekter (test-filmene)
--    — hver film med et tal > 0:
--    select slug, video_file_size_bytes
--      from public.documentaries
--     where video_file_size_bytes is not null;
--
-- 3) Løbende afregning — GB og sete timer pr. måned (coalesce:
--    anonyme sessioner har watched_seconds 0; dommets feature
--    er fallback. gb / sete_timer = GB-pr-time):
--    select date_trunc('month', started_at) as maaned,
--           round(sum(estimated_egress_bytes) / 1e9, 2) as gb,
--           round(sum(coalesce(nullif(watched_seconds, 0),
--                  (verdict->'features'->>'estimatedWatchedSec')::bigint)) / 3600.0, 1) as sete_timer
--      from public.view_sessions
--     group by 1 order by 1;
-- ------------------------------------------------------------