-- ============================================================
-- Doccys: minutpakker — kreditering, forbrug, køb og affiliate
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabeller, kolonner og policies oprettes kun hvis
-- de mangler; funktioner er create or replace).
--
-- Tillidsmodel: credit_ledger er append-only og har INGEN
-- insert-/update-/delete-policy for brugere — al kreditering og
-- alt forbrug skriveres udelukkende af service-role (webhook)
-- eller security definer-funktioner (afregn_session). Det lukker
-- af for, at en bruger kan forhånds-indsætte en forbrugsrække via
-- PostgREST og derved undertrykke sit eget forbrug. Ejerskab
-- tjekkes eksplicit i funktionerne (de omgår RLS med vilje).
-- Køb oprettes som 'pending' af brugeren selv (insert-policy
-- tvinger status='pending' og referrer ≠ én selv); 'paid'/
-- 'failed' kan kun sættes af service-role/definer-funktioner.
-- Idempotens: unik source_key gør Stripe-replay og dobbelt-
-- validate harmløse (on conflict-ækvivalenten er unik-
-- constraintet: gentagne inserts fejler simpelthen).

-- 1) credit_ledger — append-only kilde til sandhed for saldo.
--    Positiv = kredit (køb/affiliate/admin), negativ = forbrug.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  seconds integer not null,
  reason text not null check (reason in ('purchase', 'affiliate', 'consumption', 'admin')),
  -- 'koeb:{purchaseId}' | 'affiliate:{purchaseId}' | 'forbrug:{sessionId}' | 'admin:{uuid}'
  -- unik = idempotens ved webhook-replay og dobbelt-validate
  source_key text not null,
  created_at timestamptz not null default now(),
  unique (source_key)
);

create index if not exists idx_credit_ledger_user
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

-- Brugeren kan læse sin egen historik (saldoen er en sum heraf)
drop policy if exists "laes_egne_ledger" on public.credit_ledger;
create policy "laes_egne_ledger" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- INGEN insert/update/delete-policy: kun service-role og
-- security definer-funktioner skriver (jf. tillidsmodellen ovenfor).

-- 2) credit_purchases — ét engangs-køb af en minutpakke.
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  pack_id text not null check (pack_id in ('pack-1000', 'pack-2000', 'pack-3000')),
  minutes integer not null check (minutes in (1000, 2000, 3000)),
  price_dkk_excl numeric(7,2) not null check (price_dkk_excl >= 0),
  stripe_session_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  -- koderens ejer — kun sat hvis checkout-ruten kunne validere
  -- koden OG køberen ikke har tidligere paid-køb (kredit sker
  -- endeligt i indfri_koeb under advisory-lås)
  referrer_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_credit_purchases_user
  on public.credit_purchases (user_id, created_at desc);

alter table public.credit_purchases enable row level security;

-- Egne køb kan læses (købshistorik i profilen)
drop policy if exists "laes_egne_koeb" on public.credit_purchases;
create policy "laes_egne_koeb" on public.credit_purchases
  for select using (auth.uid() = user_id);

-- Egne køb kan oprettes — men kun som pending, og man kan ikke
-- henvise sig selv
drop policy if exists "opret_egne_koeb" on public.credit_purchases;
create policy "opret_egne_koeb" on public.credit_purchases
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and (referrer_user_id is null or referrer_user_id <> auth.uid())
  );

-- INGEN update/delete-policy: 'paid'/'failed' sættes kun af
-- service-role/indfri_koeb; køb slettes ikke fra app'en.

-- 3) user_referral_codes — én henvisningskode pr. konto.
create table if not exists public.user_referral_codes (
  user_id uuid primary key
    references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz not null default now()
);

alter table public.user_referral_codes enable row level security;

-- Koderne er offentlige (de vises i henvisningslinks) — samme
-- accept som creators.owner_user_id og comments.user_id
drop policy if exists "laes_henvisningskoder" on public.user_referral_codes;
create policy "laes_henvisningskoder" on public.user_referral_codes
  for select using (true);

-- Én kode pr. konto, oprettes af kontoen selv (lazy ved første
-- besøg i profilen; kode-kollision håndteres af appen med retry)
drop policy if exists "opret_egnen_henvisningskode" on public.user_referral_codes;
create policy "opret_egnen_henvisningskode" on public.user_referral_codes
  for insert with check (auth.uid() = user_id);

