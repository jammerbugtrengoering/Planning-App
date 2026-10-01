# Plan: Konkrete datoer på en aftale

Gennemgået 1.10.2026.

**Bygget 1.10.2026 (Jonn):** formularen skjuler ugedagene ved «Konkrete datoer» (de huskes og
kommer igen ved en fast rytme), hver dato har klokkeslæt + opgavetid (`min`, udfyldt med
aftalens varighed, kan rettes), stylede knapper, og Gem kræver mindst én dato i stedet for en
ugedag.

**Bygget 1.10.2026, resten:** CHECK-reglen tillader `konkrete_datoer` (begge databaser),
listen gemmes renset (`rensKonkreteDatoer`) og hentes; start/udløb = første/sidste dato,
`days` = ugedagene datoerne falder på; `aftaleKoererPaaDag` kører kun på listens datoer
(14 nye tests); opgaven får datoens klokkeslæt og opgavetid; rettelser på en godkendt aftale
følger med (ny dato dannes, fjernet dato ryddes, ny tid/varighed rettes på opgaven); kontrol af
dubletter og passerede datoer; aftalelisten viser «📅 Konkrete datoer (n) · næste …»;
kontraktsum pr. dato. Ikke gjort: medarbejder pr. dato, kundeportal, tilbud. Ikke afprøvet i
browseren endnu.

Idé (Jonn 1.10): aftaletypen kan udvides til et **klippekort** — et antal rengøringer, der
placeres på datoer efterhånden. Ikke besluttet.

## Hvad der er lavet (20.9.2026, commit b9380de m.fl.)

- Knappen «Konkrete datoer» under Plan parametre og en liste med dato + klokkeslæt
  (Tilfoej dato / Slet).
- Feltet `konkreteDatoer` i formularen og i appens hukommelse.
- `weeksUntilExpiry` danner ugerne ud fra datoerne.
- Kontraktværdien regnes som pris pr. besøg × antal datoer.
- Hjælpeteksten «Konkrete datoer» under Aftaler.
- Kolonnen `service_templates.konkrete_datoer` (jsonb) findes i databasen.

## Hvorfor det ikke virker i dag

1. **Databasen afviser det.** CHECK-reglen på `plan_interval` tillader kun
   `uge, 14_dage, 4_uger, 6_uger, maaned, 3_maaned`. En aftale med «Konkrete datoer»
   kan ikke gemmes. Ingen aftale bruger det i dag (0 rækker).
2. **Datoerne bliver aldrig gemt.** Hverken oprettelse (`service_templates.insert`) eller
   rettelse (`updateTemplate`) skriver `konkrete_datoer`.
3. **Datoerne bliver aldrig læst.** Indlæsningen af aftaler mapper ikke
   `konkrete_datoer` → `konkreteDatoer`, så listen er tom, når aftalen åbnes igen.
4. **Opgaverne dannes forkert.** `aftaleKoererPaaDag` (src/aftalerytme.js) kender ikke
   konkrete datoer:
   - uden ugedage dannes ingen opgaver
   - med ugedage kører aftalen hver uge på de dage
   Klokkeslættet pr. dato bruges heller ikke; `ensureWeekInstances` tager `dayTimes[dag]`.
5. **Formularen er halvfærdig.**
   - Ugedage, tid/varighed pr. ugedag og udløbsdato vises stadig, selvom de ikke bruges.
   - Ingen kontrol af tom liste, datoer i fortiden eller dubletter.
   - Knapperne er ustylede, og teksten «Tilfoej dato» mangler æ.

## Det, der skal bygges

### 1. Database (begge databaser)
- Tilføj `konkrete_datoer` til CHECK-reglen på `plan_interval`.
- Format: `[{ "dato": "2026-10-14", "tid": "09:00", "min": 120 }]`. `min` er valgfri;
  er den tom, bruges aftalens varighed.
- Kundedatabasen: kontrollér, at kolonnen findes, og tilføj den, hvis den mangler.

### 2. Gem og hent
- Skriv `konkrete_datoer` ved oprettelse og rettelse, og læs det ved indlæsning.
- Sorter listen efter dato, når den gemmes.
- Sæt `start_date` = første dato og `expiry_date` = sidste dato automatisk. Så virker
  «udløber snart», aftalelisten og kontraktværdien uden særregler.

### 3. Dannelse af opgaver (`aftalerytme.js`)
- Ved `konkrete_datoer`: aftalen kører på en dag, hvis og kun hvis dagens dato står på
  listen. Ugedage kræves ikke.
- Opgaven får datoens klokkeslæt som `scheduledTime` og datoens minutter som varighed.
- `excludedDays`, kladde, «slettes» og ophørsdato gælder som for de andre rytmer.
- Tests i `aftalerytme.test.mjs`:
  - kun de datoer på listen, også i weekend og hen over årsskiftet
  - klokkeslæt og minutter pr. dato
  - ugedage ignoreres

### 4. Ret listen på en godkendt aftale
Samme regel som resten af appen: udførte opgaver og opgaver med registreret tid røres
aldrig.
- **Ny dato:** opgaven dannes.
- **Slettet dato:** den kommende, ikke-udførte opgave slettes. Har den en medarbejder,
  vises en advarsel først.
- **Ændret dato eller klokkeslæt:** opgaven flyttes, og medarbejderen beholdes, hvis hun
  kan; ellers havner opgaven i «Ikke tildelt».
- Medarbejderen får besked gennem den eksisterende push_plan_koe-trigger.
- Det hele kommer i ændringsloggen (etiketten «Datoer» findes allerede).

### 5. Formularen
- Ved «Konkrete datoer» skjules:
  - ugedage
  - tid/varighed pr. ugedag
  - udløbsdato
- Startdatoen vises som «første dato» (kun til læsning).
- Én linje pr. dato: dato, klokkeslæt, minutter (valgfri) og ✕. «+ Tilføj dato» foreslår
  datoen ugen efter den sidste.
- Kontrol, før der kan gemmes:
  - mindst én dato
  - ingen datoer i fortiden på en ny aftale
  - ingen dubletter
- Kladder: `nyStartdatoHvisPasseret` skal ikke flytte noget. Passerede datoer markeres
  i stedet, så de kan rettes eller slettes.

### 6. Visning
- Aftalelisten: rytmen vises som «Konkrete datoer (8) · næste 14. okt.».
- Kundekortet og kontraktværdien: tjek, at antallet af besøg passer.

### 7. Hjælp og øvelse
- Ret hjælpeteksten «Konkrete datoer», når det virker: tid og varighed pr. dato, og hvad
  der sker, når en dato slettes eller flyttes.
- Worklist: ingen ændring (opgaven ser ud som alle andre).
- Prøveugen: evt. en øvelse senere.

## Rækkefølge
1 → 3 (med tests) → 2 → 5 → 4 → 6 → 7. Det kan bygges og afprøves på en kladde, uden at
nogen eksisterende aftale påvirkes, fordi ingen bruger rytmen i dag.

## Spørgsmål til Jonn/Charlotte, før der bygges
1. ~~Egen varighed pr. dato?~~ Ja (Jonn 1.10): opgavetid pr. dato, udfyldt med aftalens varighed.
2. Skal en dato også kunne have sin egen medarbejder, eller gælder aftalens faste
   medarbejder?
3. Skal kunden selv kunne melde datoer ind, fx sommerhusudlejning via kundeportalen?
   Det er en senere fase.
4. Skal «Konkrete datoer» også kunne vælges på et tilbud (tilbud.plan_interval)?
