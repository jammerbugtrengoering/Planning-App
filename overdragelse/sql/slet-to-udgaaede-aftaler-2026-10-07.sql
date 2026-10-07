-- Hvorfor: Jonn bad 7.10.2026 om at slette to udgåede aftaler, der stod på aftalelisten:
--   «rengøring ifølge aftale» (Sparekassen Danmark, tpl587fad6b5cb542fd) og «Rengøring — BHJ Gæstehus» (BHJ A/S, tplimpc966c30e929e).
-- Begge er opsagt af kunden og udgået. Ingen af de 629 opgaver (524 + 105) er udført eller har registreret tid, så intet arbejde eller fakturering går tabt.
-- Kopier (aflåst for anon/authenticated): kopi_udgaaede_aftaler_20261007 (2 rækker) og kopi_udgaaede_opgaver_20261007 (629 rækker).
-- Opgaverne SKAL slettes først: instances.template_id er ON DELETE SET NULL, så slettes aftalen alene, bliver 629 opgaver hængende uden aftale.
-- Kør i Supabase SQL Editor (delete hænger i Claudes værktøj):
delete from public.instances where template_id in ('tpl587fad6b5cb542fd', 'tplimpc966c30e929e')
   and status is distinct from 'udført';
delete from public.service_templates where id in ('tpl587fad6b5cb542fd', 'tplimpc966c30e929e') and status = 'udgaaet';
-- Kontrol bagefter: begge skal give 0.
-- select count(*) from public.service_templates where id in ('tpl587fad6b5cb542fd', 'tplimpc966c30e929e');
-- select count(*) from public.instances where template_id in ('tpl587fad6b5cb542fd', 'tplimpc966c30e929e');
