-- Hvorfor: Jonn bad 5.10.2026 om at slette de aftaler, der står til «slettes» (indlæste ruteplan-kladder, sorteret fra).
-- 63 står til sletning: 62 uden opgaver og 1 («Rengøring ift bevilling», Jammerbugt Kommune) med 26 opgaver, som springes over,
-- præcis som slet_markerede_aftaler gør. Kopi af de 62: kopi_slettede_aftaler_20261005 (aflåst for anon/authenticated).
-- STATUS 5.10: sletningen blev IKKE gennemført fra Claude — apply_migration timede ud på selve DELETE (også på én række),
-- uden at noget var låst. Kør den her i Supabase SQL Editor i stedet:
delete from public.service_templates t
 where t.status = 'slettes'
   and t.id in (select id from public.kopi_slettede_aftaler_20261005);
