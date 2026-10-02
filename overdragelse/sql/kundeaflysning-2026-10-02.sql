-- Kundeaflysning (Jonn 2.10.2026).
-- Aflysningen deles i to: JAMMERBUGT aflyser (Sygdom, Ferie, Andet — aldrig faktura) og
-- KUNDEN aflyser. Aflyser kunden for sent, bliver opgaven udført og faktureret med den
-- planlagte tid, men ingen medarbejder får løn for den. Fristen og om der faktureres,
-- sættes pr. kundetype under Opsætning → Aflysning. Erhverv vurderes fra gang til gang.

alter table public.aflysningsgrunde add column if not exists part text not null default 'jammerbugt';
do $$ begin
  alter table public.aflysningsgrunde add constraint aflysningsgrunde_part_check check (part in ('jammerbugt', 'kunde'));
exception when duplicate_object then null; end $$;

create table if not exists public.aflysning_regler (
  kontrakttype text primary key check (kontrakttype in ('privat', 'nexus', 'aeldrelov', 'erhverv')),
  frist_timer integer check (frist_timer is null or frist_timer between 0 and 720),
  fakturer_sen boolean not null default true,
  fra_gang_til_gang boolean not null default false,
  aendret timestamptz not null default now()
);
alter table public.aflysning_regler enable row level security;
drop policy if exists aflysning_regler_laes on public.aflysning_regler;
create policy aflysning_regler_laes on public.aflysning_regler for select to authenticated using (true);
drop policy if exists aflysning_regler_admin on public.aflysning_regler;
create policy aflysning_regler_admin on public.aflysning_regler for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

alter table public.instances add column if not exists aflyst_faktureret boolean not null default false;

-- Planlagt start: dato + klokkeslæt, uden klokkeslæt kl. 8.
create or replace function public.planlagt_start(p_year int, p_week int, p_day text, p_tid time)
returns timestamptz language sql stable set search_path to 'public' as $$
  select (instance_date(p_year, p_week, p_day) + coalesce(p_tid, time '08:00')) at time zone 'Europe/Copenhagen';
$$;

-- Den planlagte, fakturerbare tid: hver medarbejders andel (eller varigheden), elever
-- tæller ikke. Ingen medarbejder: varigheden. Samme regel som planlagtFakturerbart i
-- src/opgavetid.js.
create or replace function public.planlagt_fakturerbart(i instances)
returns integer language sql stable set search_path to 'public' as $$
  select case when jsonb_array_length(coalesce(i.assignees, '[]'::jsonb)) = 0 then coalesce(i.duration, 0)
         else coalesce((select sum(coalesce(nullif((i.tid_fordeling ->> a)::numeric, 0)::int, i.duration, 0))
                          from jsonb_array_elements_text(i.assignees) a
                         where not coalesce(i.oplaering_medarbejdere, '[]'::jsonb) ? a), 0)::int end;
$$;

