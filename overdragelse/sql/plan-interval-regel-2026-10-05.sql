-- Hvorfor: rytmen er siden 5.10.2026 en regel (N_uger 1-52, N_maaned 1-12) i src/aftalerytme.js, men databasen havde
-- stadig den gamle liste over syv værdier. «3 uger» og «12 måneder» kunne derfor ikke gemmes
-- (service_templates_plan_interval_check), og «Gem kladde» / «Gem og planlæg» gjorde intet.
-- Kontrollen følger nu samme regel som koden. Rulles tilbage ved at gendanne listen: uge, 14_dage, 4_uger, 6_uger,
-- maaned, 3_maaned, konkrete_datoer.
alter table public.service_templates drop constraint service_templates_plan_interval_check;
alter table public.service_templates add constraint service_templates_plan_interval_check
  check (plan_interval ~ '^(uge|14_dage|maaned|konkrete_datoer|([1-9]|[1-4][0-9]|5[0-2])_uger|([1-9]|1[0-2])_maaned)$');
