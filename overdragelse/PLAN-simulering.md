# Plan: Simulér uge — fri planlægning

Besluttet med Jonn 30.9.2026. Ikke bygget endnu. Skal kunne tages op i Claude Code.

## Formålet

Tag en hel uge og lad appen foreslå en bedre fordeling af opgaverne på
medarbejderne — ud fra kompetencer, kørsel, kapacitet og områder. Simuleringen
ændrer **intet** i den rigtige plan, før planlæggeren har godkendt den.

## Jonns beslutninger

| Spørgsmål | Svar |
|---|---|
| Må opgaver flyttes til en anden dag? | **Nej.** Faste dage respekteres. |
| Må aftalte klokkeslæt flyttes? | **Nej som udgangspunkt.** Kan et klokkeslæt optimeres, må simuleringen foreslå det, men opgaven **markeres tydeligt**: «her afviger vi fra det aftalte klokkeslæt». Den slags forslag skal godkendes for sig. |
| Faste medarbejdere? | **Parameter i simuleringen:** «Fast medarbejder» (aftalens faste medarbejder bliver på) eller «Fri medarbejder» (alle opgaver fordeles frit). |
| Hvilke km tæller? | **Kun kørsel mellem opgaverne.** Turen hjemmefra til første opgave og hjem fra sidste tæller ikke. |

## Størrelsen på opgaven (målt på uge 41, 2026)

- 25–43 opgaver pr. hverdag, 181 i alt. 19 aktive medarbejdere.
- **Alle** opgaver har et aftalt klokkeslæt. Rækkefølgen på en dag er derfor givet af
  klokkeslættene; det, der skal findes, er *hvem* der tager hvilken opgave.
- Højst 39 forskellige adresser på én dag, 145 på en uge. 408 køretider ligger
  allerede i `travel_overrides`.

Det er et lille problem for en computer: en god løsning kan findes i browseren på få
sekunder.

## Sådan virker det for planlæggeren

1. **Ugeplan → «Simulér uge».** Vælg:
   - Fast medarbejder / Fri medarbejder
   - Må klokkeslæt foreslås flyttet? Nej / ±15 / ±30 / ±60 min
   - Vægt: færrest km ↔ jævn fordeling (skyder)
2. **Beregningen** kører nogle sekunder (i en Web Worker, så skærmen ikke fryser).
3. **Sammenligning** med den nuværende plan:
   - km og køretid mellem opgaver (i alt og pr. dag)
   - opgaver der kommer for sent i forhold til aftalt tid
   - overbookede dage, opgaver uden for område
   - belægning pr. medarbejder
   - hvor mange kunder der får en ny medarbejder
   - hvor mange klokkeslæt der foreslås flyttet
4. **Den simulerede uge** vises i ugeplanen (gitter og tidslinje) med et tydeligt
   banner «SIMULERING — intet er gemt». Kort, der har skiftet medarbejder, markeres.
   Kort med foreslået nyt klokkeslæt får et orange mærke: «🕐 foreslået 09:30 (aftalt
   09:00)». Planlæggeren kan rette i simuleringen (træk/slip), før hun godkender.
5. **Godkend** hele ugen, én dag eller én medarbejder — eller kassér. Forslag om nyt
   klokkeslæt godkendes særskilt (de kræver typisk, at kunden spørges).
6. **Fortryd:** ved godkendelse gemmes et øjebliksbillede af den gamle fordeling.
   «Rul tilbage» sætter den tilbage. Ændringerne kommer i ændringsloggen, og
   medarbejderne får besked om ændringer i deres dag (eksisterende besked-funktion).

## Regler i motoren

**Brydes aldrig**
- Kompetencer (krævede skills og niveau)
- Sygdom/ferie og medarbejderens arbejdstider/kapacitet pr. dag (hård grænse, evt.
  med lille tolerance, der vises som overbooking)
- Weekend kun for dem, der må
- Opgavens dag
- Aftalt klokkeslæt — medmindre planlæggeren har tilladt forslag, og så kun inden for
  den valgte tolerance, og altid markeret
