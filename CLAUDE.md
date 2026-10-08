# Planlægningsappen — læs det her, før du retter noget

Det her er den eneste fil, en Claude læser af sig selv. Derfor står det vigtigste her og
ikke i en undermappe. Den længere baggrund ligger i `overdragelse/` — men intet i den
mappe bliver åbnet, medmindre nogen beder om det, så alt, der skal virke uden at nogen
husker det, skal stå her.

Appen er i drift. Netlify lægger ud, så snart der er pushet, og kontoret arbejder i den
inden for et par minutter. Der er ingen testopsætning imellem.

---

## Slå op efter det, du skal lave

De her lister er samlet af fejl, der faktisk er sket. De er ikke almindeligheder, og de
kan ikke gættes ud fra koden — hvert punkt er der, fordi noget gik galt uden det.

### Du ændrer noget om, HVORNÅR en aftale kører

Rytme, interval, startdato, udløb, udeladte dage. **Fire ting, og de hænger sammen:**

1. **`src/aftalerytme.js`** er reglen. Ikke App.jsx. Funktionen `aftaleKoererPaaDag`
   afgør både hvilke opgaver der bliver **oprettet**, og hvilke der bliver **ryddet væk**
   igen. Retter du kun App.jsx, bliver opgaverne dannet ét sted og fjernet et andet.
2. **`ugerFra`/`maanederFra`/`intervalNoegle` i samme fil** (siden 5.10.2026 en regel i
   stedet for en tabel: `N_uger` 1-52, `N_maaned` 1-12, plus de gamle `uge` og `14_dage`).
   Står en værdi ikke i reglen, falder den tilbage på `|| 1` — altså **hver uge**, uden fejl
   og uden advarsel. Sker det på en aftale, der skulle køre to gange om året, bliver det til
   26 besøg. **Formularen skriver kun værdier gennem `intervalNoegle()`**, og testen kører
   hver mulig værdi igennem. Skriv aldrig en intervaltekst i hånden. En browserfane med den
   gamle kode kender kun `uge`, `14_dage`, `4_uger`, `6_uger` og `3_maaned` — de andre
   falder tilbage på hver uge, indtil fanen er genindlæst (se `src/nyversion.js`).
   **Databasen har en egen kontrol, `service_templates_plan_interval_check`** (regex, ikke en liste, siden 5.10.2026).
   Ændres reglen i `ugerFra`/`maanederFra`, skal kontrollen ændres med (`overdragelse/sql/plan-interval-regel-2026-10-05.sql`),
   ellers afviser databasen værdien, og «Gem» ser ud til at gøre intet.
3. **`aftalerytme.test.mjs`.** Filens egen første sætning beder om det. Kør
   `node aftalerytme.test.mjs`.
4. **Hjælpeteksten** i `MODULE_HELP` — og skriv, hvad rytmen gør ved årets besøg, ikke
   bare hvad den hedder.

> 20.9.2026 blev «Konkrete datoer» lagt ind som ny rytme uden punkt 1–3. Resultatet var,
> at den enten dannede en opgave hver uge i et år, eller slet ingen — aldrig datoerne på
> listen.

### Du tilføjer en kolonne til en tabel

**Fire steder, og de to midterste bliver glemt hver gang:**

1. Kolonnen i Supabase (via `apply_migration` — se nedenfor)
2. **INSERT-listen** i `saveTask` i `src/App.jsx`. Er feltet ikke med, bliver det aldrig
   gemt.
3. **Indlæsningen** i `loadAll` i samme fil, hvor rækken laves om til et JS-objekt. Er
   feltet ikke med, er det væk, næste gang siden hentes.
4. Beregninger, der bruger værdien — kontraktsum, portefølje, rapporter

Hører kolonnen til **`instances`**, skal den også med i visningen **`instances_let`**.
Planlægningsappen henter derfra ved opstart. Er kolonnen ikke i visningen, findes den
ikke for planlæggeren, og første gang appen gemmer opgaven, bliver feltet nulstillet.
`select * from instances_let_mangler();` siger, hvad der mangler.

