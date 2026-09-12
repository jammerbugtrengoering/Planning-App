# Overdragelse af Rengøringsplan

Til Jammerbugt Rengøring, september 2026.

Det her dokument er det, man læser **først**. Det fortæller, hvad systemet består af,
hvad der kører af sig selv, hvad I skal have fat i, og hvornår I skal lade være med at
klare det selv.

De to andre dokumenter er værktøjerne:

- **`WINDOWS-OPSAETNING.md`** — fra en tom Windows-maskine til at kunne udgive ændringer.
- **`START-PROMPT.md`** — teksten, I giver Claude, første gang I beder om noget.
- **`CLAUDE.md`** — de faste regler. Claude læser den selv. Den skal holdes ved lige.

---

## Hvad I overtager

Et system, omkring 20 medarbejdere og et kontor bruger hver dag, og som rigtige
lønudbetalinger og rigtige kundefakturaer løber igennem.

**Tre apps:**

| App | Repository | Adresse | Hvem bruger den |
|---|---|---|---|
| Planlægningsappen | `Planning-App` | jammerbugtrengoering-planning.netlify.app | Kontoret: ugeplan, aftaler, fakturering, løn, lager, rapportering |
| Worklist | `jammerbugtrengoering-Medarbejder-App` | jammerbugtrengoering-service.netlify.app | Medarbejderne på telefonen |
| Kundeportalen | `jammerbugtrengoering-kundeportal` | jammerbugtrengoering-kundeportal.netlify.app | Kunderne, plus den åbne tilbudsside |

Alle tre er React + Vite, ligger i GitHub-organisationen `jammerbugtrengoering` og
udgives på Netlify, som selv bygger, når der pushes til `main`. Ingen af dem bruger
react-plugin'et til Vite — Vite oversætter selv JSX, og det holdes ens på tværs af de
tre, så et build opfører sig forudsigeligt.

**Én database:** Supabase, projekt `gteowfoahsfpunzgdxum`, placeret i **Stockholm
(eu-north-1)**. Det er ikke en detalje — det står i fortegnelsen over
behandlingsaktiviteter, og det er svaret, hvis kommunens databeskyttelsesrådgiver
spørger, hvor data ligger. Sig aldrig Frankfurt; det er forkert.

**Tre tjenester udenfor:**

- **Dinero** — kunder, fakturaer, bogføring
- **Brevo** — alle mails systemet sender: login-koder, invitationer, påmindelser, alarmer
- **OpenRouteService** — afstande mellem adresser, som kilometerpengene bygger på

Dertil et link til **KMD Nexus Mobile**, som medarbejderne kvitterer i på kommunale
opgaver. Vi taler ikke med Nexus; vi åbner bare appen.

---

## Det der kører af sig selv

Otte planlagte jobs. Tidspunkterne herunder er **dansk sommertid**; om vinteren ligger
de en time tidligere, undtagen dem hvor det står, at de har en urkontrol.

| Hvornår | Hvad | Hvis det stopper |
|---|---|---|
| ca. 01.00 | Beregner dagens kørsel ud fra registreret tid | Medarbejderne mister kilometerpenge |
| ca. 04.00 | Rydder billeder ældre end 12 måneder | Persondata hober sig op |
| ca. 05.00 | Rydder nøglebokskoder fra overståede opgaver | Det følsomste i systemet hober sig op |
| 07.00 **og** 08.00 | **Morgentjek** — se bemærkningen nedenfor | I opdager ikke, at de andre er stoppet |
| 18.00 (urkontrol) | Påmindelse til medarbejdere om manglende registrering | Timer og kørsel går tabt |
| 18.00 (urkontrol) | To dage før månedsskiftet: sidste chance-mail | Fakturering og løn går tabt for den måned |
| ca. 19.00 (søn–tor) | Besked om morgendagens plan | Medarbejderne ved ikke, planen er ændret |
| Hvert kvarter | Sender beskeder om ændringer i planen | Ændringer når ikke ud |

**Hvorfor nogle jobs står to gange.** pg_cron kører i UTC, og Danmark skifter mellem
sommer- og vintertid. De jobs, der skal ramme et bestemt klokkeslæt, er derfor lagt på
både 16 og 17 UTC — og har så en kontrol inde i databasen, der ser efter, om klokken
faktisk er 18 dansk tid. Så rammer de 18.00 hele året uden manuel justering.

**Morgentjekket mangler den kontrol.** Det ligger på 5 og 6 UTC, men uden urkontrol —
og kører derfor to gange hver morgen. Er noget galt, kommer den samme alarm altså
**to gange med en times mellemrum**. Det er ikke farligt, men det er den slags støj,
der lærer folk at ignorere alarmer. Det står på listen over udeståender nedenfor.

**Morgentjekket er det vigtigste af dem.** Det findes, fordi de daglige påmindelser
engang fejlede i et helt døgn uden at nogen opdagede det. Det sender **kun** mail, når
noget er galt — hører I ingenting, har alt kørt. Modtagerne er alle, der står som
administrator med en mailadresse.

