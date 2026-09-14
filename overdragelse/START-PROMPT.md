# Startprompt

Det her er teksten, I indsætter i Claude, første gang I åbner mappen `planapp`
i en ny samtale. Kopiér alt mellem de to streger.

Den behøver I kun at indsætte, hvis Claude virker til at have glemt sammenhængen.
Normalt læser Claude selv `CLAUDE.md` — den i `planapp`-mappen peger videre til de
rigtige regler i `Planning-App/overdragelse/CLAUDE.md`.

---

Jeg arbejder på **Rengøringsplan**, et planlægningssystem for Jammerbugt Rengøring —
et rengøringsfirma i Jammerbugt med omkring 20 medarbejdere. Jeg er ikke udvikler.
Du skriver koden; jeg beskriver, hvad jeg har brug for, og prøver resultatet af i
praksis.

## Hvad systemet består af

Tre apps, tre GitHub-repositories, samme database:

| App | Mappe | Hvem bruger den |
|---|---|---|
| **Planlægningsappen** | `Planning-App` | Kontoret. Ugeplan, aftaler, fakturering, løn, lager, rapportering. |
| **Worklist** | `jammerbugtrengoering-Medarbejder-App` | Medarbejderne på telefonen. Dagens opgaver, tidsregistrering, afslutning. |
| **Kundeportalen** | `jammerbugtrengoering-kundeportal` | Kunderne. Kalender, opgaver, bestilling, fakturaer. Og tilbudssiden, som er et åbent link uden login. |

Alle tre er React + Vite, deployes på Netlify, og bruger den samme Supabase-database
(`gteowfoahsfpunzgdxum`, i Stockholm — **ikke** Frankfurt). Databasen har edge-funktioner,
der taler med Dinero (bogføring), Brevo (mail) og OpenRouteService (kørselsafstande).

## Sådan vil jeg have, du arbejder

**Undersøg før du bygger.** Spørg databasen, læs koden, se på de rigtige data. Gæt
ikke på, hvordan noget virker — slå det op. Det er rigtige medarbejderes løn og
rigtige kunders regninger, det handler om.

**Efterprøv, og vis mig det.** Når du har lavet noget, der rører ved tid, penge eller
persondata, så prøv det af mod virkelige data og fortæl mig, hvad du så. Byg gerne
fejlen ind med vilje én gang for at se, at kontrollen fanger den. En test, der aldrig
har fejlet, beviser ingenting.

**Sig det, hvis du er i tvivl.** Hellere et spørgsmål end et gæt. Og sig det højt, hvis
noget kun kan afprøves på rigtig hardware, eller hvis du har ændret noget, jeg bør
kigge efter.

**Skriv hvorfor, ikke hvad, i kommentarerne.** Gerne hvilken fejl der ligger bag, så
ingen fjerner en linje, der ser overflødig ud. Sådan er resten af koden skrevet.

**Lav en kopi, før du sletter noget.** Og prøv at gendanne fra kopien, inden du
sletter. En kopi, der ikke er prøvet af, er ikke en kopi — den er et løfte.

## De faste regler

De står i `Planning-App/overdragelse/CLAUDE.md`. Læs den. Kort fortalt:

1. **Worklist skal virke på både Android og iOS.** Medarbejderne er cirka ligeligt
   fordelt. Vurdér hver ændring mod begge, og sig det, hvis noget kun kan afprøves
   det ene sted. «Det virker på Nadines iPhone» er ikke et svar.

2. **Hjælpen i alle tre apps skal opdateres, når funktionalitet ændres.** Worklist har
   hjælp på både dansk og engelsk. Det er ikke pynt — det er det, medarbejderne slår op i,
   når de står i et fremmed hjem og knappen ikke gør, hvad de troede.

3. **Ændrer du, hvad databasen gemmer, skal fire ting følge med.** Privatlivsteksten
   findes fire steder med fire forskellige læsere. Den fælles kilde er tabellen
   `persondata_register`. Morgentjekket mailer os, hvis der er kommet et felt til,
   som ingen har taget stilling til.

4. **Solsikken (`medSolsikke`) er pynt og må aldrig nå data** — ikke i lønfiler, CSV,
   mails eller noget, der går til Dinero.

5. **Pengekoden har tests, der kører ved hvert build.** Rører du ved løn eller
   opgavetid, skal testene rettes i samme ombæring. De ligger i `Planning-App`:
   `loenberegning.test.mjs`, `opgavetid.test.mjs`. Worklist har `ugespring.test.mjs`.

## Fælder, vi allerede er faldet i

Det her er ikke teori. Hver af dem har kostet os noget.

**`REVOKE ... FROM PUBLIC` fjerner ikke Supabases egen tildeling.** Roller som `anon`
og `authenticated` har deres egne. Skal en funktion lukkes, skal der stå
`revoke execute ... from anon` og `from authenticated` eksplicit. Vi er faldet i den
to gange.

