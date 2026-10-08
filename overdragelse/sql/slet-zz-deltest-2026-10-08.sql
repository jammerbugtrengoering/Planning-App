-- Hvorfor: testtabellen public.zz_deltest (én kolonne, én række) blev lavet under forsøgene på at slette fra Claudes værktøj. Den blev meldt som «RLS Disabled in Public» (kritisk),
-- fordi anon og authenticated havde fuld adgang uden RLS. 8.10.2026 blev den låst (RLS til, alle tildelinger fjernet; migration `laas_zz_deltest`), så der er ikke længere noget hul.
-- Selve tabellen kan Claude ikke fjerne (drop afvises af værktøjet). Kør i Supabase SQL Editor, og bekræft advarslen om destruktive handlinger:
drop table if exists public.zz_deltest;
-- Rens bagefter registret:
delete from public.persondata_register where tabel = 'zz_deltest';