Morgentjekket melder den nye kolonne som uklassificeret persondata. Den besked holder
først op, når nogen har taget stilling — også hvis svaret er «ikke personoplysninger».

> 20.9.2026 fik `konkrete_datoer` sin kolonne og sin brugerflade, men hverken punkt 2
> eller 3. Datoerne forsvandt, når vinduet blev lukket, og aftalens værdi blev 0 kr.

**Punkt 3 er den, der gør mindst væsen af sig.** Databasen skriver `po_number`, appen
læser `t.poNumber`. Mangler oversættelsen, er feltet bare tomt — ingen fejl, ingen
advarsel. Og er det et felt, selvhelbredelsen også sætter, går det i ring: den fylder
feltet ud fra aftalen, sammenligningen ser en forskel, opgaven skrives — og næste
opstart taber oversættelsen igen.

> 21.9.2026 manglede `po_number`, `video_url` og `dinero_contact_guid`. Resultatet var
> **cirka 200 skrivninger ved hver eneste opstart**, med nøjagtig de værdier der stod
> der i forvejen, målt tre gange: 202, 411, 201. Det alvorlige var ikke tiden.
> `poNumber` bærer borgerens navn på kommunens opgaver og ender som kommentar på
> fakturalinjen i Dinero — og selvhelbredelsen springer opgaver med registreret tid
> over, altså netop dem der skal faktureres.

`node indlaesning.test.mjs` håndhæver reglen: hvert felt, selvhelbredelsen rører, skal
findes i oversættelsen. Den kører med i `npm run build`.

### Du rører noget, der danner eller viser opgaver

**Opgaverne hentes i to runder.** Først ugerne omkring i dag (cirka 1.300 af 10.700),
så ugeplanen kan tegnes med det samme. Resten kommer bagefter i baggrunden.

Det gør én ting farlig: **`ensureWeekInstances` kan ikke se forskel på «pladsen er
tom» og «ugen er ikke hentet endnu».** Kører den på halve data, opfinder den dubletter
i en plan, nogen arbejder i — og sender dem ud på medarbejdernes telefoner.

Værnet er `hentedeUger` i `src/App.jsx` og reglen i **`src/vindue.js`**: er ugen ikke
hentet helt, dannes der ingenting i den. Rører du noget i den kæde, så lad værnet være,
og kør `node vindue.test.mjs`.

To ting følger med:

- Regner din nye side på **alle** opgaver, skal den stå i `SIDER_DER_KRAEVER_ALT`.
  Ellers viser den et tal bygget på en femtedel af data, uden at sige det.
- Hæver du `HORIZON_WEEKS`, skal `UGER_FREM` i `src/vindue.js` følge med.
  `indlaesning.test.mjs` fejler, hvis du glemmer det.

> 21.9.2026: opstarten tog knap 12 sekunder, fordi alle 10.893 opgaver blev hentet —
> 6,4 MB i elleve sider — mens planlæggeren sad og kiggede på én uge. 82 % af dem var
> 2027 og 2028, fordi en aftale danner hele sin løbetid, når den oprettes.

### Du rører Personalemappen, HR eller MUS

Tre apps hænger sammen: **planlægningsappen** (HR-siden, ikon i topbjælken, kun `er_hr_admin()`), **Worklist** (lederen skriver MUS-referat) og **Personalemappen**
(`jammerbugtrengoering-personalemappen`, medarbejderens egen app, samme Supabase `gteowfoahsfpunzgdxum`). Baggrunden står i `overdragelse/STATUS-2026-10-03.md` og SQL-loggen
`overdragelse/sql/tilbudslister-og-godkend-for-kunden-2026-10-05.sql`.