Mailen dækker to helt forskellige ting, og emnelinjen siger hvilken:

1. **«Fejl i de automatiske jobs»** — et job fejlede eller er holdt op med at køre.
2. **«Nye felter der skal tages stilling til»** — nogen har ændret, hvad databasen
   gemmer. Se næste afsnit.

---

## Den ene regel, der er vigtigere end de andre

Privatlivsteksten findes **fire** steder, fordi den har fire forskellige læsere:

| Hvor | Hvem læser den |
|---|---|
| Worklist, hjælpen «Dine personoplysninger» (dansk **og** engelsk) | medarbejderen |
| Kundeportalen, hjælpen «Sådan behandler vi jeres oplysninger» | kunden |
| Planlægningsappen, hjælpens knap «Personoplysninger» | kontoret, når nogen ringer |
| `Fortegnelse-behandlingsaktiviteter.docx` | kommunens databeskyttelsesrådgiver |

Tilføjer nogen en kolonne med et navn eller en adresse i, er alle fire forkerte i
samme øjeblik — **og ingenting går i stykker**. Det er den værste slags fejl: den,
ingen opdager.

Derfor sammenligner morgentjekket databasen med tabellen `persondata_register` hver
morgen og siger til. I skal altså ikke huske det — men I skal **reagere**, når mailen
kommer. Pointen er ikke, at alt er personoplysninger; pointen er, at nogen har taget
stilling. Er det ikke personoplysninger, skrives feltet ind med `persondata = false`,
og beskeden holder op.

---

## Nøgler og adgange, der skal overdrages

Ingen af dem må stå i et dokument eller sendes på mail. Person til person, og ind i en
adgangskodemanager.

| Adgang | Hvad den giver | Hvem har den i dag |
|---|---|---|
| GitHub-organisationen `jammerbugtrengoering` | Koden til alle tre apps | Jonn (ejer) |
| Netlify-team | Udgivelse af de tre apps | Jonn |
| Supabase-projektet | Database, edge-funktioner, nøgler | Jonn |
| Brevo | Alle udgående mails | Jonn |
| OpenRouteService | Afstandsberegning | Jonn |
| Dinero | Bogføring | Jer i forvejen |

**Nøgler, der ligger inde i Supabase** under *Edge Functions → Secrets*, og som ikke
skal flyttes nogen steder hen:

- `SUPABASE_SERVICE_ROLE_KEY` — den fulde adgang til databasen. Må aldrig i en browser,
  aldrig i et repository, aldrig i en mail.
- `BREVO_API_KEY` — mail
- `ORS_API_KEY` — afstande
- Dinero-adgangen
- `AFSENDER_EMAIL`, `AFSENDER_NAVN`, `SVAR_TIL` — hvem mails kommer fra

**En ting at være opmærksom på med mails.** Afsenderen er i dag en outlook.dk-adresse,
og den kan vi ikke sætte SPF- og DKIM-poster på — de tilhører Microsoft. Mailen kommer
altså fra Brevos servere og *påstår* at være fra Microsoft. Gmail og Yahoo lukker den
igennem; Microsoft 365 sætter en advarselsbjælke øverst i hver eneste mail. Løsningen
er at godkende jeres eget domæne i Brevo og sætte `AFSENDER_EMAIL` derefter — så skifter
alle mails afsender uden at noget skal bygges om. Fremgangsmåden står i
`GUIDE-afsender-eget-domaene.md`.

**Skal Jonns egne adgange lukkes ved overdragelsen?** Han fortsætter som backup, så
umiddelbart nej. Beslutter I senere at lukke dem, skal servicenøglen til Supabase og
API-nøglerne til Brevo og OpenRouteService skiftes samtidig — det er et selvstændigt
stykke arbejde, og det skal aftales med ham, så intet står stille imens.

---

## Sådan arbejder I videre

Kontoret klarer det daglige med Claude som værktøj, præcis som systemet er bygget.
Jonn er backup.

**Gangen i det:** I beskriver, hvad I har brug for. Claude undersøger, foreslår og
bygger. I prøver det af i praksis og siger, hvad der ikke passer. Det er sådan, hver
eneste funktion i systemet er blevet til — også fejlene, og de er blevet fundet, fordi
nogen brugte tingene i virkeligheden og sagde til.

**Sig det højt, når noget føles forkert.** «Jeg kan ikke se solsikken på Charlotte» og
«jeg kan ikke godkende Nexus-opgaver på min Android» var begge starten på rigtige
fejl. Den sidste havde kostet seks opgaver og en medarbejders timer, og den så ud som
et telefonproblem lige indtil nogen kiggede efter.

**Der er ingen prøvedatabase.** Alt, hvad der ændres i databasen, er live med det samme
og rammer rigtige mennesker. Bed altid om at få vist, hvad der vil ske, før noget
slettes eller ændres i større omfang — og om en kopi, der er prøvet af.

---

## Hvornår I skal ringe til Jonn

