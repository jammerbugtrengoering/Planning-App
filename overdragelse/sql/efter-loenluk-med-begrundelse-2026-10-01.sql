-- Efter lønlukning (Jonn 1.10.2026): låsen gælder kun UDFØRTE opgaver. En opgave i en
-- lukket periode, som medarbejderen ikke har meldt færdig, må hun stadig registrere —
-- men først når hun har skrevet, hvorfor det sker efter lønlukningen. Begrundelsen går
-- til kontoret, der godkender eller afviser. Tiden tæller i den ÅBNE lønperiode.
-- Afvist: hendes løn for registreringen bliver 0; kunden faktureres stadig.

create table if not exists public.loenluk_anmodning (
  instance_id text not null,
  employee_id text not null,
  begrundelse text not null,
  oprettet timestamptz not null default now(),
  status text not null default 'afventer' check (status in ('afventer', 'godkendt', 'afvist')),
  behandlet_af text,
  behandlet timestamptz,
  primary key (instance_id, employee_id)
);
alter table public.loenluk_anmodning enable row level security;
drop policy if exists loenluk_anmodning_admin on public.loenluk_anmodning;
create policy loenluk_anmodning_admin on public.loenluk_anmodning for select using ((select is_admin()));

-- Vagten. Returnerer true, når registreringen sker efter lønlukning med en begrundelse.
drop function if exists public.tjek_loen_aaben(text);
create function public.tjek_loen_aaben(p_instance_id text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare d date; v_status text; v_done boolean; v_emp text := current_employee_id();
begin
  if is_admin() or coalesce(auth.role(), '') = 'service_role' or not loenlukning_aktiv() then return false; end if;
  select instance_date(year, week, day), status, coalesce(completed_by_employee, '{}'::jsonb) ? coalesce(v_emp, '')
    into d, v_status, v_done from instances where id = p_instance_id;
  if d is null or not loen_periode_laast(d) then return false; end if;
  if v_done or v_status = 'udført' then
    raise exception 'Lønperioden er lukket, og opgaven er udført. Kontakt kontoret, hvis tiden skal rettes.' using errcode = '55000';
  end if;
  if exists (select 1 from loenluk_anmodning a where a.instance_id = p_instance_id and a.employee_id = v_emp
              and a.status in ('afventer', 'godkendt')) then
    return true;
  end if;
  raise exception 'Lønperioden er lukket. Skriv hvorfor opgaven først registreres nu — det sendes til kontoret.' using errcode = '55001';
end $$;

-- Medarbejderens begrundelse.
create or replace function public.begrund_efter_loenluk(p_instance_id text, p_begrundelse text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp text := current_employee_id();
begin
  if v_emp is null then raise exception 'Ingen medarbejder knyttet til login' using errcode = '42501'; end if;
  if p_begrundelse is null or btrim(p_begrundelse) = '' then
    raise exception 'Skriv hvorfor' using errcode = '22023';
  end if;
  if not exists (select 1 from instances where id = p_instance_id and coalesce(assignees, '[]'::jsonb) ? v_emp) then
    raise exception 'Opgaven er ikke din' using errcode = '42501';
  end if;
  insert into loenluk_anmodning (instance_id, employee_id, begrundelse)
  values (p_instance_id, v_emp, btrim(p_begrundelse))
  on conflict (instance_id, employee_id) do update
    set begrundelse = excluded.begrundelse, oprettet = now(), status = 'afventer', behandlet_af = null, behandlet = null;
end $$;
grant execute on function public.begrund_efter_loenluk(text, text) to authenticated;

-- Kontorets svar. Afvist: løn 0 for hendes registreringer efter lønluk; fakturaen står.
create or replace function public.behandl_efter_loenluk(p_instance_id text, p_emp text, p_godkend boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_af text := current_employee_id();
begin
  if not is_admin() then raise exception 'Kun planlæggere' using errcode = '42501'; end if;
  update loenluk_anmodning set status = case when p_godkend then 'godkendt' else 'afvist' end,
         behandlet_af = v_af, behandlet = now()
   where instance_id = p_instance_id and employee_id = p_emp;
  if not found then raise exception 'Ingen anmodning på opgaven'; end if;
  if not p_godkend then
    update instances set time_log = (
      select jsonb_agg(case when e ->> 'empId' = p_emp and coalesce((e ->> 'efterLoenluk')::boolean, false)
                            then e || jsonb_build_object('fakturaMinutes', coalesce((e ->> 'fakturaMinutes')::int, (e ->> 'minutes')::int),
                                                         'minutes', 0, 'afvistEfterLoenluk', true)
                            else e end order by o)
      from jsonb_array_elements(time_log) with ordinality x(e, o))
    where id = p_instance_id and time_log is not null;
  end if;
end $$;
grant execute on function public.behandl_efter_loenluk(text, text, boolean) to authenticated;

-- Registreringerne mærkes, så lønnen kan lægge dem i den åbne periode.
do $$
declare d text; mark text := $m$jsonb_build_object('efterLoenluk', true, 'periodeSlut', loen_periode_slut((now() at time zone 'Europe/Copenhagen')::date))$m$;
begin
  d := pg_get_functiondef('public.append_time_log(text,integer,text,text,text)'::regprocedure);
  if position('v_efter' in d) = 0 then
    if position('perform tjek_loen_aaben(p_instance_id);' in d) = 0
       or position($q$  update instances
     set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(entry)$q$ in d) = 0 then
      raise exception 'append_time_log ukendt form';
    end if;
    d := regexp_replace(d, E'declare\n', E'declare\n  v_efter boolean := false;\n');
    d := replace(d, 'perform tjek_loen_aaben(p_instance_id);', 'v_efter := tjek_loen_aaben(p_instance_id);');
    d := replace(d, $q$  update instances
     set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(entry)$q$,
      '  if v_efter then entry := entry || ' || mark || E'; end if;\n\n' || $q$  update instances
     set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(entry)$q$);
    execute d;
  end if;

  d := pg_get_functiondef('public.afslut_tid(text,integer,text,text,bigint,integer,integer,boolean)'::regprocedure);
  if position('v_efter' in d) = 0 then
    if position('perform tjek_loen_aaben(p_instance_id);' in d) = 0
       or position($q$update instances set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(v_post)$q$ in d) = 0 then
      raise exception 'afslut_tid ukendt form';
    end if;
    d := regexp_replace(d, E'declare\n', E'declare\n  v_efter boolean := false;\n');
    d := replace(d, 'perform tjek_loen_aaben(p_instance_id);', 'v_efter := tjek_loen_aaben(p_instance_id);');
    d := replace(d, $q$update instances set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(v_post)$q$,
      'if v_efter then v_post := v_post || ' || mark || E'; end if;\n  ' ||
      $q$update instances set time_log = coalesce(time_log, '[]'::jsonb) || jsonb_build_array(v_post)$q$);
    execute d;
  end if;
end $$;

-- Kontorets indbakke: «Registreret efter lønlukning».
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kontor_indbakke()'::regprocedure);
  if position('efter_loenluk' in d) > 0 then return; end if;
  if position('  -- 7. Fejl i data' in d) = 0 then raise exception 'kontor_indbakke ukendt form'; end if;
  d := replace(d, '  -- 7. Fejl i data', $q$  -- 10. Registreret efter loenlukning (1.10.2026): godkend eller afvis.
  select 'efter_loenluk', a.instance_id || ':' || a.employee_id, a.instance_id, 'Registreret efter lønlukning',
         concat_ws(' · ', e.name, coalesce(nullif(i.customer_name, ''), i.title),
                   to_char(instance_date(i.year, i.week, i.day), 'DD.MM'), '«' || a.begrundelse || '»'),
         a.oprettet, true, 'orange', false
  from loenluk_anmodning a
  join instances i on i.id = a.instance_id
  left join employees e on e.id = a.employee_id
  where a.status = 'afventer'

  union all
  -- 7. Fejl i data$q$);
  execute d;
end $$;

-- «Min tid»: registreringer efter lønluk står i den periode, de blev lagt i.
drop function if exists public.mine_timer(integer, integer, text);
create function public.mine_timer(p_aar integer, p_maaned integer, p_emp text DEFAULT NULL::text)
 RETURNS TABLE(opgave_id text, dato date, titel text, hvor text, planlagt integer, registreret integer,
               weekend boolean, godkendt boolean, systemlukket boolean, rettelse_afventer integer,
               rettet boolean, efterregulering boolean, laast boolean, note text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with mig as (
    select case when p_emp is not null and is_admin() then p_emp else current_employee_id() end as id
  ), per as (select * from loen_periode_interval(p_aar, p_maaned))
  select
    i.id, instance_date(i.year, i.week, i.day), i.title,
    coalesce(nullif(btrim(i.address_text), ''), i.customer_name, ''),
    coalesce(nullif((i.tid_fordeling ->> (select id from mig))::numeric, 0)::int, i.duration, 0),
    coalesce((select sum((l->>'minutes')::numeric)::int
                from jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
               where l->>'empId' = (select id from mig)
                 and not coalesce((l->>'efterregulering')::boolean, false)
                 and not coalesce((l->>'efterLoenluk')::boolean, false)), 0),
    i.day in ('Sat', 'Sun'),
    exists (select 1 from loen_godkendelser g
             where g.slags = 'timer' and g.employee_id = (select id from mig) and g.reference = i.id),
    exists (select 1 from jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
             where l->>'empId' = (select id from mig) and coalesce((l->>'systemlukket')::boolean, false)),
    (select (l->'rettelseAfventer'->>'minutes')::int from jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
      where l->>'empId' = (select id from mig) and l ? 'rettelseAfventer' limit 1),
    exists (select 1 from jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
             where l->>'empId' = (select id from mig) and l ? 'rettet'),
    false,
    loenlukning_aktiv() and loen_periode_laast(instance_date(i.year, i.week, i.day)),
    null::text
  from instances i, per
  where (select id from mig) is not null
    and i.assignees ? (select id from mig)
    and i.deleted_at is null
    and i.type not in ('sygdom', 'ferie')
    and instance_date(i.year, i.week, i.day) between per.fra and per.til
  union all
  -- Efterreguleringer og registreringer efter loenlukning lagt i perioden.
  select
    i.id || ':er:' || (l->>'ts'), instance_date(i.year, i.week, i.day), i.title,
    coalesce(nullif(btrim(i.address_text), ''), i.customer_name, ''),
    0, (l->>'minutes')::int, i.day in ('Sat', 'Sun'),
    exists (select 1 from loen_godkendelser g
             where g.slags = 'timer' and g.employee_id = (select id from mig)
               and g.reference = i.id || ':er:' || (l->>'ts')),
    false, null::int, false, true, false,
    case when coalesce((l->>'efterLoenluk')::boolean, false)
         then 'Registreret efter lønlukning' || coalesce(' — ' || (select case a.status when 'afventer' then 'venter på kontoret'
                                                                                  when 'godkendt' then 'godkendt' else 'afvist' end
                                                                   from loenluk_anmodning a
                                                                  where a.instance_id = i.id and a.employee_id = (select id from mig)), '')
         else l->>'note' end
  from instances i, per
  cross join lateral jsonb_array_elements(coalesce(i.time_log, '[]'::jsonb)) l
  where (select id from mig) is not null
    and i.deleted_at is null
    and l->>'empId' = (select id from mig)
    and (coalesce((l->>'efterregulering')::boolean, false) or coalesce((l->>'efterLoenluk')::boolean, false))
    and (l->>'periodeSlut')::date = per.til
  order by 2 desc, 3
$function$;
grant execute on function public.mine_timer(integer, integer, text) to authenticated;

insert into persondata_register (tabel, kolonne, persondata, daekket_af, bemaerkning, klassificeret) values
('loenluk_anmodning','instance_id',true,'medarbejdere','Opgave, en medarbejder registrerer efter loenlukning (1.10.2026).',now()),
('loenluk_anmodning','employee_id',true,'medarbejdere','Hvem der registrerer efter loenlukning.',now()),
('loenluk_anmodning','begrundelse',true,'medarbejdere','Medarbejderens begrundelse for at registrere efter loenlukning. Fritekst.',now()),
('loenluk_anmodning','oprettet',true,'medarbejdere','Hvornaar begrundelsen blev skrevet.',now()),
('loenluk_anmodning','status',true,'medarbejdere','afventer / godkendt / afvist af kontoret. Afvist giver 0 i loen for registreringen.',now()),
('loenluk_anmodning','behandlet_af',true,'medarbejdere','Planlaeggeren, der godkendte eller afviste.',now()),
('loenluk_anmodning','behandlet',true,'medarbejdere','Hvornaar kontoret svarede.',now())
on conflict (tabel, kolonne) do nothing;
