-- 20261114_kommentar_ejersvar.sql — SKABER-SVAR I DERNESTEGATE: filmens
-- ejer må nu kommentere OG svare på sin egen film uden selv at have
-- "brugt" minutter (brugerens beslutninger 14/11). Seer-gaten står
-- uforandret for ALLE andre — diskussionen forbliver blandt folk der
-- har set værket (anti-spam/anti-hate-filtret).
--
-- TO LED:
--   1) App-ruten (allerede committet): canComment/post-403 tager nu
--      har_set_film ELLER ejerskab (two-trins documentaries → creators).
--   2) DENNE MIGRATION: RLS-insert-policyen "skriv_kommentar" tjekkede
--      KUN user_id = auth.uid() — altså var ruten den eneste porte;
--      en indlogget bruger kunne BYPASS'e seer-gaten via et direkte
--      PostgREST-kald. Nu håndhæves gatten i DB'en: har_set_film
--      (security definer over credit_ledger, kan ikke lyves) ELLER
--      ejerskab af filmens skaber-profil.
--
-- HAANDHAEVELSEN er identisk med ruten: user_id = auth.uid() OG
-- (har set filmen ELLER ejer). Gæstekommentarer forbliver lukket.
-- NB: RLS-policy-udtryk refererer række-kolonnerna UFORKLEDT (ingen
-- new./old.-præfiks — det er kun trigger-funktioner).
--
-- VERIFIKATION (kør efter):
--   1) Politiken (forventet: with check indeholder har_set_film):
--      select policyname, pg_get_expr(qual, oid), pg_get_expr(with_check, oid)
--        from pg_policies
--       where tablename = 'comments' and policyname = 'skriv_kommentar';
--   2) Negativ test (SQL Editor, som postgres omgår RLS — brug therefore
--      "set role authenticated" + jwt-claim, eller test udefra): en
--      indlogget konto UDEN seertid på filmen, direkte PostgREST-insert
--      → forventet 42501/RLS-afvisning (ruten giver i dag 403 med pæn
--      tekst; det TJEK er at DB-en ikke længere er et bypass).
--   3) Positiv: skaber-ejer svarer en kommentar i sitet uden at have
--      set filmen → indlægget lander.

drop policy if exists "skriv_kommentar" on public.comments;
create policy "skriv_kommentar" on public.comments
  for insert with check (
    user_id = auth.uid()
    and (
      public.har_set_film(documentary_slug)
      or exists (
        select 1
          from public.documentaries d
          join public.creators c on c.handle = d.creator_handle
         where d.slug = documentary_slug
           and c.owner_user_id = auth.uid()
      )
    )
  );
