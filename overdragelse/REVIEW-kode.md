# Kodegennemgang af de tre apps

Gennemgået ved at lede efter mønstre frem for at læse 19.000 linjer. Fokus lå på den
fejltype, der faktisk har ramt jer i dag: **noget der fejler i stilhed.**

---

## Rettet undervejs

### 1. Godkendelse af løn kunne fejle uden at nogen så det

`godkFejl` blev sat seks steder i Løn data — når godkendelsen ikke kunne gemmes — men
blev **aldrig vist**. Slog den fejl, hoppede fluebenet bare tilbage, og planlæggeren
ville tro, det var et fejlklik.

Konsekvensen er ikke kosmetisk: linjen ville stå som ikke godkendt og derfor ikke komme
med i Danløn-filen. Medarbejderen ville mangle timer på lønsedlen, og ingen ville vide
hvorfor.

Det er min egen fejl fra i dag. Fejlen vises nu ved siden af godkendelsestallene.

### 2. To knapper der ikke gjorde noget, hvis det gik galt

`Opret område` og `Opret vare` kastede fejlen væk. Var navnet taget i forvejen, skete
der ingenting synligt — ingen vare, ingen besked, ingen forklaring.

Filen har allerede en `dbFail()`, som viser fejlen ordentligt, og resten af koden bruger
den. De to steder var glemt. Nu bruger de den også.

### 3. Et interval der aldrig blev stoppet

Service workerens timetjek i Worklist blev startet uden at blive ryddet op. I praksis
harmløst, fordi komponenten aldrig forsvinder — men i udviklingstilstand kører effekten
to gange, og så lå der to timere og tjekkede det samme. Nu ryddes den.

---

## Efterprøvet og i orden

**Ingen tomme `catch`-blokke** i nogen af de tre apps. Det er sjældnere, end det lyder,
og det betyder, at fejl som regel bliver håndteret et sted.

**Oprydning i Worklist er stram.** Seks lyttere tilføjes, seks fjernes. Køen til
tidsregistrering rydder både lyttere, interval og synlighedshændelse. Det er vigtigt i
netop den app: den ligger åben i en lomme hele dagen.

**Ingen hemmeligheder** i kildekode eller byggede filer. Kun den offentlige nøgle.

**TDZ-kontrollen i Worklist er ren.** Den findes, fordi I er blevet brændt før, og den
fangede faktisk et problem for mig i dag.

---

## Fundet, men ikke ændret

Jeg sletter ikke kode uden besked. Alt herunder er **beviseligt ubrugt** — ingen
henvisninger nogen steder.

| Hvad | Sted | Omfang |
|---|---|---|
| `EmployeeAppView` | Planning-App linje 4736–4890 | 155 linjer |
| `seedChecklistTemplates` | Planning-App linje 551–577 | 27 linjer |
| `scheduleWeekSimple` | Planning-App linje 4894–4912 | 19 linjer |
| `rs`, `isoWeekNumber` | Planning-App | småt |
| `Mail` i importlisten | Planning-App linje 7 | 1 |
| `LogOut` i importlisten | Worklist linje 5 | 1 |
| `fotoFremdrift` erklæret uden brug | Worklist linje 2995 | 1 |
| `dato` i importlisten | Kundeportal | 1 |

`EmployeeAppView` er den interessante: det er en hel gammel medarbejdervisning inde i
planlægningsappen, som blev afløst af Worklist. Den er død, men den er stor nok til, at
nogen kan have parkeret den med vilje. **Sig til, om den skal væk.**

---

## Det største problem er ikke en fejl

`Planning-App/src/App.jsx` er **12.810 linjer i én fil**. Komponenten `PlanningApp`
alene er 2.785 linjer.

Det er ikke i stykker, og det skal ikke laves om nu. Men det er den ting, der gør alt
andet langsommere: hver ændring kræver, at man finder rundt i en fil, ingen kan
overskue, og det er derfor, jeg tre gange i dag har rettet noget og bagefter opdaget, at
søgningen ramte bredere end tilsigtet.

Til sammenligning: Worklist er 5.341 linjer, kundeportalen 1.164.

**Jeg foreslår ikke en oprydning før produktion.** Men når I er i drift, er det værd at
tage de største stykker ud i egne filer — `OpgaveNoter` (1.318 linjer),
`TaskDetailModal` (823) og `TilbudEditor` (530) kan flyttes uden at røre noget andet.

---

## Mindre ting

**30 databaselæsninger henter ikke fejlen.** De er mindre farlige end skrivninger — en
mislykket læsning giver en tom liste i stedet for en forkert handling. Men «ingen
bestillinger» og «kunne ikke hente bestillinger» ser ens ud for brugeren. Værd at rette
løbende, ikke akut.

**Bundtstørrelser:** planlægning 811 kB, Worklist 564 kB, portal 424 kB. Det er i den
tunge ende for en telefon på mobildata. Worklist henter kun én gang takket være service
workeren, så det rammer kun første besøg.

**Fire advarsler i portalen** om at sætte tilstand inde i en effekt. Jeg har set på dem
— det er almindelig indlæsning af data, ikke fejl. Den strenge regel fanger et mønster,
der her er korrekt.

---

*Gennemgået 1. september 2026. Alle tre apps bygger uden fejl efter ændringerne.*
