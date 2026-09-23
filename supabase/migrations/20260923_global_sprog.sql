-- ============================================================
-- Doccys: global udrulning — 5 nye sprog i undertekst/talesprog
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent.
--
-- Siten udvides med japansk, forenklet kinesisk, italiensk,
-- brasiliansk portugisisk og hindi — både som grænseflade-sprog og
-- undertekst-sprog (brugerens beslutning: sproglisten følger sitens
-- sprog 1:1 → 13 sprog i alt). Denne migration udvider de to
-- check-constraints, så de nye koder kan gemmes:
--   1) film_subtitles.locale      (CC-sproget pr. film)
--   2) documentaries.spoken_language (det TALESTE sprog, whisper-hint)
--
-- Eksisterende rækker røres ikke (de 8 gamle koder er en delmængde
-- af de 13). NB: denne migration skal være KØRT, før nogen genererer
-- undertekster for et af de nye sprog eller vælger dem som talesprog
-- i studiet — ellers afvises rækken af check-constrainten.
--
-- Listerne skal ALTID matche PLATFORM_LOCALES i
-- src/lib/i18n/languageNames.ts (én kilde til sandhed i koden).

-- 1) film_subtitles.locale — den gamle check var en INLINE
--    kolonne-check og fik derfor PostgreSQLs deterministiske
--    default-navn "film_subtitles_locale_check". Drop + re-add
--    (idempotent: genkørsel genopfrisker constrainten uændret).
alter table public.film_subtitles
  drop constraint if exists film_subtitles_locale_check;

alter table public.film_subtitles
  add constraint film_subtitles_locale_check
  check (
    locale in (
      'da', 'en', 'de', 'es', 'fr', 'fi', 'no', 'sv',
      'ja', 'zh', 'it', 'pt', 'hi'
    )
  );

-- 2) documentaries.spoken_language — constrainten fra
--    20260919_film_talesprog.sql hedder doccys_spoken_language_gyldig.
--    Droppes UDENFOR do $$-vakten (drop if exists er i sig selv
--    idempotent), og re-addes i vakten som dengang.
alter table public.documentaries
  drop constraint if exists doccys_spoken_language_gyldig;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'doccys_spoken_language_gyldig'
  ) then
    alter table public.documentaries
      add constraint doccys_spoken_language_gyldig
      check (
        spoken_language in (
          'da', 'en', 'de', 'es', 'fr', 'fi', 'no', 'sv',
          'ja', 'zh', 'it', 'pt', 'hi'
        )
      );
  end if;
end $$;

-- 3) Egen verifikation (SQL Editor, efter kørslen):
--    a) Begge constraints viser de 13 koder:
--       select conname, pg_get_constraintdef(oid)
--         from pg_constraint
--        where conname in ('film_subtitles_locale_check',
--                          'doccys_spoken_language_gyldig');
--       → begge rækker skal liste ja/zh/it/pt/hi.
--    b) Præcis ÉN locale-check tilbage på film_subtitles (en levning
--       med andet navn ville stadig afvise de nye koder):
--       select count(*) from pg_constraint
--        where conrelid = 'public.film_subtitles'::regclass
--          and contype = 'c'
--          and pg_get_constraintdef(oid) ilike '%locale%';
--       → forventet 1.
--    c) De nye koder accepteres (skal give 0 rækker, ingen fejl):
--       select count(*) from public.film_subtitles
--        where locale in ('ja', 'zh', 'it', 'pt', 'hi');
--       → forventet 0 (der er endnu ingen undertekster på de nye
--         sprog — tallet vokser først når en creator genkører
--         pipeline på en film).

-- Ingen nye tabeller, grants eller policies: constraint-bytning
-- ændrer ingen rettigheder, og select using (true) samt
-- creator-ejer-policies røres ikke.