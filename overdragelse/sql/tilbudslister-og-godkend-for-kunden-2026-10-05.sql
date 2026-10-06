-- 5.10.2026, Jonn. Samlet optegnelse af tre migrationer (kørt i dele, fordi apply_migration timede ud på større blokke):
--  tilbudslister_som_tjeklister_1 / _2_seed, godkend_tilbud_for_kunden, klassificer_oprydningskopier_20261005.
--
-- 1) Opgavelisten på tilbud hentes nu fra tre tjeklister (checklist_templates.tilbud_fase = foer/under/efter), som rettes
--    under Opsætning → Tjeklister. De holdes ude af alle valg af tjekliste på aftaler og opgaver (appen skiller dem fra).
--    Triggeren seed_tilbud_opgaveliste kopierer dem til hvert nyt tilbud. tilbud_standardopgaver bruges ikke længere
--    (ikke slettet: drop hænger i Claudes Supabase-værktøj, se STATUS).
alter table public.checklist_templates add column tilbud_fase text check (tilbud_fase in ('foer', 'under', 'efter'));
-- + tre rækker tilbud_foer / tilbud_under / tilbud_efter og deres 13 punkter (kopi af tilbud_standardopgaver)
-- + seed_tilbud_opgaveliste() omskrevet til at læse dem

-- 2) Godkendelse på kundens vegne: godkend_tilbud_for_kunden(p_tilbud_id, p_kundens_navn, p_maade, p_note) — kun is_admin().
--    tilbud_signatur har fået godkendt_af, godkendt_maade (telefon/paa_stedet/brev/andet) og godkendt_note.
--    Kræver en dannet PDF (pdf_hash). Opretter aftale i kladde som accepter_tilbud. accepter_tilbud er UÆNDRET —
--    ændres, hvad en accept danner, skal begge funktioner rettes.
-- (Fuld tekst: se migrationerne i supabase_migrations.schema_migrations.)

-- 3) Ikke gennemført: ryd_oprydningskopier() skulle også rydde kopier fra 5.10 (kopi_slettede_aftaler_20261005,
--    kopi_bevilling_aftale_20261005, kopi_bevilling_opgaver_20261005) og testtabellen zz_deltest. apply_migration
--    hang på teksten (den indeholder drop/delete). Gøres i SQL Editor.

-- 6.10.2026: employee_hr (HR-oplysninger, kun administratorer). Migration «employee_hr_tabel». Egen tabel og ikke kolonner på employees,
-- fordi employees kan læses af alle kolleger. Kolonner: telefon, privat_email, nodkontakt_navn/-relation/-telefon, ansaettelsesform
-- (fast/timeloenned/vikar/elev/andet), ansat_fra, mus_sidst, mus_naeste. Ingen CPR, ingen helbred, ingen samtalenoter.
