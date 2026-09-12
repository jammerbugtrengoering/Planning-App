# Plan: Worklist på mobiler med dårlig dækning

Gælder iPhone og Android. **Afløser `PROMPT-tablets-og-offline.md`**, som byggede på
Android-tablets med SIM og bevidst udskød skrivekøen. Den forudsætning er ændret.

Alt i "Det målte grundlag" er læst ud af koden og databasen, ikke gættet.

---

## Det målte grundlag

Worklist skriver elleve steder. De deler sig skarpt efter om en gentagelse gør skade.

| Skrivning | Tåler gentagelse | Hvorfor |
|---|---|---|
| `append_time_log` | **Nej** | Lægger til. En gentagelse giver 120 min i stedet for 60 — direkte i løn og på faktura |
| `consume_stock` | **Nej** | Trækker fra lageret |
| `inventory_transactions.insert` | **Nej** | `id` har `gen_random_uuid()` som standard, altså nyt id hver gang |
| `task_notes.insert` | **Ja, med upsert** | `id` har ingen standardværdi — det laves allerede på telefonen |
| `reschedule_requests.insert` | **Ja, med upsert** | Samme |
| Fotoupload | **Ja** | Stien er `<opgave-id>/<notat-id>-<nr>.jpg` og dermed fast |
| `set_employee_task_status` | Ja | Sætter en boolsk værdi |
| `instances.update(checklist)` | Ja, men sidste skriver vinder | Se åbne spørgsmål |
| `instances.update(nexus_confirmed)` | Ja | |
| `task_notes.update(photos)` | Ja | |
| `employees.update(default_lang)` | Ja | |

To af de fem indsættelser er altså allerede idempotente. De skal bare skifte fra
`insert` til `upsert`.

**Den farlige er `append_time_log(p_instance_id, p_minutes, p_emp_id, p_note)`.**
Den skal have et id fra enheden, og databasen skal afvise et id den har set før.
Det er en ændring i databasen, ikke kun i appen.

---

## Adgangsoplysninger — besluttet

`hent_adgangsinfo` henter nøgleboks- og alarmkoder og skriver samtidig en linje i
`access_log`. Den kan ikke bare caches: så var hele adgangskontrollen sat ud af kraft.

**Pointen er at opslaget bliver logget — ikke at det skal ske ved døren.** Henter
medarbejderen koden mens hun har dækning, står opslaget i loggen præcis som nu.

Sådan bygges det:

- Appen minder om det, mens der er dækning: står der en opgave på dagens liste hvor
  adgangsoplysningerne ikke er hentet, siges det tydeligt inden hun kører
- **Koden gemmes på telefonen dagen ud og ryddes automatisk om natten** (besluttet af Jonn)
- Cachen ryddes også ved log ud
- Loggen skal skelne mellem *hentet på forhånd* og *slået op ved døren*, ellers kan man
  ikke længere se af loggen hvornår nogen faktisk stod ved kunden
- Nødudgangen er en besked om at ringe til kontoret, med nummeret stående i appen så det
  også kan læses offline

**Persondata:** kundernes nøglebokskoder ligger dermed på en privat telefon en hel
arbejdsdag. Det er borgeres og ældres hjem. Ordningen skal stå i jeres dokumentation.

Tale og SMS virker ved langt svagere signal end data, så "ring til kontoret" duer i de
fleste huller. I et rigtigt dødt hul virker heller ikke det — derfor er det nødudgangen
og ikke løsningen.

---

## iOS bestemmer tempoet

**Appen skal installeres på hjemmeskærmen.** iOS rydder lokale data for websteder der
ikke er brugt i syv dage. Installerede web-apps er undtaget. Uden installation forsvinder
køen for en medarbejder der har haft fri en uge. Det er et krav, ikke en anbefaling.

**iOS spørger ikke selv.** Medarbejderen skal trykke Del → Føj til hjemmeskærm. For folk
der ikke er it-kyndige er det en oplæringsopgave med skærmbilleder — ikke en linje i
hjælpen.

**Der findes ingen baggrundssynkronisering på iOS.** Køen kan kun tømmes når appen er
åben. En medarbejder der lukker appen i en kælder, får først sendt sine registreringer
næste gang hun åbner den. Appen skal sige det tydeligt, ikke bare gøre det.

---

## Rækkefølgen

### 1. Installerbar og opdaterbar
Service worker med `vite-plugin-pwa`. Ny version hentes i baggrunden og vises som
**"Ny version klar — tryk for at opdatere"**.

