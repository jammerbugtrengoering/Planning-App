-- Auto-slut af opgaver og lønlukning (besluttet 1.10.2026, se
-- overdragelse/PLAN-autoslut-og-loenlukning.md).
--
-- 1. En opgave, medarbejderen ikke har meldt færdig, lukkes af systemet et antal
--    minutter efter planlagt slut. Den får den planlagte tid — både som løn og som
--    fakturagrundlag (fakturaMinutes). Kunden faktureres altid den planlagte tid.
-- 2. Medarbejderen kan rette sin tid på en systemlukket opgave, indtil lønperioden
--    lukker. Op: med det samme, med begrundelse. Ned: kontoret godkender.
-- 3. Lønperioden lukker på lukkedagen kl. 23.59. Derefter kan medarbejderen hverken
--    registrere, rette eller melde færdig i perioden. Kun planlæggerne kan rette, og
--    deres rettelse bliver en efterregulering i den åbne periode.
-- Alt er SLÅET FRA, indtil autoslut_aktiv sættes i Opsætning → Tidsregistrering.

-- ── Indstillinger ───────────────────────────────────────────────────────────
alter table public.tidsregistrering_indstillinger
  add column if not exists autoslut_aktiv boolean not null default false,
  add column if not exists autoslut_efter_min integer not null default 120,
  add column if not exists autoslut_fra timestamptz,
  add column if not exists loen_lukkedag integer not null default 20,
  add column if not exists loen_varsel_dage integer[] not null default '{3,1}',
  add column if not exists systemluk_besked_antal integer not null default 3;

do $$ begin
  alter table public.tidsregistrering_indstillinger
    add constraint tidsreg_autoslut_efter_check check (autoslut_efter_min between 30 and 720);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tidsregistrering_indstillinger
    add constraint tidsreg_loen_lukkedag_check check (loen_lukkedag between 1 and 28);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tidsregistrering_indstillinger
    add constraint tidsreg_systemluk_antal_check check (systemluk_besked_antal between 1 and 50);
exception when duplicate_object then null; end $$;

-- Slås auto-slut til, gælder det fra det øjeblik. Ellers ville alle gamle, glemte
-- opgaver blive lukket på én gang med planlagt tid — også dem fra før reglen fandtes.
create or replace function public.tidsreg_autoslut_fra()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.autoslut_aktiv and (tg_op = 'INSERT' or not coalesce(old.autoslut_aktiv, false)) then
    new.autoslut_fra := now();
  end if;
  return new;
end $$;
drop trigger if exists tidsreg_autoslut_fra on public.tidsregistrering_indstillinger;
create trigger tidsreg_autoslut_fra before insert or update on public.tidsregistrering_indstillinger
  for each row execute function public.tidsreg_autoslut_fra();

alter table public.start_paamindelse drop constraint if exists start_paamindelse_slags_check;
alter table public.start_paamindelse add constraint start_paamindelse_slags_check
  check (slags = any (array['paamindelse','systemstart','fortrudt','autoslut_varsel','autoslut','loenvarsel']));

-- ── Lønperioden ─────────────────────────────────────────────────────────────
-- Lukkedag L (fx 20): perioden går fra den L. til den (L-1). i næste måned og lukker
-- på lukkedagen kl. 23.59. L = 1 betyder kalendermåned (lukker den 1. i næste måned).
create or replace function public.loen_lukkedag()
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select loen_lukkedag from tidsregistrering_indstillinger where id = 'default'), 20);
$$;

-- Sidste dag i den lønperiode, datoen hører til.
create or replace function public.loen_periode_slut(p_dato date)
returns date language plpgsql stable security definer set search_path to 'public' as $$
declare l int := loen_lukkedag(); m date := date_trunc('month', p_dato)::date;
begin
  if l <= 1 then return (m + interval '1 month - 1 day')::date; end if;
  if extract(day from p_dato) >= l then return (m + interval '1 month')::date + (l - 2); end if;
  return m + (l - 2);
