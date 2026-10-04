-- Kørt som migration «forbyd_aktiv_til_kladde» mod Jammerbugts database (4.10.2026).
-- Hvorfor: en aftale, der kører, blev gemt som kladde to gange (2.10 Springvandstorvet 3A,
-- 4.10 Kornblomstvej). En kladde kører på ingen dage, så alle kommende opgaver blev ryddet.
-- Appen har et værn, men en gammel fane, et natjob eller en edge-funktion kan stadig skrive
-- status direkte. Her står værnet i selve basen. Kun aktiv -> kladde afvises; fortryd af
-- «skal slettes» (slettes -> kladde) og kladde -> aktiv er uændret.
-- Rulles tilbage med: drop trigger forbyd_aktiv_til_kladde on public.service_templates;
create or replace function public.forbyd_aktiv_til_kladde()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'aktiv' and new.status = 'kladde' then
    raise exception 'En aftale, der koerer, kan ikke gemmes som kladde - saa ville alle dens kommende opgaver blive slettet. Gem med Godkend og planlaeg.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.forbyd_aktiv_til_kladde() from public, anon, authenticated;
create trigger forbyd_aktiv_til_kladde
  before update of status on public.service_templates
  for each row execute function public.forbyd_aktiv_til_kladde();