- **HR-administratorer** står i tabellen `hr_administratorer` (Charlotte, Karen, Udvikler IT). Alt HR-relateret tjekker `er_hr_admin()`; medarbejderappen bruger kun security-definer-funktioner.
- **`mus_samtaler` har ingen direkte adgang for login-brugere.** Forberedelsen er medarbejderens egen, til hun trykker «Del med kontoret». Læs kun gennem `mus_for_opgave`, `min_mus_samtaler`, `hr_mus_samtaler`.
- **Referatet skrives af lederen** (`gem_mus_referat`; HR kan også, i planlægningsappen). **Medarbejderen kan aldrig skrive eller sende sit eget** — rollen i `mus_for_opgave` er leder / medarbejder / hr efter selve samtalen, ikke efter HR-status.
  Før 6.10.2026 fik en HR-administrator, der selv var medarbejderen, rollen leder og kunne sende sit eget referat. Send = samtalen holdt + aktiviteten lukket for begge; medarbejderen godkender (låst) eller skriver bemærkning.
- **MUS-aktiviteten kendes på titlen `MUS: navn`** (`addActivity`). Worklist åbner `MusSkaerm` på den titel; ændres titlen, skal ruten i Worklist med.
- **MUS-spørgsmålene (q1–q5), `NAESTE_BESOEG_TEKST` og lønperiodereglen står flere steder** — ret alle.
- **Alt under «Noget nogen skal tage stilling til» på Drift skal også i klokken** (Jonn 8.10.2026), undtagen det, der løser sig selv (medarbejdere uden mail, i takt med onboarding). Ellers ser kun dem, der selv åbner Drift, det. Ny linje: art `drift`, egen `ref`, lukker sig selv ved 0 (se `overdragelse/sql/klokken-drift-kladder-og-postnummer-2026-10-08.sql`).
- **Klokken (`kontor_indbakke`) rettes med `pg_get_functiondef` + `replace()` før `-- 7. Fejl i data`** i en migration (se SQL-loggen); skriv linjen i `gaaTilIndbakkeLinje` også.
- **apply_migration hænger på DROP, DELETE (også ordet i funktionstekst) og DROP POLICY.** Brug `create or replace`, `ALTER POLICY` og `execute 'de' || 'lete ...'`. Tjek bagefter, om den alligevel nåede at køre, før du prøver igen. `execute_sql` returnerer kun sidste sætning.
- **Hver ny kolonne skal klassificeres i `persondata_register`**, og hjælpeteksten (`MODULE_HELP`, i Worklist `HELP_DA` og `HELP_EN` med lige mange afsnit) følger med hver ændring.
- **Medarbejdere oprettes og får rettet navn/personoplysninger kun i Personalemappen** (HR-administratorer, Jonns beslutning 7.10.2026). Opsætning → Medarbejdere har ikke «Ny medarbejder» og ingen Person-fane; kortet åbner på Planlægning, og under Adgang oprettes login til Worklist.
- **Områder kan slås fra (`firma.brug_omraader`, 7.10.2026).** Al planlægning går gennem `candidatesFor`, som ser bort fra områderne, når `omraaderIBrug()` er falsk; ugeplanen og medarbejderlisten skjuler filtrene. Ny vej, der bruger `areas`/`employeeAreas` direkte, skal også tjekke `omraaderIBrug()`. Kolonnen er kun lagt i Jammerbugts database; mangler den i en kundedatabase, regnes områder for slået til.
- **Varsel på ferie og fri står i `firma.ferie_varsel_dage` (28) og `fridag_varsel_dage` (10)**, rettes under Opsætning → Ferie og fravær (ikke på anmodningssiden under Personalemappen), og læses af `anmod_fravaer` og `fravaer_varsel()` (Personalemappen). En for sen anmodning afvises ikke; den gemmes med `for_sent` og kontoret afgør, men `anmod_fravaer` kræver en grund på mindst 20 tegn (Personalemappen-appen viser en advarsel og kræver det samme). Kun Jammerbugts database har kolonnerne endnu; kundeudgaven falder tilbage på 28/10 i appen.
- **Håndbøger har status `kladde` / `aktiv` / `udgaaet` (`haandbog_dokumenter.status`, `saet_haandbog_status`).** Nye dokumenter starter som kladde. Medarbejderne læser tabellerne direkte, så skjulningen står i læsepolitikkerne (`laes_medarbejder`) — ny vej, der læser håndbogen, skal også kræve `status = 'aktiv'`. Kun aktive tæller i `mine_haandbog_kvittering` og klokken. Intet slettes. **HR-administratorer kan læse alt gennem `hr_admin_skriv`, så Personalemappen-appen filtrerer selv på `status = 'aktiv'`** — ellers ser HR kladder og udgåede dér (rettet 7.10.2026).
- **Skriv aldrig «hun», «han» eller «hende» i tekster, brugeren ser** (Jonns beslutning 7.10.2026: der er mænd i virksomheden). Brug «medarbejderen», «kunden», «borgeren», «vedkommende».
- Ikke bygget endnu: opbevaringsfrister og sletning af dokumenter, push til medarbejderen ved afgjort ferieanmodning, ferieblokering i databasen (nu i klienten via `addBlock`), stillingsfelt.
  MUS-flowet er afprøvet med en rigtig leder og en rigtig medarbejder (7.10.2026, Jonn). Supabase Redirect URLs skal indeholde Personalemappens adresse.

