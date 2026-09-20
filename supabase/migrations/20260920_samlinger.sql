-- ============================================================
-- Doccys: kuraterede samlinger (tematiske riller på forsiden)
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: tabeller, trigger og
-- policies oprettes kun hvis de mangler; seed bruger
-- on conflict do nothing, så eksisterende kuratering respekteres.
--
-- Formål (20/9): redaktionen skal kunne kuratere tematiske
-- samlinger ("Is, hav og natur") med egne oversatte titler og
-- beskrivelser, vist som rille på forsiden og som temasider.
--
-- Tillidsmodel: samlinger er rene redaktionsdata — offentlig
-- SELECT-policy på begge tabeller, men INGEN insert/update/
-- delete-policy (creator_payouts-præcedensen). Kuratering sker
-- udelukkende i dashboardet (service role omgår RLS). En film kan
-- stå i flere samlinger; rækkefølgen er collection_films.sort_order.
--
-- NB: documentaries' RLS er select using (true) — kladder skjules
-- af APP-filtret (.eq status 'published'), ikke af databasen.
-- App-koden forholder sig derfor ALTID til publiceret-status, så
-- en kladde aldrig kan dukke op i en offentlig samling.

-- 1) collections — én kurateret samling. Dansk titel/beskrivelse
--    er canonical; *_i18n har oversættelser pr. sprog (bio_i18n-
--    mønsteret fra 20260914_doccys_content_i18n).
create table if not exists public.collections (
  id text primary key,
  slug text not null unique,
  title text not null,
  title_i18n jsonb,
  description text not null,
  description_i18n jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;

drop policy if exists "offentlig laesning" on public.collections;
create policy "offentlig laesning" on public.collections
  for select using (true);

-- INGEN insert/update/delete-policy: kuratering sker kun i
-- dashboardet (service role).

-- updated_at røres automatisk ved UPDATE (touch-mønsteret)
create or replace function public.touch_collection_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_collection_touch on public.collections;
create trigger trg_collection_touch
  before update on public.collections
  for each row execute function public.touch_collection_updated_at();

-- 2) collection_films — film-medlemskab. Unikt pr. (samling, film);
--    sletter en samling eller filmen, ryger medlemskabet med.
create table if not exists public.collection_films (
  collection_id text not null
    references public.collections (id) on delete cascade,
  documentary_slug text not null
    references public.documentaries (slug) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (collection_id, documentary_slug)
);

create index if not exists idx_collection_films_order
  on public.collection_films (collection_id, sort_order);

alter table public.collection_films enable row level security;

drop policy if exists "offentlig laesning" on public.collection_films;
create policy "offentlig laesning" on public.collection_films
  for select using (true);

-- INGEN insert/update/delete-policy — jf. ovenfor.

-- 3) seed — 3 eksempler fordelt over alle 6 seedede film, så
--    rillen og temasiderne har indhold fra første dag. Egne
--    kurateringer fra dashboardet ligger ved siden af disse.
insert into public.collections
  (id, slug, title, title_i18n, description, description_i18n, sort_order)
