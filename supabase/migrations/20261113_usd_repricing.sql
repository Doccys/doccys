-- 20261113_usd_repricing.sql — USD-skiftet (brugerens beslutninger 13/
-- 11): pakker $6.99/$10.99/$13.99 · skabersats $0.30 pr. 100 gyldige
-- minutter · udbetalingstærskel $25 · USD er ENE afregningsvaluta —
-- alt fra kolonnenavne til RPC-nøgler og kvittering hedder nu USD.
--
-- KØRSEL: MIGRATIONEN SKAL KØRES FØR koden pushes/deployes — koden
-- læser/kræver de NYE kolonnenavne (payout_rate_usd, price_usd_excl,
-- amount_usd) og de nye RPC-json-nøgler (optjent_usd …). Kan køres
-- igen (idempotent: rename på ny = fejl, så rename-punkterne er
-- vogtet af information_schema-tjek i DO-blokke).
--
-- OMRÆGNINGEN af gamle rækker sker til FAST kurs 7,00 DKK/USD
-- (round(x / 7.00, 2)) — de røgte rækker er test-data (få testkøb,
-- 3 films satser 2,00) og anmodninger/satser kan justeres i
-- dashboardet efter behov. NOTERET i PROJEKTSTATUS.
--
-- MOMS-MODELLEN (vigtig ændring): priserne er NU BASISPRISER
-- (tax_behavior: exclusive); Stripe Tax lægger kundens lands moms
-- oveni pr. faktureringsland. Den tidligere "inkl. dansk moms"-visning
-- (49 kr = 39,20 + moms) er afviklet — UI viser samme $-tal som
-- checkout'ens basispris, og moms-linjen står separat. Koden
-- (minutePacks.ts + checkout-route) er allerede opdateret hertil.
--
-- VERIFIKATION (kør efter — 1-3 i SQL Editor, 4 udefra):
--   1) kolonnenavne (forventet: 3 USD-navne, 0 dkk-navne):
--      select table_name, column_name from information_schema.columns
--       where column_name like '%_dkk%' and table_schema = 'public';
--      → skal være TOMT
--   2) satserne er omregnet (plausibelt: 2,00 → 0,29; 2,10 → 0,30;
--      2,40 → 0,34):
--      select slug, payout_rate_usd from public.documentaries
--       where payout_rate_usd is not null;
--   3) Funktionen er ejer-privat (forventet 42501):
--      select public.creator_indtjening('nordlys-film');
--   4) constraint'et (forventet 'payout_anmod_minimum'):
--      select conname, pg_get_constraintdef(oid)
--        from pg_constraint
--       where conrelid = 'public.creator_payout_requests'::regclass;
--   5) tsc + i18n-verify i kodbanken, derefter test: log ind som
--      skaber-ejer → studiets tal viser $-beløb.

-- 1) credit_purchases: kr → USD (fast kurs 7,00) og navnet med.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'credit_purchases'
       and column_name = 'price_dkk_excl'
  ) then
    update public.credit_purchases
       set price_dkk_excl = round(price_dkk_excl / 7.00, 2);
    alter table public.credit_purchases
      rename column price_dkk_excl to price_usd_excl;
  end if;
end $$;

-- 2) documentaries: satsen → payout_rate_usd, gammel default til
--    $0.30 (20260920_payout_rate satte den til 2,00 DKK; konverteres
--    først, sæt derefter den nye default).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'documentaries'
       and column_name = 'payout_rate_dkk'
  ) then
    update public.documentaries
       set payout_rate_dkk = round(payout_rate_dkk / 7.00, 2);
    alter table public.documentaries
      rename column payout_rate_dkk to payout_rate_usd;
  end if;
end $$;

alter table public.documentaries
  alter column payout_rate_usd set default 0.30;

-- 3) Udbetalings-tabellerne: amount_dkk → amount_usd + tærsklen
--    150 kr → 25 USD. Gammel check (navn fulgte den gamle kolonne)
--    droppes, NY navngivet check lægges — NOT VALID hvis gamle
--    (test-)rækker ligger under $25, så migrationen aldrig fejler;
--    ryd rækkerne og kør "validate constraint" bagefter (noteret i
--    filens hoved).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'creator_payouts'
       and column_name = 'amount_dkk'
  ) then
    update public.creator_payouts
       set amount_dkk = round(amount_dkk / 7.00, 2)
     where amount_dkk <> 0;
    alter table public.creator_payouts
      rename column amount_dkk to amount_usd;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'creator_payout_requests'
       and column_name = 'amount_dkk'
  ) then
    update public.creator_payout_requests
       set amount_dkk = round(amount_dkk / 7.00, 2)
     where amount_dkk <> 0;
    alter table public.creator_payout_requests
      rename column amount_dkk to amount_usd;
  end if;
