# Plan: Auto-slut af opgaver og lønlukning

Besluttet af Jonn og Charlotte 1.10.2026 (beslutningsdokument:
https://claude.ai/code/artifact/f7ed5ce9-a11f-4f6c-a774-b417ab87866d, også som
`planapp/Beslutning-lukning-af-opgaver-og-loenperiode.docx`).

## Status 1.10.2026: bygget og SLÅET TIL kl. 21.09 (Jonn)

Panel: Medarbejdere → «🔒 Auto-slut og lønlukning». Gælder kun opgaver med planlagt slut efter 1.10.2026
kl. 21.09. De 32 gamle åbne opgaver (Karen 17, Nadine 15, fra 21.8) blev bevidst IKKE lukket (Jonn: «kun fra
nu») og skal ryddes op i hånden.
- Database (begge): kolonner i `tidsregistrering_indstillinger`, `loen_periode_slut/_laast/_for/_interval`,
  `tjek_loen_aaben` (vagt i append_time_log, afslut_tid, set_employee_task_status, fejlkode 55000),
  `autoslut_behandl`, `loen_varsel_behandl`, `ret_systemlukket_tid`, `behandl_tidsrettelse`,
  `efterreguler_tid`; `kontor_indbakke` har «tidsrettelse» og «systemlukninger» og måler afvigelse mod
  fakturaMinutes; `mine_timer`/`mine_km` følger lønperioden. SQL: `overdragelse/sql/autoslut-og-loenlukning-2026-10-01.sql`
  (+ migrationerne autoslut_d og autoslut_e i databasen).
- time_log-linjer: `systemlukket`, `fakturaMinutes`, `rettet`, `rettelseAfventer`, `rettelseAfvist`,
  `efterregulering` + `periodeSlut`. Faktura bruger fakturaMinutes (`src/opgavetid.js`), løn bruger minutes.
- Edge `plan-beskeder` v9 (JR): job «start» kalder også autoslut — push «Husk at afslutte» 1 time før og
  «Lukket af systemet»; lønvarsel 3 og 1 dag før kl. 15. Kundeudgavens `kunde-functions/plan-beskeder` er
  IKKE opdateret endnu.
- Planlægningsappen: panel, lønopgørelse og km pr. lønperiode (`src/loenperiode.js` + test), efterreguleringer
  som egne linjer (reference `opgave:er:ts`), «Efterreguler tid» på opgaven når perioden er lukket, mærker i
  tidsregistreringen, Godkend/Afvis i klokken.
- Worklist: «Min tid» pr. lønperiode, «Ret tid» på systemlukkede opgaver, hjælp.
- Afvigelse fra planen: kun ÉN push før lukning (1 time før), ikke tre — for ikke at drukne dem i beskeder.
- Afprøvet i databasen i en transaktion, der blev rullet tilbage (luk, ret op, ret ned, godkend, efterreguler).
- Planlæggere med Worklist (Charlotte/Karen) får også deres opgaver lukket.
- Låsen på lukkede perioder gælder kun, når auto-slut er slået til (`loenlukning_aktiv()`, migration autoslut_f).
  Lønopgørelsen, km og «Min tid» følger lønperioden 20.–19. allerede nu.
- Jonn 1.10: låsen gælder kun UDFØRTE opgaver (fejl 55000). En ikke-udført opgave i en lukket periode kan
  registreres, når medarbejderen har skrevet en begrundelse (fejl 55001 → Worklist spørger →
  `begrund_efter_loenluk` → tabel `loenluk_anmodning`). Linjen mærkes `efterLoenluk` + `periodeSlut` og tæller i
  den åbne periode. Klokken: «Registreret efter lønlukning» → `behandl_efter_loenluk` (afvist = løn 0,
  fakturaMinutes bevares). SQL: `overdragelse/sql/efter-loenluk-med-begrundelse-2026-10-01.sql`.

## Beslutningerne

1. **Auto-slut:** opgaver, der ikke er afsluttet, lukkes af systemet 2 timer efter planlagt sluttid.
2. **Løn ved systemlukning:** den planlagte tid (ikke nul). Overtid kun, hvis medarbejderen selv retter
   og begrunder før lønlukning.
3. **Lønperiode:** fast 20.–19. Lukkedag den 20. kl. 23.59, også når den falder i en weekend eller på en
   helligdag.
4. **Rettelse til mindre end planlagt tid:** kræver kontorets godkendelse.
5. **Efter lukning:** kun Charlotte og Karen kan rette. Rettelsen bliver en efterregulering i næste periode.
   En udbetalt løn ændres aldrig.

## Sådan skal det virke

- **Faktura:** den systemlukkede opgave er «udført» med planlagt tid og mærket «Lukket af systemet». Kunden
  faktureres den planlagte tid. Medarbejderens senere rettelse ændrer ikke fakturaen.
- **Push før auto-slut:** ved planlagt slut, efter 30 min og «Lukkes automatisk om 1 time». Bygger videre på
  de eksisterende start-påmindelser (`start_paamindelse`, slags udvides).
- **Push før lønlukning:** 3 dage og 1 dag før, kun til medarbejdere med systemlukkede eller urettede opgaver.
- **Rettelse i Worklist** indtil lukning, med begrundelse. Rettelse ned under planlagt tid → kontorets indbakke
  til godkendelse.
- **Trappe:** 1–2 systemlukninger pr. periode = kun mærket; ved 3 får kontoret besked i indbakken.
- **Rapport:** antal systemlukninger pr. medarbejder pr. periode i «Start/stop pr. medarbejder».
- **Ændringslog:** alle rettelser og efterreguleringer.

## Indstillinger (Opsætning → Tidsregistrering)

Auto-slut efter planlagt slut (2 t, kan slås fra) · lukkedag for løn (20) · påmindelser før lukning (3 og 1
dag) · weekend/helligdag (samme dag) · systemlukninger før besked (3). Udvid `tidsregistrering_indstillinger`.

## Før det slås til

- Reglerne tjekkes med overenskomst eller arbejdsgiverforening.
- Medarbejderne varsles (ligesom start/stop), og persondata-registret opdateres for nye felter.
- Afprøves en måned, før det gælder alle.
- Hjælpen i planlægningsappen og Worklist opdateres.
