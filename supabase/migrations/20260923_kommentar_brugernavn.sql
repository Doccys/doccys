-- ============================================================
-- Doccys: brugernavn i stedet for e-mail som forfatternavn
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistre hele filen ind → Run. Idempotent: UPDATE'en rammer 0
-- rækker ved genkørsel, og trigger/par er med vilje drop/create
-- (genkørsel opfrisker dem).
--
-- Tillidsmodel: en seers identitet har indtil nu været dens
-- E-MAILADRESSE — vist i header og profil, og gemt som
-- author_name på hver kommentar. Comments er offentligt læsbart
-- (select using (true)), så hver kommentar har altså lækket
-- forfatterens e-mail ud til alle. Denne migration rydder op:
--   1) eksisterende e-mail-navne skjules ('Tidl. seer') —
--      render-skjuling ville stadig lække dem via API'et,
--   2) forfatternavnet fremkommer KUN fra brugerens eget
--      brugernavn (auth.users.raw_user_meta_data->>'full_name',
--      sat ved signup og redigerbart på profilen) — en insert-
--      trigger overskriver altid author_name med det, uanset hvad
--      klienten sender. Indtil nu kunne en authenticated seer
--      indsætte et vilkårligt author_name direkte via PostgREST
--      — dvs. skrive kommentarer i ANDRES navn. Det hul lukkes
--      her (sammen med har_set_film-gatet og user_id = auth.uid()
--      håndhæver DB'en nu hele identiteten af en kommentar).
-- Gæster kan ikke kommentere i forvejen (insert-policy kræver
-- user_id = auth.uid()), så triggeren rammer kun kendte konti.

-- 1) Ryd eksisterende e-mails ud af forfatternavnene.
--    Snæver e-mail-regex: kun rækker, der ER en blottet
--    mailadresse, røres — seed-navne ("Mette" osv.) og fremtidige
--    brugernavne (som må indeholde @) bliver stående.
--    NB: UPDATE på comments vagtes af kun_pin_aendring() (20260918,
--    "indholdet må aldrig ændres") — den skal slås fra omkring denne
--    rydning, som netop er den ene legitime omrokning af forfatter-
--    navne. Vagten slås til igen straks efter; fejler UPDATE'en,
--    efterlades vagten slået fra i den pågældende session, men da
--    SQL-editoren stopper ved fejlen, ses det med det samme.
alter table public.comments disable trigger trg_comment_pin_kun;

update public.comments
  set author_name = 'Tidl. seer'
  where author_name ~ '^[^@[:space:]]+@[^@[:space:]]+$';

alter table public.comments enable trigger trg_comment_pin_kun;

-- 2) Insert-trigger: author_name kommer ALTID fra brugerens egen
--    metadata. Mangler brugeren et brugernavn, afvises kommentaren
--    med en tydelig besked (navnet sættes på profilen).
create or replace function public.saet_kommentar_navn()
returns trigger
language plpgsql
security definer
as $$
declare
  v_navn text;
begin
  if new.user_id is null then
    return new;  -- gæster er lukket af insert-policien; ikke vores sag
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', '')
    into v_navn
  from auth.users u
  where u.id = new.user_id;

  v_navn := coalesce(trim(v_navn), '');

  if v_navn = '' then
    raise exception 'Vælg dit brugernavn på din profil, før du kommenterer';
  end if;
  if length(v_navn) > 120 then
    raise exception 'Brugernavnet er for langt (maks 120 tegn)';
  end if;

  new.author_name := v_navn;
  return new;
end $$;

drop trigger if exists trg_comment_brugernavn on public.comments;
create trigger trg_comment_brugernavn
  before insert on public.comments
  for each row execute function public.saet_kommentar_navn();

-- 3) EXECUTE-hullet: funktionen kan kaldes direkte via PostgREST
--    af alle, hvis den får standard-grants — revoke fra public
--    (den er KUN til triggeren). Triggere fyres uden execute-tjek
--    pr. række, og anon kan ikke indsætte i forvejen (RLS).
revoke execute on function public.saet_kommentar_navn() from public;

-- 4) Egen verifikation (SQL Editor, efter kørslen):
--    a) E-mails væk:
--       select count(*) from public.comments
--        where author_name ~ '^[^@[:space:]]+@[^@[:space:]]+$';
--       → forventet 0.
--    a2) Begge vagter er aktive igen (tgenabled = 'O'):
--       select tgname, tgenabled from pg_trigger
--        where tgname in ('trg_comment_pin_kun', 'trg_comment_brugernavn');
--    b) Forfalsket navn afvist/overskrevet (som AUTHENTICERET seer
--       med brugernavn sat i metadata):
--       insert med "author_name": "En Anden" direkte via PostgREST
--       → rækken får brugerens EGET brugernavn, ikke det sendte.
--    c) Uden brugernavn: samme insert uden full_name i metadata
--       → forventet fejl 'Vælg dit brugernavn på din profil...'.
--    d) Anon-røgtest: GET /rest/v1/comments?select=author_name
--       → 200 og ingen e-mail-adresser i svaret.

-- Intet grant at røre: ingen nye tabeller; triggeren er
-- security definer (læser auth.users) og execute-revoked fra
-- public. Select/insert-policyerne og har_set_film er uændret.