- To-mandsopgaver har det antal personer, de har i dag; fordelt tid (tid_fordeling)
  bevares pr. plads
- «Fast medarbejder»-tilstand: aftalens `preferred_employee_id` bliver på opgaven
- Udførte opgaver, opgaver med registreret tid og overståede dage røres ikke
- Sygdom/ferie-blokke og «anden aktivitet» flyttes ikke

**Optimeres (vægtet sum, lavest vinder)**
- Køretid/km **mellem** opgaverne samme dag (ikke hjemmefra/hjem)
- For sent i forhold til aftalt tid (stor straf)
- Opgaver uden for medarbejderens område (straf)
- Ujævn belægning (straf efter skyderen)
- Foreslået flyttet klokkeslæt (straf pr. minut, så det kun sker, når det betaler sig)

## Metoden

1. **Start:** fordel opgaverne én ad gangen efter klokkeslæt til den medarbejder, hvor
   de koster mindst (billigste indsættelse), inden for reglerne.
2. **Forbedring:** tusindvis af små træk — flyt én opgave til en anden, byt to
   opgaver, byt to medarbejderes halve dage — og behold kun dem, der gør ugen bedre
   (lokal søgning med lidt tilfældighed for ikke at sidde fast). Tidsgrænse ~3 sek.
3. Dagene er uafhængige (opgaver flytter ikke dag), så hver dag løses for sig.
4. Resultatet er ikke garanteret det matematisk bedste, men et meget godt, og det
   samme input giver samme resultat (fast «seed»), så det kan afprøves.

## Data og afstande

- **Kortpunkter** for kundeadresser: slås op én gang og gemmes (ny kolonne/tabel).
  Det er kundens adresse, ikke medarbejdernes position — i tråd med reglen om, at
  medarbejdernes position aldrig gemmes.
- **Køretider:** `travel_overrides` bruges først. Manglende par hentes med
  OpenRouteServices matrix-kald — én afstandstabel pr. dag (højst 39×39 = 1.521
  par, under grænsen på 3.500 pr. kald). Gratis-kvoten er 500 matrix-kald i døgnet og
  40 i minuttet ([ORS](https://openrouteservice.org/restrictions/),
  [ORS-forum](https://ask.openrouteservice.org/t/updated-api-quotas/500)), så en uge
  koster 5 kald. Resultaterne gemmes i `travel_overrides`, så de kun hentes én gang.
- Ny edge-funktion `koeretabel` (planlæggere only) henter og gemmer matrixen.
  ORS-nøglen findes allerede (bruges af `travel-distance`).

## Gemt simulering

Tabel `plan_simulering`: uge/år, oprettet af, parametre, resultat (json), nøgletal,
status (kladde / godkendt / kasseret / rullet tilbage), øjebliksbillede af den gamle
fordeling. Så kan begge planlæggere se samme simulering, og en godkendelse kan rulles
tilbage. RLS: kun planlæggere. Firma-adskillelse i kundedatabasen.

## Faser

1. **Data:** kortpunkter + `koeretabel` + cache. Test: køretabel for uge 41.
2. **Motoren:** `src/simulering.js` + `simulering.test.mjs` (regler brydes aldrig,
   samme input → samme svar, bedre end «alle på én» og end den nuværende plan på
   testdata). Ingen app-kode endnu.
3. **Visning:** knap, parametre, sammenligning, simuleret uge med banner og
   markeringer. Stadig intet gemt i planen.
4. **Godkendelse:** hele/dag/medarbejder, klokkeslæt særskilt, øjebliksbillede,
   rul tilbage, ændringslog, besked til medarbejdere.
5. **Hjælp og øvelse:** hjælpetekster i planlægningsappen; evt. en øvelse i
   prøveugen. Worklist-hjælpen: at dagen kan ændres efter en simulering.

## Åbne spørgsmål til senere

- Skal kunder med «samme medarbejder» (kontinuitet) have en vægt, også i «Fri
  medarbejder»-tilstand?
- Skal simuleringen kunne køre for flere uger ad gangen (fx resten af måneden)?
- Skal den også kunne foreslå, hvem der skal have fri, når der er luft?
