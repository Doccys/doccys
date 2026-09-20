-- ============================================================
-- Doccys: RPC-execute-tilladelser — Supabases DEFAULT PRIVILEGES
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent (revoke kan køres igen
-- uden fejl; default-privileges-ændringen er også idempotent).
--
-- Baggrund (20/9): anon-røgtestene afslørede at indfri_koeb kunne
-- kaldes med anons publishable-nøgle — hvem som helst kunne altså
-- indfri en pending checkout UDEN at betale (betalingsomgåelse:
-- webhook-signaturen beskytter kun ruten, ikke funktionen over
-- PostgREST). Diagnosen (pg_proc.proacl) viste hvorfor:
--
--   Supabases platform-setup kører
--     alter default privileges in schema public
--       grant execute on functions to anon, authenticated, service_role;
--
--   dvs. ALLE nye funktioner i public får DIREKTE execute-grants
--   til de tre roller — ikke via PUBLIC som ren Postgres default.
--   Grant-sætningerne i vore migrationer har derfor aldrig kunnet
--   begrænse noget, og "revoke from public" (v. 1 af denne fil)
--   var en no-op. creator_indtjening var den eneste der virkede,
--   fordi 20260919 revoquede anons DIREKTE grant.
--
-- Denne version revoquer de direkte grants — og fjerner default-
-- privilegernes anon/authenticated-del, så Fremtidige funktioner
-- KUN får adgang via eksplicitte grant-sætninger (som alle vore
-- migrationer i forvejen skriver; uden grant = 42501 = synligt
-- under udvikling, ikke et stille hul).
--
-- Adgangstildeling efter denne migration:
--   saldo_sekunder, film_faedighedsstats   → alle (offentlige efter hensigten)
--   afregn_session, har_set_film,
--   creator_indtjening, film_retention      → authenticated
--   indfri_koeb                             → KUN service_role
--     (webhook-ruten OG rescue-proceduren bruger netop service_role)
--   service_role                            → beholdes overalt (kun backend
--     har nøglen — Supabases egen default, rører vi ikke)

-- 1) indfri_koeb — KUN service_role. NB: signaturen er (text,
--    text) pga. p_billing_country-defaulten fra 20260920_koebs_land.
revoke execute on function public.indfri_koeb(text, text) from anon, authenticated;

-- 2) afregn_session — kaldes af validate-ruten som den loggede
--    bruger; authenticated har direkte grant (20260917 + fortsaet_se).
revoke execute on function public.afregn_session(uuid) from anon;

-- 3) har_set_film — kommentar-kvalitetsfilter; authenticated har
--    direkte grant (20260918).
revoke execute on function public.har_set_film(text) from anon;

-- 4) creator_indtjening — korrekt siden 20260919 (anon revoqued
--    direkte); intet at gøre her, medtaget for completeness.
revoke execute on function public.creator_indtjening(text) from anon;

-- 5) KILDEN: fremtidige funktioner skal have EKPLICITTE grants.
--    Default-privilegierne gælder objekter skabt af postgres-
--    rollen (SQL Editor) i public — præcis hvor vore funktioner
--    skabes. anon OG authenticated revoques: ingen ny funktion får
--    automatisk adgang; migrationerne tildeler selv (vort mønster).
--    service_role-defaulten fra Supabase lades stå (trusted backend).
--    Trigger-funktioner (touch_*) røres ikke — EXECUTE tjekkes
--    ikke for triggers.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;