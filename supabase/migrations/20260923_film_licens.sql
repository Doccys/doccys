-- ============================================================
-- Doccys: film-licens — skaberens accept ved upload
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent.
--
-- Baggrund: Doccys strømmer filmen kommercielt (pay-per-minute),
-- genererer AI-undertekster og trailer (bearbejdelse) og bevarer
-- filmen publiceret — men før denne migration accepterede
-- skaberen intet som helst ved upload. Nu kræver både API'en
-- (POST /api/films, licenseAccepted) og insert-policyn en
-- bekræftelse af ejerskab + en ikke-eksklusiv brugsret. Klausulen
-- står i Handelsbetingelserne afsnit 11 (legal.terms.sections.s11).
--
-- Bevis-model: license_accepted_at (HVORNÅR — servertid fra API'en,
-- aldrig klient-ur) + license_version (HVILKEN tekstversion, bundet
-- til "Senest opdateret"-datoen i legal.terms.intro). HVEM følger
-- allerede af rækken (creator_handle → creators.owner_user_id).
-- Accepten er BEVIS, ikke kryptografi — samme tillidsniveau som
-- kodebasens øvrige kendte begrænsninger (fx at MIME-typen ved
-- upload er klient-erklæret, jf. 20260915).
--
-- Kolonnerne er NULLABLE og UDEN default — bevidst: en default
-- now() ville give alle inserts en "accept", og beviset ville
-- intet være. Kun POST /api/films sætter dem. Eksisterende film
-- (seed-indhold, redaktionelt) backfill'es IKKE — det ville være
-- falsk bevisførelse; kolonnerne dokumenterer fremtidige uploads.
--
-- Der er INGEN check-constraint: den ville gælde alle roller
-- inkl. service role og knække redaktionelle inserts. RLS-policyn
-- er den reelle garant — service role (dashboardet) omgår RLS og
-- kan dermed fortsat indsætte uden accept.

-- 1) Dokumentations-kolonner (nullable, ingen default)
alter table public.documentaries
  add column if not exists license_accepted_at timestamptz;
alter table public.documentaries
  add column if not exists license_version text;

-- 2) Opret KUN egne kladder — NU også med tvungen licens-accept:
--    samme betingelser som 20260915_creator_program, plus at
--    accept-tidspunktet skal være sat (API'en sætter det fra
--    servertid sammen med license_version).
drop policy if exists "opret_egne_kladder" on public.documentaries;
create policy "opret_egne_kladder" on public.documentaries
  for insert with check (
    status = 'draft'
    and license_accepted_at is not null
    and total_views = 0
    and total_completions = 0
    and valid_completions = 0
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- 3) Rediger KUN egne kladder — accepten kan ikke nulles efterfølgende
drop policy if exists "rediger_egne_kladder" on public.documentaries;
create policy "rediger_egne_kladder" on public.documentaries
  for update
  using (
    status = 'draft'
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    status = 'draft'
    and license_accepted_at is not null
    and exists (
      select 1 from public.creators c
      where c.handle = documentaries.creator_handle
        and c.owner_user_id = auth.uid()
    )
  );

-- 4) Egen verifikation (SQL Editor, efter kørslen):
--    a) Begge kolonner findes:
--       select column_name from information_schema.columns
--        where table_schema = 'public'
--          and table_name = 'documentaries'
--          and column_name like 'license%';
--       → 2 rækker: license_accepted_at, license_version.
--    b) NEGATIV test (skal AFVISES): som skaber i app'en, POST til
--       /api/films UDEN licenseAccepted → 400 "Du skal bekræfte
--       licensvilkårene…"; formularen ruller selv de uploadede
--       Storage-objekter tilbage. (Direkte PostgREST-insert uden
--       license_accepted_at afvises af insert-policyn.)
--    c) POSITIV test: fuld studie-upload med afkrydset boks →
--       select slug, license_accepted_at, license_version
--         from public.documentaries
--        order by created_at desc limit 1;
--       → begge felter sat, license_version = '2026-09-23'.
--
-- NB: versionen '2026-09-23' er bundet til legal.terms.intro's
-- "Senest opdateret"-dato og FILM_LICENSE_VERSION-konstanten i
-- src/app/api/films/route.ts — ændres licens-teksten væsentligt,
-- bumpes alle tre steder.