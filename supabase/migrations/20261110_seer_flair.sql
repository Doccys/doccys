-- 20261110_seer_flair.sql — OFFENTLIG seer-flair (backlog 13: brugerens
-- beslutning 10/11): en lille guld-chip med seer-titlen (Opdager/
-- Nysgerrig/Pioner/Legende) ved brugernavne i kommentarfeltet.
--
-- PRIVATLIV: et VIEW eksponerer KUN user_id + den grove tier (0-3,
-- tærsklerne fra SEER_TRAE) — INGEN enkelte sessioner, enheder,
-- film, genrer eller dommer. En "Opdager"-chip røber på det samme
-- som en profilbesøg med profilens statuskort (der er offentligt
-- læsbar allerede).
--
-- TÆRSKLER (seconds) — MÅ SYNKE med SEER_TRAE i src/lib/viewerStatus.ts:
--   tier0 Opdager    0 s
--   tier1 Nysgerrig  100 min    = 6.000 s
--   tier2 Pioner     1.000 min  = 60.000 s
--   tier3 Legende    10.000 min = 600.000 s
--
-- VERIFIKATION (kør efter):
--   select * from seer_flair limit 5;           -- rækker med tier
--   select tier, count(*) from seer_flair group by tier;
--   anon-røgtest: GET https://…/rest/v1/seer_flair?select=*&limit=1
--   med apikey-hovedet → 200 (offentlig læsning, som ønsket)

create or replace view public.seer_flair
as
select
  user_id,
  floor(sum(watched_seconds)) as total_seconds,
  case
    when sum(watched_seconds) >= 600000 then 3
    when sum(watched_seconds) >= 60000  then 2
    when sum(watched_seconds) >= 6000   then 1
    else 0
  end as tier
from public.view_sessions
where user_id is not null
  and status <> 'active'
  and watched_seconds > 0
group by user_id;

revoke all on public.seer_flair from public;
grant select on public.seer_flair to anon, authenticated;
