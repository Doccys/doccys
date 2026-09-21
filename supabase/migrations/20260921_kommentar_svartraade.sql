-- ============================================================
-- Doccys: svar-tråde i kommentarfeltet (maks ét niveau)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent: kolonnen, indexet,
-- triggers og funktionerne kan oprettes igen uden fejl
-- (drop/create-par er med vilje — genkørsel opfrisker dem).
--
-- Tillidsmodel: forsiden lover "hver film har sin egen diskussion
-- — bare folk der har set det samme som dig", men feltet var en
-- flad kommentarvæg. Nu kan seere SVARE på hinanden. Et svar er en
-- kommentar-række med parent_id, så alle eksisterende policies
-- (select/insert/slet) og har_set_film-gatet dækker svar uændret.
-- Tre regler håndhæves i DB, ikke kun i API'en (PostgREST er
-- direkte nåbar for seerne):
--   1) maks ét niveau — svar på svar afvises,
--   2) svaret skal tilhøre samme film som forælderen,
--   3) svar kan ALDRIG fastgøres (uq_comments_pinned forbliver
--      ét topindlæg pr. film) — og pin kan nu heller ikke sniges
--      ind via INSERT: pinned=true ved indsættelse afvises.
--      (Indtil nu kunne en authenticated seer teknisk indsætte et
--      'pinned' indlæg direkte via PostgREST, når intet andet var
--      fastgjort — fastgørelse er KUN creator-ejerens UPDATE-flow.)
-- Sletning af et topindlæg kaskaderer dets svar (on delete
-- cascade) — én moderationsbeslutning, ingen forladte svar.

-- 1) parent_id-kolonne: svaret peger på det indlæg, det svarer på
alter table public.comments
  add column if not exists parent_id uuid
  references public.comments (id) on delete cascade;

create index if not exists idx_comments_parent
  on public.comments (parent_id);

-- 2) Insert-trigger: gyldige svar + pin-omgåelse lukket
create or replace function public.valider_kommentar_svar()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
  v_parent text;
begin
  -- Fastgørelse sker kun via UPDATE (creator-ejerens pin-flow);
  -- ellers kunne en seer indsætte sit eget indlæg som fastgjort.
  if new.pinned then
    raise exception 'pinned kan ikke sættes ved indsættelse — brug fastgørelsen (UPDATE)';
  end if;

  if new.parent_id is not null then
    select c.documentary_slug, c.parent_id
      into v_slug, v_parent
      from public.comments c
      where c.id = new.parent_id;

    if v_slug is null then
      raise exception 'Svarets forælder findes ikke';
    end if;
    if v_slug <> new.documentary_slug then
      raise exception 'Svar skal tilhøre samme film som forælderen';
    end if;
    if v_parent is not null then
      raise exception 'Svar på svar er ikke tilladt — maks ét niveau';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_comment_svar_gyldig on public.comments;
create trigger trg_comment_svar_gyldig
  before insert on public.comments
  for each row execute function public.valider_kommentar_svar();

-- 3) Pin-trigger udvidet: parent_id låses som resten af indholdet,
--    og et svar kan aldrig fastgøres. Triggeren trg_comment_pin_kun
--    består — create or replace på funktionen er nok.
create or replace function public.kun_pin_aendring()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null and new.pinned then
    raise exception 'Svar kan ikke fastgøres — kun topindlæg kan';
  end if;
  if new.body is distinct from old.body
     or new.author_name is distinct from old.author_name
     or new.documentary_slug is distinct from old.documentary_slug
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.parent_id is distinct from old.parent_id
  then
    raise exception 'Kommentarer kan kun fastgøres — indholdet må aldrig ændres';
  end if;
  return new;
end $$;

-- 4) Egen verifikation (SQL Editor, efter kørslen):
--    a) Kolonnen:
--       select column_name from information_schema.columns
--        where table_name = 'comments' and column_name = 'parent_id';
--    b) Pin-omgåelse lukket (som AUTHENTICERET seer, almindelig
--       anon-session kan ikke indsætte — insert-policien kræver
--       user_id = auth.uid()):
--       Prøv i app'en at POSTe en kommentar med pinned med i bodyen
--       via konsollen — API'en sender aldrig pinned, og et direkte
--       PostgREST-insert med "pinned": true giver nu fejl.
--    c) Svar-pin lukket:
--       update public.comments set pinned = true
--        where parent_id is not null;  → forventet trigger-fejl.
--    d) Ét niveau:
--       insert med parent_id = (id på et eksisterende svar)
--       → forventet fejl 'Svar på svar er ikke tilladt'.
--    Eksisterende rækker har parent_id null — topindlæg, korrekt.

-- Intet grant at røre: ingen nye funktioner over PostgREST
-- (triggere kører internt), ingen nye tabeller. Policies og
-- har_set_film dækker svar uændret — se hovedkommentaren.