-- INGEN update/delete-policy: koden er permanent.

-- 4) view_sessions.watched_seconds — reel set tid pr. session,
--    skrevet af afregn_session (og backfilled fra gamle domme).
alter table public.view_sessions
  add column if not exists watched_seconds integer not null default 0
    check (watched_seconds >= 0);

-- Backfill fra eksisterende domme (features.estimatedWatchedSec
-- gemmes i verdict-jsonb af valideringen). Guard: kun rækker
-- der endnu ikke er afregnet (watched_seconds = 0 og verdict findes).
update public.view_sessions s
   set watched_seconds = least(
         coalesce((s.verdict -> 'features' ->> 'estimatedWatchedSec')::int, 0),
         d.duration_sec)
  from public.documentaries d
 where d.slug = s.documentary_slug
   and s.verdict is not null
   and s.watched_seconds = 0;

-- 5) saldo_sekunder() — brugerens aktuelle minut-saldo i sekunder.
--    Security INVOKER: RLS gælder stadig (brugeren kan kun summe
--    sine egne rækker), ingen udvidet tillid nødvendig.
create or replace function public.saldo_sekunder()
returns bigint
language sql
security invoker
as $$
  select coalesce(sum(seconds), 0)
    from public.credit_ledger
   where user_id = auth.uid();
$$;

grant execute on function public.saldo_sekunder() to anon, authenticated;

-- 6) afregn_session(p_session_id) — afregn ÉN afspilning.
--    Beregner de reelt sete sekunder ud fra råloggen (samme logik
--    som src/lib/analytics/features.ts: kun naturlige fremskridt
--    0 < delta <= 20 s, intervaller efter pause tæller ikke,
--    cap mod filmens længde), trækker forbruget fra saldoen,
--    skriver watched_seconds og sætter slutstatus — alt atomisk.
--    Idempotent: status-guard + unik source_key.
create or replace function public.afregn_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_sec integer;
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

  return jsonb_build_object('watched_seconds', v_sec);
end;
$$;

grant execute on function public.afregn_session(uuid) to authenticated;

-- 7) indfri_koeb(p_stripe_session_id) — indfri ét gennemført køb.
--    Kaldes KUN af Stripe-webhooken (service-role — der gives
--    intet grant til anon/authenticated). Alt sker i ÉN trans-
--    aktion: markér paid, kreditér pakken, kreditér evt. affiliate-
--    belønning. Advisory-låsen serialiserer pr. bruger, så
--    "første paid-køb"-reglen er race-fri (to samtidige første-
--    køb kan ikke begge krediteres). Idempotent ved replay:
--    status-garden + unikke source_keys gør anden kørsel til no-op.
create or replace function public.indfri_koeb(p_stripe_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
begin
  select * into v_purchase
    from public.credit_purchases
   where stripe_session_id = p_stripe_session_id
     for update;

  if v_purchase.id is null then
    return jsonb_build_object('fundet', false);
  end if;

  if v_purchase.status <> 'pending' then
    return jsonb_build_object('fundet', true, 'allerede_indfriet', true);
  end if;

  -- Serialisér fulfilment pr. bruger ("første paid-køb"-reglen)
  perform pg_advisory_xact_lock(hashtext(v_purchase.user_id::text));

  -- Affiliate-belønning: 250 min til koderens ejer — men kun hvis
  -- dette er køberens FØRSTE paid-køb (tjekkes under låsen) og
  -- køberen ikke har henvist sig selv
  if v_purchase.referrer_user_id is not null
     and v_purchase.referrer_user_id <> v_purchase.user_id
     and not exists (
       select 1 from public.credit_purchases
        where user_id = v_purchase.user_id
          and status = 'paid')
  then
    insert into public.credit_ledger (user_id, seconds, reason, source_key)
    values (v_purchase.referrer_user_id, 15000, 'affiliate',
            'affiliate:' || v_purchase.id);
  end if;

  -- Selve pakken (minutter → sekunder)
  insert into public.credit_ledger (user_id, seconds, reason, source_key)
  values (v_purchase.user_id, v_purchase.minutes * 60, 'purchase',
          'koeb:' || v_purchase.id);

  update public.credit_purchases
     set status = 'paid', paid_at = now()
   where id = v_purchase.id;

  return jsonb_build_object('fundet', true, 'indfriet', true);
end;
$$;

-- Intet grant: indfri_koeb køres kun med service-role.