### Du rører ved tidsregistrering for Nexus eller Ældrelov

**Opgaver med kontrakttype `nexus` eller `aeldrelov` registreres altid til den aftalte tid** (Jonns beslutning 7.10.2026). Aftalt tid = medarbejderens andel i `tid_fordeling`, ellers `duration`; er den 0, er tiden ikke fast.
Reglen står i databasen (`fast_tid_min`, brugt af `afslut_tid`, `append_time_log` og `ret_systemlukket_tid`), fordi en gammel browserfane eller telefon ellers stadig sender den tid, der blev tastet. Ny registrering er idempotent pr. medarbejder: en anden afslutning tilføjer intet.
Worklist springer tidstrinnet over (`fastTid` i `AfslutOpgave`), planlægningsappen låser timerne i papirskemaet. Overstyring sker kun med `efterreguler_tid` (planlægger, logges). Tidligere registreringer er ikke ændret.
Ny vej, der skriver `time_log`, skal også gå gennem `fast_tid_min` — ellers findes der en vej uden om reglen.

### Du retter i databasen

`execute_sql` i Supabase-værktøjet er **skrivebeskyttet**. Ethvert `insert`, `update`,
`delete` eller `create` skal gennem `apply_migration`. Det er ikke en forhindring, det er
en fordel: migrationen bliver stående med sin forklaring, og om et halvt år kan man se
hvorfor.

Skriv **hvorfor** i migrationen, ikke hvad. SQL'en siger selv hvad.

**Claude kan ikke slette i databasen.** Værktøjet afviser enhver migration med `delete`
eller `drop` — også inde i en funktionstekst — mens `insert` og `update` går igennem.
Læg sletningen som fil i `overdragelse/sql/` og lad Jonn eller Charlotte køre den i SQL
Editor. Indsæt ikke testrækker for at prøve det af; de kan ikke fjernes igen herfra.

> 7.10.2026: en testrække blev sat ind i `arketyper` i SoMe-databasen; sletningen kom
> tilbage som «cancelled». Samme mønster som `drop table` fire gange 4.10.

**En upsert på `instances` skal sende hele rækken.** Sender den kun nogle af kolonnerne,
fejler den *altid* — også når rækken findes i forvejen. Postgres tjekker NOT NULL på den
række, der ville blive indsat, før den opdager at id'et er taget, og `title`, `type`,
`week` og `duration` har ingen standardværdi. Skal kun nogle felter skrives, så brug
`.update(...).in("id", ...)` eller `rpc("opdater_arvede_felter", ...)`.
`node indlaesning.test.mjs` fejler, hvis nogen skriver en delvis upsert igen.

