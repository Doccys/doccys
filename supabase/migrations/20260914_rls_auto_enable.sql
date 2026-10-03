-- ============================================================
-- Doccys: rls_auto_enable — automatisk RLS pa nye tabeller
-- ============================================================
-- GENSKABT 4/10: Denne SQL koerte i SQL Editor helt i starten
-- (foer migrationsfilerne blev en fast vane) og manglede i
-- repoet. Definitionen her er verificeret identisk med den
-- live i databasen (pg_get_functiondef + pg_event_trigger,
-- 4/10). Formaalet: sikkerhedsnet, der automatisk aktiverer
-- row level security paa ALLE nye tabeller i public-skemaet
-- i oejeblikket de oprettes — RLS-first-disciplinen har altsaa
-- vaeret maskinelt haandhaevet fra dag ét.
--
-- NB: Supabases EGEN event-triggers (pgrst_ddl_watch, pgrst_
-- drop_watch, issue_graphql_placeholder m.fl.) er platform-
-- styrede og genskabes IKKE her — de tilhoerer hostingen, ikke
-- databasens indhold.
--
-- Idempotent: create or replace + drop event trigger if exists.
-- Alle tabel-oprettende migrations aktiverer RLS desuden
-- eksplicit selv — auto-hjaelperen er andet forsvar, ikke det
-- eneste, saa dens plads i raekkefoelgen ved en fuld genop-
-- bygning er uden betydning.
-- ============================================================

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%'
    then
      begin
        execute format(
          'alter table if exists %s enable row level security',
          cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %',
          cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %',
            cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

-- Event-triggeren der binder funktionen til alle DDL-koersler
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

-- EXECUTE-hullet (projekt-disciplin; event-triggers tjekker
-- ikke execute selv, men RPC-fladen er dermed ogsaa lukket):
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

-- ============================================================
-- Verifikation (kør i SQL Editor — forventede værdier):
-- 1) Triggeren er aktiv:
--   select evtname, evtevent, evtenabled, evtfoid::regproc
--   from pg_event_trigger where evtname = 'ensure_rls';
--   → ensure_rls | ddl_command_end | O | rls_auto_enable
-- 2) Automatikken virker (rul tilbage bagefter!):
--   begin;
--   create table public.rls_test (id int);
--   select relrowsecurity from pg_class
--   where relname = 'rls_test';   → true
--   rollback;
-- 3) Grants:
--   select proname, coalesce(proacl::text, 'null') as proacl
--   from pg_proc where proname = 'rls_auto_enable';
--   → ingen anon/authenticated
-- ============================================================