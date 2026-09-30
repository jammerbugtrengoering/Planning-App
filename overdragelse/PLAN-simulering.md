# Plan: Simulér uge — fri planlægning

Besluttet med Jonn 30.9.2026. Skal kunne tages op i Claude Code.

**Status 30.9.2026:** fase 1 og 2 er bygget.
- Motoren: `src/simulering.js` + `simulering.test.mjs` (24 kontroller, køres af `npm run build`).
- Køretabel: edge-funktionen `koeretabel` (deployet) + tabellerne `koeretabel` og `adresse_punkt`.
  Uge 41 er hentet: 5 matrix-kald, alle par for hver dag.
- Prøvekørsel på uge 41 (181 opgaver, 18 medarbejdere, «Fri medarbejder», balance 40):
  nu 934 km / 3.222 kr. / 60,7 t for sent / 8 dage over dagstimerne →
  simuleret 652 km / 2.129 kr. / 0 / 0. Sparer ca. 1.100 kr. og 280 km på ugen.
  159 af 181 pladser skifter medarbejder — kontinuitet er ikke vægtet endnu.
  3 opgaver har ingen lovlig kandidat (kompetencer/dagstimer) og står som «ikke placeret».
  Medarbejdere uden kilometersats (Charlotte, Lea, Karen) regnes med standardsatsen 3,94.
- Kontinuitet (Jonn 30.9): skyderen «Kunden beholder sin medarbejder» — op til 150 kr. pr.
  plads, der får ny medarbejder (`kontinuitet` i motoren, med test).
- Fase 3 bygget: `SimuleringView` i App.jsx, knappen «🔀 Simulér uge» i ugeplanen (kun
  planlæggere), hjælpeteksten «Simulér uge» under Ugeplan. Ikke afprøvet i browseren endnu.
- Planlæggerne (is_admin med dagstimer — Charlotte og Karen) er udeladt som standard
  (Jonn 30.9): de beholder deres opgaver og får ingen nye. «Medtag …» tager dem med.
  (`udeladte` i motoren, med test.)
- Fase 4 bygget: godkend hele ugen / dag / medarbejder / klokkeslæt for sig; opgaver med
  en uplaceret plads røres ikke; opgaver ændret siden simuleringen springes over.
  Øjebliksbillede i tabellen `plan_simulering` (begge databaser) → «Rul tilbage».
  Besked til medarbejdere via den eksisterende push_plan_koe-trigger.
- Hjælp: Ugeplan → «Simulér uge» (planlægningsappen) og en linje i Worklist.
- Kundeudgaven: knappen er skjult, fordi kundedatabasen ikke har koeretabel-funktionen
  endnu (tabellerne koeretabel/adresse_punkt og ORS-nøgle mangler dér).
- Flere på én opgave: hver person er en «plads» med sine minutter (tid_fordeling). Pladserne
  fordeles hver for sig, aldrig to pladser til samme person, og antallet ændres ikke. Er et
  klokkeslæt foreslået flyttet, får alle pladser samme nye tid (test i simulering.test.mjs).
- Mangler: øvelse i prøveugen (valgfri).

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
   - dage over dagstimerne eller på fridage, opgaver før mødetid, opgaver uden for område
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
- Sygdom/ferie
- **Mødetid** (emp.startTime): ingen opgave begynder før hun møder (Jonn 30.9)
- **Dagstimer** pr. ugedag (emp.capacity): hendes arbejde på dagen må ikke overstige
  dem, og 0 timer = fri den dag (Jonn 30.9). Kørsel tæller ikke med i dagstimerne,
  ligesom i resten af appen.
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
- **Kørselsgodtgørelse i kroner** mellem opgaverne samme dag (ikke hjemmefra/hjem):
  km × medarbejderens egen kilometersats fra `km_sats_historik`, gyldig på dagen
  (Jonn 30.9). Sammenligningen viser kroner og km, besparelsen pr. uge og et groft
  årstal (× 46 arbejdsuger, tydeligt markeret som «hvis hver uge var som denne»).
  OBS: med kroner som mål får medarbejdere med lav sats lidt mere af kørslen —
  jævn-fordelingsskyderen modvirker det.
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