> 23.9.2026: `gemArvedeFelter` havde brugt en delvis upsert i tre uger og slugt fejlen.
> Selvhelbredelsen gemte aldrig noget, og 4.145 opgaver stod uden telefon, e-mail og
> kontaktperson fra deres aftale — eller med forkert kontrakttype. Natjobbet
> `arvede-felter-sync` havde samme fejl. Og en fejl, der ikke siges højt, er ikke en fejl,
> der ikke sker — den er bare en, ingen retter.

**En ny `security definer`-funktion kan kaldes uden login, indtil du lukker den.**
Supabase giver `anon` adgang gennem `PUBLIC`. Skriv derfor altid, i samme migration:

    revoke execute on function public.<navn>(<typer>) from public, anon;
    grant execute on function public.<navn>(<typer>) to authenticated, service_role;

Triggerfunktioner lukkes også for `authenticated` — de skal aldrig kaldes direkte.
Kun de funktioner, loginsiderne og RLS-politikkerne har brug for, er åbne for `anon`
(`firma_offentlig`, `hent_portal_forside`, `is_admin`, `current_*`, `er_medarbejder`,
`modul`, og i kundedatabasen `current_firma_id` og `firma_efter_slug`). Tjek
bagefter med `get_advisors` — listen over funktioner, `anon` kan kalde, skal være
præcis den.

> 3.10.2026 stod 30 funktioner åbne for `anon` (31 i kundedatabasen). Intet hul —
> de skrivende funktioner tjekkede selv — men det var held, ikke design.

**Kun én ad gangen rører databasen.** Koden kan rulles tilbage; en tabel, der er lavet om,
mens den andens app kørte på den gamle form, kan ikke.

### Du rører ved timepriser eller noget, der regner kroner ud

**Timepriserne har gyldighedsdato** (3.10.2026). De ligger i `timepris_satser`
(kontrakttype, sats, `gyldig_fra`) i begge databaser — **ikke** i `pricing`, som er
forældet og ikke læses. En opgave prissættes med satsen på **opgavens egen dato**:
`satsForOpgave(t)` i `src/App.jsx`, logikken i `src/timepriser.js`
(`node timepriser.test.mjs`).

- Regner du kroner ud for en bestemt opgave, så brug `satsForOpgave(t)` — aldrig
  `pricing[type]`. `pricing` er kun dagens satser, til forslag på tilbud og overslag
  over en aftales fremtid.
- **En faktureret opgave må aldrig skifte beløb.** Triggeren `timepris_laas` afviser
  en sats, der oprettes, rettes eller slettes med en dato, der rammer en opgave sendt
  til Dinero (i kundeudgaven: markeret som fakturagrundlag). Startsatsen kan ikke
  slettes. Lav aldrig en vej uden om — skal en faktureret periode have en anden pris,
  sker det som kreditnota eller ekstra faktura i Dinero.
- Fastprisopgaver bruger deres egen pris og påvirkes ikke.
- I kundedatabasen spejler triggeren `pricing_til_timepris` nye `pricing`-rækker fra
  `opret_firma` som startsatser, så et nyt firma ikke står uden priser.

> Indtil 3.10.2026 var timeprisen ét tal pr. kontrakttype. Rettede man det, regnede
> alt om — også fakturering og rapporter for måneder, der allerede var sendt til Dinero.

### Du rører ved at gemme en aftale

En aftale, der kører, må **aldrig** kunne gemmes som kladde. `updateTemplate` rydder
kommende opgaver uden tid, som ikke passer til den nye udgave af aftalen — og en kladde
kører på ingen dage, så **alle** ryddes. Knappen «Gem kladde» vises derfor kun på nye
aftaler og kladder, og `updateTemplate` afviser det også selv (gamle faner).

