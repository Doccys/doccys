-- 20261117_fangst_listen.sql — DEMAND-SIDE-FANGSTEN (brugerens
-- spørgsmål 17/11: "skal der være noget på siden som kan fange seere
-- før der er indhold") — e-mail-waitlist: "Kuratering pågår — få
-- besked når nye dokumentarer landar".
--
-- PRIVATLIV: rækkerne er IKKE læsbar via API (ingen select-policy —
-- e-mail-listen er redaktionens ejendom, kun dashboardet kan læse);
-- hvem-som-helst (anon) kan INDSETTE egen mail (offentlig signup), og
-- ingen kan opdatere/slette (append-only liste). Duplikat-mails
-- håndhæves af unique-index (23505 → kortet viser "tilmeldt ✓").
--
-- VERIFIKATION (kør efter):
--   1) anon-INSERT paa gyldig mail (via sitets kort eller PostgREST:
--      POST /rest/v1/notify_waitlist {"email":"x@y.dk","locale":"da"}
--      → 201; rækken ses i dashboardet
--   2) INSERT paa invalid mail (fx "noget") → RLS-afvisning
--   3) INSERT af SAMME gyldig mail igen → 23505 (unique)
--   4) anon GET /rest/v1/notify_waitlist → []  (læsning spærret!)
--   5) RLS-tjek:
--      select relname, relrowsecurity from pg_class
--       where relname = 'notify_waitlist';   -- t=true

create table if not exists public.notify_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  locale text not null default 'da',
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

-- én mail pr. gang — uanset case ("A@X.dk" = "a@x.dk")
create unique index if not exists uq_fangst_mail
  on public.notify_waitlist (lower(trim(email)));

alter table public.notify_waitlist enable row level security;

-- hvem-som-helst fanger listen: anon + authenticated insetter EGEN mail
drop policy if exists "fangelisten_insert_offentlig"
  on public.notify_waitlist;
create policy "fangelisten_insert_offentlig"
  on public.notify_waitlist
  for insert
  to anon, authenticated
  with check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[[:alpha:]]{2,}$'
    and char_length(email) <= 254
    and locale in (
      'da','en','de','es','fr','fi','no','sv',
      'ja','zh','it','pt','hi'
    )
  );

-- INGEN select/update/delete-policies: listen er kun insetbar via
-- API'et — udlæsning sker KUN i dashboardet (postgres-rolle), så
-- e-mail-listen kan aldrig lække via PostgREST.