Lad være med at klare det selv, hvis:

- Noget skal slettes permanent, og I er i tvivl om, hvad der hænger ved det
- Lønberegning eller fakturering regner forkert
- Nogen kan se noget, de ikke skal kunne se
- Morgentjekket siger det samme to dage i træk
- En medarbejder ikke kan komme ind i Worklist, og det ikke er en glemt adgangskode
- I overvejer at skifte nøgler eller flytte afsenderadressen
- Nogen har fået en mail fra systemet, de ikke skulle have haft

Og ellers: hellere et opkald for meget.

---

## Hvad der ligger her

Alle dokumenterne ligger i **`Planning-App/overdragelse/`** og følger dermed med koden.
De har historik, kan rettes af hvem som helst med adgang, og kan hentes ned igen, hvis
en maskine går tabt. I `planapp`-mappen ligger kun en `CLAUDE.md`, der peger herind.

| Fil | Hvad det er |
|---|---|
| `CLAUDE.md` | De faste regler. Claude læser den. **Hold den opdateret.** |
| `START-PROMPT.md` | Teksten til Claude, første gang |
| `WINDOWS-OPSAETNING.md` | Maskinen sat op fra bunden |
| `OVERDRAGELSE.md` | Det her dokument |
| `Fortegnelse-behandlingsaktiviteter.docx` | Artikel 30-fortegnelsen. Skal følge med, når databasen ændrer sig |
| `Fortegnelse-markedsfoering.docx` | Samme for markedsføring og SoMe |
| `GUIDE-afsender-eget-domaene.md` | Sådan flyttes mailafsenderen til jeres eget domæne |
| `REVIEW-sikkerhed-og-driftsklarhed.md` | Gennemgang før produktion |
| `REVIEW-kode.md` | Kodegennemgang |
| `PLAN-offline-mobil.md` | Hvordan Worklist klarer sig uden dækning |

Og i `Planning-App/supabase/functions/` ligger kildeteksten til alle edge-funktionerne
med sin egen `README.md`. **Læs den, før du retter i en af dem** — de rulles ud inde i
Supabase og ikke herfra, så filerne er en kopi med historik, ikke selve kilden.

**Retter I noget, så commit og push.** Så har både I og Jonn den samme udgave, og han
kan hjælpe fra sin egen maskine uden at skulle gætte, hvad der er ændret siden.

---

## Det der stadig udestår

Ærligt, så I ikke opdager det selv om tre måneder:

1. **Supabase Pro.** Projektet kører på det gratis niveau. Pro giver beskyttelse mod
   lækkede adgangskoder og mulighed for at rulle databasen tilbage til et tidspunkt.
   Det sidste er værd at have, når der ikke findes en prøvedatabase.
2. **Afsenderadressen** — se afsnittet om nøgler ovenfor.
3. **`Fortegnelse-markedsfoering.docx`** mangler afklaring på nogle punkter om
   SoMePlanning: samtykke til billeder af medarbejdere, en fremgangsmåde til at fjerne
   en persons billeder, og forholdet til Meta om sideindsigt.
4. **Kopien fra oprydningen 11.–12. september 2026** ligger i tabellen
   `oprydning_opsagte_2026_09`. Den indeholder nøglebokskoder og skal slettes, når
   oprydningen har stået sin prøve. **Sæt en dato.**
5. **To udgåede aftaler hos Anne Sørensen** har hver en åben opgave, der skal afgøres i
   hånden — den ene er sidste dags rengøring, den anden blev dannet ved en fejl.
6. **Morgentjekket sender to ens alarmer**, fordi det mangler den urkontrol, de andre
   daglige jobs har. Rettelsen er en enkelt linje, og den bør laves, inden nogen vænner
   sig til at der altid kommer to.
7. ~~Den gamle anon-nøgle udfases ved udgangen af 2026.~~ **Lukket 12. september 2026.**
   Alle tre apps kører på den nye publishable-nøgle. Efterprøvet i de udgivne filer på
   begge Netlify-sites: nøglen er der, den gamle anon-nøgle er ikke. Kundeportalen har
   aldrig brugt anon-nøglen.

   Alle tre læser nu nøglen fra Netlify. Portalen havde variablen sat, men læste den
   ikke — nøglen stod hårdt i koden. Det er rettet, for ellers ville en fremtidig
   nøgleudskiftning slå igennem på to af tre sites, og portalen ville køre videre på
   den gamle uden at sige noget. **Skiftes nøglen, skal den skiftes alle tre steder.**
8. ~~`VITE_BREVO_API_KEY` i Netlify.~~ **Fjernet 12. september 2026.** Den lækkede
   aldrig noget, fordi ingen frontend-kode læste den — men `VITE_`-præfikset betyder
   «byg mig ind i den fil, browseren henter», og den dag nogen havde skrevet
   `import.meta.env.VITE_BREVO_API_KEY`, havde nøglen ligget offentligt.
   `BREVO_API_KEY` uden præfiks er den rigtige og er beholdt.