**Værnet står nu i tre lag:** knappen vises ikke, `updateTemplate` afviser, og triggeren
`forbyd_aktiv_til_kladde` på `service_templates` afviser `aktiv` -> `kladde` i selve basen
(4.10.2026, `overdragelse/sql/forbyd-aktiv-til-kladde-2026-10-04.sql`). Skal en edge-funktion
eller et natjob sætte status, må den aldrig gå fra `aktiv` til `kladde`. Triggeren er
kun i Jammerbugts database; kundedatabasen har den ikke endnu.

> 4.10.2026 fik en aktiv Carelink-aftale (Kornblomstvej, Klim) rettet adressen og blev
> gemt med «Gem kladde». 48 kommende opgaver blev slettet, og beskeden sagde, at de
> «ikke passede til den nye rytme». Ingen var udført, så intet tid eller penge gik tabt.
> Det samme var sket 2.10.2026 på Springvandstorvet 3A (ændringsloggen viste det).

### Du løber noget igennem for hver uge, når en aftale gemmes

Der er 18.500 opgaver i hukommelsen, og en aftale gennemgår op til 104 uger. **Slå aldrig
op i listen med `.find`/`.findIndex`/`.includes` inde i en løkke** — brug et `Set` eller et
`Map`, bygget én gang (`nyeOpgaver` og `pladsIndeks` i `src/App.jsx`). `n × n` er usynligt
ved 500 opgaver og over et minut ved 18.500; `node skrivehastighed.test.mjs` håndhæver det.

> 4.10.2026 tog det over et minut at gemme en aftale. Det var ikke databasen: en
> `filter(... find(...))` i `updateTemplate` og `addTask` lavede cirka 170 millioner
> sammenligninger pr. uge. Tiden steg med kvadratet af antal opgaver (10.900 den 21.9,
> 18.500 nu), så den blev ved med at blive værre.

### Du tilføjer en menugruppe eller en side

Nøglerne i **`MENU_GRUPPER`** skal være unikke. To grupper med samme nøgle får **begge**
til at lyse op som den valgte, uanset hvor man står — linjen, der tegner fanerne,
sammenligner netop på `key`. Sidenøglerne inde i grupperne skal også være unikke, men de
er et andet navnerum end gruppenøglerne.

> 19.9.2026 fik Drift-gruppen nøglen `drift`, som Ugeplanen allerede brugte.

### Du ændrer, hvad der står i ugeplanen, eller hvad en opgave indeholder

Fredagsbackuppen (`supabase/functions/ugeplan-backup`, 7.10.2026) læser `instances` direkte og tegner sin egen PDF på serveren — den bruger **ikke** appens udskrift. Henter eller viser du et nyt felt på opgaven (adgang, kontakt, tid), så tag stilling til, om det også skal med i PDF'en. Funktionen viser kun aftalt tid (`scheduled_time`), aldrig den beregnede køreplan, og må aldrig vise koder fra adgangslageret.
Prøv den med «Send en prøve til mig» på Drift. En prøve skriver ikke i `job_koersel` — med vilje.

### Du tilføjer et automatisk job

Skriv det i `DRIFT_JOB` i `src/App.jsx` **med `foerst`** = dets første planlagte kørsel + luft (UTC). Uden den lyser Drift gult som «aldrig kørt», fra jobbet er lavet, og kontoret lærer at ignorere gult (7.10.2026, fredagsbackuppen). Med den står jobbet gråt som «venter» og bliver først gult, hvis første kørsel udebliver.

### Du retter en edge-funktion

**Mappen `supabase/functions/` er en KOPI, ikke kilden.** Funktionerne kører i Supabase og
bliver rullet ud derinde. Retter du en fil her og pusher, sker der **ingenting** i driften.

Rækkefølgen er omvendt af det, man er vant til: ret og rul ud i Supabase → kopiér den
færdige tekst herind → commit. Se `supabase/functions/README.md`.