drop function if exists public.aflys_opgave(text, text, text);
create or replace function public.aflys_opgave(p_id text, p_grund text, p_forklaring text, p_fakturer boolean default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v instances%rowtype; g aflysningsgrunde%rowtype; r aflysning_regler%rowtype;
        v_timer numeric; v_sen boolean := false; v_fakt boolean := false; v_min int; v_note text;
begin
  if not is_admin() then raise exception 'Kun planlæggere kan aflyse' using errcode = '42501'; end if;
  select * into g from aflysningsgrunde where id = p_grund;
  if not found then raise exception 'Vælg en aflysningsgrund' using errcode = '22023'; end if;
  select * into v from instances where id = p_id for update;
  if not found then raise exception 'Opgaven findes ikke'; end if;
  if v.status = 'udført' then raise exception 'Opgaven er udført og kan ikke aflyses' using errcode = '22023'; end if;
  if v.status = 'aflyst' then return to_jsonb(v); end if;
  if jsonb_array_length(coalesce(v.time_log, '[]'::jsonb)) > 0 then
    raise exception 'Der er registreret tid på opgaven. Ret tiden først, hvis den skal aflyses.' using errcode = '22023';
  end if;

  if g.part = 'kunde' then
    select * into r from aflysning_regler where kontrakttype = coalesce(v.contract_type, 'privat');
    v_timer := extract(epoch from (planlagt_start(v.year, v.week, v.day, v.scheduled_time) - now())) / 3600.0;
    v_sen := found and r.frist_timer is not null and v_timer < r.frist_timer;
    if found and r.fra_gang_til_gang then
      v_fakt := coalesce(p_fakturer, false);           -- erhverv: kontoret vælger
    else
      v_fakt := coalesce(p_fakturer, v_sen and coalesce(r.fakturer_sen, false));
    end if;
    if p_fakturer is not null and p_fakturer is distinct from (v_sen and coalesce(r.fakturer_sen, false))
       and not coalesce(r.fra_gang_til_gang, false)
       and nullif(btrim(coalesce(p_forklaring, '')), '') is null then
      raise exception 'Skriv hvorfor reglen for sen aflysning ikke følges' using errcode = '22023';
    end if;
  end if;

  delete from tidsstart where instance_id = p_id;
  if v_fakt then
    v_min := planlagt_fakturerbart(v);
    v_note := 'Sen aflysning: ' || g.navn || coalesce(' — ' || nullif(btrim(coalesce(p_forklaring, '')), ''), '');
    update instances set status = 'udført', completed_at = now(), completed_by = 'kontor',
           time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'minutes', v_min, 'empId', 'planner', 'ts', (extract(epoch from now()) * 1000)::bigint,
             'note', v_note, 'senAflysning', true)),
           aflyst_grund = p_grund, aflyst_forklaring = nullif(btrim(coalesce(p_forklaring, '')), ''),
           aflyst_af = current_employee_id(), aflyst_tid = now(), aflyst_faktureret = true,
           aflyst_assignees = coalesce(assignees, '[]'::jsonb), assignees = '[]'::jsonb,
           completed_by_employee = '{}'::jsonb
     where id = p_id returning * into v;
  else
    update instances set status = 'aflyst', aflyst_grund = p_grund,
           aflyst_forklaring = nullif(btrim(coalesce(p_forklaring, '')), ''),
           aflyst_af = current_employee_id(), aflyst_tid = now(), aflyst_faktureret = false,
           aflyst_assignees = coalesce(assignees, '[]'::jsonb), assignees = '[]'::jsonb,
           completed_by_employee = '{}'::jsonb
     where id = p_id returning * into v;
  end if;
  return to_jsonb(v);
end $$;
grant execute on function public.aflys_opgave(text, text, text, boolean) to authenticated;

create or replace function public.genaabn_opgave(p_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v instances%rowtype;
begin
  if not is_admin() then raise exception 'Kun planlæggere' using errcode = '42501'; end if;
  select * into v from instances where id = p_id for update;
  if not found or v.aflyst_grund is null then raise exception 'Opgaven er ikke aflyst'; end if;
  if coalesce(v.dinero_exported, false) then
    raise exception 'Den sene aflysning er allerede faktureret og kan ikke fortrydes her' using errcode = '22023';
  end if;
  update instances set
         status = case when jsonb_array_length(coalesce(aflyst_assignees, '[]'::jsonb)) > 0 then 'planlagt' else 'unscheduled' end,
         assignees = coalesce(aflyst_assignees, '[]'::jsonb),
         time_log = (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                       from jsonb_array_elements(coalesce(time_log, '[]'::jsonb)) with ordinality x(e, o)
                      where not coalesce((e ->> 'senAflysning')::boolean, false)),
         completed_at = null, completed_by = null, invoice_ready = false,
         aflyst_grund = null, aflyst_forklaring = null, aflyst_af = null, aflyst_tid = null,
         aflyst_assignees = null, aflyst_faktureret = false
   where id = p_id returning * into v;
  return to_jsonb(v);
end $$;
grant execute on function public.genaabn_opgave(text) to authenticated;

-- Medarbejderne får «aflyst» — også når den sene aflysning gør opgaven «udført».
do $$
declare d text;
begin
  d := pg_get_functiondef('public.fang_planaendring()'::regprocedure);
  if position('aflyst_grund' in d) > 0 then return; end if;
  if position($q$if TG_OP = 'UPDATE' and NEW.status = 'aflyst' and OLD.status is distinct from 'aflyst' then$q$ in d) = 0 then
    raise exception 'fang_planaendring ukendt form';
  end if;
  d := replace(d, $q$if TG_OP = 'UPDATE' and NEW.status = 'aflyst' and OLD.status is distinct from 'aflyst' then$q$,
                  $q$if TG_OP = 'UPDATE' and NEW.aflyst_grund is not null and OLD.aflyst_grund is null then$q$);
  execute d;
end $$;

-- Kundeportalen: en sen aflysning vises som «Aflyst», ikke som «Udført».
do $$
declare d text;
begin
  d := pg_get_functiondef('public.portal_opgaver_data()'::regprocedure);
  if position('aflyst_grund' in d) > 0 then return; end if;
  if position(E'    i.status,\n' in d) = 0 then raise exception 'portal_opgaver_data ukendt form'; end if;
  d := replace(d, E'    i.status,\n', E'    CASE WHEN i.aflyst_grund IS NOT NULL THEN ''aflyst''::text ELSE i.status END AS status,\n');
  execute d;
end $$;
