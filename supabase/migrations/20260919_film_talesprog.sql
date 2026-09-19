-- ============================================================
-- Doccys: filmens talesprog (til AI-undertekst-pipelinen)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent.
--
-- spoken_language = ISO 639-1-koden på det sprog der TALES i
-- filmen (ikke appens/grænsefladens sprog). Undertekst-pipelinen
-- bruger værdien som whisper's sprog-hint, så en engelsksproget
-- film bliver skrevet af på engelsk — transskriptionen er derefter
-- KILDEN, som oversættes direkte til alle 8 platformssprog.
--
-- Default 'da': alle eksisterende film taler dansk, og upload-
-- formularen forudvælger dansk. Listen her skal ALTID matche
-- PLATFORM_LOCALES i src/lib/i18n/languageNames.ts — og den
-- matcher check-constrainten på film_subtitles.locale, da
-- pipeline-rækkerne (og dermed CC-sprogene) netop er de 8.

alter table public.documentaries
  add column if not exists spoken_language text not null default 'da';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'doccys_spoken_language_gyldig'
  ) then
    alter table public.documentaries
      add constraint doccys_spoken_language_gyldig
      check (
        spoken_language in ('da', 'en', 'de', 'es', 'fr', 'fi', 'no', 'sv')
      );
  end if;
end $$;