### Du rører ved kilometer og adresser

Geokoderen har en reserve: kan Dataforsyningen ikke finde adressen, spørger den
OpenRouteService — som **gætter i stedet for at sige fra**. En adresse med en stavefejl
kan derfor få koordinater i Viborg, og turen bliver 112 km i stedet for 30.

Kolonnen `source` i `travel_overrides` siger, hvem der svarede. Alt andet end `dawa`
betyder, at registret ikke kunne svare på mindst én af de to adresser.

> 20.9.2026 blev alle 182 adresser slået op på ny. 168 ramte nul meter fra registret. De
> 14 øvrige var stavefejl og forkerte postnumre — ikke fejl i registret. Fejlen hører
> hjemme i adressefeltet, ikke i geokoderen.

Kørselsgodtgørelsen er ikke sat i drift endnu. Den dag den er, bliver et gættet tal til
penge på en lønseddel.

---

## Når I er flere om det samme repository

**Sæt de her to én gang på hver maskine.** Den første, fordi git ellers går i stå:

    git config --global pull.rebase false
    git config --global user.name "Fornavn Efternavn"
    git config --global user.email "din@adresse.dk"

Uden den første siger git *«You have divergent branches»* og **gør ingenting**, når I
begge har committet siden sidst. Uden de to andre står der «Dit Navn» i historikken, og om
et halvt år kan ingen se, hvem der lavede ændringen, eller hvem man skal spørge.

**Hent ned, før du begynder** — ikke før du pusher. Sidder I begge i `App.jsx`, er det
ikke til at flette bagefter.

**Push, så snart noget virker.** Små ændringer, ofte.

Bliver et push afvist med `! [rejected] main -> main (fetch first)`, har den anden pushet
imens. Det er ikke en fejl, du har lavet:

    git pull --no-rebase --no-edit origin main
    git push origin main

Kommer der **CONFLICT**, så stop. Lad være med at gætte, og brug aldrig `--force` — det
sletter den andens arbejde. `git merge --abort` sætter dig tilbage, hvor du var.

---

## Fælles læring — læs før, skriv efter

Jonn og Charlotte arbejder begge i de her repositories med hver sin Claude. Det eneste,
de to Claude-samtaler deler, er **filerne her**. Det, der kun står i en samtale, er væk
for den anden. Derfor (Jonns beslutning 3.10.2026):

- **Før du begynder:** `git pull`, og læs den nyeste `STATUS-*.md` i
  `Planning-App/overdragelse/` — den anden kan have lært noget siden sidst.
- **Når en regel, en beslutning eller en arbejdsgang ændres, eller I har lært noget
  af en fejl:** skriv det ind i samme commit som ændringen — reglen her i `CLAUDE.md`,
  og hvad der er sket og besluttet i dagens `STATUS-*.md`. Ligesom hjælpen i appen
  skal følge med funktionaliteten, skal instruktionsfilerne følge med arbejdsgangen.
- Skriv **hvorfor** og gerne hvilken fejl, der lå bag — ikke bare reglen.

## Faste ting

- **Ord i skærmbillederne (Jonns beslutning 7.10.2026):** *Aftale* er det, man opretter og retter («Ny aftale», «Ret aftale», «Ret aftalen»); en *opgave* er den enkelte dag, der dannes ud fra aftalen, og den åbner som «Ret opgave», hvor man også kan vælge «Ret aftalen». Brug «Ret», ikke «Rediger/Redigér», for aftale og opgave. Feltet kontrakttype hedder **Aftaletype** i alle skærmbilleder (Privat, Erhverv, Nexus, Ældrelov); koden, databasen og CSV-eksporten hedder stadig `contract_type`/«Kontrakttype».
- **Hjælpen skal opdateres, når funktionalitet ændres.** Det gælder alle tre apps. En
  hjælpetekst, der beskriver noget, der ikke længere passer, er værre end ingen.
