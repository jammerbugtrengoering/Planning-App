# Review før produktion

Gennemgang af sikkerhed, adgangskontrol og driftsklarhed. Alt er afprøvet mod den
kørende database — ikke læst i koden og antaget.

---

## Kort fortalt

**Fundamentet er solidt.** Afgrænsningen mellem medarbejdere er tæt, portalkunder kan
ikke se hinanden, ingen hemmeligheder ligger i frontend, og alle seks natlige job kører
uden fejl.

**Tre huller er fundet og lukket** under gennemgangen. To af dem var alvorlige.

**Fem ting bør gøres, før I går fuldt produktivt.** De står nederst i den rækkefølge,
jeg ville tage dem.

---

## Lukket under gennemgangen

### 1. Nøgleboks-koder og en timeløn lå åbent tilgængeligt — ALVORLIGT

Fem backup-tabeller fra august stod **helt uden adgangskontrol**. De kunne læses af
enhver, der åbnede appen og kiggede i browserens netværksfane — ingen konto behøvedes.

| Tabel | Indhold |
|---|---|
| `backup_20260824_testadgang` | `adgangstekst` — nøgleboks-koder til kunders hjem |
| `backup_20260824_testloen` | `hourly_wage` |
| `backup_20260824_testbruger` | navn, mail, admin-flag |
| `backup_20260824_testopgaver` | 3 opgaver |
| `backup_20260823_guid_horisont` | 34 opgaver |

Alle fem har nu adgangskontrol slået til. **De bør slettes** — se punkt 1 nedenfor.

### 2. Medarbejdernes navne og mailadresser kunne hentes uden login — ALVORLIGT

`send_missing_registration_reminders` kunne kaldes af en ikke-indlogget og returnerede
modtager, mailadresse og den færdige mailtekst. Med `p_dry_run=false` og
`p_ignore_clock=true` kunne den desuden bruges til at sende påmindelsesmails på kommando.

Rettelsen afslørede en anden ting, der er værd at kende: **rettighederne lå på `PUBLIC`,
ikke på `anon`.** Første forsøg fjernede dem fra `anon`, og funktionen svarede stadig.
Det blev kun opdaget, fordi jeg prøvede efter i stedet for at tro på, at rettelsen
virkede.

Elleve funktioner er nu lukket for ikke-indloggede. `hent_portal_forside` er bevidst
undtaget — login-siden skal kunne vise kundens navn, før nogen er logget ind.

### 3. Portalkunder kunne læse hele lagerkartoteket

Fire politikker hed `emp_read`, men sagde `true` — altså **enhver der er logget ind**.
Da de blev skrevet, var alle indloggede medarbejdere, og så var det rigtigt. Det holdt
op med at være rigtigt den dag kunderne fik login, uden at en eneste linje blev ændret.

En portalkunde kunne læse 31 varer med varenumre og priser samt jeres
transportopsætning. De fire politikker kræver nu `er_medarbejder()`.

**Den slags fejl er værd at huske på:** en regel, der var korrekt, kan blive forkert af
at omverdenen ændrer sig. Hver gang en ny slags bruger får adgang, skal de eksisterende
politikker læses igennem igen.

---

## Efterprøvet og i orden

Alt herunder er prøvet ved at simulere en rigtig bruger i databasen — ikke ved at læse
politikken og vurdere, at den ser rigtig ud.

**En almindelig medarbejder (Nadine) kan ikke se:** lønhistorik, lønsatser, lønarter,
løngodkendelser, portalbrugere, kundebestillinger, kundeadgangskoder, tilbud, andres
kørsel eller andres telefoner. Hun ser sin egen hjemmeadresse og intet andet.

**En portalkunde kan ikke se:** andre kunders opgaver, brugere eller abonnementer,
jeres medarbejdere, kundekartotek, aftaler, priser, adgangskoder eller interne noter.

**Frontend indeholder ingen hemmeligheder.** Kun den offentlige nøgle, som den skal
være. Ingen service-nøgle i hverken kildekode eller de byggede filer.

