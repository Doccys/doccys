-- ============================================================
-- Doccys: "Fortsæt se" — position gemmes i watch_history ved afregning
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: funktionen er
-- create or replace med uændret signatur (ingen overlast).
--
-- Formål (20/9): forsiden skal kunne vise en "Fortsæt se"-rille
-- for loggede ind. Positionen skrives VED AFSLUTNING af afspil-
-- ningen (i afregn_session), ikke undervejs — det er den samme
-- beslutning som watched_seconds: råloggen (view_events) er
-- sandheden, watch_history er den kuraterede visning.
--
-- Tillidsmodel: funktionen er security definer og omgår RLS med
-- vilje (view_events/watch_history er ikke sommerbar under
-- bruger-RLS), men ejerskabet tjekkes eksplicit på sessionen —
-- uændret fra tidligere. watch_history-rækken armer altid
-- sessionens user_id, og completed kan ALDRIG sættes true her:
--
--   completed = watch_history.completed
--
-- dvs. anti-fraud-gated recordValidCompletion (validate-API'en)
-- forbliver den ENESTE vej til completed=true. greatest() sikrer,
-- at en re-watch aldrig sænker progress, og en eksisterende
-- gyldig completion (ratio 1) kan ikke degraderes — afregn
-- skriver kun "op ad". Idempotens: status-garden returnerer,
-- FØR upsert'en røres; dobbelt-validate (ended + beacon) er
-- derfor harmløs, og on conflict gør gentagne afregninger til
-- no-op. Anonyme sessioner røres ikke — afregn kaldes kun for
-- loggede, så rillen er automatisk logged-ind-only.

-- 1) afregn_session v2 — samme signatur, udvidet med watch_history-
--    upsert efter status-UPDATE (kun på hovedstien, efter idempotens-
--    garden). Alt andet er uændret fra 20260917_minutpakker_ledger.
create or replace function public.afregn_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_sec integer;
  v_pos integer;
begin
  select s.*, d.duration_sec into v_session
    from public.view_sessions s
    join public.documentaries d on d.slug = s.documentary_slug
   where s.id = p_session_id
     for update of s;

  if v_session.id is null then
    raise exception 'Sessionen findes ikke';
  end if;

  -- Definer omgår RLS — ejerskabet tjekkes eksplicit
  if v_session.user_id is distinct from auth.uid() then
    raise exception 'Sessionen tilhører ikke den indloggede konto';
  end if;

  -- Idempotens: en allerede afregnet session røres ikke igen
  if v_session.status <> 'active' then
    return jsonb_build_object(
      'allerede_afregnet', true,
      'watched_seconds', v_session.watched_seconds);
  end if;

  -- Naturlige fremskridt fra råloggen (vinduesfunktion over
  -- seq-ordnede events — spejler estimatedWatchedSec)
  with ev as (
    select video_time_sec,
           type,
           lag(type) over w as prev_type,
           lag(video_time_sec) over w as prev_time
      from public.view_events
     where session_id = p_session_id
     window w as (order by seq)
  )
  select least(
         coalesce(sum(
           case
             when prev_type is distinct from 'pause'
              and video_time_sec - prev_time > 0
              and video_time_sec - prev_time <= 20
             then video_time_sec - prev_time
             else 0
           end), 0),
         v_session.duration_sec)
    into v_sec
    from ev;

  if v_sec > 0 then
    insert into public.credit_ledger (user_id, seconds, reason, source_key)
    values (v_session.user_id, -v_sec, 'consumption', 'forbrug:' || p_session_id);
  end if;

  update public.view_sessions
     set watched_seconds = v_sec,
         ended_at = coalesce(ended_at, now()),
         status = case
                    when exists (select 1
                                   from public.view_events e
                                  where e.session_id = p_session_id
                                    and e.type = 'complete')
                    then 'completed' else 'abandoned'
                  end
   where id = p_session_id;

  -- "Fortsæt se": gem den længste nåede position til forsiden.
  -- max(video_time_sec) = hvor langt seeren KOM (rå position,
  -- ikke de fakturerbare naturlige fremskridt ovenfor). Guard
  -- v_pos >= 1: en session uden brugbare events rører ikke
  -- historikken. Se tillidsmodellen i headeren for greatest()/
  -- completed-reglerne.
  select coalesce(max(video_time_sec), 0)::int into v_pos
    from public.view_events
   where session_id = p_session_id;

  if v_pos >= 1 and coalesce(v_session.duration_sec, 0) > 0 then
    insert into public.watch_history
      (user_id, documentary_slug, watched_at, progress_ratio, completed)
    values (v_session.user_id, v_session.documentary_slug, now(),
            least(1, round(v_pos / v_session.duration_sec::numeric, 3)), false)
    on conflict (user_id, documentary_slug) do update
      set progress_ratio = greatest(watch_history.progress_ratio,
                                    excluded.progress_ratio),
          completed      = watch_history.completed,
          watched_at     = excluded.watched_at;
  end if;

  return jsonb_build_object('watched_seconds', v_sec);
end;
$$;

-- Grant uændret: kun authenticated (afregn trækker på saldoen).

grant execute on function public.afregn_session(uuid) to authenticated;