- **Kommentarer forklarer hvorfor, ikke hvad** — og gerne hvilken fejl der ligger bag, så
  ingen fjerner en linje, der ser overflødig ud.
- Solsikken (`medSolsikke`) er pynt og må aldrig nå data — ikke i lønfiler, CSV, mails
  eller noget, der går til Dinero.
- En kopitabel lavet med `create table as` arver Supabases tildelinger: `anon` og
  `authenticated` får fuld adgang. `revoke` dem ved navn og slå RLS til — `revoke ... from
  public` gør det ikke.
- **Sider, der hentes ved behov, skal bruge `lazyChunk(() => import(...))` og aldrig `React.lazy` direkte.** Efter en udgivelse findes de gamle filnavne ikke mere; en fane, der har stået åben, får forsiden (text/html) tilbage og siden bliver hvid (8.10.2026, Udnyttelse: «Failed to fetch dynamically imported module»). `lazyChunk` genindlæser én gang af sig selv og viser ellers en besked med en knap.
- Ændrer du en regel, der afgør **hvad der bliver oprettet**, så husk, at en browserfane
  kører den kode, den hentede, og ikke den, der ligger ude nu. Se `src/nyversion.js`.
- **Opgavenummeret (`instances.opgave_nr`) tildeles af databasen og skrives aldrig af appen.**
  Det står med vilje ikke i `syncInstance`: nummeret er trykt på udleverede papirskemaer, og
  en skrivning, der overskrev det, ville gøre et udfyldt skema umuligt at knytte til sin opgave.
  Papirskemaet (Økonomi → Papirskema, `src/papirskema.js`) lægger tiden på opgaven gennem
  `append_time_log` og gemmer papirets kilometer i `papirskema_linjer`; det er altid
  systemets kilometer, der gælder.
- Drift-siden viser byggetidspunktet nederst. Er stemplet ældre, end du forventer, er
  sidste push ikke gået igennem hos Netlify.

## Før du melder noget færdigt

    npx oxlint          # 0 errors
    npm run build
    node aftalerytme.test.mjs   # og de øvrige *.test.mjs, der rører dit område

**Claude committer og pusher selv** (Jonns beslutning 3.10.2026), men først når
build og tests er grønne, og hele outputtet er læst. Push går i drift med det samme.
Først `git pull --no-rebase origin main`, aldrig `--force`. Commit-beskeder uden æøå.

Kører Claude et sted uden adgang til GitHub (fx lokalt, hvor adgangskoden ligger i
brugerens nøglering), gælder den gamle deling: Claude committer, brugeren pusher, og
svaret sluttes af med kommandoen:

    cd ~/planapp/Planning-App && git push origin main

Tjek `git log origin/main..HEAD` først. Mærket flytter sig også, når brugeren pusher fra
sin egen terminal, så du kan altid se, om der faktisk mangler noget.

---

## Hvor resten står

`overdragelse/` indeholder den lange udgave: `OVERDRAGELSE.md` (hvad systemet består af),
`START-PROMPT.md`, `WINDOWS-OPSAETNING.md`, sikkerhedsgennemgangen og
persondatafortegnelserne. `overdragelse/CLAUDE.md` har baggrunden for reglerne ovenfor og
detaljerne om privatlivsteksten og `persondata_register`.

## Status og beslutninger fra september 2026

Den samtale, hvor meget af systemet blev bygget, lukkede 6.10.2026. Det, der kun stod
dér — beslutninger, hvad der er lært om ydelse, åbne punkter — er samlet i
`Planning-App/overdragelse/STATUS-2026-09-30.md` og tillægget
`Planning-App/overdragelse/STATUS-2026-10-03.md` (1.–3.10: adresseopslag efter DAWA, timepriser med gyldighedsdato, fælles læring,
henvendelser fra pjecen, pjece/magnet, næste opgave: kampagneappen). Læs dem, før du begynder på noget
større.