**Tilbudslinket til kunder er ordentligt bygget:** adgangen er nøglen i linket,
databasefunktionerne er lukket for alle andre end bagsiden, PDF'en udleveres som en
midlertidig adresse der udløber efter en time, og IP-adressen på en accept tages fra
serveren og ikke fra det, browseren sender — så beviset ikke kan skrives af den, der
bestrider det bagefter.

**Alle seks natlige job kører uden fejl.** Helsetjekket fanger, hvis et af dem holder op.

---

## Anbefalinger før fuld produktion

### 1. Slet de fem backup-tabeller

De er låst nu, men de indeholder nøgleboks-koder og en løn, og de har ingen funktion.
Data, der ikke findes, kan ikke lækkes. Sig til, så laver jeg det — jeg sletter ikke
data uden besked.

### 2. Slå anonyme logins fra

Supabase advarer om, at anonyme logins er tilladt. Det betyder, at enhver kan få et
gyldigt «indlogget» token uden konto — og næsten alle jeres politikker giver adgang til
netop `authenticated`. Det er en indstilling i Supabase under Authentication, og den kan
jeg ikke ændre herfra. **Tjek den, og slå den fra hvis I ikke bruger den.**

### 3. Slå beskyttelse mod lækkede adgangskoder til

Supabase kan tjekke nye adgangskoder mod kendte læk. Det er ét flueben og gratis. Særligt
relevant nu, hvor sytten medarbejdere skal vælge en adgangskode.

### 4. Beslut hvor længe adgangskoder skal gemmes

Der ligger **1.976 rækker med adgangsoplysninger** på opgaver — nøglebokskoder og
lignende. Opgaver slettes aldrig, kun markeres, så de vokser for evigt. Fotos ryddes
allerede natligt; det gør koderne ikke.

Det er ikke et hul i dag, men det er en voksende mængde af det mest følsomme, I har. Jeg
foreslår, at koder på udførte opgaver ældre end fx tre måneder ryddes automatisk — de
findes stadig på aftalen.

### 5. Kontrollér at backup er slået til hos Supabase

Jeg kan se, at jobbene kører, men ikke om projektet har point-in-time recovery. Med løn-
og kundedata i basen bør det være på plads, før I går produktivt.

---

## Mindre ting, der kan vente

**Tilbudslinket har ingen hastighedsbegrænsning.** Nøglen er lang nok til, at gætteri er
urealistisk, men portalens login har en grænse, og den her har ikke. Værd at ensrette.

**~~Fire databasevisninger kører med ejerens rettigheder~~** — *lukket 16. september
2026.* De var åbne for enhver med et login, og det inkluderer medarbejderne: Nadine
har et Worklist-login og kunne med det læse hele kundebogen med omsætning pr. kunde.

- `aktive_medarbejdere` er **slettet**. Den blev ikke brugt af nogen af de tre apps,
  af nogen databasefunktion, politik eller visning — og gav medarbejdernes mails,
  deres auth-id og hvem der er administrator til enhver med et login.
- `kundeoversigt` og `kunder_med_opgaver` har fået `is_admin()` ind i selve visningen.
  Planlæggerne ser præcis det samme som før; alle andre får en tom liste.
- `portal_opgaver` er urørt. Den er ment som den er — kundens eget vindue, filtreret på
  `current_portal_guid()`. Uden ejerens rettigheder ville den ikke virke, for kunden
  har ingen adgang til `instances`.

> Supabases Security Advisor **bliver ved med at melde de tre resterende** som fejl.
> Den kan ikke se spærringen inde i visningen. Lav dem ikke om til `security_invoker`
> for at få advarslen væk — så holder kundeportalen op med at virke. Efterprøvet som
> både planlægger og medarbejder, rullet tilbage bagefter.

**~~To funktioner mangler fast `search_path`~~** — *lukket 16. september 2026.* Fire
i alt: `iso_week_monday`, `instance_date`, `maanedsluk_periode` og `vaern_om_tjekliste`.

---

*Gennemgået 1. september 2026. Alle prøver kørt mod den rigtige database og rullet
tilbage bagefter.*
