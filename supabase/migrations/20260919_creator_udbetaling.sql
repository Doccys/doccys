-- ============================================================
-- Doccys: selvbetjent creator-udbetaling (150 kr-tærskel)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- Model (19/9): creatoren gemmer selv sine udbetalingsoplysninger
-- og trykker "Udbetal" på egen profil, når den tilgængelige saldo
-- er >= 150 kr (tærsklen skal kunne forsvare bankgebyrer). Den
-- FAKTISKE pengeoverførsel foregår stadig manuelt (bank) — knappen
-- opretter en anmodning, som redaktionen eksekverer og kvitterer.
--
-- To tabeller:
--   creator_payout_methods   — bankoplysninger (KUN ejeren selv læser/skriver)
--   creator_payout_requests  — anmodninger (één afventende pr. konto;
--                              status kan KUN ændres af service-role)

-- 1) Udbetalingsoplysninger — én række pr. konto
create table if not exists public.creator_payout_methods (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bank_reg_nr text,
  bank_account_nr text,
  iban text,
  updated_at timestamptz not null default now(),
  -- dansk konto (reg.nr. + kontonummer) ELLER IBAN — ikke begge dele påkrævet
  constraint payout_method_udfyldt check (
    (bank_reg_nr is not null and bank_account_nr is not null)
    or iban is not null
  )
);

alter table public.creator_payout_methods enable row level security;

drop policy if exists "laes_egne_udbetalingsoplysninger"
  on public.creator_payout_methods;
create policy "laes_egne_udbetalingsoplysninger"
  on public.creator_payout_methods
  for select using (auth.uid() = user_id);

drop policy if exists "gem_egne_udbetalingsoplysninger"
  on public.creator_payout_methods;
create policy "gem_egne_udbetalingsoplysninger"
  on public.creator_payout_methods
  for insert with check (auth.uid() = user_id);

drop policy if exists "ret_egne_udbetalingsoplysninger"
  on public.creator_payout_methods;
create policy "ret_egne_udbetalingsoplysninger"
  on public.creator_payout_methods
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at ved UPDATE
create or replace function public.trg_payout_method_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payout_method_touch
  on public.creator_payout_methods;
create trigger trg_payout_method_touch
  before update on public.creator_payout_methods
  for each row execute function public.trg_payout_method_touch();

-- 2) Udbetalingsanmodninger — creatoren anmoder, redaktionen udbetaler
create table if not exists public.creator_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_dkk numeric(9,2) not null check (amount_dkk >= 150),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_payout_requests_user
  on public.creator_payout_requests (user_id, created_at desc);

-- max ÉN afventende anmodning pr. konto (23505 → API 409)
create unique index if not exists uq_payout_request_pending
  on public.creator_payout_requests (user_id)
  where status = 'pending';

alter table public.creator_payout_requests enable row level security;

drop policy if exists "laes_egne_udbetalingsanmodninger"
  on public.creator_payout_requests;
create policy "laes_egne_udbetalingsanmodninger"
  on public.creator_payout_requests
  for select using (auth.uid() = user_id);

drop policy if exists "anmod_egne_udbetalinger"
  on public.creator_payout_requests;
create policy "anmod_egne_udbetalinger"
  on public.creator_payout_requests
  for insert with check (auth.uid() = user_id and status = 'pending');

-- INGEN update/delete-policy: statusændringer sker KUN i
-- dashboardet (service role). Creatoren kan aldrig markere sig selv
-- udbetalt.
--
-- ARBEJDSGANG for redaktionen (SQL Editor, service role):
--   1) se afventende:  select * from public.creator_payout_requests
--                        where status = 'pending';
--   2) overfør beløbet i banken, og kvitter derefter:
--      insert into public.creator_payouts (user_id, amount_dkk, note)
--      values ('<user_id>', <amount_dkk>, 'Anmodning <request-id>');
--      update public.creator_payout_requests
--         set status = 'paid', processed_at = now()
--       where id = '<request-id>';
--   (creator_payouts-rækken trækker "Tilgængelig" ned automatisk,
--    se creator_indtjening: tilgængelig = optjent − udbetalt.)