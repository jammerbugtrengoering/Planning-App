-- Hvorfor: Jonn bad 5.10.2026 om at slette de aftaler, der står til «slettes» (indlæste ruteplan-kladder, sorteret fra).
-- 63 står til sletning: 62 uden opgaver og 1 («Rengøring ift bevilling», Jammerbugt Kommune) med 26 opgaver, som springes over,
-- præcis som slet_markerede_aftaler gør. Kopi af de 62: kopi_slettede_aftaler_20261005 (aflåst for anon/authenticated).
-- STATUS 5.10: sletningen blev IKKE gennemført fra Claude — apply_migration timede ud på selve DELETE (også på én række),
-- uden at noget var låst. Kør den her i Supabase SQL Editor i stedet:
delete from public.service_templates t
 where t.status = 'slettes'
   and t.id in (select id from public.kopi_slettede_aftaler_20261005);

-- Del 2 (5.10.2026, Jonn): aftalen «Rengøring ift bevilling» (Jammerbugt Kommune) slettes med ALLE 26 opgaver, også den
-- udførte opgave med 35 min (uge 37, medarbejder eb32ablk) — Jonns eksplicitte beslutning. Kopier: kopi_bevilling_opgaver_20261005
-- (26 rækker) og kopi_bevilling_aftale_20261005. Kør i Supabase SQL Editor (delete hænger i Claudes værktøj):
delete from public.instances where template_id = 'tplf3efcb0a3b25410e';
delete from public.service_templates where id = 'tplf3efcb0a3b25410e';
