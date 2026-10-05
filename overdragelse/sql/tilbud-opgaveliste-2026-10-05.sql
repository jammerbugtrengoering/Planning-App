-- Opgaveliste på tilbud (5.10.2026, Jonn): en tjekliste før, under og efter kundemødet, så intet, der
-- hører til et tilbud, bliver glemt. Samme liste i planlægningsappen og i Worklist.
--
-- Hvorfor listen står på selve tilbuddet (jsonb) og ændres gennem funktioner: planlægger og medarbejder
-- kan sidde med det samme tilbud samtidig. En funktion ændrer ÉT punkt i ét kald, så en kollegas flueben
-- ikke bliver overskrevet af en hel liste, der blev hentet for ti minutter siden.
-- Hvorfor standardlisten står i databasen og ikke i koden: de to apps ligger i hvert sit repository, og
-- en liste i begge ville komme ud af trit. Triggeren kopierer den til hvert nyt tilbud, uanset hvilken app der
-- opretter det. Et tilbud har sin egen kopi; ændrer man standardlisten, ændres ingen eksisterende tilbud.
--
-- Rulles tilbage med: drop trigger tilbud_seed_opgaveliste on public.tilbud;
--   drop function public.tilbud_opgave_flueben, public.tilbud_opgave_tilfoej, public.tilbud_opgave_fjern, public.seed_tilbud_opgaveliste;
--   alter table public.tilbud drop column opgaveliste; drop table public.tilbud_standardopgaver;

create table if not exists public.tilbud_standardopgaver (
  id             uuid primary key default gen_random_uuid(),
  fase           text not null check (fase in ('foer', 'under', 'efter')),
  tekst          text not null check (length(btrim(tekst)) > 0),
  raekkefoelge   integer not null default 0,
  aktiv          boolean not null default true
);
alter table public.tilbud_standardopgaver enable row level security;
create policy standardopgaver_laes on public.tilbud_standardopgaver for select to authenticated using (true);
create policy standardopgaver_admin on public.tilbud_standardopgaver for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
revoke all on public.tilbud_standardopgaver from public, anon;
grant select, insert, update, delete on public.tilbud_standardopgaver to authenticated, service_role;

insert into public.tilbud_standardopgaver (fase, tekst, raekkefoelge) values
  ('foer',  'Kundens navn, adresse, kontaktperson og e-mail er skrevet ind', 1),
  ('foer',  'Tjek om kunden allerede findes (aftaler, tidligere tilbud, Dinero)', 2),
  ('foer',  'Aftal hvem der tager med, og hvornår mødet er bekræftet med kunden', 3),
  ('foer',  'Find dagens timepris og kontrakttype', 4),
  ('under', 'Gå lokalerne igennem og noter størrelse, gulve, vinduer og særlige ønsker', 1),
  ('under', 'Tag billeder, og vælg hvilke der må med i tilbuddet', 2),
  ('under', 'Aftal ydelser, rytme og hvem der har nøgle eller kode', 3),
  ('under', 'Skriv referatet, mens kunden sidder der', 4),
  ('efter', 'Tjek pris, anslået tid pr. besøg og tjeklister', 1),
  ('efter', 'Dan PDF og gennemse den', 2),
  ('efter', 'Send tilbuddet til kunden', 3),
  ('efter', 'Aftal opfølgning med kunden (dato)', 4),
  ('efter', 'Ved accept: tjek aftalekladden og sæt startdato', 5);

alter table public.tilbud add column if not exists opgaveliste jsonb not null default '[]'::jsonb;

-- Nyt tilbud får en kopi af standardlisten. Eksisterende tilbud røres ikke.
create or replace function public.seed_tilbud_opgaveliste() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.opgaveliste is null or new.opgaveliste = '[]'::jsonb then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', 'o' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
             'fase', s.fase, 'tekst', s.tekst, 'done', false, 'doneAt', null, 'doneBy', null)
           order by case s.fase when 'foer' then 1 when 'under' then 2 else 3 end, s.raekkefoelge, s.id), '[]'::jsonb)
      into new.opgaveliste
      from public.tilbud_standardopgaver s where s.aktiv;
  end if;
  return new;
end $$;
revoke execute on function public.seed_tilbud_opgaveliste() from public, anon, authenticated;
drop trigger if exists tilbud_seed_opgaveliste on public.tilbud;
create trigger tilbud_seed_opgaveliste before insert on public.tilbud
  for each row execute function public.seed_tilbud_opgaveliste();

-- Hvem må ændre listen: planlæggere altid; en medarbejder på mødet, så længe tilbuddet er kladde eller sendt
-- (samme regel som medarb_ret_eget_tilbud).
create or replace function public.tilbud_maa_aendre_opgaveliste(p_tilbud_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from tilbud t join instances i on i.id = t.instance_id
     where t.id = p_tilbud_id and t.status in ('kladde', 'sendt')
       and i.assignees ? coalesce(current_employee_id(), ''));
