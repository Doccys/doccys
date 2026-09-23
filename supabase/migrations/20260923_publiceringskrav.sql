-- ============================================================
-- Doccys: publiceringskrav — undertekster + trailer SKAL være klar
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent.
--
-- Publicering sker IKKE i app'en: POST /api/films opretter altid
-- kladder, og der findes ingen rute der flipper status — filmen
-- sættes live af redaktionen direkte her i dashboardet. Et krav om
-- færdige undertekster og trailer kan derfor IKKE håndhæves i
-- koden — det SKAL sidde i databasen som trigger på selve
-- omskiftningen draft → published:
--   1) ALLE platformssprog skal have en ready-række i
--      film_subtitles (13 — tallet matcher check-constrainten fra
--      20260923_global_sprog.sql og PLATFORM_LOCALES i
--      src/lib/i18n/languageNames.ts; udvides sproglisten, rettes
--      tallet her med)
--   2) film_trailers skal have en ready-række til filmen
--
-- Hvorfor: "udgiv på 13 sprog med ét klik" er creator-løftet, og
-- trailer er den gratis smagsprøve bag paywallen — en film uden
-- dem er en halv film. Fejlbeskederne henviser til studiet, hvor
-- begge pipelines har deres knapper.
--
-- Eksisterende publicerede film røres IKKE (triggeren ser kun på
-- selve draft → published-overgangen). Af-publicering og senere
-- redigering af publicerede film er uhindret; gen-publicering
-- (draft → published igen) tjekkes på ny — korrekt.

-- 1) Trigger-funktion (create or replace = idempotent genkørsel)
create or replace function public.kraev_undertekster_og_trailer()
returns trigger
language plpgsql
as $$
declare
  klar integer;
  trailer_klar boolean;
begin
  if new.status = 'published' and old.status = 'draft' then
    select count(*) into klar
      from public.film_subtitles
     where documentary_slug = new.slug
       and status = 'ready';

    if klar < 13 then
      raise exception
        'Filmen kan ikke publiceres endnu: kun % af 13 undertekst-sprog er klar — kør undertekst-generering i studiet',
        klar;
    end if;

    select exists (
      select 1
        from public.film_trailers
       where documentary_slug = new.slug
         and status = 'ready'
    ) into trailer_klar;

    if not trailer_klar then
      raise exception
        'Filmen kan ikke publiceres endnu: traileren mangler eller er ikke færdig — kør trailer-generering i studiet';
    end if;
  end if;

  return new;
end $$;

-- 2) Trigger på omskiftningen (drop/create-par som husstilen)
drop trigger if exists trg_publiceringskrav on public.documentaries;
create trigger trg_publiceringskrav
  before update on public.documentaries
  for each row execute function public.kraev_undertekster_og_trailer();

-- 3) EXECUTE-hullet: Supabases platform-setup giver ALLE nye
--    funktioner direkte execute-grants til anon+authenticated
--    (jf. 20260920_rpc_tilladelser). En trigger-funktion skal
--    KUN kunne affyres af selve triggeren — kaldes den direkte,
--    fejer den ganske vist pga manglende NEW/OLD, men adgangen
--    lukkes alligevel helt:
revoke all on function public.kraev_undertekster_og_trailer()
  from public;
revoke execute on function public.kraev_undertekster_og_trailer()
  from anon, authenticated;

-- 4) Egen verifikation (SQL Editor, efter kørslen):
--    a) Triggeren sidder på tabellen og er aktiveret:
--       select tgname, tgenabled from pg_trigger
--        where tgrelid = 'public.documentaries'::regclass
--          and not tgisinternal;
--       → trg_publiceringskrav, tgenabled = 'O'.
--    b) NEGATIV test (skal FEJLE med undertekst-beskeden — tag en
--       kladde uden færdige spor, fx en test-upload; rul tilbage
--       bagefter):
--       begin;
--       update public.documentaries set status = 'published'
--        where slug = '<en-kladde-uden-spor>' and status = 'draft';
--       → ERROR: Filmen kan ikke publiceres endnu: kun 0 af 13 …
--       rollback;
--    c) POSITIV test: en film med 13 ready-undertekster + ready-
--       trailer skal kunne publiceres (prøv fx en ny testfilm efter
--       en fuld pipeline-kørsel, eller vent til første rigtige
--       publicering og se den gå igennem).
--    d) Ingen nye grants: funktionen må IKKE kunne kaldes direkte:
--       select proacl from pg_proc
--        where proname = 'kraev_undertekster_og_trailer';
--       → proacl uden execute til anon/authenticated (service_role
--         er altid med som owner-rettighed i dashboardet).

-- Ingen policies røres: dokumentary-tabellen har select using
-- (true) + creator-ejer-skrivning i forvejen, og triggeren gælder
-- for ALLE opdateringer uanset rolle — også dashboardets service
-- role. Det er netop pointen: redaktionen kan ikke publicere
-- sig uden om kravet ved et uheld.