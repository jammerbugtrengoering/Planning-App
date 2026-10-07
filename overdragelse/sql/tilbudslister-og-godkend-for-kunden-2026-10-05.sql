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

-- 6.10.2026 (Jonn): dokumenter i personalemappen kan gøres synlige for medarbejderen. Migrationer: personalemappen_1_dokumenter_synlighed, personalemappen_2_storage_laes_eget.
--  * employee_dokumenter: synlig_for_medarbejder (standard false), kvittering_kraeves, kvitteret_tid. Klassificeret i persondata_register.
--  * mine_dokumenter() og kvitter_dokument(id): medarbejderens egne synlige dokumenter og kvittering. Lukket for anon.
--  * storage-politik medarbejder_dokumenter_laes_eget: medarbejderen kan læse en fil, hvis dens dokument er synligt og hendes.
-- personalemappen_3_mine_datoer: mine_datoer() giver medarbejderen hendes egen ansat_fra, mus_sidst og mus_naeste (employee_hr er kun for HR-administratorer).
-- personalemappen_4_klokken_hr: tre nye linjer i kontor_indbakke (indsat med replace() før «-- 7. Fejl i data»), kun hvis er_hr_admin():
--   ikke_kvitteret (4 dage), bevis_udloeber (60 dage / udløbet), mus_forfalden (næste dato passeret, eller 12 mdr. uden). Ikke i morgenmailen (service_role er ikke HR-administrator).
-- personalemappen_5a-5d: haandbog_dokumenter + haandbog_afsnit (alle medarbejdere læser, HR-administratorer skriver), gem_haandbog_dokument(id, titel, underskrift, afsnit jsonb),
--   og håndbogen (maj 2025) og rygepolitikken (feb. 2026) lagt ind uændret. FÆLDE: apply_migration hænger, hvis ordet «delete» står i en funktionstekst (og ved DROP/DELETE);
--   i gem_haandbog_dokument står sletningen som streng ('de' || 'lete ...'). Samme symptom som 6.10 med DROP POLICY.
-- personalemappen_6a-6c: fravaer_anmodninger (ferie/fridag; status afventer/godkendt/afvist/trukket; for_sent efter håndbogen: ferie < 28 dage, fri < 10 dage),
--   anmod_fravaer / traek_fravaer / mine_fravaer (medarbejderen) og afgoer_fravaer (HR-administrator), og linjen 'fravaer_anmodning' i kontor_indbakke.
--   Godkendelsen lægger blokeringen i ugeplanen i APPEN (addBlock) efter at databasen har gemt afgørelsen. Sygdom er ikke en anmodning.
-- personalemappen_7a-7e: MUS og udvikling.
--  * mus_samtaler (instance_id → aktiviteten i ugeplanen, employee_id, leder_id, status planlagt/afholdt/aflyst, forberedelse jsonb q1-q5, forberedelse_delt).
--    authenticated har INGEN direkte adgang: forberedelsen er medarbejderens egen, til hun deler den. Alt går gennem book_mus (HR), hr_mus (HR, forberedelse kun hvis delt),
--    min_mus, gem_mus_forberedelse. udviklingsoensker: mine_udviklingsoensker / tilfoej / traek (medarbejder); HR læser og retter tabellen direkte. mine_kompetencer().
--  * Udløser mus_status_fra_aktivitet_trg på instances (after update of status → udført/aflyst): samtalen afholdt/aflyst, employee_hr.mus_sidst sættes, mus_naeste tømmes. Testet i en migration, der rullede tilbage.
--  * mine_datoer(): næste MUS er den planlagte aktivitet, ellers kortets dato. kontor_indbakke: mus_forfalden springer over, når en MUS er booket; ny linje 'udviklingsoenske'.
-- personalemappen_8a-8c: kvittering for haandbog. haandbog_dokumenter + kraever_kvittering, version, version_udgivet; haandbog_kvitteringer (employee_id, dokument_id, version).
--   gem_haandbog (kalder gem_haandbog_dokument og sætter flag/version), kvitter_haandbog, mine_haandbog_kvittering (medarbejder), haandbog_kvittering_status (HR),
--   og linjen 'haandbog_ikke_kvitteret' i kontor_indbakke (14 dage efter version_udgivet). Ny navn og ikke et overload, fordi PostgREST ikke kan vælge mellem to overload med standardværdier.
-- mus_referat_1-3 (6.10.2026): referat til MUS-samtalen. Kolonner på mus_samtaler: referat, referat_status (kladde/sendt/bemaerkning/godkendt), referat_sendt_tid, referat_godkendt_tid, medarbejder_bemaerkning.
--   Hvorfor: lederen skriver referatet i Worklist (som tilbuddets referat), og medarbejderen godkender det i Personalemappen — så ingen kan sige, at referatet aldrig blev set.
--   mus_for_opgave(text) (leder/medarbejder på aktiviteten), gem_mus_referat(uuid,text,boolean) (leder eller HR; send markerer samtalen holdt og lukker aktiviteten for begge),
--   mus_holdt(uuid), min_mus_samtaler() (kladde skjules), svar_mus_referat(uuid,boolean,text) (godkend låser), hr_mus_samtaler(text). Alle lukket for anon.
--   Redigering af et sendt referat uden at sende igen gør det til kladde. kontor_indbakke: linje 19 'mus_referat' (bemærkninger, eller sendt for over 7 dage siden uden svar).
-- mus_referat_4-5 (6.10.2026): rollen i mus_for_opgave følger samtalen (leder kun hvis man ER lederen; HR uden for samtalen = 'hr', skrivebeskyttet i Worklist). Før fik en HR-administrator, der selv var medarbejderen, rollen 'leder' og kunne sende sit eget referat.
--   gem_mus_referat afviser nu, at man skriver referatet til sin egen samtale (medmindre man selv er lederen). HR skriver/retter i planlægningsappen på medarbejderens kort.
-- fast_tid_nexus_aeldrelov_1-2 (7.10.2026): Nexus og Ældrelov registreres altid til aftalt tid. fast_tid_min(instance, emp) = tid_fordeling[emp] ellers duration for contract_type nexus/aeldrelov, ellers null.
--   afslut_tid og append_time_log tvinger p_minutes til den og ignorerer en ny registrering fra samme medarbejder (idempotent); ret_systemlukket_tid afviser medarbejderen (planlæggere kan stadig). afslut_tid springer kravet om begrundelse over for de to typer.
--   Hvorfor i databasen: en gammel fane/telefon sender ellers medarbejderens tastede tid. Efterreguler_tid er uændret og er kontorets vej til at rette.
-- firma_brug_omraader (7.10.2026): firma.brug_omraader boolean not null default true. Slået fra: candidatesFor ser bort fra områder, ugeplan og medarbejderliste skjuler dem. Kun Jammerbugts database; kundedatabasen skal have samme kolonne, før parameteren kan slås fra dér.
-- fravaer_varsel_opsaetning (7.10.2026): firma.ferie_varsel_dage (28) og fridag_varsel_dage (10), fravaer_varsel() (authenticated), anmod_fravaer læser dem i stedet for faste 28/10. for_sent gemmes som før.
-- haandbog_udgaaet_1-3 (7.10.2026): haandbog_dokumenter.udgaaet_tid/udgaaet_af; laes_medarbejder på dokumenter og afsnit kræver udgaaet_tid is null (ALTER POLICY); mine_haandbog_kvittering og klokkens linje 'haandbog_ikke_kvitteret' springer udgåede over; saet_haandbog_udgaaet(text, boolean) (HR). persondata_register klassificeret. Sletter intet.