**`create or replace function` med en ny parameter erstatter ikke — den laver en
overbelastning.** Resultatet er to funktioner med samme navn, og ethvert kald med det
gamle antal argumenter bliver tvetydigt. Den gamle skal droppes.

**pg_cron kører i UTC, og Danmark skifter mellem sommer- og vintertid.** Derfor ligger
de daglige jobs på både 16 og 17 UTC med en urkontrol inde i databasen, der ser efter,
om klokken faktisk er 18 i dansk tid.

**`net.http_post` er asynkron.** Kaldet ser ud til at lykkes, også når svaret bagefter
er 401. Skal du vide, om noget gik igennem, så slå op i `net._http_response` bagefter.
Det var dét, der fik en hel dags påmindelser til at fejle i stilhed.

**En edge-funktion kan fejle på en kold opstart, uden at der er noget galt med den.**
Den 14. september 2026 faldt kilometerberegningen over «Gateway Timeout» på sit
allerførste databasekald — Supabases egen gateway gav op, mens funktionen startede.
To dage før ramte det `slet-gamle-fotos`. Koden fejlede ikke, og OpenRouteService
fejlede ikke. Derfor: et natjob, der kun kører én gang, skal have et genforsøg.
`genforsoeg_daglig_km()` kører kl. 2 og 3, men kun hvis natkørslen ikke lykkedes.
Kommer den samme fejl på et andet job, er det dén slags løsning, der skal til — ikke
en fejlsøgning i koden.

**Mails sendes gennem edge-funktionen, ikke fra databasen.** `send-email` kræver en
Authorization-header, og databasen sætter den ikke. Kald
`daglige-paamindelser`/`maaneds-paamindelse` i stedet.

**JSX behandler ikke `\uXXXX`-escapes.** I en almindelig streng i JavaScript bliver
`å` til å. I et JSX-tekstfelt står der `å` på skærmen.

**`color-scheme: light dark` gør formularfelter ulæselige i mørk tilstand** — hvid
tekst på hvid baggrund i en `<select>`. Sæt `color` eksplicit på felter.

**`duration` på en opgave er tiden PR. PERSON, ikke for hele opgaven.** To personer à
to timer har leveret fire timers arbejde. Den ene misforståelse fik Kundetimer til at
melde overforbrug på besøg, der gik præcis som planlagt.

**Worklist henter én uge ad gangen; planlægningsappen henter alle opgaver.** Regner du
med, at en opgave ligger i hukommelsen i Worklist, holder det kun for den uge, der er
åben.

**Planen danner opgaver, når nogen åbner en uge.** Sletter du derfor en opgave helt,
er den tilbage, næste gang nogen bladrer hen til den uge — med et nyt id, så det
ligner en ny fejl. Opgaver på en aftale skal **slettemarkeres** (`deleted_at`), ikke
fjernes: den slettemarkerede række holder pladsen og fortæller planen, at her er
ryddet med vilje. Det kostede en formiddags oprydning, der var lavet om en time
senere.

**En browserfane kører den kode, den hentede — ikke den, der ligger ude nu.** Den 13.
september 2026 blev fire aftaler lagt om fra «Måned» til «Hver 4. uge» klokken 9.35.
En fane, der havde stået åben siden før, kendte ikke den nye rytme, faldt tilbage på
én uge og dannede syv opgaver, der ikke skulle have været der — én af dem dagen efter
og tildelt en medarbejder. Planen så helt almindelig ud imens. Derfor sammenligner
appen nu sit eget bundtnavn med det, der ligger på serveren, og holder op med at danne
opgaver, indtil fanen er genindlæst (`src/nyversion.js`). **Ændrer du en regel, der
afgør, hvad der bliver oprettet, så tænk over, hvad en gammel fane vil gøre med den.**

## Sådan udgiver vi en ændring

1. Byg og se, at det er rent: `npm run build` i den mappe, det handler om. Byggeriet
   kører linteren og testene undervejs og stopper, hvis noget fejler.
2. `git add`, `git commit`, `git push origin main`.
3. Netlify bygger selv og lægger det ud, som regel inden for et par minutter.
4. Worklist er en app, medarbejderne har på hjemmeskærmen. Den overtager **ikke** en ny
   version midt i en tidsregistrering — telefonen skal lukkes helt ned. På iPhone
   betyder det at skubbe appen væk i app-skifteren. Husk det, før en «fejl» meldes som
   ikke rettet.

Databaseændringer sker direkte gennem Supabase og er live med det samme. Der er ingen
prøvedatabase — vær tilsvarende forsigtig, og lav en kopi først.

## Hvornår du skal stoppe og spørge

- Noget skal slettes permanent
- Noget rører ved løn, fakturering eller tal, der går til Dinero
- Noget ændrer, hvem der kan se hvad
- Noget sender mail til medarbejdere eller kunder
- Du er i tvivl om, hvad jeg mener

Ved de fire første: vis mig, hvad der vil ske, og vent på et ja. Er det stadig uklart,
eller ser det ud til at være noget større, så sig til — så tager vi fat i Jonn
Tholstrup, som har bygget systemet og er backup.

---
