-- ============================================================
-- Doccys: faktureringsland pr. køb (lande-statistik til redaktionen)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- Formål (20/9): redaktionen vil vide hvilke lande der sælger
-- bedst ift. deling/markedsføring. Stripe Tax (DK-registreringen)
-- KRÆVER allerede faktureringsadresse ved checkout — landet ligger
-- i session.customer_details.address.country, men webhook'en sendte
-- kun session-id'et, så landet blev smidt væk. GDPR-note: landet
-- indsamles allerede til moms-beregning; der sker INGEN ny
-- tracking (ingen IP-geolokation, ingen cookies) ved at gemme det
-- på købsrækken.
--
-- NB: utm-sporing pr. køb (utm_source/medium/campaign fra del-
-- rillerne) er BEVIDST ikke med — det kræver en kilde-cookie, som
-- er marketing-tracking under Cookie-reglen → afventer samtykke-
-- løsningen i launch-backloggen. Affiliate-deling dækkes allerede
-- af referrer_user_id.
--
-- REDAKTIONENS LANDE-STATISTIK (SQL Editor):
--   select billing_country,
--          count(*)                        as koeb,
--          sum(minutes)                    as minutter,
--          sum(price_dkk_excl)             as omsaetning_eksl_moms
--     from public.credit_purchases
--    where status = 'paid'
--    group by billing_country
--    order by koeb desc;
-- (null = gamle køb fra før kolonnen, eller checkout uden adresse)

-- 1) kolonnen — ISO 3166-1 alpha-2, præcis som Stripe leverer den
alter table public.credit_purchases
  add column if not exists billing_country text;

alter table public.credit_purchases
  drop constraint if exists koeb_land_format;
alter table public.credit_purchases
  add constraint koeb_land_format check (
    billing_country is null or billing_country ~ '^[A-Z]{2}$'
  );

-- 2) indfri_koeb udvides med land-parameteren. FUNKTIONEN MED GAMMEL
--    SIGNATUR DROPPES FØRST — create or replace med flere parametre
--    ellers en OVERLAST, og et rescue-kald med kun session-id ville
--    stadig ramme den gamle (uden land). Default null betyder at
--    rescue-epost /rest/v1/rpc/indfri_koeb {p_stripe_session_id}
--    fortsat virker uændret.
drop function if exists public.indfri_koeb(text);

create or replace function public.indfri_koeb(p_stripe_session_id text,
                                              p_billing_country text default null)
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
     set status = 'paid',
         paid_at = now(),
         billing_country = p_billing_country
   where id = v_purchase.id;

  return jsonb_build_object('fundet', true, 'indfriet', true);
end;
$$;

-- Intet grant: indfri_koeb køres kun med service-role.