end $$;

alter table public.creator_payout_requests
  drop constraint if exists creator_payout_requests_amount_dkk_check;
alter table public.creator_payout_requests
  drop constraint if exists payout_anmod_minimum;

do $$
begin
  if exists (
    select 1 from public.creator_payout_requests where amount_usd < 25
  ) then
    alter table public.creator_payout_requests
      add constraint payout_anmod_minimum check (amount_usd >= 25) not valid;
    raise notice 'Gamle r-aekker under $25: constraint lagt som NOT VALID — slet/rette raekkerne og koeer: alter table public.creator_payout_requests validate constraint payout_anmod_minimum;';
  else
    alter table public.creator_payout_requests
      add constraint payout_anmod_minimum check (amount_usd >= 25);
  end if;
end $$;

-- 4) creator_indtjening — PENGEBEGREBET i USD: optjent = sum(
--    watched_seconds * filmens payout_rate_usd) / 60 / 100. Nøglerne
--    omdøbes (optjent_usd/udbetalt_usd/tilgaengelig_usd) så en
--    valutamix-kilde IKKE kan opstå. Alt andet er uændret fra
--    20260920_payout_rate: kun verdict 'valid', afregnede (status <>
--    'active') loggede sessioner, ejerskabs-garden (42501).
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
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

  if auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese indtjening'
      using errcode = '42501';
  end if;

  if v_owner is null then
    return jsonb_build_object(
      'optjent_usd', 0, 'udbetalt_usd', 0, 'tilgaengelig_usd', 0,
      'sete_minutter', 0, 'film', to_jsonb('{}'::jsonb));
  end if;

  select coalesce(sum(s.watched_seconds), 0),
         coalesce(round(sum(s.watched_seconds * d.payout_rate_usd)
                        / 60.0 / 100.0, 2), 0)
    into v_sete_sek, v_optjent
    from public.view_sessions s
    join public.documentaries d on d.slug = s.documentary_slug
   where d.creator_handle = p_creator_handle
     and s.user_id is not null
     and s.status <> 'active'
     and s.verdict ->> 'verdict' = 'valid';

  select coalesce(sum(amount_usd), 0)
    into v_udbetalt
    from public.creator_payouts
   where user_id = v_owner;

  return jsonb_build_object(
    'optjent_usd', v_optjent,
    'udbetalt_usd', v_udbetalt,
    'tilgaengelig_usd', v_optjent - v_udbetalt,
    'sete_minutter', round(v_sete_sek / 60.0),
    'film', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'slug', f.slug,
                'sete_minutter', f.sete_minutter,
                'optjent_usd', f.optjent_usd) order by f.sete_minutter desc),
              to_jsonb('{}'::jsonb))
        from (
          select d.slug,
                 round(sum(s.watched_seconds) / 60.0) as sete_minutter,
                 round(sum(s.watched_seconds * d.payout_rate_usd)
                       / 60.0 / 100.0, 2) as optjent_usd
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

revoke execute on function public.creator_indtjening(text) from anon;
grant execute on function public.creator_indtjening(text) to authenticated;

-- 5) creator_tal — samme pengebegreb i USD (nøglerne 'kr' → 'usd',
--    'optjent_dkk' → 'optjent_usd'), columnen payout_rate_usd. Tal og
--    ordner ellers 1:1 fra 20260927_creator_tal.sql.
create or replace function public.creator_tal(p_creator_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

  if v_owner is null or auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese tallene'
      using errcode = '42501';
  end if;

  return jsonb_build_object(

    'ialt', (
      select jsonb_build_object(
               'minutter', coalesce(round(sum(s.watched_seconds) / 60.0), 0),
               'usd', coalesce(round(sum(s.watched_seconds * d.payout_rate_usd)
                                   / 60.0 / 100.0, 2), 0))
        from public.view_sessions s
        join public.documentaries d on d.slug = s.documentary_slug
       where d.creator_handle = p_creator_handle
         and s.user_id is not null
         and s.status <> 'active'
         and s.verdict ->> 'verdict' = 'valid'
    ),

    'film', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'slug', f.slug, 'titel', f.titel, 'status', f.status,
                 'sats', f.sats, 'afspilninger', f.afspilninger,
                 'unikke_seere', f.unikke_seere,
                 'gyldige_minutter', f.gyldige_minutter,
                 'optjent_usd', f.optjent_usd, 'faerdigspct', f.faerdigspct,
                 'kommentarer', f.kommentarer, 'likes', f.likes)
                 order by f.optjent_usd desc, f.titel),
               '[]'::jsonb)
        from (
          select d.slug, d.title as titel, d.status,
                 d.payout_rate_usd as sats,
                 coalesce(fs.afspilninger, 0) as afspilninger,
                 coalesce(fs.unikke_seere, 0) as unikke_seere,
                 coalesce(gy.minutter, 0) as gyldige_minutter,
                 coalesce(gy.usd, 0) as optjent_usd,
                 case when coalesce(fs.afsluttede, 0) > 0
                      then round(fs.faerdige * 100.0 / fs.afsluttede)
                      else 0 end as faerdigspct,
                 coalesce(en.kommentarer, 0) as kommentarer,
                 coalesce(en.likes, 0) as likes
            from public.documentaries d
            left join (
              select documentary_slug,
                     count(*) as afspilninger,
                     count(distinct user_id) as unikke_seere,
                     count(*) filter (where status <> 'active') as afsluttede,
                     count(*) filter (where status = 'completed') as faerdige
                from public.view_sessions
               group by documentary_slug
            ) fs on fs.documentary_slug = d.slug
            left join (
              select s.documentary_slug,
                     round(sum(s.watched_seconds) / 60.0) as minutter,
                     round(sum(s.watched_seconds * d2.payout_rate_usd)
                           / 60.0 / 100.0, 2) as usd
                from public.view_sessions s
                join public.documentaries d2 on d2.slug = s.documentary_slug
               where d2.creator_handle = p_creator_handle
                 and s.user_id is not null
                 and s.status <> 'active'
                 and s.verdict ->> 'verdict' = 'valid'
               group by s.documentary_slug
            ) gy on gy.documentary_slug = d.slug
            left join (
              select c.documentary_slug,
                     count(distinct c.id) as kommentarer,
                     count(cl.comment_id) as likes
                from public.comments c
                left join public.comment_likes cl on cl.comment_id = c.id
               group by c.documentary_slug
            ) en on en.documentary_slug = d.slug
           where d.creator_handle = p_creator_handle
        ) f
    ),

    'daglig', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'dato', ds.dato::text,
                 'minutter', coalesce(round(g.sum_sec / 60.0), 0),
                 'usd', coalesce(round(g.sum_usd, 2), 0))
                 order by ds.dato),
               '[]'::jsonb)
        from generate_series(
               (now() at time zone 'Europe/Copenhagen')::date - 29,
               (now() at time zone 'Europe/Copenhagen')::date,
               interval '1 day'
             ) as ds(dato)
        left join (
          select (s.started_at at time zone 'Europe/Copenhagen')::date as dag,
                 sum(s.watched_seconds) as sum_sec,
                 sum(s.watched_seconds * d.payout_rate_usd) / 60.0 / 100.0 as sum_usd
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
             and s.user_id is not null
             and s.status <> 'active'
             and s.verdict ->> 'verdict' = 'valid'
           group by 1
        ) g on g.dag = ds.dato
    ),

    'seere', (
      select jsonb_build_object(
        'sprog', (
          select coalesce(jsonb_agg(
                   jsonb_build_object('navn', l.sprog, 'antal', l.antal)
                     order by l.antal desc, l.sprog),
                   '[]'::jsonb)
            from (
              select s.device ->> 'language' as sprog, count(*) as antal
                from public.view_sessions s
                join public.documentaries d on d.slug = s.documentary_slug
               where d.creator_handle = p_creator_handle
                 and s.device ->> 'language' is not null
               group by 1
               order by antal desc, sprog
               limit 5
            ) l
        ),
        'enhed', (
          select jsonb_build_object(
            'mobil', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) > 0
                and (s.device ->> 'screenWidth')::int <= 600),
            'tablet', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) > 600
                and (s.device ->> 'screenWidth')::int <= 1024),
            'computer', count(*) filter (
              where (s.device ->> 'screenWidth')::int > 1024),
            'ukendt', count(*) filter (
              where coalesce((s.device ->> 'screenWidth')::int, 0) = 0))
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
        )
      )
    )
  );
end;
$$;

revoke execute on function public.creator_tal(text) from anon, public;
grant execute on function public.creator_tal(text) to authenticated;
