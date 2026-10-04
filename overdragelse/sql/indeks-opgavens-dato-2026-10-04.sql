-- Kørt som migration «indeks_opgavens_dato» mod Jammerbugts database (4.10.2026).
-- Hvorfor: kontor_indbakke() (klokken i topmenuen) kaldes hvert minut af hver planlægger og
-- efter hver ændring i planen. To af dens led filtrerer på instance_date(year, week, day) og
-- læste derfor alle ca. 18.500 opgaver for hvert kald. Målt før/efter med explain analyze:
--   tidsrettelser    676 ms -> 27 ms
--   systemlukninger  968 ms ->  3 ms
-- Rulles tilbage med: drop index public.instances_dato_idx;
create index if not exists instances_dato_idx
  on public.instances (public.instance_date(year, week, day))
  where deleted_at is null;
analyze public.instances;