$$;
revoke execute on function public.tilbud_maa_aendre_opgaveliste(text) from public, anon;
grant execute on function public.tilbud_maa_aendre_opgaveliste(text) to authenticated, service_role;

create or replace function public.tilbud_opgave_flueben(p_tilbud_id text, p_opgave_id text, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not tilbud_maa_aendre_opgaveliste(p_tilbud_id) then
    raise exception 'Du kan ikke ændre opgavelisten på det her tilbud' using errcode = '42501';
  end if;
  update tilbud set opgaveliste = (
      select coalesce(jsonb_agg(
        case when e ->> 'id' = p_opgave_id
             then e || jsonb_build_object('done', p_done,
                    'doneAt', case when p_done then to_jsonb(now()) else 'null'::jsonb end,
                    'doneBy', case when p_done then to_jsonb(current_employee_id()) else 'null'::jsonb end)
             else e end order by ord), '[]'::jsonb)
        from jsonb_array_elements(opgaveliste) with ordinality as t(e, ord))
   where id = p_tilbud_id returning opgaveliste into v;
  if v is null then raise exception 'Tilbuddet findes ikke'; end if;
  return v;
end $$;

create or replace function public.tilbud_opgave_tilfoej(p_tilbud_id text, p_fase text, p_tekst text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not tilbud_maa_aendre_opgaveliste(p_tilbud_id) then
    raise exception 'Du kan ikke ændre opgavelisten på det her tilbud' using errcode = '42501';
  end if;
  if p_fase not in ('foer', 'under', 'efter') then raise exception 'Ukendt fase'; end if;
  if coalesce(btrim(p_tekst), '') = '' then raise exception 'Skriv, hvad der skal gøres'; end if;
  update tilbud set opgaveliste = coalesce(opgaveliste, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', 'o' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      'fase', p_fase, 'tekst', left(btrim(p_tekst), 300), 'done', false, 'doneAt', null, 'doneBy', null))
   where id = p_tilbud_id returning opgaveliste into v;
  if v is null then raise exception 'Tilbuddet findes ikke'; end if;
  return v;
end $$;

create or replace function public.tilbud_opgave_fjern(p_tilbud_id text, p_opgave_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not tilbud_maa_aendre_opgaveliste(p_tilbud_id) then
    raise exception 'Du kan ikke ændre opgavelisten på det her tilbud' using errcode = '42501';
  end if;
  update tilbud set opgaveliste = (
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
        from jsonb_array_elements(opgaveliste) with ordinality as t(e, ord) where e ->> 'id' <> p_opgave_id)
   where id = p_tilbud_id returning opgaveliste into v;
  if v is null then raise exception 'Tilbuddet findes ikke'; end if;
  return v;
end $$;

revoke execute on function public.tilbud_opgave_flueben(text, text, boolean) from public, anon;
revoke execute on function public.tilbud_opgave_tilfoej(text, text, text) from public, anon;
revoke execute on function public.tilbud_opgave_fjern(text, text) from public, anon;
grant execute on function public.tilbud_opgave_flueben(text, text, boolean) to authenticated, service_role;
grant execute on function public.tilbud_opgave_tilfoej(text, text, text) to authenticated, service_role;
grant execute on function public.tilbud_opgave_fjern(text, text) to authenticated, service_role;

insert into public.persondata_register (tabel, kolonne, persondata, daekket_af, bemaerkning) values
  ('tilbud', 'opgaveliste', true, 'medarbejdere', 'Tjekliste på tilbuddet. Hvert punkt har et flueben, tidspunkt og medarbejder-id for den, der satte det.'),
  ('tilbud_standardopgaver', 'id', false, null, null),
  ('tilbud_standardopgaver', 'fase', false, null, null),
  ('tilbud_standardopgaver', 'tekst', false, null, 'Standardlisten. Ingen persondata.'),
  ('tilbud_standardopgaver', 'raekkefoelge', false, null, null),
  ('tilbud_standardopgaver', 'aktiv', false, null, null)
on conflict (tabel, kolonne) do nothing;

-- Tilbud, der allerede er i gang (kladde/sendt), får standardlisten én gang, så de ikke står tomme.
-- Accepterede og afviste røres ikke: der er intet at forberede.
update public.tilbud t set opgaveliste = (
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', 'o' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
           'fase', s.fase, 'tekst', s.tekst, 'done', false, 'doneAt', null, 'doneBy', null)
         order by case s.fase when 'foer' then 1 when 'under' then 2 else 3 end, s.raekkefoelge, s.id), '[]'::jsonb)
    from public.tilbud_standardopgaver s where s.aktiv)
 where t.status in ('kladde', 'sendt') and t.opgaveliste = '[]'::jsonb;