Uden det bytter vi "blank skærm uden dækning" ud med "hele holdet kører på en tre dage
gammel version", og det er værre. I dag rettes fejl i produktion flere gange om dagen med
"hent siden med ?v= bagpå" — den vej findes ikke længere.

Hertil: vejledning med skærmbilleder til Føj til hjemmeskærm, både iPhone og Android.

### 2. Offline læsning af dagens opgaver
Ugens opgaver gemmes lokalt, så dagslisten kan tegnes uden forbindelse. Vis tydeligt at
det er en gemt kopi og hvornår den blev hentet.

Adgangsoplysninger følger reglerne ovenfor og ikke den almindelige cache.

### 3. Idempotens i databasen — før køen
Skal ligge **før** punkt 4. Bygges køen først, er der en periode hvor en gentagelse kan
fordoble en lønudbetaling.

- `append_time_log` og `consume_stock` får et id fra enheden og afviser en gentagelse
- `inventory_transactions` får sit id fra enheden
- `task_notes` og `reschedule_requests` skifter fra `insert` til `upsert`
- Fotoupload behandler "findes allerede" som succes i stedet for fejl

### 4. Selve køen
Skrivninger lægges i IndexedDB og sendes når der er dækning. Fotos skal med, og de fylder
— komprimeringen findes allerede.

I appen: hvor mange venter, hvornår blev der sidst sendt, og en tydelig besked når noget
ikke er kommet af sted endnu.

### 5. Måling
En linje hver gang en skrivning fejler på grund af manglende forbindelse. Formålet er at
kunne se efter en måned om det sker to gange eller to hundrede — så beslutninger kan
træffes på tal.

---

## Åbne spørgsmål

**Hvilket klokkeslæt gælder?** Registreres 60 minutter kl. 14 uden dækning og sendes kl.
19 — tæller det som 14 eller 19? Det har betydning for løn og fakturering. Telefonens ur
kan desuden være forkert eller bevidst stillet.

**Tjeklisten når to er på opgaven.** Sidste skriver vinder i dag. Er begge offline og
sætter hver sine flueben, forsvinder den enes. Ikke farligt, men det ligner en fejl for
dem der oplever det.

---

## Sådan arbejdes der

- Undersøg den faktiske kode og de faktiske data før du foreslår noget
- Læs det virkelige svar fra et API før du konkluderer hvad der er galt
- Afprøv før deploy, og helst uden at ændre i produktionsdata
- Tag backup i databasen før du sletter eller masseopdaterer
- Skriv kommentarer på dansk der forklarer **hvorfor**, ikke hvad
- Fortæl ærligt når noget gik galt, og hvad det kostede
- Spørg når et valg er forretningsmæssigt frem for teknisk
- **Opdatér altid hjælpen i begge apps når funktionalitet ændres**

## Om afprøvning

Et grønt build beviser kun at der ikke er syntaksfejl. Appen har to gange på én dag været
helt blank i produktion efter et rent build. `oxlint` med `no-undef` er koblet på
`npm run build` og stopper Netlify-buildet ved en manglende variabel — men den fanger
ikke en variabel der bruges før den er erklæret.

Service workere og offline-køer ser rigtige ud på udviklerens maskine og opfører sig
anderledes på en rigtig telefon. **Bed om afprøvning på en rigtig enhed før noget kaldes
klar.**

Det Jonn skal teste, og som ikke kan testes herfra:

- Appen installeret på hjemmeskærmen, åbnet i flytilstand — på **både** iPhone og Android
- En ny version deployet: kommer opdateringsbeskeden, og hvor hurtigt?
- Appen lukket helt ned og åbnet dagen efter — er den stadig opdateret?
- Dagens liste uden dækning
- Et billede taget og sendt mens forbindelsen falder ud undervejs
- En tidsregistrering lagt i kø, appen lukket, telefonen genstartet, appen åbnet igen —
  kommer registreringen af sted, og **kun én gang?**
- Adgangskoden hentet om morgenen, brugt om eftermiddagen uden dækning, væk næste morgen

## Teknisk baggrund

- **Worklist:** repo `jammerbugtrengoering-Medarbejder-App`, hele appen i `src/App.jsx`.
  React 19 + Vite, Netlify-site `jammerbugtrengoering-service`, auto-deploy fra `main`
- **Planlægningsappen:** repo `Planning-App`, site `jammerbugtrengoering-planning`.
  Skal formentlig ikke røres her
- **Supabase:** projekt-ref `gteowfoahsfpunzgdxum`. Adgangsstyring med RLS i databasen
- Begge repoer: `npm run build` kører `oxlint && vite build`. `npm run build:kun`
  springer linteren over