end $$;

-- Er lønperioden for datoen lukket? Lukkedagen er dagen efter periodens sidste dag,
-- og den er åben dagen ud.
create or replace function public.loen_periode_laast(p_dato date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select now() >= ((loen_periode_slut(p_dato) + 2)::timestamp at time zone 'Europe/Copenhagen');
$$;

-- Til appen: periode og status for en dato.
create or replace function public.loen_periode_for(p_dato date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'slut', loen_periode_slut(p_dato),
    'lukkedag', loen_periode_slut(p_dato) + 1,
    'laast', loen_periode_laast(p_dato));
$$;

-- Medarbejdere må ikke ændre tid i en lukket periode. Planlæggere må, men en
-- planlæggers rettelse skal gå gennem efterreguler_tid (appen sørger for det).
create or replace function public.tjek_loen_aaben(p_instance_id text)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare d date;
begin
  if is_admin() or coalesce(auth.role(), '') = 'service_role' then return; end if;
  select instance_date(year, week, day) into d from instances where id = p_instance_id;
  if d is not null and loen_periode_laast(d) then
    raise exception 'Lønperioden er lukket. Kontakt kontoret, hvis tiden skal rettes.' using errcode = '22023';
  end if;
end $$;

-- ── Vagter på de eksisterende indgange fra Worklist ─────────────────────────
create or replace function public.append_time_log(p_instance_id text, p_minutes integer, p_emp_id text, p_note text DEFAULT NULL::text, p_klient_id text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  new_log jsonb;
  entry   jsonb;
begin
  -- Har vi set den her registrering foer? Saa returneres loggen uaendret. Kaldet ser
  -- vellykket ud for appen, praecis som foerste gang, og der lægges ingenting til.
  if p_klient_id is not null and btrim(p_klient_id) <> '' then
    select time_log into new_log from instances where id = p_instance_id;
    if new_log is not null and exists (
      select 1 from jsonb_array_elements(new_log) e where e ->> 'kid' = p_klient_id
    ) then
      return new_log;
    end if;
  end if;

  -- Lukket lønperiode (1.10.2026): kun kontoret kan rette.
  perform tjek_loen_aaben(p_instance_id);

  entry := jsonb_build_object(
    'minutes', p_minutes,
    'empId',   p_emp_id,
    'ts',      (extract(epoch from now()) * 1000)::bigint);

  if p_note is not null and btrim(p_note) <> '' then
    entry := entry || jsonb_build_object('note', btrim(p_note));
  end if;
  if p_klient_id is not null and btrim(p_klient_id) <> '' then
    entry := entry || jsonb_build_object('kid', p_klient_id);
  end if;

  update instances
     set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(entry)
   where id = p_instance_id
  returning time_log into new_log;

  if not found then raise exception 'instance % not found', p_instance_id; end if;
  return new_log;
end
$function$;

create or replace function public.set_employee_task_status(p_instance_id text, p_emp_id text, p_done boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_assignees jsonb;
  v_completed jsonb;
  v_all_done boolean;
  v_any_done boolean;
  v_status text;
  v_completed_by text;
  v_completed_at timestamptz;
  v_row instances%rowtype;
begin
  -- Lukket lønperiode (1.10.2026): kun kontoret kan aendre.
  perform tjek_loen_aaben(p_instance_id);

  select assignees, completed_by_employee into v_assignees, v_completed
  from instances where id = p_instance_id for update;

  if not found then
    raise exception 'instance % not found', p_instance_id;
  end if;

  if p_done then
    v_completed := coalesce(v_completed, '{}'::jsonb) || jsonb_build_object(p_emp_id, to_jsonb(now()));
  else
    v_completed := coalesce(v_completed, '{}'::jsonb) - p_emp_id;
  end if;

  select
    bool_and(v_completed ? elem),
    bool_or(v_completed ? elem)
  into v_all_done, v_any_done
  from jsonb_array_elements_text(coalesce(v_assignees, '[]'::jsonb)) as elem;

  v_all_done := coalesce(v_all_done, false);
  v_any_done := coalesce(v_any_done, false);

  if v_all_done then
    v_status := 'udført';
    v_completed_by := p_emp_id;
    v_completed_at := now();
  elsif v_any_done then
    v_status := 'i_gang';
    v_completed_by := null;
    v_completed_at := null;
  else
    v_status := 'planlagt';
    v_completed_by := null;
    v_completed_at := null;
  end if;

  update instances
    set completed_by_employee = v_completed,
        status = v_status,
        completed_by = v_completed_by,
        completed_at = v_completed_at
    where id = p_instance_id
    returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- ── Auto-slut ───────────────────────────────────────────────────────────────
-- Køres af plan-beskeder hvert 5. minut. Returnerer det, der skal sendes push om:
--   autoslut_varsel  en time før lukning: «lukkes automatisk kl. HH:MM»
--   autoslut         opgaven er lukket af systemet med den planlagte tid
-- Planlagt slut = dato + klokkeslæt + hendes egen tid. Uden klokkeslæt regnes
-- slut som kl. 17.00 på dagen.
create or replace function public.autoslut_behandl()
 RETURNS TABLE(employee_id text, instance_id text, titel text, slags text, kl text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_nu timestamptz := now();
  s tidsregistrering_indstillinger%rowtype;
  r record;
  v_luk timestamptz;
  v_entry jsonb;
  v_start tidsstart%rowtype;
  v_completed jsonb;
  v_alle boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Kun for baggrundsjobbet' using errcode = '42501';
  end if;
  select * into s from tidsregistrering_indstillinger where id = 'default';
  if not found or not s.autoslut_aktiv or s.autoslut_fra is null then return; end if;

  for r in
    select i.id, coalesce(nullif(i.customer_name, ''), i.title) as titel, e.id as emp,
           coalesce(nullif((i.tid_fordeling ->> e.id)::numeric, 0)::int, i.duration, 0) as egen,
           case when i.scheduled_time is not null
                then ((instance_date(i.year, i.week, i.day) + i.scheduled_time) at time zone 'Europe/Copenhagen')
                     + make_interval(mins => coalesce(nullif((i.tid_fordeling ->> e.id)::numeric, 0)::int, i.duration, 0))
                else ((instance_date(i.year, i.week, i.day) + time '17:00') at time zone 'Europe/Copenhagen') end as slut,
           exists (select 1 from jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
                    where l ->> 'empId' = e.id) as har_tid
    from instances i
    join employees e on coalesce(i.assignees, '[]'::jsonb) ? e.id
    where instance_date(i.year, i.week, i.day) between (v_nu at time zone 'Europe/Copenhagen')::date - 7
                                                   and (v_nu at time zone 'Europe/Copenhagen')::date
      and i.deleted_at is null and coalesce(i.status, '') <> 'udført'
      and coalesce(i.type, '') not in ('aktivitet', 'ferie', 'sygdom', 'blok', 'intern')
      and e.fratraadt_dato is null
      and e.auth_user_id is not null          -- kun medarbejdere med Worklist
      and not (coalesce(i.completed_by_employee, '{}'::jsonb) ? e.id)
      and not coalesce(i.oplaering_medarbejdere, '[]'::jsonb) ? e.id
  loop
    continue when r.slut < s.autoslut_fra;      -- aldrig bagud i tid
    continue when r.egen <= 0;
    v_luk := r.slut + make_interval(mins => s.autoslut_efter_min);

    if v_nu >= v_luk then
      -- Lås rækken og tjek igen: hun kan have meldt færdig i mellemtiden.
      select completed_by_employee into v_completed from instances where id = r.id for update;
      continue when coalesce(v_completed, '{}'::jsonb) ? r.emp;

      if not r.har_tid then
        v_entry := jsonb_build_object(
          'minutes', r.egen, 'fakturaMinutes', r.egen, 'empId', r.emp,
          'ts', (extract(epoch from v_nu) * 1000)::bigint,
          'systemlukket', true);
        select * into v_start from tidsstart t where t.instance_id = r.id and t.employee_id = r.emp;
        if found then
          v_entry := v_entry || jsonb_build_object('startUdenSlut', (extract(epoch from v_start.startet) * 1000)::bigint);
        end if;
        update instances set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(v_entry)
         where id = r.id;
      end if;
      delete from tidsstart t where t.instance_id = r.id and t.employee_id = r.emp;

      v_completed := coalesce(v_completed, '{}'::jsonb) || jsonb_build_object(r.emp, to_jsonb(v_nu));
      select coalesce(bool_and(v_completed ? a), false) into v_alle
        from instances i, jsonb_array_elements_text(coalesce(i.assignees, '[]'::jsonb)) a where i.id = r.id;
      update instances
         set completed_by_employee = v_completed,
             status = case when v_alle then 'udført' else 'i_gang' end,
             completed_by = case when v_alle then 'system' else null end,
             completed_at = case when v_alle then v_nu else null end
       where id = r.id;

      insert into start_paamindelse (instance_id, employee_id, slags) values (r.id, r.emp, 'autoslut')
      on conflict do nothing;
      employee_id := r.emp; instance_id := r.id; titel := r.titel; slags := 'autoslut';
      kl := to_char(v_nu at time zone 'Europe/Copenhagen', 'HH24:MI');
      return next;

    elsif v_nu >= greatest(r.slut, v_luk - interval '60 minutes')
          and not exists (select 1 from start_paamindelse p
                           where p.instance_id = r.id and p.employee_id = r.emp and p.slags = 'autoslut_varsel') then
      insert into start_paamindelse (instance_id, employee_id, slags) values (r.id, r.emp, 'autoslut_varsel')
      on conflict do nothing;
      employee_id := r.emp; instance_id := r.id; titel := r.titel; slags := 'autoslut_varsel';
      kl := to_char(v_luk at time zone 'Europe/Copenhagen', 'HH24:MI');
      return next;
    end if;
  end loop;
end $function$;

-- ── Varsel før lønlukning ───────────────────────────────────────────────────
-- X dage før lukkedagen (loen_varsel_dage), fra kl. 15: én besked til hver
-- medarbejder, der har systemlukkede opgaver i perioden, som hun ikke har rettet.
create or replace function public.loen_varsel_behandl()
 RETURNS TABLE(employee_id text, antal integer, lukkedag date)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_lokal timestamp := now() at time zone 'Europe/Copenhagen';
  v_dag date := v_lokal::date;
  s tidsregistrering_indstillinger%rowtype;
  v_slut date;
  v_luk date;
  v_d int;
  r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Kun for baggrundsjobbet' using errcode = '42501';
  end if;
  select * into s from tidsregistrering_indstillinger where id = 'default';
  if not found or not s.autoslut_aktiv then return; end if;
  if extract(hour from v_lokal) < 15 then return; end if;

  v_slut := loen_periode_slut(v_dag);
  v_luk := v_slut + 1;
  v_d := v_luk - v_dag;
  if not (v_d = any (s.loen_varsel_dage)) then return; end if;

  for r in
    select l ->> 'empId' as emp, count(*)::int as n
    from instances i, jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
    where i.deleted_at is null
      and instance_date(i.year, i.week, i.day) between (v_slut - interval '1 month')::date + 1 and v_slut
      and coalesce((l ->> 'systemlukket')::boolean, false)
      and not (l ? 'rettet') and not (l ? 'rettelseAfventer')
    group by 1
  loop
    continue when exists (select 1 from start_paamindelse p
                           where p.instance_id = 'loen:' || v_slut || ':' || v_d
                             and p.employee_id = r.emp and p.slags = 'loenvarsel');
    insert into start_paamindelse (instance_id, employee_id, slags)
    values ('loen:' || v_slut || ':' || v_d, r.emp, 'loenvarsel') on conflict do nothing;
    employee_id := r.emp; antal := r.n; lukkedag := v_luk;
    return next;
  end loop;
end $function$;

-- ── Medarbejderens rettelse af en systemlukket opgave ───────────────────────
create or replace function public.ret_systemlukket_tid(p_instance_id text, p_minutes integer, p_note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_emp text := current_employee_id();
  v_log jsonb;
  v_idx int;
  v_e jsonb;
  v_plan int;
  v_d date;
begin
  if v_emp is null then raise exception 'Ingen medarbejder knyttet til login' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'Skriv tiden i minutter' using errcode = '22023';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Skriv hvorfor tiden skal rettes' using errcode = '22023';
  end if;
  select time_log, instance_date(year, week, day) into v_log, v_d from instances where id = p_instance_id for update;
  if not found then raise exception 'Opgaven findes ikke'; end if;
  if loen_periode_laast(v_d) then
    raise exception 'Lønperioden er lukket. Kontakt kontoret, hvis tiden skal rettes.' using errcode = '22023';
  end if;

  select (o - 1)::int, e into v_idx, v_e
    from jsonb_array_elements(coalesce(v_log, '[]'::jsonb)) with ordinality as x(e, o)
   where e ->> 'empId' = v_emp and coalesce((e ->> 'systemlukket')::boolean, false)
   order by o desc limit 1;
  if v_idx is null then raise exception 'Der er ingen systemlukket tid at rette på opgaven'; end if;

  v_plan := coalesce((v_e ->> 'fakturaMinutes')::int, (v_e ->> 'minutes')::int);
  if p_minutes >= v_plan then
    -- Mere end planlagt (eller det samme): gælder med det samme. Fakturaen er uændret.
    v_e := (v_e - 'rettelseAfventer') || jsonb_build_object('minutes', p_minutes,
             'rettet', jsonb_build_object('fra', (v_e ->> 'minutes')::int, 'note', btrim(p_note),
                                          'ts', (extract(epoch from now()) * 1000)::bigint, 'af', v_emp));
  else
    -- Mindre end planlagt: kontoret skal godkende først.
    v_e := v_e || jsonb_build_object('rettelseAfventer', jsonb_build_object('minutes', p_minutes,
             'note', btrim(p_note), 'ts', (extract(epoch from now()) * 1000)::bigint));
  end if;
  update instances set time_log = jsonb_set(time_log, array[v_idx::text], v_e)
   where id = p_instance_id returning time_log into v_log;
  return v_log;
end $function$;

-- ── Efterregulering (kun planlæggere) ───────────────────────────────────────
-- Retter en medarbejders tid på en opgave i en LUKKET periode. Den lukkede periode
-- røres ikke: forskellen lægges som en ny linje i den åbne periode, så en udbetalt
-- løn aldrig ændrer sig bagefter. Fakturaen røres heller ikke (fakturaMinutes 0).
create or replace function public.efterreguler_tid(p_instance_id text, p_emp text, p_minutes integer, p_note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_log jsonb;
  v_af text := current_employee_id();
begin
  if not is_admin() then raise exception 'Kun planlæggere kan efterregulere' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes = 0 then raise exception 'Skriv forskellen i minutter (+ eller −)'; end if;
  if p_note is null or btrim(p_note) = '' then raise exception 'Skriv hvorfor' using errcode = '22023'; end if;
  update instances set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'minutes', p_minutes, 'fakturaMinutes', 0, 'empId', p_emp,
      'ts', (extract(epoch from now()) * 1000)::bigint,
      'efterregulering', true,
      'periodeSlut', loen_periode_slut((now() at time zone 'Europe/Copenhagen')::date),
      'note', btrim(p_note), 'af', v_af))
   where id = p_instance_id returning time_log into v_log;
  if not found then raise exception 'Opgaven findes ikke'; end if;
  return v_log;
end $function$;

-- ── Kontorets svar på en rettelse ned ───────────────────────────────────────
-- Godkendt i en åben periode: tiden rettes på linjen. Godkendt efter lukning: som
-- efterregulering. Afvist: den planlagte tid står.
create or replace function public.behandl_tidsrettelse(p_instance_id text, p_emp text, p_godkend boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_log jsonb;
  v_idx int;
  v_e jsonb;
  v_a jsonb;
  v_d date;
  v_af text := current_employee_id();
begin
  if not is_admin() then raise exception 'Kun planlæggere' using errcode = '42501'; end if;
  select time_log, instance_date(year, week, day) into v_log, v_d from instances where id = p_instance_id for update;
  if not found then raise exception 'Opgaven findes ikke'; end if;
  select (o - 1)::int, e into v_idx, v_e
    from jsonb_array_elements(coalesce(v_log, '[]'::jsonb)) with ordinality as x(e, o)
   where e ->> 'empId' = p_emp and e ? 'rettelseAfventer'
   order by o desc limit 1;
  if v_idx is null then raise exception 'Ingen rettelse venter på opgaven'; end if;
  v_a := v_e -> 'rettelseAfventer';
  v_e := v_e - 'rettelseAfventer';

  if not p_godkend then
    v_e := v_e || jsonb_build_object('rettelseAfvist', v_a || jsonb_build_object('af', v_af));
    update instances set time_log = jsonb_set(time_log, array[v_idx::text], v_e) where id = p_instance_id
      returning time_log into v_log;
  elsif not loen_periode_laast(v_d) then
    v_e := v_e || jsonb_build_object('minutes', (v_a ->> 'minutes')::int,
             'rettet', jsonb_build_object('fra', (v_e ->> 'minutes')::int, 'note', v_a ->> 'note',
                                          'ts', (extract(epoch from now()) * 1000)::bigint,
                                          'af', p_emp, 'godkendtAf', v_af));
    update instances set time_log = jsonb_set(time_log, array[v_idx::text], v_e) where id = p_instance_id
      returning time_log into v_log;
  else
    v_e := v_e || jsonb_build_object('rettelseEfterreguleret', v_a || jsonb_build_object('af', v_af));
    update instances set time_log = jsonb_set(time_log, array[v_idx::text], v_e) where id = p_instance_id;
    v_log := efterreguler_tid(p_instance_id, p_emp,
               (v_a ->> 'minutes')::int - (v_e ->> 'minutes')::int,
               'Godkendt rettelse efter lønlukning: ' || coalesce(v_a ->> 'note', ''));
  end if;
  return v_log;
end $function$;

-- Ingen må kalde de interne funktioner udefra.
revoke all on function public.autoslut_behandl() from public, anon, authenticated;
revoke all on function public.loen_varsel_behandl() from public, anon, authenticated;
grant execute on function public.ret_systemlukket_tid(text, integer, text) to authenticated;
grant execute on function public.efterreguler_tid(text, text, integer, text) to authenticated;
grant execute on function public.behandl_tidsrettelse(text, text, boolean) to authenticated;
grant execute on function public.loen_periode_for(date) to authenticated;

-- ── afslut_tid: samme vagt mod lukket periode ───────────────────────────────
do $$
declare d text;
begin
  d := pg_get_functiondef('public.afslut_tid(text,integer,text,text,bigint,integer,integer,boolean)'::regprocedure);
  if position('tjek_loen_aaben' in d) = 0 then
    if position('  select * into v_start from tidsstart' in d) = 0 then
      raise exception 'afslut_tid ser anderledes ud end ventet';
    end if;
    d := replace(d, '  select * into v_start from tidsstart',
      E'  -- Lukket loenperiode (1.10.2026): kun kontoret kan rette.\n  perform tjek_loen_aaben(p_instance_id);\n\n  select * into v_start from tidsstart');
    execute d;
  end if;
end $$;

-- ── Kontorets indbakke ──────────────────────────────────────────────────────
-- Afvigelsen måles mod fakturaMinutes, når den findes (en systemlukket opgave, som
-- medarbejderen har rettet op, er ikke en afvigelse for kunden). To nye linjer:
--   tidsrettelse     en medarbejder har rettet til MINDRE end planlagt → godkend/afvis
--   systemlukninger  N eller flere systemlukninger i lønperioden → tag en snak (kvittér)
do $$
declare d text; f text := 'public.kontor_indbakke()';
begin
  d := pg_get_functiondef(f::regprocedure);
  if position('tidsrettelse' in d) > 0 then return; end if;
  if position($q$(select coalesce(sum((l ->> 'minutes')::numeric), 0) from jsonb_array_elements(i.time_log) l$q$ in d) = 0
     or position('  -- 7. Fejl i data' in d) = 0 then
    raise exception 'kontor_indbakke ser anderledes ud end ventet';
  end if;
  d := replace(d, $q$(select coalesce(sum((l ->> 'minutes')::numeric), 0) from jsonb_array_elements(i.time_log) l$q$,
                  $q$(select coalesce(sum(coalesce((l ->> 'fakturaMinutes')::numeric, (l ->> 'minutes')::numeric)), 0) from jsonb_array_elements(i.time_log) l$q$);
  d := replace(d, '  -- 7. Fejl i data', $q$  -- 8. Auto-slut (1.10.2026): en medarbejder har rettet en systemlukket opgave til
  --    MINDRE end planlagt. Det kraever kontorets godkendelse.
  select 'tidsrettelse', i.id || ':' || (l ->> 'empId'), i.id, 'Rettelse af tid',
         concat_ws(' · ', e.name, coalesce(nullif(i.customer_name, ''), i.title),
                   to_char(instance_date(i.year, i.week, i.day), 'DD.MM'),
                   (l ->> 'minutes') || ' → ' || (l -> 'rettelseAfventer' ->> 'minutes') || ' min',
                   nullif(btrim(l -> 'rettelseAfventer' ->> 'note'), '')),
         to_timestamp(((l -> 'rettelseAfventer' ->> 'ts')::bigint) / 1000.0), true, 'orange', false
  from instances i
  cross join lateral jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
  left join employees e on e.id = l ->> 'empId'
  where i.deleted_at is null
    and instance_date(i.year, i.week, i.day) >= current_date - 70
    and l ? 'rettelseAfventer'

  union all
  -- 9. Auto-slut: medarbejdere, der glemmer at afslutte (N eller flere i lønperioden).
  select 'systemlukninger', x.emp || ':' || loen_periode_slut(current_date), null::text, 'Glemmer at afslutte',
         concat_ws(' · ', e.name, x.n || ' opgaver lukket af systemet i lønperioden'),
         x.sidst, false, 'orange', true
  from (select l ->> 'empId' emp, count(*)::int n, max(to_timestamp(((l ->> 'ts')::bigint) / 1000.0)) sidst
          from instances i cross join lateral jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
         where i.deleted_at is null
           and instance_date(i.year, i.week, i.day)
               between (loen_periode_slut(current_date) - interval '1 month')::date + 1 and loen_periode_slut(current_date)
           and coalesce((l ->> 'systemlukket')::boolean, false)
         group by 1) x
  join employees e on e.id = x.emp
  where x.n >= coalesce((select systemluk_besked_antal from tidsregistrering_indstillinger where id = 'default'), 3)
    and not exists (select 1 from kontor_set k where k.art = 'systemlukninger'
                     and k.ref = x.emp || ':' || loen_periode_slut(current_date))

  union all
  -- 7. Fejl i data$q$);
  execute d;
end $$;
