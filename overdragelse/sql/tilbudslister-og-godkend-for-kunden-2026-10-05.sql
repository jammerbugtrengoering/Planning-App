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

-- 6.10.2026: medarbejderen retter selv telefon og nødkontakt i Worklist. Funktionerne hent_mine_kontaktoplysninger() og
-- opdater_mine_kontaktoplysninger(telefon, nod_navn, nod_relation, nod_telefon) — security definer, kun for den indloggede medarbejder,
-- rører KUN de fire felter (ikke privat e-mail, ansættelse eller MUS), lukket for anon. Registeret er opdateret (bemærkningen).

-- 6.10.2026: dokumentarkiv på medarbejderkortet. Tabel employee_dokumenter (kategori kontrakt/aendring/mus/certifikat/andet, titel, filnavn, sti,
-- gyldig_til, uploadet_af/-at) + privat bucket «medarbejder-dokumenter» (10 MB, pdf/jpg/png/doc/docx), begge kun for administratorer.
-- Migrationerne «medarbejder_dokumentarkiv_1_tabel» og «_2_bucket». Filen får tilfældigt navn i bucket'en; det rigtige filnavn står i tabellen.

-- 6.10.2026 (Jonn): lønlukningen flyttes til hverdagen før, når lukkedagen er weekend/helligdag.
-- Kolonnen tidsregistrering_indstillinger.loen_hverdag_foer (standard true), dk_paaskedag/dk_helligdag, loen_slut_maaned,
-- loen_periode_slut (nu min. af kandidaterne fra tre måneder), loen_periode_start, loen_periode_interval. kontor_indbakke og
-- loen_varsel_behandl brugte «en måned tilbage» som periodestart; de er omskrevet med replace() til loen_periode_start.
-- Migrationer: loen_hverdag_foer_1_kolonne_og_helligdage, loen_hverdag_foer_2_periodefunktioner.
-- Rulles tilbage ved at sætte loen_hverdag_foer = false (så er alt som før).

-- 6.10.2026 (Jonn): rytmen «Aftales ved besøget» (plan_interval = 'ved_besoeg'). Migrationer: ved_besoeg_1_interval_kontrol,
-- ved_besoeg_2_opret_naeste_besoeg, ved_besoeg_3_klokken.
--  * service_templates_plan_interval_check kender nu ved_besoeg (ellers afviser databasen «Gem»).
--  * naeste_besoeg_kerne / opret_naeste_besoeg(p_instance_id, p_dato, p_tid): kopierer opgaven, medarbejderen står på, til en ny dato.
--    Genopliver en ryddet plads (deleted_at) i stedet for at indsætte: bloker_opgaver_paa_opsagt_aftale dropper ellers indsættelsen uden fejl.
--    Testet i en migration, der rullede tilbage (genoplivet plads + ny række + ingen dublet).
--  * kontor_udsaet: «Husk om en uge» på klokken (kontor_kvitter gør intet, hvis rækken findes).
--  * kontor_indbakke: ny linje 'naeste_besoeg' — aftale med ved_besoeg, status aktiv, ingen åben opgave, sidste besøg før i dag, ikke udsat inden for 7 dage.
-- Punktets tekst «Aftal næste besøg med kunden» står i src/aftalerytme.js (NAESTE_BESOEG_TEKST), i Worklist og i naeste_besoeg_kerne (c_tekst).
-- opret_naeste_besoeg_for_aftale(p_template_id, p_dato, p_tid): kontorets vej til samme kerne (naeste_besoeg_kerne), fra klokken og fra aftalekortet.

-- 6.10.2026 (Jonn): HR-administrator. Migrationer: hr_admin_1_rolle, hr_admin_2b/2c/2d (ALTER POLICY).
--  * Tabellen hr_administratorer (employee_id), funktionen er_hr_admin() (lukket for anon), udløseren hr_admin_sidste_trg (mindst én).
--  * Politikkerne på employee_hr, employee_dokumenter, employee_wages (læs) og storage-politikken for bucket medarbejder-dokumenter kræver nu er_hr_admin().
--  * Startliste: e5 (Charlotte), evfebxn6 (Karen), e2 (Udvikler IT) — de tre administratorer.
--  * DROP POLICY hænger i apply_migration (som DELETE); ALTER POLICY virker. Politikkerne hedder stadig admin_all/admin_read.
--  * Ikke ændret: employee_wage_history, km_sats_historik, employee_home. De er løn/transport og bør med, når en planlægger uden HR-adgang kommer til;
--    appens planlæggerudgave skriver dem ikke (wageFrom/kmSatsFra sættes til null uden hrAdgang).
