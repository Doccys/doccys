-- ============================================================
-- Doccys: payout_rate_dkk bliver sandheden for skaber-indtjening
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent (update + alter +
-- create or replace + grant/revoke kan køres igen uden fejl).
--
-- Baggrund (20/9): documentaries.payout_rate_dkk var seedet pr.
-- film (1,60-2,40 kr) men blev ALDRIG brugt — creator_indtjening
-- havde satsen hardcodet til 2 kr pr. 100 sete minutter. Med
-- stoette-beviset (end-skaerm: "X min · Y kr gik direkte til
-- skaberen") skal bevis og penge stemme: kolonnen bliver den
-- reelle kilde, og RPC'en summerer rate PR. FILM.
--
-- NB: kolonnens default var 0 — bruger-uploadede film (fx test-
-- filmen "earth") ville dermed tjene 0 kr. Rækker med 0 rettes til
-- standard-satsen 2,00, og default ændres, så fremtidige uploads
-- automatisk får standarden.

-- 1) Eksisterende 0-rækker = default-artifakt → standard-satsen.
--    (En redaktionel 0-rate kan senere sættes BEVIDST — denne
--    update rører kun historiske 0'er, og efter første kørsel
--    findes der ingen 0-rækker tilbage at røre.)
update public.documentaries
   set payout_rate_dkk = 2.00
 where payout_rate_dkk = 0;

-- 2) Fremtidige uploads får standarden automatisk
alter table public.documentaries
  alter column payout_rate_dkk set default 2.00;

-- 3) creator_indtjening — rate PR. FILM foer summeringen:
--    optjent = sum(watched_seconds * filmens rate) / 60 / 100.
--    Delsummerne pr. film stemmer dermed med totalen. Alt andet
--    er uændret fra 20260919_indtjening_privat: kun verdict
--    'valid', afregnede (status <> 'active') sessioner med kendt
--    seer taeller — og ejerskabsgarden (42501) står uændret.
create or replace function public.creator_indtjening(p_creator_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_sete_sek numeric;
  v_optjent numeric;
  v_udbetalt numeric;
begin
  -- creatorens ejerkonto (NULL → seed-profil uden bundet konto)
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

  -- Kun ejeren ma laese tallene (42501 = samme kode som RLS-
  -- afvisning; gaelder ogsaa authenticated-brugere, der ejer en
  -- anden creator)
  if auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese indtjening'
      using errcode = '42501';
  end if;

  if v_owner is null then
    return jsonb_build_object(
      'optjent_dkk', 0, 'udbetalt_dkk', 0, 'tilgaengelig_dkk', 0,
      'sete_minutter', 0, 'film', to_jsonb('{}'::jsonb));
  end if;

  -- Sete minutter (uændret) — og optjent med rate pr. film:
  -- sekunder * filmens payout_rate_dkk / 60 / 100, summeret foer
  -- afrunding, saa delsummer matcher totalen.
  select coalesce(sum(s.watched_seconds), 0),
         coalesce(round(sum(s.watched_seconds * d.payout_rate_dkk)
                        / 60.0 / 100.0, 2), 0)
    into v_sete_sek, v_optjent
    from public.view_sessions s
    join public.documentaries d on d.slug = s.documentary_slug
   where d.creator_handle = p_creator_handle
     and s.user_id is not null
     and s.status <> 'active'
     and s.verdict ->> 'verdict' = 'valid';

  select coalesce(sum(amount_dkk), 0)
    into v_udbetalt
    from public.creator_payouts
   where user_id = v_owner;

  return jsonb_build_object(
    'optjent_dkk', v_optjent,
    'udbetalt_dkk', v_udbetalt,
    'tilgaengelig_dkk', v_optjent - v_udbetalt,
    'sete_minutter', round(v_sete_sek / 60.0),
    'film', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'slug', f.slug,
                'sete_minutter', f.sete_minutter,
                'optjent_dkk', f.optjent_dkk) order by f.sete_minutter desc),
              to_jsonb('{}'::jsonb))
        from (
          select d.slug,
                 round(sum(s.watched_seconds) / 60.0) as sete_minutter,
                 round(sum(s.watched_seconds * d.payout_rate_dkk)
                       / 60.0 / 100.0, 2) as optjent_dkk
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
             and s.user_id is not null
             and s.status <> 'active'
             and s.verdict ->> 'verdict' = 'valid'
           group by d.slug
        ) f
    )
  );
end;
$$;

-- 4) Tilladelser: eksplicit og idempotent (create or replace
--    bevarer eksisterende ACL, men vi fastsaetter den selv —
--    jf. learingen om Supabases default privileges): anon kan
--    slet ikke kalde funktionen, ejeren er authenticated.
revoke execute on function public.creator_indtjening(text) from anon;
grant execute on function public.creator_indtjening(text) to authenticated;