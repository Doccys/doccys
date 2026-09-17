-- ============================================================
-- Doccys: creator-afregning — 2 kr pr. 100 sete minutter
-- ============================================================
-- Kørsel: Supabase-dashboardet → SQL Editor → New query →
-- klistr hele filen ind → Run. Idempotent: kan køres igen
-- uden fejl (tabeller, kolonner og policies oprettes kun hvis
-- de mangler; funktioner er create or replace).
--
-- Tillidsmodel: creator_payouts har INGEN insert-policy —
-- udbetalinger indsættes manuelt i dashboardet (service-role),
-- creatoren kan kun læse sine egne rækker. creator_indtjening er
-- security definer fordi view_sessions kun er læsbare under
-- bruger-RLS af "egne eller gæste"-sessioner — en creator kan
-- altså ikke selv summere over alle seeres sessioner. Funktionen
-- omgår RLS med vilje men returnerer KUN aggregater (tal) for en
-- offentlig handle — ingen persondata lækker.

-- 1) creator_payouts — manuel udbetaling fra dashboardet.
create table if not exists public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  amount_dkk numeric(9,2) not null check (amount_dkk > 0),
  note text,
  paid_at timestamptz not null default now()
);

create index if not exists idx_creator_payouts_user
  on public.creator_payouts (user_id, paid_at desc);

alter table public.creator_payouts enable row level security;

-- Creatoren kan læse sine egne udbetalinger (udbetalings-
-- historik i creator-panelet)
drop policy if exists "laes_egne_udbetalinger" on public.creator_payouts;
create policy "laes_egne_udbetalinger" on public.creator_payouts
  for select using (auth.uid() = user_id);

-- INGEN insert/update/delete-policy: rækker indsættes og
-- administreres manuelt i Supabase-dashboardet (service-role).

-- 2) creator_indtjening(p_creator_handle) — aggregat for én
--    creators økonomi. Grundlag: afregnede sessioner (status ≠
--    'active') på creatorens film med verdict 'valid' og kendt
--    seer (user_id). Optjent = sete minutter × 2 kr / 100.
--    Tilgængelig = optjent − allerede udbetalt.
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
  -- creatorens ejerkonto (NULL → tom historik)
  select owner_user_id into v_owner
    from public.creators
   where handle = p_creator_handle;

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

grant execute on function public.creator_indtjening(text) to anon, authenticated;