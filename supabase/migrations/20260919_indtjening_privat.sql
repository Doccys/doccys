-- ============================================================
-- Doccys: indtjening er privat — kun creatorens ejer må læse den
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent (create or replace +
-- revoke kan køres igen uden fejl).
--
-- Baggrund (19/9): creator_indtjening var tildelt anon og returnerede
-- aggregater til HVEM som helst — inkognito-gæster kunne se en fremmed
-- creators kr-tal direkte på profilsiden og via PostgREST. Beslutning:
-- indtjening (optjent/udbetalt/tilgængelig + sete minutter pr. film)
-- er KUN for creatorens egen ejer-konto.
--   1) anon mister execute-grantet
--   2) funktionen afviser alle undtagen auth.uid() = owner_user_id

create or replace function public.creator_indtjening(p_creator_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_sete_sek numeric;
  v_optjent numeric;
  v_udbetalt numeric;
begin
  -- creatorens ejerkonto (NULL → seed-profil uden bundet konto)
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

  -- Kun ejeren må læse tallene (42501 = samme kode som RLS-afvisning;
  -- gælder også authenticated-brugere, der ejer en anden creator)
  if auth.uid() is distinct from v_owner then
    raise exception 'Kun creatorens ejer kan laese indtjening'
      using errcode = '42501';
  end if;

  if v_owner is null then
    return jsonb_build_object(
      'optjent_dkk', 0, 'udbetalt_dkk', 0, 'tilgaengelig_dkk', 0,
      'sete_minutter', 0, 'film', to_jsonb('{}'::jsonb));
  end if;

  -- Gyldige, afregnede sete sekunder på creatorens film
  select coalesce(sum(s.watched_seconds), 0)
    into v_sete_sek
    from public.view_sessions s
    join public.documentaries d on d.slug = s.documentary_slug
   where d.creator_handle = p_creator_handle
     and s.user_id is not null
     and s.status <> 'active'
     and s.verdict ->> 'verdict' = 'valid';

  v_optjent := round(v_sete_sek / 60.0 * 2 / 100.0, 2);

  select coalesce(sum(amount_dkk), 0)
    into v_udbetalt
    from public.creator_payouts
   where user_id = v_owner;

  return jsonb_build_object(
    'optjent_dkk', v_optjent,
    'udbetalt_dkk', v_udbetalt,
    'tilgaengelig_dkk', v_optjent - v_udbetalt,
    'sete_minutter', round(v_sete_sek / 60.0),
    'film', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'slug', f.slug,
                'sete_minutter', f.sete_minutter,
                'optjent_dkk', f.optjent_dkk) order by f.sete_minutter desc),
              to_jsonb('{}'::jsonb))
        from (
          select d.slug,
                 round(sum(s.watched_seconds) / 60.0) as sete_minutter,
                 round(sum(s.watched_seconds) / 60.0 * 2 / 100.0, 2) as optjent_dkk
            from public.view_sessions s
            join public.documentaries d on d.slug = s.documentary_slug
           where d.creator_handle = p_creator_handle
             and s.user_id is not null
             and s.status <> 'active'
             and s.verdict ->> 'verdict' = 'valid'
           group by d.slug
        ) f
    )
  );
end;
$$;

-- Gæster (anon) kan slet ikke kalde funktionen mere
revoke execute on function public.creator_indtjening(text) from anon;