values
  ('c-01', 'is-hav-og-natur', 'Is, hav og natur',
   jsonb_build_object(
     'en', 'Ice, Sea and Nature',
     'es', 'Hielo, mar y naturaleza',
     'fr', 'Glace, mer et nature',
     'de', 'Eis, Meer und Natur',
     'no', 'Is, hav og natur',
     'sv', 'Is, hav och natur',
     'fi', 'Jää, meri ja luonto'
   ),
   'Landskaber i forandring: gletsjere der forsvinder, et saltmarsk der drukner og en skov, der ånder med årstiderne.',
   jsonb_build_object(
     'en', 'Landscapes in change: vanishing glaciers, a drowning salt marsh and a forest that breathes with the seasons.',
     'es', 'Paisajes en cambio: glaciares que desaparecen, una marisma salada que se ahoga y un bosque que respira con las estaciones.',
     'fr', 'Des paysages en mutation : des glaciers qui disparaissent, un marais salant qui s''engloutit et une forêt qui respire au rythme des saisons.',
     'de', 'Landschaften im Wandel: verschwindende Gletscher, ein ertrinkendes Salzmarschland und ein Wald, der mit den Jahreszeiten atmet.',
     'no', 'Landskap i endring: isbreer som forsvinner, en saltmyr som drukner og en skog som puster med årstidene.',
     'sv', 'Landskap i förändring: glaciärer som försvinner, ett saltkärr som drunknar och en skog som andas med årstiderna.',
     'fi', 'Muuttuvat maisemat: häviävät jäätiköt, hukkumaan menevä suolaniitty ja metsä, joka hengittelee vuodenaikojen mukana.'
   ),
   1),
  ('c-02', 'mennesker-i-fokus', 'Mennesker i fokus',
   jsonb_build_object(
     'en', 'People in Focus',
     'es', 'Personas en foco',
     'fr', 'Gens au centre',
     'de', 'Menschen im Fokus',
     'no', 'Mennesker i fokus',
     'sv', 'Människor i fokus',
     'fi', 'Ihmiset keskiössä'
   ),
   'Nære portrætter af mennesker med et livsværk: en maler, en teknikeren og en glaciolog på hendes sidste feltmission.',
   jsonb_build_object(
     'en', 'Intimate portraits of people with a life''s work: a painter, a technician and a glaciologist on her final field mission.',
     'es', 'Retratos íntimos de personas con una obra de vida: una pintora, un técnico y una glacióloga en su última misión de campo.',
     'fr', 'Portraits intimes de personnes portant une œuvre de vie : une peintre, un technicien et une glaciologue dans sa dernière mission de terrain.',
     'de', 'Nahe Porträts von Menschen mit einem Lebenswerk: eine Malerin, ein Techniker und eine Glaziologin auf ihrer letzten Feldmission.',
     'no', 'Nære portretter av mennesker med et livsverk: en maler, en tekniker og en glaciolog på hennes siste feltmisjon.',
     'sv', 'Nära porträtt av människor med ett livsverk: en målare, en tekniker och en glaciolog på hennes sista fältmission.',
     'fi', 'Lähikuvia ihmisistä, joilla on elämäntyö: taidemaalari, teknikko ja glasioologi viimeisellä kenttäkeikallaan.'
   ),
   2),
  ('c-03', 'byen-maskinen-arkivet', 'Byen, maskinen og arkivet',
   jsonb_build_object(
     'en', 'The City, the Machine and the Archive',
     'es', 'La ciudad, la máquina y el archivo',
     'fr', 'La ville, la machine et l''archive',
     'de', 'Die Stadt, die Maschine und das Archiv',
     'no', 'Byen, maskinen og arkivet',
     'sv', 'Staden, maskinen och arkivet',
     'fi', 'Kaupunki, kone ja arkisto'
   ),
   'Under betonen og på loftet: byer, der blev glemt, maskiner med intentioner og stemmer, havet tog.',
   jsonb_build_object(
     'en', 'Beneath the concrete and in the attic: forgotten cities, machines with intentions and voices the sea took away.',
     'es', 'Bajo el hormigón y en el desván: ciudades olvidadas, máquinas con intenciones y voces que el mar se llevó.',
     'fr', 'Sous le béton et dans les greniers : des villes oubliées, des machines animées d''intentions et des voix que la mer a emportées.',
     'de', 'Unter dem Beton und auf dem Dachboden: vergessene Städte, Maschinen mit Absichten und Stimmen, die das Meer nahm.',
     'no', 'Under betongen og på loftet: glemte byer, maskiner med hensikter og stemmer havet tok.',
     'sv', 'Under betongen och på vinden: glömda städer, maskiner med avsikter och röster som havet tog.',
     'fi', 'Betonin alla ja ullakolla: unohdettuja kaupunkeja, koneita aikeilla ja ääniä, jotka meri vei mukanaan.'
   ),
   3)
on conflict (id) do nothing;

-- 4) film-medlemskaber (alle 6 seedede film fordelt på de 3
--    samlinger — genkørsel rører intet)
insert into public.collection_films
  (collection_id, documentary_slug, sort_order)
values
  ('c-01', 'isens-sidste-vinter',   1),
  ('c-01', 'saltmaleren',           2),
  ('c-01', 'skovens-lys',           3),
  ('c-02', 'saltmaleren',           1),
  ('c-02', 'maskinen-der-dromte',   2),
  ('c-02', 'isens-sidste-vinter',   3),
  ('c-03', 'byen-under-betonen',    1),
  ('c-03', 'havets-arkiv',          2),
  ('c-03', 'maskinen-der-dromte',   3)
on conflict do nothing;